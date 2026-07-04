import "server-only"
// src/lib/payments/shared/confirm-order-paid.ts
// D-04: Shared idempotent order-confirmation path.
//
// This is extracted from the Stripe webhook handler and is now the single place that:
//   1. Inserts into processed_webhook_events (ON CONFLICT DO NOTHING) — idempotency guard (T-07-01)
//   2. Flips the order to payment_confirmed + sets paidAt
//   3. Atomically decrements each line's variant stock (WHERE stock >= qty — T-07-02)
//   4. Detects last-unit-race oversold (D-09) and marks payment_failed
//   5. Sends the confirmation email (non-blocking)
//
// Called by: Stripe webhook (Plan 01), Paystack webhook (Plan 02), Flutterwave webhook (Plan 03),
//            and the verify-on-callback Server Actions (Plans 02/03).
//
// IMPORTANT: This helper is gateway-agnostic. It does NOT call any Stripe/Paystack/Flutterwave API.
// On oversold it returns { outcome: "oversold", refundNeeded: true } — the CALLER performs the refund.
//
// Security: provider is accepted as a string so future gateways can reuse without type widening here.

import { db } from "@/lib/db/client"
import { processedWebhookEvents, orders, variants } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"

/**
 * Minimal order shape required by confirmOrderPaid.
 * Must include the items array (with stock-decrement fields) and basic email fields.
 */
export type OrderWithItems = {
  id: string
  status: string
  customerEmail: string
  reference: string
  guestToken: string
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
  items: Array<{
    variantId: string
    quantity: number
    productName: string
    variantLabel: string
    lineTotalKobo: number
  }>
}

export type ConfirmResult =
  | { outcome: "confirmed" }
  | { outcome: "duplicate" }
  | { outcome: "oversold"; refundNeeded: true }

/**
 * Idempotent order-confirmation helper shared by all gateway webhook handlers and
 * verify-on-callback actions.
 *
 * @param order - The order to confirm, with items pre-loaded.
 * @param provider - The gateway provider string (e.g. "stripe", "paystack", "flutterwave").
 * @param eventId - Deterministic idempotency key for this confirmation event.
 *                  Must be the same value from both the webhook and the callback verify
 *                  so exactly one wins via ON CONFLICT DO NOTHING (Pitfall 3 / D-04).
 *
 * @returns { outcome: "confirmed" }              — first confirmation; order flipped, stock decremented, email sent.
 * @returns { outcome: "duplicate" }              — already processed (idempotency guard fired).
 * @returns { outcome: "oversold", refundNeeded } — decrement failed; order marked payment_failed. Caller must refund.
 */
export async function confirmOrderPaid(
  order: OrderWithItems,
  { provider, eventId }: { provider: string; eventId: string }
): Promise<ConfirmResult> {

  // ── 1. Idempotency guard (T-07-01) ──────────────────────────────────────────
  // Insert the event id FIRST. If this exact eventId was already processed, the unique
  // constraint fires and ON CONFLICT DO NOTHING returns rowCount === 0 → early return.
  // This is the guard that makes both the webhook and the verify-on-callback idempotent —
  // whichever arrives first wins; the second is a no-op.
  const [idempotencyResult] = await db.batch([
    db
      .insert(processedWebhookEvents)
      .values({ id: eventId, provider })
      .onConflictDoNothing(),
  ])

  if (idempotencyResult.rowCount === 0) {
    // Already processed — duplicate delivery or verify-on-callback beat the webhook (or vice versa).
    return { outcome: "duplicate" }
  }

  // ── 2. Already-confirmed guard ────────────────────────────────────────────
  // Defensive: if the order was already confirmed by another path (e.g. admin manual confirm),
  // treat this as a duplicate rather than overwriting state.
  if (order.status === "payment_confirmed") {
    return { outcome: "duplicate" }
  }

  // ── 3. Atomic batch: flip order + decrement stock (T-07-02) ──────────────
  // Build a raw-SQL conditional decrement for each order line.
  // WHERE stock >= qty is the oversell guard (CLAUDE.md: atomic stock decrement; SC5).
  // RETURNING id lets us count affected rows without relying on driver-specific rowCount fields.
  type DecrementResult = { rows: { id: string }[] }
  const decrementStatements = order.items.map((item) =>
    db.execute<{ id: string }>(sql`
      UPDATE "variant"
      SET stock = stock - ${item.quantity}
      WHERE id = ${item.variantId}
        AND stock >= ${item.quantity}
      RETURNING id
    `)
  )

  const [, ...decrementResults] = (await db.batch([
    db
      .update(orders)
      .set({ status: "payment_confirmed", paidAt: new Date() })
      .where(eq(orders.id, order.id)),
    ...decrementStatements,
  ])) as [unknown, ...DecrementResult[]]

  // ── 4. Last-unit race detection (D-09) ───────────────────────────────────
  // If any decrement affected 0 rows, that variant was oversold: another confirmation
  // ran concurrently and drove the stock to 0 before ours arrived.
  //
  // Recovery: mark the order payment_failed + refundReason. The CALLER is responsible
  // for performing the gateway-specific refund (stripe.refunds.create, etc.).
  // This helper returns refundNeeded: true — it never calls a gateway API.
  const anyOversold = decrementResults.some((r) => r.rows.length === 0)

  if (anyOversold) {
    await db
      .update(orders)
      .set({ status: "payment_failed", refundReason: "oversold" })
      .where(eq(orders.id, order.id))

    console.error(
      "[confirmOrderPaid] Oversold — caller must refund. eventId:", eventId,
      "orderId:", order.id
    )

    return { outcome: "oversold", refundNeeded: true }
  }

  // ── 5. Happy path: send confirmation email (ORD-01) ──────────────────────
  // Non-blocking (.catch(console.error)) — email failure must not fail the webhook acknowledgement.
  sendOrderConfirmationEmail({
    customerEmail: order.customerEmail,
    reference: order.reference,
    guestToken: order.guestToken,
    items: order.items.map((i) => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      lineTotalKobo: i.lineTotalKobo,
    })),
    subtotalKobo: order.subtotalKobo,
    shippingKobo: order.shippingKobo,
    totalKobo: order.totalKobo,
  }).catch(console.error)

  return { outcome: "confirmed" }
}
