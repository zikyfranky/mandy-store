import "server-only"
// src/lib/cart/merge.ts
// D-10: Merge guest cookie cart into the authenticated user's DB cart on login.
//
// Security contracts:
//   - userId comes from auth() session (caller: login() Server Action) — never client input
//   - Only variants present in the live stockMap are merged (forged-cookie safety, T-03-08)
//   - Additive merge clamped to stock: Math.min(guestQty + dbQty, stock) (Open-Q1)
//   - Guest cookie cleared after merge to prevent duplicate items on refresh

import { db } from "@/lib/db/client"
import { cart, cartItems, variants } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { mergeCartItems } from "@/lib/cart/logic"
import { getGuestCartItems, clearGuestCartCookie } from "@/lib/cart/cookie"

// ─── mergeGuestCartOnLogin ───────────────────────────────────────────────────

/**
 * Merge the guest cookie cart into the user's DB cart after a successful login.
 *
 * Algorithm (D-10, Open-Q1):
 *   1. Read guest cookie items; if empty, return early (no work to do).
 *   2. Get-or-create the user's cart row.
 *   3. Read the user's existing DB cart items.
 *   4. Fetch current stock for all involved variantIds.
 *   5. mergeCartItems(guest, db, stockMap) → additive+clamped merged list.
 *      - Variants missing from stockMap (not found or inactive) are dropped (T-03-08).
 *   6. Upsert each merged item into cart_item (onConflictDoUpdate quantity).
 *   7. Clear the guest cookie (maxAge: 0) so it is not re-applied on refresh.
 *
 * @param userId  Authenticated user's ID — from auth() session, never from client.
 */
export async function mergeGuestCartOnLogin(userId: string): Promise<void> {
  // Step 1: Read guest cookie; bail out early if nothing to merge
  const guestItems = await getGuestCartItems()
  if (guestItems.length === 0) return

  // Step 2: Get-or-create the user's cart row
  let cartRow = await db.query.cart.findFirst({
    where: eq(cart.userId, userId),
    columns: { id: true },
  })

  if (!cartRow) {
    const newId = crypto.randomUUID()
    await db.insert(cart).values({ id: newId, userId }).onConflictDoNothing({
      target: cart.userId,
    })
    cartRow = await db.query.cart.findFirst({
      where: eq(cart.userId, userId),
      columns: { id: true },
    })
  }

  // If cart still can't be found (race condition), abort merge
  if (!cartRow) return

  const cartId = cartRow.id

  // Step 3: Read the user's existing DB cart items
  const dbCartItems = await db.query.cartItems.findMany({
    where: eq(cartItems.cartId, cartId),
    columns: { variantId: true, quantity: true },
  })
  const dbItems = dbCartItems.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
  }))

  // Step 4: Collect all variantIds (guest + DB) and fetch current stock
  const allVariantIds = [
    ...new Set([
      ...guestItems.map((i) => i.variantId),
      ...dbItems.map((i) => i.variantId),
    ]),
  ]

  const variantRows = await db.query.variants.findMany({
    where: inArray(variants.id, allVariantIds),
    columns: { id: true, stock: true, isActive: true },
  })

  // Build stockMap — only include active variants with stock > 0 (forged-cookie safety, T-03-08)
  const stockMap: Record<string, number> = {}
  for (const v of variantRows) {
    if (v.isActive && v.stock > 0) {
      stockMap[v.id] = v.stock
    }
  }

  // Step 5: Merge additively, clamped to stock (D-10)
  // mergeCartItems drops variants absent from stockMap (missing/inactive/OOS)
  const merged = mergeCartItems(guestItems, dbItems, stockMap)

  // Step 6: Upsert merged quantities into cart_item
  for (const item of merged) {
    await db
      .insert(cartItems)
      .values({
        id: crypto.randomUUID(),
        cartId,
        variantId: item.variantId,
        quantity: item.quantity,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: {
          quantity: item.quantity,
          updatedAt: new Date(),
        },
      })
  }

  // Step 7: Clear the guest cookie to prevent re-merging on the next request
  await clearGuestCartCookie()
}
