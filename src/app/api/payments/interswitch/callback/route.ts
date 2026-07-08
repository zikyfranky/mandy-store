// src/app/api/payments/interswitch/callback/route.ts
// Interswitch verify-on-return callback (PAY-09 / D-14 / D-15).
//
// Security contract:
//   - Toggle check FIRST (PAY-12, D-18, T-71-16)
//   - Return params (txnref) are a LOOKUP HINT ONLY — never trusted for status/amount (Pitfall 3)
//   - Authoritative status + amount come from interswitchAdapter.verifyTransaction (server requery, D-15)
//   - Confirm only when status === "confirmed" AND amountKobo >= order.totalKobo (T-71-13)
//   - eventId "interswitch:"+ref shared with the webhook so exactly one confirms (Pitfall 4, D-04)
//
// Do NOT export `runtime` — breaks cacheComponents:true.

import { NextRequest, NextResponse } from "next/server"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { interswitchAdapter } from "@/lib/payments/gateways/interswitch"

async function handle(req: NextRequest): Promise<NextResponse> {
  // ── Toggle check — FIRST (PAY-12, D-18) ───────────────────────────────────
  if (!(await isPaymentMethodEnabled("interswitch"))) {
    return NextResponse.redirect(new URL("/checkout?error=disabled", req.url))
  }

  // ── Reference: query (GET) or form body (POST) — HINT ONLY, never trusted ──
  const ref =
    req.nextUrl.searchParams.get("txnref") ??
    (req.method === "POST" ? String((await req.formData()).get("txnref") ?? "") : "")

  const order = await getOrderByGatewayReference(ref)
  if (!order) {
    return NextResponse.redirect(new URL("/checkout?error=notfound", req.url))
  }

  // ── Authoritative server-side requery (D-15) — the return params are ignored ──
  const v = await interswitchAdapter.verifyTransaction(ref)

  // Tamper guard (Pitfall 3): confirm only on a verified success for the full amount.
  if (v.status !== "confirmed" || v.amountKobo < order.totalKobo) {
    // D-14 fallback: land on the order page; the "Payment processing…" interstitial + polling resolves.
    return NextResponse.redirect(new URL(`/order/${order.guestToken}`, req.url))
  }

  const result = await confirmOrderPaid(order, { provider: "interswitch", eventId: "interswitch:" + ref })
  if (result.outcome === "oversold") {
    await interswitchAdapter.refund(ref).catch(console.error)
  }

  return NextResponse.redirect(new URL(`/order/${order.guestToken}`, req.url))
}

export const GET = handle
export const POST = handle
