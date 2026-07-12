// src/app/api/webhooks/remita/route.ts
// Remita notification webhook (PAY-11 / D-15 "consume webhook when it exists").
//
// Only fires if the merchant configures a Remita notification URL. The verify-on-return
// callback is the primary authority (D-15); this is the backstop that shares the SAME
// idempotency key so exactly one path confirms (Pitfall 4, D-04).
//
// Security: toggle-first (T-71-16); raw body before parse; plain SHA-512 notify-hash verify
// BEFORE confirm (T-71-12). NOTE (A-uncertain): the exact Remita notification hash field set
// is confirm-at-sandbox (D-19) — verified here as SHA-512(rrr + apiKey + merchantId).
// Do NOT export `runtime`.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { remitaAdapter } from "@/lib/payments/gateways/remita"
import { getGatewayConfig } from "@/lib/payments/gateway-credentials"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Toggle FIRST — 200 so a disabled endpoint stops retries ───────────────
  if (!(await isPaymentMethodEnabled("remita"))) {
    return new NextResponse(null, { status: 200 })
  }

  // ── Raw body before parse ─────────────────────────────────────────────────
  const body = await req.text()
  let payload: { rrr?: string; RRR?: string; hash?: string } = {}
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  const rrr = payload.rrr ?? payload.RRR ?? ""
  const receivedHash = payload.hash ?? ""

  // ── Plain SHA-512 notify-hash verify BEFORE confirm (T-71-12) ──────────────
  // A-uncertain: exact Remita notification hash scheme is confirm-at-sandbox (D-19).
  // Resolver-backed (D-03/ADMN-07) — fail closed (400) if api_key/merchant_id resolve empty,
  // BEFORE any hash compute is attempted.
  const cfg = await getGatewayConfig("remita")
  if (!cfg.api_key || !cfg.merchant_id) {
    return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })
  }
  const expected = crypto.createHash("sha512").update(rrr + cfg.api_key + cfg.merchant_id).digest("hex")

  if (expected !== receivedHash) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const order = await getOrderByGatewayReference(rrr)
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 400 })
  }

  // Shared idempotency key with the callback route (Pitfall 4).
  const result = await confirmOrderPaid(order, { provider: "remita", eventId: "remita:" + rrr })

  if (result.outcome === "oversold") {
    await remitaAdapter.refund(rrr).catch((err) => {
      console.error("[remita/webhook] refund on oversold failed:", err)
    })
  }

  return NextResponse.json({ received: true })
}
