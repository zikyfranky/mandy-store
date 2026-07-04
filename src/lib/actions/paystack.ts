"use server"
import "server-only"
// src/lib/actions/paystack.ts
// Paystack Server Actions: initPaystackPayment + verifyPaystackPayment.
// PAY-05 / PAY-12 / D-04 / D-06
//
// Security contracts:
//   - isPaymentMethodEnabled("paystack") is the FIRST statement in every action (PAY-12, D-06, T-07-09)
//   - Server-side total ALWAYS recomputed from buildOrderContext() → getCart() — client amount ignored (T-07-06)
//   - verifyPaystackPayment re-fetches from Paystack server-side; rejects if verified < order.totalKobo (T-07-06)
//   - eventId "paystack:" + reference shared by callback + webhook so exactly one confirms (D-04, T-07-07)
//   - Only NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY returned to client; secret never in response (T-07-10, D-08)

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { buildOrderContext, type CheckoutInput } from "@/lib/actions/checkout"
import { paystackInitialize, paystackVerify, paystackRefund } from "@/lib/payments/gateways/paystack"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"

// ─── initPaystackPayment ───────────────────────────────────────────────────────

export type PaystackInitResult =
  | { accessCode: string; reference: string; publicKey: string; guestToken: string }
  | { error: string }

/**
 * Create a Paystack payment session and a pending_payment order.
 *
 * PAY-05 / PAY-12:
 *   1. Toggle check FIRST — rejects before any DB or gateway call (D-06, T-07-09)
 *   2. buildOrderContext: Zod-validate input, server-recompute totals from getCart() (T-07-06)
 *   3. Insert order (pending_payment) + orderItems via db.batch
 *   4. Set gatewayProvider="paystack", gatewayReference=ctx.reference for later webhook lookup
 *   5. Call paystackInitialize → get accessCode (client uses it for resumeTransaction())
 *   6. On Paystack failure: roll back orphan order + return { error }
 *   7. Return { accessCode, reference, publicKey, guestToken } — secret NEVER in return value (T-07-10)
 */
export async function initPaystackPayment(input: CheckoutInput): Promise<PaystackInitResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-06) ─────────────────────
  if (!isPaymentMethodEnabled("paystack")) {
    return { error: "Paystack is not available" }
  }

  // ── 2. Build order context — server-side validation + total recompute ──────
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // ── 3. Insert order + items atomically via db.batch ───────────────────────
  // Status: pending_payment (not yet confirmed by Paystack)
  // gatewayProvider + gatewayReference set so the webhook can look up this order
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
        gatewayProvider: "paystack",
        gatewayReference: reference,  // Paystack reference = our order reference (stable across verify + webhook)
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
    console.error("[paystack] order insert failed:", err)
    return { error: "Something went wrong creating your order. Please try again." }
  }

  // ── 4. Initialize Paystack transaction ────────────────────────────────────
  // On failure: roll back the orphan order so a failed start leaves no dangling row (mirrors Stripe pattern)
  let accessCode: string
  try {
    const result = await paystackInitialize({
      email: customerEmail,
      amountKobo: totals.totalKobo,  // server-computed kobo — never trust client (T-07-06)
      reference,                      // our order reference = gateway reference for lookup
      orderId,
    })
    accessCode = result.accessCode
  } catch (err) {
    console.error("[paystack] paystackInitialize failed:", err)
    // Roll back the orphaned pending_payment order (same recovery as Stripe)
    await db.delete(orders).where(eq(orders.id, orderId)).catch((cleanupErr) => {
      console.error("[paystack] failed to roll back orphaned order:", cleanupErr)
    })
    return {
      error: "We couldn't start the Paystack payment. Please try again in a moment, or choose another payment method.",
    }
  }

  // ── 5. Return client data — secret NEVER in return value (T-07-10, D-08) ──
  return {
    accessCode,
    reference,                                        // client passes this to verifyPaystackPayment
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,  // client-safe (NEXT_PUBLIC_ prefix)
    guestToken,                                       // used to redirect to /order/{guestToken}
  }
}

// ─── verifyPaystackPayment ────────────────────────────────────────────────────

export type PaystackVerifyResult = { guestToken: string } | { error: string }

/**
 * Verify a Paystack payment after the popup success callback.
 *
 * PAY-05 / D-04 / T-07-06:
 *   1. Toggle check FIRST (PAY-12, D-06)
 *   2. Look up order by gatewayReference (reference from the popup callback)
 *   3. Re-fetch authoritative status + amount from Paystack (never trust client, T-07-06)
 *   4. Reject if status !== "confirmed" OR verified amountKobo < order.totalKobo (tampering guard)
 *   5. Call confirmOrderPaid with eventId "paystack:"+reference — shared with webhook (D-04, T-07-07)
 *   6. On oversold: call paystackRefund + return { error } (T-07-08)
 *   7. Return { guestToken } → client redirects to /order/{guestToken}
 */
export async function verifyPaystackPayment({
  reference,
}: {
  reference: string
}): Promise<PaystackVerifyResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-06) ─────────────────────
  if (!isPaymentMethodEnabled("paystack")) {
    return { error: "Paystack is not available" }
  }

  // ── 2. Look up order by gateway reference ─────────────────────────────────
  const order = await getOrderByGatewayReference(reference)
  if (!order) {
    return { error: "Order not found" }
  }

  // ── 3. Re-fetch authoritative status from Paystack ────────────────────────
  // Client provides ONLY the reference — server must verify status and amount independently
  let v: Awaited<ReturnType<typeof paystackVerify>>
  try {
    v = await paystackVerify(reference)
  } catch (err) {
    console.error("[paystack] verify failed:", err)
    return { error: "We could not verify your payment. Please contact support if you were charged." }
  }

  // ── 4a. Status guard ──────────────────────────────────────────────────────
  if (v.status !== "confirmed") {
    return { error: "Payment not confirmed" }
  }

  // ── 4b. Amount guard (T-07-06 Tampering mitigation) ──────────────────────
  // Reject if the Paystack-verified amount is less than the server-computed order total.
  // This prevents a client from paying less than the actual price.
  // Use < (not !==) to allow for exact integer match only; any shortfall is tampering.
  if (v.amountKobo < order.totalKobo) {
    console.error(
      "[paystack] Amount mismatch — verified:", v.amountKobo,
      "expected:", order.totalKobo,
      "orderId:", order.id
    )
    return { error: "Amount mismatch" }
  }

  // ── 5. Shared idempotent confirmation path (D-04) ─────────────────────────
  // eventId "paystack:"+reference is identical to what the webhook will use (D-04, T-07-07).
  // Whichever arrives first (this callback verify OR the webhook) wins the idempotency insert.
  const eventId = "paystack:" + reference
  const result = await confirmOrderPaid(order, {
    provider: "paystack",
    eventId,
  })

  // ── 6. Oversold recovery (T-07-08) ────────────────────────────────────────
  if (result.outcome === "oversold") {
    // confirmOrderPaid already set order to payment_failed. Refund via Paystack.
    await paystackRefund(reference).catch((err) => {
      console.error("[paystack] refund on oversold failed:", err)
    })
    return { error: "Item sold out — you have been refunded" }
  }

  // outcome === "confirmed" or "duplicate" (webhook beat us) — both mean order is paid
  return { guestToken: order.guestToken }
}
