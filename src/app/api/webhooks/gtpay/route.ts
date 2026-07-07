// src/app/api/webhooks/gtpay/route.ts
// GTPay notification webhook (PAY-10 / D-15 "consume webhook when it exists").
//
// Security contract:
//   - Toggle check FIRST (PAY-12, T-71-16) — return 200 so a disabled endpoint stops retries
//   - Raw body via req.text() BEFORE parse (mirror paystack webhook)
//   - Plain SHA-512 notification-hash verify (NOT HMAC) BEFORE any confirm (T-71-12 Spoofing)
//   - eventId "gtpay:"+ref MUST match the callback route so exactly one confirms (Pitfall 4, D-04)
//
// Do NOT export `runtime` — breaks cacheComponents:true.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { gtpayAdapter } from "@/lib/payments/gateways/gtpay"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Toggle FIRST — 200 so the gateway stops retrying a disabled endpoint ──
  if (!isPaymentMethodEnabled("gtpay")) {
    return new NextResponse(null, { status: 200 })
  }

  // ── Raw body before parse (mirror paystack webhook) ───────────────────────
  const body = await req.text()
  const params = new URLSearchParams(body)

  const tranxId = params.get("gtpay_tranx_id") ?? ""
  const amt = params.get("gtpay_tranx_amt") ?? ""
  const statusCode = params.get("gtpay_tranx_status_code") ?? ""
  const curr = params.get("gtpay_tranx_curr") ?? ""
  const receivedHash = params.get("gtpay_hash") ?? ""

  // ── Plain SHA-512 notify-hash verify BEFORE confirm (RESEARCH Pattern 4, T-71-12) ──
  // Order: tranx_id + amt + status_code + curr + hashkey (confirm exact field set at sandbox).
  const hashKey = (process.env.GTPAY_HASH_KEY ?? "").trim()
  const expected = crypto
    .createHash("sha512")
    .update(tranxId + amt + statusCode + curr + hashKey)
    .digest("hex")

  if (expected !== receivedHash) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const order = await getOrderByGatewayReference(tranxId)
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 400 })
  }

  // Shared idempotency key with the callback route (Pitfall 4) — whichever arrives first wins.
  const result = await confirmOrderPaid(order, { provider: "gtpay", eventId: "gtpay:" + tranxId })

  if (result.outcome === "oversold") {
    await gtpayAdapter.refund(tranxId).catch((err) => {
      console.error("[gtpay/webhook] refund on oversold failed:", err)
    })
  }

  return NextResponse.json({ received: true })
}
