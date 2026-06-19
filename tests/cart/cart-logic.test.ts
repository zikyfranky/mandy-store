// tests/cart/cart-logic.test.ts
// Covers: CART-01/02/03, D-10/D-11/D-12 — pure cart math
// Pure unit tests — no DB, no vi.mock needed.

import { describe, it, expect } from "vitest"
import {
  parseCartCookie,
  serializeCartCookie,
  clampToStock,
  mergeCartItems,
  hydrateCart,
  CART_COOKIE,
  MAX_AGE,
  type GuestCartItem,
  type CartVariantRow,
} from "@/lib/cart/logic"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeVariantRow(
  variantId: string,
  priceKobo: number,
  stock: number,
  isActive = true
): CartVariantRow {
  return {
    variantId,
    priceKobo,
    stock,
    isActive,
    productName: "Test Product",
    variantLabel: "Black / 128GB",
    imageUrl: null,
  }
}

// ─── parseCartCookie ──────────────────────────────────────────────────────────

describe("parseCartCookie()", () => {
  it("returns [] for undefined input", () => {
    expect(parseCartCookie(undefined)).toEqual([])
  })

  it("returns [] for empty string", () => {
    expect(parseCartCookie("")).toEqual([])
  })

  it("returns [] for non-JSON string", () => {
    expect(parseCartCookie("not json")).toEqual([])
  })

  it("returns [] for JSON object (not array)", () => {
    expect(parseCartCookie('{"variantId":"v1","quantity":2}')).toEqual([])
  })

  it("parses a valid single-item cookie", () => {
    const result = parseCartCookie('[{"variantId":"v1","quantity":2}]')
    expect(result).toEqual([{ variantId: "v1", quantity: 2 }])
  })

  it("parses a valid multi-item cookie", () => {
    const result = parseCartCookie(
      '[{"variantId":"v1","quantity":2},{"variantId":"v2","quantity":1}]'
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ variantId: "v1", quantity: 2 })
    expect(result[1]).toEqual({ variantId: "v2", quantity: 1 })
  })

  it("filters out entries missing variantId", () => {
    const result = parseCartCookie('[{"quantity":2},{"variantId":"v1","quantity":1}]')
    expect(result).toHaveLength(1)
    expect(result[0].variantId).toBe("v1")
  })

  it("filters out entries missing quantity", () => {
    const result = parseCartCookie('[{"variantId":"v1"},{"variantId":"v2","quantity":3}]')
    expect(result).toHaveLength(1)
    expect(result[0].variantId).toBe("v2")
  })

  it("filters out entries with wrong variantId type (number)", () => {
    const result = parseCartCookie('[{"variantId":123,"quantity":2}]')
    expect(result).toEqual([])
  })

  it("filters out entries with wrong quantity type (string)", () => {
    const result = parseCartCookie('[{"variantId":"v1","quantity":"2"}]')
    expect(result).toEqual([])
  })

  it("returns [] for malformed JSON (truncated)", () => {
    expect(parseCartCookie('[{"variantId":"v1"')).toEqual([])
  })

  it("returns [] for JSON null", () => {
    expect(parseCartCookie("null")).toEqual([])
  })
})

// ─── serializeCartCookie ──────────────────────────────────────────────────────

describe("serializeCartCookie()", () => {
  it("serializes an empty array to '[]'", () => {
    expect(serializeCartCookie([])).toBe("[]")
  })

  it("serializes items back to valid JSON round-trippable with parseCartCookie", () => {
    const items: GuestCartItem[] = [
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
    ]
    const serialized = serializeCartCookie(items)
    const parsed = parseCartCookie(serialized)
    expect(parsed).toEqual(items)
  })
})

// ─── clampToStock ─────────────────────────────────────────────────────────────

describe("clampToStock()", () => {
  it("returns stock when qty > stock (D-06/D-12)", () => {
    expect(clampToStock(5, 3)).toBe(3)
  })

  it("returns qty when qty <= stock", () => {
    expect(clampToStock(2, 10)).toBe(2)
  })

  it("returns 0 when stock is 0", () => {
    expect(clampToStock(4, 0)).toBe(0)
  })

  it("returns exact qty when qty === stock", () => {
    expect(clampToStock(5, 5)).toBe(5)
  })

  it("handles qty=0 with positive stock", () => {
    expect(clampToStock(0, 10)).toBe(0)
  })
})

