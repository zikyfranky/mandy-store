import "server-only"
// src/lib/cart/queries.ts
// Cart data access layer — server-only (never imported in client bundles).
// NEVER cache this module — cookie reads are request-time (Research Pitfall 3).
// CART-01 / CART-03 / SC4 / D-08 / D-09 / D-11 / D-12 / D-13

import { db } from "@/lib/db/client"
import { cart, cartItems, variants, products, productImages } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { getGuestCartItems } from "@/lib/cart/cookie"
import {
  hydrateCart,
  type CartVariantRow,
  type CartResult,
  type GuestCartItem,
} from "@/lib/cart/logic"

// ─── loadVariantRows ─────────────────────────────────────────────────────────

/**
 * Fetch variant rows for the given IDs, joined with product name + first image.
 * Prices always sourced from here — never from cookie or client (SC4, CLAUDE.md).
 *
 * @param variantIds  IDs to look up; may be empty.
 * @returns CartVariantRow[] with all fields needed by hydrateCart.
 */
async function loadVariantRows(variantIds: string[]): Promise<CartVariantRow[]> {
  if (variantIds.length === 0) return []

  // Load variants with product + productImages relations
  const variantRows = await db.query.variants.findMany({
    where: inArray(variants.id, variantIds),
    with: {
      product: {
        with: {
          images: { orderBy: (img, { asc }) => [asc(img.position)] },
        },
      },
      optionValues: {
        with: {
          optionValue: {
            with: { option: true },
          },
        },
      },
    },
  })

  return variantRows.map((v) => {
    // Build a human-readable variant label, e.g. "Black / 128GB"
    // Sort by option position for consistent display order
    const labelParts = v.optionValues
      .sort((a, b) => (a.optionValue.option?.position ?? 0) - (b.optionValue.option?.position ?? 0))
      .map((ov) => ov.optionValue.value)
    const variantLabel = labelParts.length > 0 ? labelParts.join(" / ") : ""

    // Variant-specific imageUrl first; fall back to first product image
    const imageUrl =
      v.imageUrl ??
      v.product.images[0]?.url ??
      null

    return {
      variantId: v.id,
      priceKobo: v.priceKobo,
      stock: v.stock,
      isActive: v.isActive,
      productName: v.product.name,
      variantLabel,
      imageUrl,
    } satisfies CartVariantRow
  })
}

// ─── getGuestRaw ─────────────────────────────────────────────────────────────

/**
 * Read raw guest cart items from the cookie.
 * Returns [] if cookie is absent or malformed.
 */
async function getGuestRaw(): Promise<GuestCartItem[]> {
  return getGuestCartItems()
}

// ─── getDbRaw ────────────────────────────────────────────────────────────────

/**
 * Read raw cart items for an authenticated user from the DB.
 * Only returns items belonging to the verified session user (IDOR-safe via FK).
 *
 * @param userId  User ID from the verified session — never from client input.
 */
async function getDbRaw(userId: string): Promise<GuestCartItem[]> {
  // Look up the user's cart (may not exist yet for a new user)
  const userCart = await db.query.cart.findFirst({
    where: eq(cart.userId, userId),
    with: { items: true },
  })

  if (!userCart) return []

  return userCart.items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }))
}

// ─── getCart ─────────────────────────────────────────────────────────────────

/**
 * Unified server-side cart read: guest cookie path OR authed DB path.
 *
 * Hydration:
 *   - Joins variant rows from DB (prices, stock, labels) — never from cookie (SC4)
 *   - Excludes OOS lines from subtotal; sets hasOOS (D-11)
 *   - Clamps quantities to current stock (D-12)
 *
 * This route is always dynamic (reads cookies() / DB at request time).
 * This route is always dynamic — reading cookies/DB per request (Research Pitfall 3).
 */
export async function getCart(): Promise<CartResult> {
  const session = await auth()
  const raw = session?.user?.id
    ? await getDbRaw(session.user.id)
    : await getGuestRaw()

  const variantIds = raw.map((i) => i.variantId)
  const rows = await loadVariantRows(variantIds)

  return hydrateCart(raw, rows)
}

// ─── getCartCount ─────────────────────────────────────────────────────────────

/**
 * Returns the total item quantity for non-OOS lines (D-13).
 * Used by layout.tsx to seed CartProvider and SiteHeader badge.
 */
export async function getCartCount(): Promise<number> {
  return (await getCart()).totalQty
}
