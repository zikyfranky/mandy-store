"use server"
import "server-only"
// src/lib/actions/gtpay.ts
// GTPay Server Action: initGtpayPayment (PAY-10 / PAY-12 / D-14).
// Config variant of the Interswitch WebPay flow (D-12) — same action shape, gtpay adapter.
//
// Security: toggle-first (PAY-12, T-71-16); server total recompute (T-71-14); server-only
// adapter (no secret to client, T-71-17); gatewayReference = order reference (Pitfall 4).

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { buildOrderContext, type CheckoutInput } from "@/lib/actions/checkout"
import { gtpayAdapter } from "@/lib/payments/gateways/gtpay"

export type GtpayInitResult =
  | { mode: "redirect"; url: string; method: "POST"; fields: Record<string, string>; guestToken: string }
  | { error: string }

export async function initGtpayPayment(input: CheckoutInput): Promise<GtpayInitResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-18) ─────────────────────
  if (!isPaymentMethodEnabled("gtpay")) {
    return { error: "GTPay is not available" }
  }

  // ── 2. Build order context — server-side validation + total recompute ──────
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // ── 3. Insert pending_payment order + items ───────────────────────────────
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
        gatewayProvider: "gtpay",
        gatewayReference: reference,
        shippingName:     parsed.address.fullName,
        shippingPhone:    parsed.address.phone,
        shippingStreet:   parsed.address.street,
        shippingCity:     parsed.address.city,
        shippingState:    parsed.address.state,
        shippingLandmark: parsed.address.landmark ?? null,
        createdAt: new Date(),
      }),
      ...(items.length > 0 ? [db.insert(orderItems).values(items)] : []),
    ])
  } catch (err) {
    console.error("[gtpay] order insert failed:", err)
    return { error: "Something went wrong creating your order. Please try again." }
  }

  // ── 4. Build the WebPay POST redirect (server total, T-71-14) ─────────────
  try {
    const init = await gtpayAdapter.initPayment({
      email: customerEmail,
      amountKobo: totals.totalKobo,
      reference,
      orderId,
      customerName: parsed.address.fullName,
      phone: parsed.address.phone,
    })
    if (init.mode !== "redirect" || !("method" in init)) {
      throw new Error("gtpay adapter did not return a POST redirect")
    }
    return { ...init, guestToken }
  } catch (err) {
    console.error("[gtpay] initPayment failed:", err)
    await db.delete(orders).where(eq(orders.id, orderId)).catch((cleanupErr) => {
      console.error("[gtpay] failed to roll back orphaned order:", cleanupErr)
    })
    return {
      error: "We couldn't start the GTPay payment. Please try again in a moment, or choose another payment method.",
    }
  }
}