// ─── mergeCartItems ───────────────────────────────────────────────────────────

describe("mergeCartItems()", () => {
  it("additive merge: guest 2 + db 3, stock 4 → clamped to 4 (D-10)", () => {
    const guest: GuestCartItem[] = [{ variantId: "v1", quantity: 2 }]
    const db: GuestCartItem[] = [{ variantId: "v1", quantity: 3 }]
    const stockMap = { v1: 4 }
    const result = mergeCartItems(guest, db, stockMap)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ variantId: "v1", quantity: 4 })
  })

  it("guest-only variant is added to result", () => {
    const guest: GuestCartItem[] = [{ variantId: "v2", quantity: 2 }]
    const db: GuestCartItem[] = []
    const stockMap = { v2: 10 }
    const result = mergeCartItems(guest, db, stockMap)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ variantId: "v2", quantity: 2 })
  })

  it("db-only variant is preserved", () => {
    const guest: GuestCartItem[] = []
    const db: GuestCartItem[] = [{ variantId: "v3", quantity: 1 }]
    const stockMap = { v3: 5 }
    const result = mergeCartItems(guest, db, stockMap)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ variantId: "v3", quantity: 1 })
  })

  it("drops variant not in stockMap (clamped to 0)", () => {
    const guest: GuestCartItem[] = [{ variantId: "unknown", quantity: 2 }]
    const db: GuestCartItem[] = []
    const result = mergeCartItems(guest, db, {})
    expect(result).toHaveLength(0)
  })

  it("handles merge of multiple variants independently", () => {
    const guest: GuestCartItem[] = [
      { variantId: "v1", quantity: 1 },
      { variantId: "v2", quantity: 3 },
    ]
    const db: GuestCartItem[] = [
      { variantId: "v1", quantity: 2 },
      { variantId: "v3", quantity: 1 },
    ]
    const stockMap = { v1: 5, v2: 10, v3: 2 }
    const result = mergeCartItems(guest, db, stockMap)
    const v1 = result.find((i) => i.variantId === "v1")
    const v2 = result.find((i) => i.variantId === "v2")
    const v3 = result.find((i) => i.variantId === "v3")
    expect(v1?.quantity).toBe(3) // 1+2 = 3, stock=5 → 3
    expect(v2?.quantity).toBe(3) // guest-only, stock=10 → 3
    expect(v3?.quantity).toBe(1) // db-only, stock=2 → 1
  })

  it("clamps when sum exceeds stock", () => {
    const guest: GuestCartItem[] = [{ variantId: "v1", quantity: 8 }]
    const db: GuestCartItem[] = [{ variantId: "v1", quantity: 7 }]
    const stockMap = { v1: 10 }
    const result = mergeCartItems(guest, db, stockMap)
    expect(result[0].quantity).toBe(10) // min(8+7, 10) = 10
  })
})

// ─── hydrateCart ──────────────────────────────────────────────────────────────

