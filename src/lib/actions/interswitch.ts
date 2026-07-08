"use server"
import "server-only"
// src/lib/actions/interswitch.ts
// Interswitch Server Action: initInterswitchPayment (PAY-09 / PAY-12 / D-14).
//
// Security contracts (mirror paystack.ts):
//   - isPaymentMethodEnabled("interswitch") is the FIRST statement (PAY-12, D-18, T-71-16)
//   - Total ALWAYS recomputed server-side via buildOrderContext() — client amount ignored (T-71-14)
//   - Redirect + POST fields returned to the client carry NO secret (adapter is server-only, T-71-17)
//   - gatewayReference = order reference (stable across the callback requery, Pitfall 4)

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { buildOrderContext, type CheckoutInput } from "@/lib/actions/checkout"
import { interswitchAdapter } from "@/lib/payments/gateways/interswitch"

export type InterswitchInitResult =
  | { mode: "redirect"; url: string; method: "POST"; fields: Record<string, string>; guestToken: string }
  | { error: string }

export async function initInterswitchPayment(input: CheckoutInput): Promise<InterswitchInitResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-18) ─────────────────────
  if (!(await isPaymentMethodEnabled("interswitch"))) {
    return { error: "Interswitch is not available" }
  }

  // ── 2. Build order context — server-side validation + total recompute ──────
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // ── 3. Insert pending_payment order + items (gatewayReference = order reference) ──
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
        gatewayProvider: "interswitch",
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
    console.error("[interswitch] order insert failed:", err)
    return { error: "Something went wrong creating your order. Please try again." }
  }

  // ── 4. Build the WebPay POST redirect (server total, never client price, T-71-14) ──
  try {
    const init = await interswitchAdapter.initPayment({
      email: customerEmail,
      amountKobo: totals.totalKobo,
      reference,
      orderId,
      customerName: parsed.address.fullName,
      phone: parsed.address.phone,
    })
    if (init.mode !== "redirect" || !("method" in init)) {
      throw new Error("interswitch adapter did not return a POST redirect")
    }
    return { ...init, guestToken }
  } catch (err) {
    console.error("[interswitch] initPayment failed:", err)
    await db.delete(orders).where(eq(orders.id, orderId)).catch((cleanupErr) => {
      console.error("[interswitch] failed to roll back orphaned order:", cleanupErr)
    })
    return {
      error: "We couldn't start the Interswitch payment. Please try again in a moment, or choose another payment method.",
    }
  }
}
