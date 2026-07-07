"use server"
import "server-only"
// src/lib/actions/remita.ts
// Remita Server Action: initRemitaPayment (PAY-11 / PAY-12 / D-14 / D-17).
//
// D-17: the RRR is generated inside remitaAdapter.initPayment. We call the adapter FIRST,
// then persist the returned RRR as gatewayReference so the callback/webhook can look the
// order up by RRR. The RRR is NOT leaked to the client separately — it is already in the URL.
//
// Security: toggle-first (PAY-12, T-71-16); server total recompute (T-71-14); server-only adapter.

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { buildOrderContext, type CheckoutInput } from "@/lib/actions/checkout"
import { remitaAdapter } from "@/lib/payments/gateways/remita"

export type RemitaInitResult =
  | { mode: "redirect"; url: string; guestToken: string }
  | { error: string }

export async function initRemitaPayment(input: CheckoutInput): Promise<RemitaInitResult> {
  // ── 1. Toggle check — FIRST statement (PAY-12, D-18) ─────────────────────
  if (!isPaymentMethodEnabled("remita")) {
    return { error: "Remita is not available" }
  }

  // ── 2. Build order context — server-side validation + total recompute ──────
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // ── 3. Generate the RRR (D-17 — adapter first, so gatewayReference = RRR) ──
  let init: { mode: "redirect"; url: string; rrr?: string }
  try {
    const result = await remitaAdapter.initPayment({
      email: customerEmail,
      amountKobo: totals.totalKobo, // server-computed kobo — never trust client (T-71-14)
      reference,
      orderId,
      customerName: parsed.address.fullName,
      phone: parsed.address.phone,
    })
    if (result.mode !== "redirect" || "method" in result || !result.rrr) {
      throw new Error("remita adapter did not return an RRR")
    }
    init = result
  } catch (err) {
    console.error("[remita] initPayment failed:", err)
    return {
      error: "We couldn't start the Remita payment. Please try again in a moment, or choose another payment method.",
    }
  }

  // ── 4. Insert pending_payment order with gatewayReference = RRR (D-17) ─────
  // Gateway pre-step already succeeded; on insert failure we log for manual reconciliation
  // (no orphan to roll back — the order was never created).
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
        gatewayProvider: "remita",
        gatewayReference: init.rrr, // RRR — the callback/webhook look up by this (D-17)
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
    console.error("[remita] order insert failed after RRR generation (RRR=" + init.rrr + "):", err)
    return { error: "Something went wrong creating your order. Please try again." }
  }

  // Do NOT leak the RRR separately — it is already embedded in the redirect URL.
  return { mode: "redirect", url: init.url, guestToken }
}
