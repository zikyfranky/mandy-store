// src/app/api/payments/remita/callback/route.ts
// Remita verify-on-return callback (PAY-11 / D-14 / D-15).
// GET only (Remita does a plain GET redirect back with the RRR).
//
// Security: toggle-first (T-71-16); RRR is a lookup hint only (Pitfall 3); status+amount from
// server-side status.reg requery (D-15); shared "remita:"+rrr idempotency key (Pitfall 4).
// Do NOT export `runtime`.

import { NextRequest, NextResponse } from "next/server"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { remitaAdapter } from "@/lib/payments/gateways/remita"

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await isPaymentMethodEnabled("remita"))) {
    return NextResponse.redirect(new URL("/checkout?error=disabled", req.url))
  }

  // RRR is the gatewayReference — hint only, never trusted for status/amount.
  const rrr =
    req.nextUrl.searchParams.get("RRR") ?? req.nextUrl.searchParams.get("rrr") ?? ""

  const order = await getOrderByGatewayReference(rrr)
  if (!order) {
    return NextResponse.redirect(new URL("/checkout?error=notfound", req.url))
  }

  const v = await remitaAdapter.verifyTransaction(rrr) // D-15 authoritative status.reg requery
  if (v.status !== "confirmed" || v.amountKobo < order.totalKobo) {
    return NextResponse.redirect(new URL(`/order/${order.guestToken}?checkout=1`, req.url)) // D-14 fallback
  }

  const result = await confirmOrderPaid(order, { provider: "remita", eventId: "remita:" + rrr })
  if (result.outcome === "oversold") {
    await remitaAdapter.refund(rrr).catch(console.error)
  }

  return NextResponse.redirect(new URL(`/order/${order.guestToken}?checkout=1`, req.url))
}
