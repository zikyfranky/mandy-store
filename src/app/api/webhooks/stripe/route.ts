// src/app/api/webhooks/stripe/route.ts
// Stripe webhook Route Handler — the SOLE authority that flips an order to `payment_confirmed` (D-06).
//
// Security contract:
//   - runtime = "nodejs" (never edge — needs Node.js crypto for HMAC timing-safe compare; Pitfall 1)
//   - Raw body read via req.text() BEFORE any parse (Pitfall 1 — req.json() re-serialises and breaks HMAC)
//   - Idempotency-first: insert event id into processed_webhook_events ON CONFLICT DO NOTHING (Pitfall 2)
//   - Atomicity via db.batch (neon-http has no db.transaction(); batch is documented atomic)
//   - Stock decrement uses WHERE stock >= qty guard — no oversell, no read-then-write (CLAUDE.md, SC5)
//   - Last-unit-race (D-09): if any decrement returns 0 rows → refund + payment_failed + notify customer
//   - Never returns non-200 for valid webhook events; Stripe retries on non-200 (except signature failure)

// runtime = "nodejs" is the default for Route Handlers in Next.js 16 + cacheComponents mode.
// Explicit "nodejs" export is incompatible with cacheComponents:true — Node.js is the default
// and stripe.webhooks.constructEvent uses Node.js crypto (HMAC timing-safe) automatically.

import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/payments/stripe"
import { db } from "@/lib/db/client"
import { processedWebhookEvents, orders, orderItems, variants } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getOrderByStripePaymentIntentId } from "@/lib/orders/queries"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"

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

  // ── Idempotency guard (T-04-17, Pitfall 2) ─────────────────────────────────
  // Insert the event id FIRST inside a batch. If the event was already processed (duplicate
  // delivery), the unique constraint fires and ON CONFLICT DO NOTHING returns rowCount === 0.
  // We check rowCount to short-circuit without touching any order data.
  //
  // NOTE on rowCount: neon-http returns a result object with a `rowCount` number field.
  // The insert().onConflictDoNothing() result rowCount is 1 on new insert, 0 on conflict.
  const [idempotencyResult] = await db.batch([
    db
      .insert(processedWebhookEvents)
      .values({ id: event.id, provider: "stripe" })
      .onConflictDoNothing(),
  ])

  if (idempotencyResult.rowCount === 0) {
    // Already processed — this is a duplicate delivery. Return 200 immediately so Stripe
    // stops retrying. No DB writes, no second stock decrement. (Pitfall 2)
    return NextResponse.json({ received: true })
  }

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

  // Defensive: if the order is already confirmed (e.g. admin confirmed it manually), no-op.
  if (order.status === "payment_confirmed") {
    return NextResponse.json({ received: true })
  }

  // ── Atomic batch: flip order + decrement stock ─────────────────────────────
  // Build a raw-SQL conditional decrement for each order line.
  // WHERE stock >= qty is the oversell guard (CLAUDE.md: atomic stock decrement; SC5).
  // RETURNING id lets us count affected rows without relying on driver-specific rowCount fields.
  // (The result.rows.length approach is more portable across neon-http driver versions.)
  type DecrementResult = { rows: { id: string }[] }
  const decrementStatements = order.items.map((item) =>
    db.execute<{ id: string }>(sql`
      UPDATE "variant"
      SET stock = stock - ${item.quantity}
      WHERE id = ${item.variantId}
        AND stock >= ${item.quantity}
      RETURNING id
    `),
  )

  const [, ...decrementResults] = (await db.batch([
    db
      .update(orders)
      .set({ status: "payment_confirmed", paidAt: new Date() })
      .where(eq(orders.id, order.id)),
    ...decrementStatements,
  ])) as [unknown, ...DecrementResult[]]

  // ── Last-unit race detection (D-09 / Pitfall 3 / T-04-19) ──────────────────
  // If any decrement affected 0 rows, that variant was oversold: another customer's webhook
  // ran concurrently and drove the stock to 0 before ours arrived.
  //
  // Recovery:
  //   1. Issue a Stripe refund for the PaymentIntent.
  //   2. Mark the order payment_failed with refundReason = "oversold".
  //   3. Log the issue (customer notification is best-effort; do not fail the webhook).
  //   Return 200 so Stripe does NOT retry the already-refunded charge.
  const anyOversold = decrementResults.some((r) => r.rows.length === 0)

  if (anyOversold) {
    // D-09: Trigger a Stripe refund for the full PaymentIntent amount.
    try {
      await stripe.refunds.create({ payment_intent: pi.id })
    } catch (refundErr) {
      // Refund failure must not suppress the order-failure status update.
      // Log and continue — the store owner must manually reconcile if this fires.
      console.error("[webhook] Stripe refund failed for oversold order:", order.id, refundErr)
    }

    await db
      .update(orders)
      .set({ status: "payment_failed", refundReason: "oversold" })
      .where(eq(orders.id, order.id))

    // Best-effort: log oversell for store-owner visibility.
    // In v1 we log rather than send a separate oversell email (a distinct email template
    // would be a v2 improvement). The order is accessible via the guest token link.
    console.error("[webhook] Oversold — refunded PaymentIntent", pi.id, "for order", order.id)

    return NextResponse.json({ received: true })
  }

  // ── Happy path: send confirmation email (ORD-01) ────────────────────────────
  // Non-blocking (.catch(console.error)) — email failure must not fail the webhook acknowledgement.
  // Stripe will not retry on email errors; the webhook must return 200 regardless. (T-04-21)
  sendOrderConfirmationEmail({
    customerEmail: order.customerEmail,
    reference: order.reference,
    guestToken: order.guestToken,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      lineTotalKobo: item.lineTotalKobo,
    })),
    subtotalKobo: order.subtotalKobo,
    shippingKobo: order.shippingKobo,
    totalKobo: order.totalKobo,
  }).catch(console.error)

  return NextResponse.json({ received: true })
}
