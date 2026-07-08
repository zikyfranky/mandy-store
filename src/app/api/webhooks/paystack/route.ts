// src/app/api/webhooks/paystack/route.ts
// Paystack webhook Route Handler — PAY-05.
//
// Security contract:
//   - Toggle check FIRST (D-06 / PAY-12) — disabled gateway rejected before reading body (T-07-09)
//   - Raw body via req.text() BEFORE any parse (Pitfall 4 — req.json() re-serialises and breaks HMAC)
//   - HMAC SHA-512 signature verification: x-paystack-signature vs PAYSTACK_SECRET_KEY (T-07-05)
//   - Idempotency via confirmOrderPaid → processed_webhook_events ON CONFLICT DO NOTHING (D-04, T-07-07)
//   - Atomic stock decrement inside confirmOrderPaid (T-07-08)
//   - Oversold → paystackRefund + 200 (prevents Paystack retry storm)
//   - Returns 200 for all events except: disabled gateway (400), bad signature (400), order not found (400)
//
// Do NOT export `runtime` — Node.js is the default; explicit export breaks cacheComponents:true.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { paystackRefund } from "@/lib/payments/gateways/paystack"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. Toggle check — FIRST statement (D-06, PAY-12, T-07-09) ────────────────
  // Reject at the route level before reading any data. A disabled gateway must be
  // rejected here, not merely hidden in the UI (plan constraint).
  if (!(await isPaymentMethodEnabled("paystack"))) {
    return NextResponse.json({ error: "Gateway disabled" }, { status: 400 })
  }

  // ── 1. Raw body FIRST (Pitfall 4) ────────────────────────────────────────────
  // Must be read before JSON.parse — the raw string is required for HMAC verify.
  // Re-stringifying parsed JSON may differ in whitespace/key order and break the sig.
  const body = await req.text()

  // ── 2. HMAC SHA-512 signature verification (RESEARCH Pattern 4, T-07-05) ─────
  // Paystack signs the request body with PAYSTACK_SECRET_KEY using HMAC-SHA512.
  const signature = req.headers.get("x-paystack-signature") ?? ""
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)       // raw string — do NOT re-stringify parsed JSON (Pitfall 4)
    .digest("hex")

  if (expected !== signature) {
    // Signature mismatch — forged request or misconfigured secret (T-07-05 Spoofing mitigation)
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  // ── 3. Parse event + filter ───────────────────────────────────────────────────
  const event = JSON.parse(body) as {
    event: string
    data: {
      id: number
      status: string
      reference: string
      amount: number    // kobo (Paystack native unit — no conversion needed)
      currency: string
      customer: { email: string }
    }
  }

  // Only handle charge.success — return 200 for all other events so Paystack does not retry them.
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true })
  }

  // ── 4. Order lookup ──────────────────────────────────────────────────────────
  const reference = event.data.reference
  const order = await getOrderByGatewayReference(reference)

  if (!order) {
    // No matching order — return 400 so Paystack retries (same as Stripe pattern).
    // The order may not yet exist if the webhook arrives before the action completes.
    return NextResponse.json({ error: "Order not found" }, { status: 400 })
  }

  // ── 5. Shared idempotent confirmation path (D-04, T-07-07) ──────────────────
  // eventId "paystack:"+reference is shared with verifyPaystackPayment so exactly
  // one of them (callback verify OR webhook) wins the ON CONFLICT DO NOTHING insert.
  const eventId = "paystack:" + reference
  const result = await confirmOrderPaid(order, {
    provider: "paystack",
    eventId,
  })

  if (result.outcome === "duplicate") {
    // Already processed (webhook fired after verify-on-callback, or duplicate delivery)
    return NextResponse.json({ received: true })
  }

  if (result.outcome === "oversold") {
    // D-09 last-unit race: confirmOrderPaid already set payment_failed + refundReason.
    // Trigger Paystack refund — best-effort, catch to avoid suppressing the 200 response.
    await paystackRefund(reference).catch((err) => {
      console.error("[paystack/webhook] refund on oversold failed:", err)
    })

    console.error(
      "[paystack/webhook] Oversold — refunded reference:", reference,
      "orderId:", order.id
    )

    // Return 200 to prevent Paystack from retrying (the order is already handled)
    return NextResponse.json({ received: true })
  }

  // outcome === "confirmed" — email already sent inside confirmOrderPaid
  return NextResponse.json({ received: true })
}
