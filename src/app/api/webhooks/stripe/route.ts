// src/app/api/webhooks/stripe/route.ts
// Stripe webhook Route Handler — the SOLE authority that flips an order to `payment_confirmed` (D-06).
//
// Security contract:
//   - runtime = "nodejs" (never edge — needs Node.js crypto for HMAC timing-safe compare; Pitfall 1)
//   - Raw body read via req.text() BEFORE any parse (Pitfall 1 — req.json() re-serialises and breaks HMAC)
//   - Idempotency-first: handled inside confirmOrderPaid via processed_webhook_events ON CONFLICT DO NOTHING
//   - Atomicity via db.batch (neon-http has no db.transaction(); batch is documented atomic)
//   - Stock decrement uses WHERE stock >= qty guard — no oversell, no read-then-write (CLAUDE.md, SC5)
//   - Last-unit-race (D-09): confirmOrderPaid returns { outcome: "oversold" } → caller does stripe.refunds.create
//   - Never returns non-200 for valid webhook events; Stripe retries on non-200 (except signature failure)

// runtime = "nodejs" is the default for Route Handlers in Next.js 16 + cacheComponents mode.
// Explicit "nodejs" export is incompatible with cacheComponents:true — Node.js is the default
// and stripe.webhooks.constructEvent uses Node.js crypto (HMAC timing-safe) automatically.

import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/payments/stripe"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getOrderByStripePaymentIntentId } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL: req.text() must be the FIRST statement — raw body required for HMAC verification.
  // Any parse (req.json(), body consumption) before this will cause StripeSignatureVerificationError.
  const body = await req.text()
  const sig = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    // Signature mismatch — this is either a forged request or a misconfigured secret. (T-04-16)
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  // Only handle payment_intent.succeeded — return 200 for all other event types so Stripe
  // does not retry them. Never return secrets in the response body (Pitfall 6 / T-04-21).
  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true })
  }

  const pi = event.data.object as Stripe.PaymentIntent

  // ── Look up order ──────────────────────────────────────────────────────────
  // Primary lookup by stripePaymentIntentId (set during createStripePaymentIntent action, 04-03).
  // Fallback: if pi.metadata.orderId is available and PI lookup fails, use it.
  let order = await getOrderByStripePaymentIntentId(pi.id)

  if (!order && pi.metadata?.orderId) {
    // Fallback: use orderId from PaymentIntent metadata (set by createStripePaymentIntent).
    const { db: dbDirect } = await import("@/lib/db/client")
    order = await dbDirect.query.orders.findFirst({
      where: eq(orders.id, pi.metadata.orderId),
      with: { items: true },
    })
  }

  if (!order) {
    // No matching order — this may be a misconfiguration or test event. Return 400 so Stripe
    // retries (acceptable: if the order eventually appears, the retry will succeed).
    return NextResponse.json({ error: "Order not found" }, { status: 400 })
  }

  // ── Shared idempotent confirmation path (D-04) ─────────────────────────────
  // confirmOrderPaid handles: idempotency insert, order-already-confirmed guard,
  // atomic order-flip + stock decrement, oversold detection, confirmation email.
  // The Stripe event id is the idempotency key (evt_xxx).
  const result = await confirmOrderPaid(order, {
    provider: "stripe",
    eventId: event.id,
  })

  if (result.outcome === "duplicate") {
    return NextResponse.json({ received: true })
  }

  if (result.outcome === "oversold") {
    // D-09: Trigger a Stripe refund for the full PaymentIntent amount.
    // confirmOrderPaid already set order to payment_failed + refundReason="oversold".
    try {
      await stripe.refunds.create({ payment_intent: pi.id })
    } catch (refundErr) {
      // Refund failure must not suppress the order-failure status update.
      // Log and continue — the store owner must manually reconcile if this fires.
      console.error("[webhook] Stripe refund failed for oversold order:", order.id, refundErr)
    }

    console.error("[webhook] Oversold — refunded PaymentIntent", pi.id, "for order", order.id)

    return NextResponse.json({ received: true })
  }

  // outcome === "confirmed" — confirmation email already sent inside confirmOrderPaid.
  return NextResponse.json({ received: true })
}
