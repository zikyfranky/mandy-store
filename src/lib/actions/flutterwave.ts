"use server"
import "server-only"
// src/lib/actions/flutterwave.ts
// Flutterwave Server Actions: initFlutterwavePayment + verifyFlutterwavePayment.
// PAY-06 / PAY-12 / D-04 / D-06
//
// Security contracts:
//   - isPaymentMethodEnabled("flutterwave") is the FIRST statement in every action (PAY-12, D-06, T-07-15)
//   - Server-side total ALWAYS recomputed from buildOrderContext() → getCart() — client amount ignored (T-07-12)
//   - verifyFlutterwavePayment re-fetches from Flutterwave server-side; rejects if verified < order.totalKobo (T-07-12)
//   - NAIRA normalization: Flutterwave returns naira; adapter normalizes to kobo (amountNaira × 100) (Pitfall 1/8)
//   - eventId "flutterwave:" + txRef shared by callback + webhook so exactly one confirms (D-04, T-07-13)
//   - Only NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY returned to client; secret never in response (T-07-16, D-08)

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getGatewayConfig } from "@/lib/payments/gateway-credentials"
import { buildOrderContext, type CheckoutInput } from "@/lib/actions/checkout"
import { flutterwaveBuildParams, flutterwaveVerify, flutterwaveRefund } from "@/lib/payments/gateways/flutterwave"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"

// ─── initFlutterwavePayment ────────────────────────────────────────────────────

export type FlutterwaveInitResult =
  | {
      publicKey: string
      txRef: string
      amountNaira: number
      email: string
      customerName: string
      phone: string | undefined
      guestToken: string
    }
  | { error: string }

/**
 * Build Flutterwave popup params and create a pending_payment order.
 *
 * PAY-06 / PAY-12:
 *   1. Toggle check FIRST — rejects before any DB or gateway call (D-06, T-07-15)
 *   2. buildOrderContext: Zod-validate input, server-recompute totals from getCart() (T-07-12)
 *   3. Insert order (pending_payment) + orderItems via db.batch
 *      - gatewayProvider="flutterwave", gatewayReference=ctx.reference (tx_ref for stable webhook lookup)
 *   4. Build Flutterwave popup params (amountKobo ÷ 100 = naira — critical unit conversion, Pitfall 1)
 *   5. Return { publicKey, txRef, amountNaira, email, customerName, phone, guestToken }
 *      - Only NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY returned — secret never leaves server (T-07-16, D-08)
 *
 * Unlike Paystack, Flutterwave has no server-side "initialize" endpoint. The server assembles
 * the popup params and returns them; the client calls FlutterwaveCheckout({ tx_ref, amount, ... }).
 */
export async function initFlutterwavePayment(input: CheckoutInput): Promise<FlutterwaveInitResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-06, T-07-15) ───────────────
  if (!(await isPaymentMethodEnabled("flutterwave"))) {
    return { error: "Flutterwave is not available" }
  }

  // ── 2. Build order context — server-side validation + total recompute ──────
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // ── 3. Insert order + items atomically via db.batch ───────────────────────
  // Status: pending_payment (not yet confirmed by Flutterwave)
  // tx_ref = ctx.reference — used as the stable webhook lookup key (gatewayReference)
  try {
    await db.batch([
      db.insert(orders).values({
        id: orderId,
        reference,
        guestToken,
        status: "pending_payment",
        userId,
        customerEmail,
        subtotalKobo: totals.subtotalKobo,
        shippingKobo: totals.shippingKobo,
        totalKobo: totals.totalKobo,
        gatewayProvider: "flutterwave",
        gatewayReference: reference,  // tx_ref for stable webhook lookup
        shippingName:     parsed.address.fullName,
        shippingPhone:    parsed.address.phone,
        shippingStreet:   parsed.address.street,
        shippingCity:     parsed.address.city,
        shippingState:    parsed.address.state,
        shippingLandmark: parsed.address.landmark ?? null,
        createdAt: new Date(),
      }),
      ...(items.length > 0
        ? [db.insert(orderItems).values(items)]
        : []
      ),
    ])
  } catch (err) {
    console.error("[flutterwave] order insert failed:", err)
    return { error: "Something went wrong creating your order. Please try again." }
  }

  // ── 4. Compute naira amount for popup (critical unit conversion) ──────────
  // amountKobo ÷ 100 = naira — Flutterwave popup requires naira (Pitfall 1)
  const amountNaira = totals.totalKobo / 100

  // ── 5. Return client data — secret NEVER in return value (T-07-16, D-08) ──
  // Public key resolves DB-first (admin Settings), env-fallback — same resolver as the secret.
  const flutterwaveCfg = await getGatewayConfig("flutterwave")
  return {
    publicKey: flutterwaveCfg.public_key ?? "",
    txRef: reference,     // client passes tx_ref to FlutterwaveCheckout() + verifyFlutterwavePayment
    amountNaira,          // naira amount for FlutterwaveCheckout({ amount })
    email: customerEmail,
    customerName: parsed.address.fullName,
    phone: parsed.address.phone,
    guestToken,           // used to redirect to /order/{guestToken} after confirm
  }
}

