"use server"
// src/lib/actions/cart.ts
// Cart Server Actions: addToCart, updateCartItem, removeCartItem.
// CART-01 / CART-02 / D-06 / D-07 / D-09 / D-12 / T-03-05 / T-03-07
//
// Security contracts:
//   - userId ALWAYS from auth() session — never from client input (IDOR-safe, T-03-07)
//   - Prices NEVER read from client — always fetched from variants.priceKobo (SC4)
//   - Quantity always clamped to variants.stock server-side (T-03-05, D-06/D-12)
//   - variantId validated as UUID and confirmed to exist + isActive in DB (T-03-08)

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { cart, cartItems, variants } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import { clampToStock, type GuestCartItem } from "@/lib/cart/logic"
import { getGuestCartItems, setGuestCartItems } from "@/lib/cart/cookie"
import { getCartCount } from "@/lib/cart/queries"

// ─── Validation ───────────────────────────────────────────────────────────────

const VariantId = z.string().uuid()
const Qty = z.number().int().min(0).max(1000)

// ─── Return type consumed by Plan 03 UI ─────────────────────────────────────

export type CartActionResult = { success: boolean; count: number; error?: string }

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Fetch the minimal variant row needed for stock clamping + active check.
 * Returns undefined if the variant is not found in the DB.
 */
async function fetchVariant(
  variantId: string
): Promise<{ id: string; stock: number; isActive: boolean } | undefined> {
  return db.query.variants.findFirst({
    where: eq(variants.id, variantId),
    columns: { id: true, stock: true, isActive: true },
  })
}

/**
 * Get-or-create the cart row for an authenticated user.
 * Uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicate-user-cart errors.
 *
 * @param userId  Session user ID — never from client input (IDOR-safe).
 * @returns The cart id for this user.
 */
async function getOrCreateCartId(userId: string): Promise<string> {
  // Try to find existing cart
  const existing = await db.query.cart.findFirst({
    where: eq(cart.userId, userId),
    columns: { id: true },
  })
  if (existing) return existing.id

  // Create a new cart row (idempotent — unique constraint on userId)
  const newId = crypto.randomUUID()
  await db.insert(cart).values({ id: newId, userId }).onConflictDoNothing({
    target: cart.userId,
  })

  // Re-fetch in case of a race (another concurrent request created it first)
  const created = await db.query.cart.findFirst({
    where: eq(cart.userId, userId),
    columns: { id: true },
  })
  return created!.id
}

// ─── addToCart ────────────────────────────────────────────────────────────────

/**
 * Add a variant to the cart. Additive merge: if the variant already exists,
 * the quantities are summed and clamped to stock (Research Pitfall 5 — concurrent adds).
 *
 * Guest path: writes to ms_cart cookie (httpOnly, lax, 30d).
 * Authed path: upserts cart_item row keyed to the session user's cart (IDOR-safe).
 *
 * @param variantId  UUID of the variant to add (validated server-side).
 * @param quantity   Desired quantity (default 1); clamped to stock (D-06/D-12).
 * @returns CartActionResult: success + updated total count, or an error message.
 */
export async function addToCart(
  variantId: string,
  quantity: number = 1
): Promise<CartActionResult> {
  // T-03-05: Validate inputs with Zod before touching the DB
  const parsed = z.object({
    variantId: VariantId,
    quantity: z.number().int().min(1).max(1000),
  }).safeParse({ variantId, quantity })

  if (!parsed.success) {
    return { success: false, count: 0, error: "Invalid input" }
  }

  // T-03-08: Validate variant existence, isActive, and stock server-side
  const variant = await fetchVariant(parsed.data.variantId)
  if (!variant || !variant.isActive || variant.stock === 0) {
    return { success: false, count: 0, error: "Out of stock" }
  }

  const desired = clampToStock(parsed.data.quantity, variant.stock)

  // Detect guest vs authed — userId ONLY from auth() session (T-03-07)
  const session = await auth()

  if (session?.user?.id) {
    // ─── Authed path: write to DB cart_item ──────────────────────────────
    const userId = session.user.id
    const cartId = await getOrCreateCartId(userId)

    // INSERT ... ON CONFLICT DO UPDATE: additive + clamped (Research Pitfall 5)
    // LEAST(existing_quantity + desired, stock) ensures we never exceed stock (D-12)
    await db
      .insert(cartItems)
      .values({
        id: crypto.randomUUID(),
        cartId,
        variantId: parsed.data.variantId,
        quantity: desired,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: {
          quantity: sql`LEAST(${cartItems.quantity} + ${desired}, ${variant.stock})`,
          updatedAt: new Date(),
        },
      })
  } else {
    // ─── Guest path: write to ms_cart cookie ─────────────────────────────
    const items = await getGuestCartItems()

    const existingIdx = items.findIndex(
      (i) => i.variantId === parsed.data.variantId
    )

    if (existingIdx >= 0) {
      // Additive merge: sum quantities then clamp to stock (D-10 logic, additive)
      const newQty = clampToStock(
        items[existingIdx].quantity + desired,
        variant.stock
      )
      items[existingIdx] = { variantId: parsed.data.variantId, quantity: newQty }
    } else {
      items.push({ variantId: parsed.data.variantId, quantity: desired })
    }

    await setGuestCartItems(items)
  }

  revalidatePath("/", "layout")
  const count = await getCartCount()
  return { success: true, count }
}

