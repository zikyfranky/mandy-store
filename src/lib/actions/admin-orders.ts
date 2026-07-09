"use server"
import "server-only"
// src/lib/actions/admin-orders.ts
// Admin order-fulfillment Server Actions (ADMN-03, ORD-03).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement in updateOrderStatus, before any
//     DB access (D-02, T-05-14).
//   - updateOrderStatus is the ONE shared, guarded transition function — no other file may
//     write orders.status (D-08, T-05-15). Transitions are validated against the
//     LEGAL_TRANSITIONS allowlist; anything not listed is rejected server-side regardless
//     of what the UI sends.
//   - awaiting_bank_transfer -> payment_confirmed delegates VERBATIM to the existing
//     idempotent confirmOrderPaid() path (D-09, T-05-16/T-05-17) — this is the only place
//     that performs the atomic stock decrement for bank-transfer orders. No reimplementation.
//   - shipped/delivered fire the ORD-03 status-change email non-blocking (D-10); processing
//     and all other transitions do not.

import { eq } from "drizzle-orm"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { sendOrderStatusChangeEmail } from "@/lib/email/send-order-status-change"
// D-08: single transition allowlist — extracted to a non-"use server" module because
// Next.js requires every export of a "use server" file to be an async function, and
// getValidNextStatuses is a plain sync helper the UI calls directly (see
// src/lib/orders/legal-transitions.ts for the full rationale).
import { LEGAL_TRANSITIONS } from "@/lib/orders/legal-transitions"

export type UpdateOrderStatusResult = { success: boolean; outcome?: string }

/**
 * The single guarded fulfillment-status transition function (D-08). Never write
 * orders.status anywhere else.
 */
export async function updateOrderStatus(
  orderId: string,
  nextStatus: string
): Promise<UpdateOrderStatusResult> {
  await verifyAdminSession() // D-02 — first statement

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  })
  if (!order) {
    throw new Error("Order not found")
  }

  // D-09: bank-transfer confirm reuses the shared idempotent path verbatim — never
  // reimplement the atomic decrement/idempotency logic here. Legal from
  // awaiting_bank_transfer (per LEGAL_TRANSITIONS) OR when the order is already
  // payment_confirmed — the latter is a re-confirm/double-call, which confirmOrderPaid's
  // own idempotency guard resolves to { outcome: "duplicate" } (T-05-17). Any other
  // current status attempting to jump straight to payment_confirmed is still illegal.
  if (nextStatus === "payment_confirmed") {
    const allowedForConfirm = order.status === "payment_confirmed" || (LEGAL_TRANSITIONS[order.status] ?? []).includes(nextStatus)
    if (!allowedForConfirm) {
      throw new Error(`Illegal transition: ${order.status} -> ${nextStatus}`)
    }
    const result = await confirmOrderPaid(order, {
      provider: "bank_transfer",
      eventId: `bank_transfer:${order.reference}`, // deterministic idempotency key
    })
    return { success: result.outcome === "confirmed", outcome: result.outcome }
  }

  const allowed = LEGAL_TRANSITIONS[order.status] ?? []
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Illegal transition: ${order.status} -> ${nextStatus}`)
  }

  await db
    .update(orders)
    .set({ status: nextStatus as typeof order.status })
    .where(eq(orders.id, orderId))

  // D-10: email ONLY on shipped/delivered, non-blocking.
  if (nextStatus === "shipped" || nextStatus === "delivered") {
    sendOrderStatusChangeEmail({
      customerEmail: order.customerEmail,
      reference: order.reference,
      guestToken: order.guestToken,
      newStatus: nextStatus,
    }).catch(console.error)
  }

  return { success: true }
}
