// src/lib/cart/logic.ts
// Pure cart-math utilities: parse, serialize, clamp, merge, hydrate.
// No DB, no import restrictions — safe to import in Client Components AND unit tests.
// CART-01/02/03: core cart logic (D-06/D-08/D-10/D-11/D-12)

// ─── Cookie Constants (D-08) ──────────────────────────────────────────────────

/** Cookie name for the guest cart. "ms" = Mandy Store; short name saves cookie bytes. */
export const CART_COOKIE = "ms_cart"

/** Guest cart cookie lifetime: 30 days in seconds (D-08). */
export const MAX_AGE = 30 * 24 * 60 * 60

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Guest cookie item shape — stored in cookie; shared by guest and DB paths.
 * Stores ONLY variantId + quantity — never prices (D-08/D-09, CLAUDE.md).
 */
export type GuestCartItem = { variantId: string; quantity: number }

/**
 * Variant-stock-and-price lookup consumed by hydrateCart.
 * One row per variant in the cart — fetched server-side from variants table.
 * Prices always sourced from here, never from cookie or client (SC4).
 */
export type CartVariantRow = {
  variantId: string
  priceKobo: number     // from variants.priceKobo — never client-supplied
  stock: number
  isActive: boolean
  productName: string
  variantLabel: string  // e.g. "Black / 128GB"
  imageUrl: string | null
}

/**
 * Hydrated line item — computed server-side only; never derived from cookie prices.
 */
export type CartLineItem = {
  variantId: string
  quantity: number          // already clamped to stock
  stock: number
  priceKobo: number
  productName: string
  variantLabel: string
  imageUrl: string | null
  lineTotalKobo: number     // priceKobo * quantity, 0 when isOOS
  isOOS: boolean            // stock === 0 OR !isActive  (D-11)
  isClamped: boolean        // requested qty was reduced to stock (D-12)
}

/** Full cart result returned by hydrateCart — all math is server-side (SC4). */
export type CartResult = {
  items: CartLineItem[]
  subtotalKobo: number      // sum of lineTotalKobo for non-OOS lines (SC4)
  totalQty: number          // sum of quantity for non-OOS lines (D-13)
  hasOOS: boolean           // any item isOOS — blocks checkout (D-11)
}

// ─── parseCartCookie ──────────────────────────────────────────────────────────

/**
 * Parse the raw guest cart cookie value into typed items.
 *
 * @param value  Raw cookie string (may be undefined, malformed, or empty)
 * @returns Array of valid GuestCartItem; [] on any parse error or invalid input.
 *
 * Security: Catches malformed JSON (try/catch), validates shape (Array.isArray +
 * per-field typeof filter). An attacker who forges the cookie can only affect
 * valid variantId strings and number quantities — prices are never stored (T-03-02).
 */
export function parseCartCookie(value: string | undefined): GuestCartItem[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is GuestCartItem =>
        typeof item.variantId === "string" && typeof item.quantity === "number"
    )
  } catch {
    return []
  }
}

// ─── serializeCartCookie ──────────────────────────────────────────────────────

/**
 * Serialize cart items to a JSON string for storage in the cookie.
 * Inverse of parseCartCookie.
 */
export function serializeCartCookie(items: GuestCartItem[]): string {
  return JSON.stringify(items)
}

// ─── clampToStock ─────────────────────────────────────────────────────────────

/**
 * Clamp a requested quantity to available stock (D-06/D-12).
 *
 * @param qty    Requested quantity
 * @param stock  Available stock count
 * @returns min(qty, stock) — never exceeds stock, never below 0
 */
export function clampToStock(qty: number, stock: number): number {
  return Math.max(0, Math.min(qty, stock))
}

// ─── mergeCartItems ───────────────────────────────────────────────────────────

