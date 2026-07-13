// src/app/api/payments/gtpay/callback/route.ts
// GTPay verify-on-return callback (PAY-10 / D-14 / D-15).
// Config variant of the Interswitch callback (D-12): same requery-authoritative logic,
// gtpay adapter, ref param `gtpay_tranx_id`, eventId prefix "gtpay:".
//
// Security: toggle-first (T-71-16); return params are a hint only (Pitfall 3); status+amount
// from server requery (D-15); shared "gtpay:"+ref idempotency key (Pitfall 4).
// Do NOT export `runtime`.

import { NextRequest, NextResponse } from "next/server"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { gtpayAdapter } from "@/lib/payments/gateways/gtpay"

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!(await isPaymentMethodEnabled("gtpay"))) {
    return NextResponse.redirect(new URL("/checkout?error=disabled", req.url))
  }

  const ref =
    req.nextUrl.searchParams.get("gtpay_tranx_id") ??
    (req.method === "POST" ? String((await req.formData()).get("gtpay_tranx_id") ?? "") : "")

  const order = await getOrderByGatewayReference(ref)
  if (!order) {
    return NextResponse.redirect(new URL("/checkout?error=notfound", req.url))
  }

  const v = await gtpayAdapter.verifyTransaction(ref) // D-15 authoritative requery
  if (v.status !== "confirmed" || v.amountKobo < order.totalKobo) {
    return NextResponse.redirect(new URL(`/order/${order.guestToken}?checkout=1`, req.url)) // D-14 fallback
  }

  const result = await confirmOrderPaid(order, { provider: "gtpay", eventId: "gtpay:" + ref })
  if (result.outcome === "oversold") {
    await gtpayAdapter.refund(ref).catch(console.error)
  }

  return NextResponse.redirect(new URL(`/order/${order.guestToken}?checkout=1`, req.url))
}

export const GET = handle
export const POST = handle