// ─── updateCartItem ───────────────────────────────────────────────────────────

/**
 * Update the quantity for a cart line.
 * qty 0 → delegates to removeCartItem (D-07).
 * qty > 0 → clamps to current stock (D-06/D-12) and writes.
 *
 * @param variantId  UUID of the variant.
 * @param quantity   New desired quantity (0 = remove; >0 = update clamped to stock).
 */
export async function updateCartItem(
  variantId: string,
  quantity: number
): Promise<CartActionResult> {
  // Validate inputs
  const parsedId = VariantId.safeParse(variantId)
  const parsedQty = Qty.safeParse(quantity)

  if (!parsedId.success || !parsedQty.success) {
    return { success: false, count: 0, error: "Invalid input" }
  }

  // Delegate qty=0 to removeCartItem (D-07)
  if (parsedQty.data === 0) {
    return removeCartItem(parsedId.data)
  }

  // T-03-08: Validate variant existence + stock
  const variant = await fetchVariant(parsedId.data)
  if (!variant) {
    return { success: false, count: 0, error: "Variant not found" }
  }

  const desired = clampToStock(parsedQty.data, variant.stock)

  const session = await auth()

  if (session?.user?.id) {
    // ─── Authed path ──────────────────────────────────────────────────────
    const cartRow = await db.query.cart.findFirst({
      where: eq(cart.userId, session.user.id),
      columns: { id: true },
    })
    if (!cartRow) return { success: false, count: 0, error: "Cart not found" }

    await db
      .update(cartItems)
      .set({ quantity: desired, updatedAt: new Date() })
      .where(
        and(
          eq(cartItems.cartId, cartRow.id),
          eq(cartItems.variantId, parsedId.data)
        )
      )
  } else {
    // ─── Guest path ───────────────────────────────────────────────────────
    const items = await getGuestCartItems()
    const updated: GuestCartItem[] = items.map((i) =>
      i.variantId === parsedId.data ? { ...i, quantity: desired } : i
    )
    await setGuestCartItems(updated)
  }

  revalidatePath("/", "layout")
  const count = await getCartCount()
  return { success: true, count }
}

// ─── removeCartItem ───────────────────────────────────────────────────────────

/**
 * Remove a variant from the cart entirely (D-07).
 * Authed path: deletes only from the session user's cart (IDOR-safe, T-03-07).
 * Guest path: filters the variant out of the cookie items.
 *
 * @param variantId  UUID of the variant to remove.
 */
export async function removeCartItem(
  variantId: string
): Promise<CartActionResult> {
  const parsedId = VariantId.safeParse(variantId)
  if (!parsedId.success) {
    return { success: false, count: 0, error: "Invalid input" }
  }

  const session = await auth()

  if (session?.user?.id) {
    // ─── Authed path: delete only from the session user's cart (IDOR-safe) ─
    const cartRow = await db.query.cart.findFirst({
      where: eq(cart.userId, session.user.id),
      columns: { id: true },
    })

    if (cartRow) {
      await db.delete(cartItems).where(
        and(
          eq(cartItems.cartId, cartRow.id),
          eq(cartItems.variantId, parsedId.data)
        )
      )
    }
  } else {
    // ─── Guest path: filter out the variant from the cookie ───────────────
    const items = await getGuestCartItems()
    const filtered = items.filter((i) => i.variantId !== parsedId.data)
    await setGuestCartItems(filtered)
  }

  revalidatePath("/", "layout")
  const count = await getCartCount()
  return { success: true, count }
}
