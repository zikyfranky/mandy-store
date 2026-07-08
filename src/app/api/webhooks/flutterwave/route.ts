// src/app/api/webhooks/flutterwave/route.ts
// Flutterwave webhook Route Handler — PAY-06.
//
// Security contract:
//   - Toggle check FIRST (D-06 / PAY-12 / T-07-15) — disabled gateway rejected before reading body
//   - Raw body via req.text() BEFORE any parse (Pitfall 4 — req.json() re-serialises and breaks HMAC)
//   - HMAC SHA-256 base64 signature: "flutterwave-signature" header (newer API)
//     with "verif-hash" plaintext fallback (legacy / transition period) (Pitfall 5 / RESEARCH Pattern 5)
//   - Event filter: type="charge.completed" AND data.status="successful" (Pitfall 7 — NOT "success")
//   - Idempotency via confirmOrderPaid → processed_webhook_events ON CONFLICT DO NOTHING (D-04, T-07-13)
//   - Atomic stock decrement inside confirmOrderPaid (T-07-14)
//   - Oversold → flutterwaveRefund + 200 (prevents Flutterwave retry storm)
//   - Returns 200 for all events except: disabled gateway (400), bad signature (400)
//
// Do NOT export `runtime` — Node.js is the default; explicit export breaks cacheComponents:true.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { flutterwaveRefund } from "@/lib/payments/gateways/flutterwave"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. Toggle check — FIRST statement (D-06, PAY-12, T-07-15) ─────────────────
  // Reject at the route level before reading any data. A disabled gateway must be
  // rejected here, not merely hidden in the UI (plan constraint).
  if (!(await isPaymentMethodEnabled("flutterwave"))) {
    return NextResponse.json({ error: "Gateway disabled" }, { status: 400 })
  }

  // ── 1. Raw body FIRST (Pitfall 4 / RESEARCH Pattern 5) ────────────────────────
  // Must be read before JSON.parse — the raw string is required for HMAC verify.
  // Re-stringifying parsed JSON may differ in whitespace/key order and break the sig.
  const body = await req.text()

  // ── 2. Signature verification (RESEARCH Pattern 5 + Pitfall 5) ────────────────
  //
  // Flutterwave newer API: "flutterwave-signature" header, HMAC SHA-256 base64.
  // Flutterwave legacy:    "verif-hash" header, plaintext string compare.
  //
  // Strategy: read whichever header is present; compute HMAC SHA-256 base64 first.
  // If that doesn't match, fall back to comparing the signature as a plaintext hash
  // (legacy "verif-hash" pattern). This safely covers both old and new webhook configs.
  const signature =
    req.headers.get("flutterwave-signature") ??
    req.headers.get("verif-hash") ??
    ""

  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH!

  // Primary: HMAC SHA-256 base64 (newer API — "flutterwave-signature")
  const expected = crypto
    .createHmac("sha256", secretHash)
    .update(body)
    .digest("base64")

  // Accept either: computed HMAC base64 match OR legacy plaintext string match (verif-hash)
  const signatureValid = expected === signature || signature === secretHash

  if (!signatureValid) {
    // Signature mismatch — forged request or misconfigured secret (T-07-11 Spoofing mitigation)
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  // ── 3. Parse event + filter ────────────────────────────────────────────────────
  const event = JSON.parse(body) as {
    type: string
    id?: string
    data?: {
      id?: number           // Flutterwave numeric transaction ID (use for refund)
      status?: string
      tx_ref?: string       // merchant's txRef — the idempotency key and lookup key
      amount?: number       // NAIRA (major units) — Pitfall 1
      currency?: string
      customer?: { email: string; name: string }
    }
  }

  // Only handle charge.completed + status "successful" — return 200 for all other events.
  // Pitfall 7: Flutterwave uses "successful" (NOT "success" — that's Paystack).
  if (event.type !== "charge.completed" || event.data?.status !== "successful") {
    return NextResponse.json({ received: true })
  }

  // ── 4. Order lookup ────────────────────────────────────────────────────────────
  const txRef = event.data.tx_ref!
  const order = await getOrderByGatewayReference(txRef)

  if (!order) {
    // No matching order — return 400 so Flutterwave retries.
    // The order may not exist yet if the webhook arrives before initFlutterwavePayment completes.
    return NextResponse.json({ error: "Order not found" }, { status: 400 })
  }

  // Already confirmed guard — idempotency shortcut before calling confirmOrderPaid.
  if (order.status === "payment_confirmed") {
    return NextResponse.json({ received: true })
  }

  // ── 5. Shared idempotent confirmation path (D-04, T-07-13) ───────────────────
  // eventId "flutterwave:"+txRef is shared with verifyFlutterwavePayment so exactly
  // one of them (callback verify OR webhook) wins the ON CONFLICT DO NOTHING insert.
  const eventId = "flutterwave:" + txRef
  const result = await confirmOrderPaid(order, {
    provider: "flutterwave",
    eventId,
  })

  if (result.outcome === "duplicate") {
    // Already processed (webhook fired after verify-on-callback, or duplicate delivery)
    return NextResponse.json({ received: true })
  }

  if (result.outcome === "oversold") {
    // D-09 last-unit race: confirmOrderPaid already set payment_failed + refundReason.
    // Trigger Flutterwave refund using the numeric transaction ID — best-effort.
    if (event.data?.id !== undefined) {
      await flutterwaveRefund(String(event.data.id)).catch((err) => {
        console.error("[flutterwave/webhook] refund on oversold failed:", err)
      })
    }

    console.error(
      "[flutterwave/webhook] Oversold — refunded txRef:", txRef,
      "orderId:", order.id
    )

    // Return 200 to prevent Flutterwave from retrying (the order is already handled)
    return NextResponse.json({ received: true })
  }

  // outcome === "confirmed" — email already sent inside confirmOrderPaid
  return NextResponse.json({ received: true })
}