describe("hydrateCart()", () => {
  it("returns empty CartResult for empty items", () => {
    const result = hydrateCart([], [])
    expect(result.items).toHaveLength(0)
    expect(result.subtotalKobo).toBe(0)
    expect(result.totalQty).toBe(0)
    expect(result.hasOOS).toBe(false)
  })

  it("in-stock line: quantity unchanged, lineTotalKobo = priceKobo * qty, isOOS false", () => {
    const items: GuestCartItem[] = [{ variantId: "v1", quantity: 2 }]
    const rows = [makeVariantRow("v1", 5_000_000, 10)]
    const result = hydrateCart(items, rows)
    expect(result.items).toHaveLength(1)
    const line = result.items[0]
    expect(line.quantity).toBe(2)
    expect(line.lineTotalKobo).toBe(10_000_000) // 5_000_000 * 2
    expect(line.isOOS).toBe(false)
    expect(line.isClamped).toBe(false)
    expect(result.subtotalKobo).toBe(10_000_000)
    expect(result.totalQty).toBe(2)
    expect(result.hasOOS).toBe(false)
  })

  it("stock < stored qty: clamps quantity, isClamped true, lineTotalKobo recomputed (D-12)", () => {
    const items: GuestCartItem[] = [{ variantId: "v1", quantity: 5 }]
    const rows = [makeVariantRow("v1", 2_000_000, 3)] // stock=3 < qty=5
    const result = hydrateCart(items, rows)
    const line = result.items[0]
    expect(line.quantity).toBe(3) // clamped to stock
    expect(line.isClamped).toBe(true)
    expect(line.isOOS).toBe(false)
    expect(line.lineTotalKobo).toBe(6_000_000) // 2_000_000 * 3 (clamped qty)
    expect(result.subtotalKobo).toBe(6_000_000)
    expect(result.totalQty).toBe(3)
  })

  it("stock === 0: isOOS true, quantity preserved for display, lineTotalKobo 0 (D-11)", () => {
    const items: GuestCartItem[] = [{ variantId: "v1", quantity: 2 }]
    const rows = [makeVariantRow("v1", 5_000_000, 0)]
    const result = hydrateCart(items, rows)
    const line = result.items[0]
    expect(line.isOOS).toBe(true)
    expect(line.quantity).toBe(2) // preserved for display
    expect(line.lineTotalKobo).toBe(0) // excluded from total
    expect(result.subtotalKobo).toBe(0) // OOS lines excluded
    expect(result.totalQty).toBe(0)   // OOS lines excluded
    expect(result.hasOOS).toBe(true)
  })

  it("isActive=false: isOOS true, excluded from subtotal (D-11)", () => {
    const items: GuestCartItem[] = [{ variantId: "v1", quantity: 1 }]
    const rows = [makeVariantRow("v1", 3_000_000, 10, false)] // isActive=false
    const result = hydrateCart(items, rows)
    const line = result.items[0]
    expect(line.isOOS).toBe(true)
    expect(line.lineTotalKobo).toBe(0)
    expect(result.subtotalKobo).toBe(0)
    expect(result.hasOOS).toBe(true)
  })

  it("item with variantId absent from variantRows is dropped (forged-cookie safety)", () => {
    const items: GuestCartItem[] = [
      { variantId: "forged-id", quantity: 1 },
      { variantId: "v1", quantity: 2 },
    ]
    const rows = [makeVariantRow("v1", 1_000_000, 5)]
    const result = hydrateCart(items, rows)
    expect(result.items).toHaveLength(1) // forged-id dropped
    expect(result.items[0].variantId).toBe("v1")
  })

  it("mixed cart: OOS line excluded from subtotal and totalQty, in-stock line included", () => {
    const items: GuestCartItem[] = [
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
    ]
    const rows = [
      makeVariantRow("v1", 5_000_000, 10), // in-stock
      makeVariantRow("v2", 3_000_000, 0),  // OOS
    ]
    const result = hydrateCart(items, rows)
    expect(result.subtotalKobo).toBe(10_000_000) // only v1: 5_000_000 * 2
    expect(result.totalQty).toBe(2)              // only v1 counted
    expect(result.hasOOS).toBe(true)
  })

  it("subtotalKobo is sum of non-OOS lineTotalKobo (SC4 — server-side only)", () => {
    const items: GuestCartItem[] = [
      { variantId: "v1", quantity: 3 },
      { variantId: "v2", quantity: 2 },
    ]
    const rows = [
      makeVariantRow("v1", 1_000_000, 10),
      makeVariantRow("v2", 2_000_000, 5),
    ]
    const result = hydrateCart(items, rows)
    // v1: 1_000_000 * 3 = 3_000_000; v2: 2_000_000 * 2 = 4_000_000; total = 7_000_000
    expect(result.subtotalKobo).toBe(7_000_000)
    expect(result.totalQty).toBe(5)
  })
})

// ─── Constants ────────────────────────────────────────────────────────────────

describe("CART_COOKIE + MAX_AGE constants", () => {
  it("CART_COOKIE is 'ms_cart'", () => {
    expect(CART_COOKIE).toBe("ms_cart")
  })

  it("MAX_AGE is 30 days in seconds (D-08)", () => {
    expect(MAX_AGE).toBe(30 * 24 * 60 * 60)
  })
})
