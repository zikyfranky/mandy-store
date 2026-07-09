import "server-only"
// src/lib/orders/queries.ts
// Order data access layer — server-only.
// Used by: Plans 03 (checkout action), 04 (webhook), 06 (order status page).
// D-12: token lookups return undefined on miss (no enumeration).

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"

/**
 * Looks up an order by the guest access token (64-char hex, IDOR-safe).
 * Returns the order with all its items, or undefined if the token is unknown.
 *
 * @param token - The guest token from the order URL
 */
export async function getOrderByToken(token: string) {
  if (!token) return undefined
  return db.query.orders.findFirst({
    where: eq(orders.guestToken, token),
    with: { items: true },
  })
}

/**
 * Looks up an order by Stripe PaymentIntent ID.
 * Used by the Stripe webhook handler to locate the matching order.
 *
 * @param piId - The Stripe PaymentIntent ID (pi_xxx)
 */
export async function getOrderByStripePaymentIntentId(piId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.stripePaymentIntentId, piId),
    with: { items: true },
  })
}

/**
 * Returns only the order status field for the given guest token.
 * Lighter read for the confirmation page polling path (D-07).
 *
 * @param token - The guest token from the order URL
 */
export async function getOrderStatusByToken(token: string): Promise<string | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.guestToken, token),
    columns: { status: true },
  })
  return order?.status ?? null
}

/**
 * Looks up an order by the gateway-agnostic reference field.
 * Used by Paystack/Flutterwave webhook handlers and verify-on-callback actions.
 *
 * @param reference - The gateway reference (Paystack: order reference; Flutterwave: tx_ref)
 */
export async function getOrderByGatewayReference(reference: string) {
  if (!reference) return undefined
  return db.query.orders.findFirst({
    where: eq(orders.gatewayReference, reference),
    with: { items: true },
  })
}

// ─── Customer-scoped order reads (Phase 6, AUTH-04) ────────────────────────────
// IDOR-safe (D-04): ownership lives IN the SQL WHERE clause, never a post-fetch check.
// `userId` MUST come from verifySession() (the caller passes it) — never from the request.

/**
 * Single order for the account order-detail page — IDOR-safe.
 * Returns the order (with items) ONLY when it belongs to `userId`.
 * Returns null for both a nonexistent id AND an order owned by another user
 * (indistinguishable — the page renders an identical "not found" for both, no enumeration).
 *
 * @param userId  - The verified session user id (never a client-supplied value)
 * @param orderId - The order id from the route param
 */
export async function getOrderForUser(userId: string, orderId: string) {
  if (!userId || !orderId) return null
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    with: { items: true },
  })
  return order ?? null
}

/**
 * Order-history list for the account order-history page — scoped to the caller.
 * Returns only `userId`'s orders, newest first, each with a numeric item count.
 * Returns [] for a user with no orders (feeds the empty state).
 *
 * @param userId - The verified session user id (never a client-supplied value)
 */
export async function listOrdersForUser(userId: string) {
  if (!userId) return []

  const itemCountSq = db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`COUNT(*)`.as("item_count"),
    })
    .from(orderItems)
    .groupBy(orderItems.orderId)
    .as("item_count_sq")

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      createdAt: orders.createdAt,
      status: orders.status,
      totalKobo: orders.totalKobo,
      itemCount: itemCountSq.itemCount,
    })
    .from(orders)
    .leftJoin(itemCountSq, eq(orders.id, itemCountSq.orderId))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    createdAt: r.createdAt,
    status: r.status,
    totalKobo: r.totalKobo,
    itemCount: Number(r.itemCount ?? 0),
  }))
}
