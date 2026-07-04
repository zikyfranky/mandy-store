import "server-only"
// src/lib/orders/queries.ts
// Order data access layer — server-only.
// Used by: Plans 03 (checkout action), 04 (webhook), 06 (order status page).
// D-12: token lookups return undefined on miss (no enumeration).

import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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