/**
 * Merge guest cookie cart items with DB cart items, clamped to stock (D-10).
 *
 * Algorithm:
 *   1. Sum quantities per variantId across both lists (additive merge)
 *   2. Clamp sum to stockMap[variantId] (default 0 if unknown variant)
 *   3. Drop variants where clamped qty === 0
 *
 * This matches the resolved conflict strategy: min(guestQty + dbQty, stock).
 *
 * @param guest     Items from the guest cookie
 * @param db        Items from the user's DB cart
 * @param stockMap  Current stock per variantId (fetched server-side)
 * @returns Merged, stock-clamped list of items
 */
export function mergeCartItems(
  guest: GuestCartItem[],
  db: GuestCartItem[],
  stockMap: Record<string, number>
): GuestCartItem[] {
  // Accumulate quantities from both lists
  const quantityByVariant = new Map<string, number>()

  for (const item of [...guest, ...db]) {
    const existing = quantityByVariant.get(item.variantId) ?? 0
    quantityByVariant.set(item.variantId, existing + item.quantity)
  }

  // Clamp to stock and drop zero-qty results
  const merged: GuestCartItem[] = []
  for (const [variantId, totalQty] of quantityByVariant) {
    const stock = stockMap[variantId] ?? 0
    const clamped = clampToStock(totalQty, stock)
    if (clamped > 0) {
      merged.push({ variantId, quantity: clamped })
    }
  }
  return merged
}

// ─── hydrateCart ─────────────────────────────────────────────────────────────

/**
 * Hydrate cart items with server-fetched variant data (prices, stock, labels).
 *
 * Security contract (SC4, CLAUDE.md "never trust client prices"):
 *   - All price data comes from variantRows (server DB), never from items
 *   - lineTotalKobo = row.priceKobo * quantity — client cannot influence price
 *
 * Behaviors:
 *   - Items with unknown variantId are DROPPED (forged-cookie safety, T-03-03)
 *   - OOS (stock===0 or !isActive): isOOS=true, qty preserved for display,
 *     lineTotalKobo=0, excluded from subtotal/totalQty (D-11)
 *   - Clamped (stock < qty): quantity reduced to stock, isClamped=true,
 *     lineTotalKobo recomputed at clamped qty (D-12)
 *
 * @param items       Raw cart items (from cookie or DB), unvalidated quantities
 * @param variantRows Server-fetched variant data (prices, stock, labels)
 * @returns CartResult with all math computed server-side
 */
export function hydrateCart(
  items: GuestCartItem[],
  variantRows: CartVariantRow[]
): CartResult {
  // Build lookup map for O(1) variant access
  const rowByVariantId = new Map(variantRows.map((r) => [r.variantId, r]))

  let subtotalKobo = 0
  let totalQty = 0
  let hasOOS = false

  const lineItems: CartLineItem[] = []

  for (const item of items) {
    const row = rowByVariantId.get(item.variantId)
    // Drop items not in the server-fetched rows (forged variantId, T-03-03)
    if (!row) continue

    const isOOS = row.stock === 0 || !row.isActive

    let quantity: number
    let isClamped: boolean

    if (isOOS) {
      // OOS: preserve stored quantity for display; don't count in totals
      quantity = item.quantity
      isClamped = false
      hasOOS = true
    } else {
      // In-stock: clamp to available stock (D-12)
      const clamped = clampToStock(item.quantity, row.stock)
      isClamped = clamped < item.quantity
      quantity = clamped
    }

    // lineTotalKobo is 0 for OOS lines; always uses server priceKobo (SC4)
    const lineTotalKobo = isOOS ? 0 : row.priceKobo * quantity

    if (!isOOS) {
      subtotalKobo += lineTotalKobo
      totalQty += quantity
    }

    lineItems.push({
      variantId: item.variantId,
      quantity,
      stock: row.stock,
      priceKobo: row.priceKobo,
      productName: row.productName,
      variantLabel: row.variantLabel,
      imageUrl: row.imageUrl,
      lineTotalKobo,
      isOOS,
      isClamped,
    })
  }

  return { items: lineItems, subtotalKobo, totalQty, hasOOS }
}