// ─── verifyFlutterwavePayment ─────────────────────────────────────────────────

export type FlutterwaveVerifyResult = { guestToken: string } | { error: string }

/**
 * Verify a Flutterwave payment after the popup success callback.
 *
 * PAY-06 / D-04 / T-07-12:
 *   1. Toggle check FIRST (PAY-12, D-06, T-07-15)
 *   2. Look up order by gatewayReference (txRef from the popup callback)
 *   3. Re-fetch authoritative status + amount from Flutterwave (never trust client, T-07-12)
 *      - transactionId from popup callback; server independently verifies via FLW API
 *   4. Reject if status !== "confirmed" OR verified amountKobo < order.totalKobo (tampering guard)
 *      - amountKobo is already normalized by the adapter (naira × 100) — Pitfall 1/8
 *   5. Call confirmOrderPaid with eventId "flutterwave:"+txRef — shared with webhook (D-04, T-07-13)
 *   6. On oversold: call flutterwaveRefund(transactionId) + return { error } (T-07-14)
 *   7. Return { guestToken } → client redirects to /order/{guestToken}
 */
export async function verifyFlutterwavePayment({
  transactionId,
  txRef,
}: {
  transactionId: string
  txRef: string
}): Promise<FlutterwaveVerifyResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-06, T-07-15) ───────────────
  if (!(await isPaymentMethodEnabled("flutterwave"))) {
    return { error: "Flutterwave is not available" }
  }

  // ── 2. Look up order by gateway reference ─────────────────────────────────
  const order = await getOrderByGatewayReference(txRef)
  if (!order) {
    return { error: "Order not found" }
  }

  // ── 3. Re-fetch authoritative status from Flutterwave ─────────────────────
  // Client provides transactionId (numeric FLW txn id) — server verifies independently.
  // The adapter normalizes amountNaira → amountKobo (× 100) for uniform comparison (Pitfall 8).
  let v: Awaited<ReturnType<typeof flutterwaveVerify>>
  try {
    v = await flutterwaveVerify(transactionId)
  } catch (err) {
    console.error("[flutterwave] verify failed:", err)
    return { error: "We could not verify your payment. Please contact support if you were charged." }
  }

  // ── 4a. Status guard ──────────────────────────────────────────────────────
  if (v.status !== "confirmed") {
    return { error: "Payment not confirmed" }
  }

  // ── 4b. Amount guard (T-07-12 Tampering mitigation, Pitfall 1/8) ─────────
  // v.amountKobo is already normalized to kobo by the adapter (naira × 100).
  // Reject if the Flutterwave-verified amount is less than the server-computed order total.
  // Use < (not !==) — any shortfall is tampering; exact integer compare after normalization.
  if (v.amountKobo < order.totalKobo) {
    console.error(
      "[flutterwave] Amount mismatch — verified:", v.amountKobo,
      "expected:", order.totalKobo,
      "orderId:", order.id
    )
    return { error: "Amount mismatch" }
  }

  // ── 5. Shared idempotent confirmation path (D-04, T-07-13) ───────────────
  // eventId "flutterwave:"+txRef is identical to what the webhook will use (D-04, T-07-13).
  // Whichever arrives first (this callback verify OR the webhook) wins the idempotency insert.
  const eventId = "flutterwave:" + txRef
  const result = await confirmOrderPaid(order, {
    provider: "flutterwave",
    eventId,
  })

  // ── 6. Oversold recovery (T-07-14) ────────────────────────────────────────
  if (result.outcome === "oversold") {
    // confirmOrderPaid already set order to payment_failed. Refund via Flutterwave.
    // transactionId is the numeric FLW txn id required by the refund endpoint.
    await flutterwaveRefund(transactionId).catch((err) => {
      console.error("[flutterwave] refund on oversold failed:", err)
    })
    return { error: "Item sold out — you have been refunded" }
  }

  // outcome === "confirmed" or "duplicate" (webhook beat us) — both mean order is paid
  return { guestToken: order.guestToken }
}
