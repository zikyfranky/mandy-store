// tests/cart/cart-db.test.ts
// Cart DB integration tests — skip if DATABASE_URL is not set.
// Covers: CART-01, D-09 (cart_item stores no prices), CART-03 (persistence)
// Plan 02 extends: addToCart round-trip, mergeGuestCartOnLogin

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateCartTables } from "../helpers/db"

// server-only is a no-op in Node test environment (queries.ts uses it)
vi.mock("server-only", () => ({}))

const skip = !hasDatabase

// ─── Tracked IDs for cleanup ──────────────────────────────────────────────────
// cart-db tests insert their own catalog rows using random UUIDs.
// They clean up only the cart tables (cart_item → cart) in afterEach,
// then remove their own user/variant/product/brand/category rows individually
// to avoid truncating shared tables that other test files may rely on.

const createdUserIds: string[] = []
const createdVariantIds: string[] = []
const createdProductIds: string[] = []
const createdBrandIds: string[] = []
const createdCategoryIds: string[] = []

afterEach(async () => {
  if (!hasDatabase) return
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")
  const { eq, inArray } = await import("drizzle-orm")

  // FK-safe order: cart tables first, then catalog, then auth
  await truncateCartTables()

  // Remove this test's catalog rows (by tracked IDs only — don't wipe shared data)
  if (createdVariantIds.length)
    await db.delete(schema.variants).where(inArray(schema.variants.id, [...createdVariantIds]))
  if (createdProductIds.length)
    await db.delete(schema.products).where(inArray(schema.products.id, [...createdProductIds]))
  if (createdBrandIds.length)
    await db.delete(schema.brands).where(inArray(schema.brands.id, [...createdBrandIds]))
  if (createdCategoryIds.length)
    await db.delete(schema.categories).where(inArray(schema.categories.id, [...createdCategoryIds]))

  // Remove this test's user rows
  if (createdUserIds.length) {
    await db.delete(schema.sessions).where(inArray(schema.sessions.userId, [...createdUserIds]))
    await db.delete(schema.accounts).where(inArray(schema.accounts.userId, [...createdUserIds]))
    await db.delete(schema.users).where(inArray(schema.users.id, [...createdUserIds]))
  }

  // Reset tracking arrays
  createdUserIds.length = 0
  createdVariantIds.length = 0
  createdProductIds.length = 0
  createdBrandIds.length = 0
  createdCategoryIds.length = 0
  void eq // suppress unused import warning
})

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Seed a minimal cart fixture: user → product/variant → cart → cart_item.
 * Tracks all created IDs for cleanup in afterEach.
 * Returns the IDs for assertion.
 */
async function seedCartFixture() {
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Create a user
  const userId = crypto.randomUUID()
  createdUserIds.push(userId)
  await db.insert(schema.users).values({
    id: userId,
    email: `test-${userId.slice(0, 8)}@example.com`,
    name: "Test User",
    role: "customer",
  })

  // Create a category and brand for the product FK
  const categoryId = crypto.randomUUID()
  createdCategoryIds.push(categoryId)
  await db.insert(schema.categories).values({
    id: categoryId,
    name: `CartTest-Cat-${categoryId.slice(0, 8)}`,
    slug: `carttest-cat-${categoryId.slice(0, 8)}`,
  })
  const brandId = crypto.randomUUID()
  createdBrandIds.push(brandId)
  await db.insert(schema.brands).values({
    id: brandId,
    name: `CartTest-Brand-${brandId.slice(0, 8)}`,
  })

  // Create a product
  const productId = crypto.randomUUID()
  createdProductIds.push(productId)
  await db.insert(schema.products).values({
    id: productId,
    name: "Test Cart Phone",
    slug: `test-cart-phone-${productId.slice(0, 8)}`,
    categoryId,
    brandId,
    isActive: true,
  })

  // Create a variant (priceKobo on variants, NOT cart_item — D-09)
  const variantId = crypto.randomUUID()
  createdVariantIds.push(variantId)
  await db.insert(schema.variants).values({
    id: variantId,
    productId,
    sku: `SKU-CART-${variantId.slice(0, 8)}`,
    priceKobo: 5_000_000, // price lives here, never in cart_item (D-09)
    stock: 10,
    isActive: true,
  })

  // Create a cart for the user
  const cartId = crypto.randomUUID()
  await db.insert(schema.cart).values({
    id: cartId,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Create a cart_item — NO priceKobo column (D-08/D-09)
  const cartItemId = crypto.randomUUID()
  await db.insert(schema.cartItems).values({
    id: cartItemId,
    cartId,
    variantId,
    quantity: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  return { userId, categoryId, brandId, productId, variantId, cartId, cartItemId }
}

// ─── Cart DB table smoke tests ────────────────────────────────────────────────

describe("cart DB tables", () => {
  it.skipIf(skip)(
    "cart_item row reads back with correct quantity and NO price field (D-08/D-09)",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const { cartItemId, variantId, cartId } = await seedCartFixture()

      const [item] = await db
        .select()
        .from(schema.cartItems)
        .where(eq(schema.cartItems.id, cartItemId))

      expect(item).toBeDefined()
      expect(item.id).toBe(cartItemId)
      expect(item.cartId).toBe(cartId)
      expect(item.variantId).toBe(variantId)
      expect(item.quantity).toBe(2)

      // Verify no price column exists on the cart_item row (D-09, T-03-01)
      expect("priceKobo" in item).toBe(false)
      expect("price_kobo" in item).toBe(false)
    }
  )

  it.skipIf(skip)(
    "cart_user_unique constraint: second cart insert for same user throws",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const { userId } = await seedCartFixture()

      // Inserting a second cart for the same user should violate the unique constraint
      await expect(
        db.insert(schema.cart).values({
          id: crypto.randomUUID(),
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow()
    }
  )

  it.skipIf(skip)(
    "cart_item_variant_unique constraint: duplicate variant in same cart throws",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const { cartId, variantId } = await seedCartFixture()

      // Inserting a second cart_item with same cartId + variantId should throw
      await expect(
        db.insert(schema.cartItems).values({
          id: crypto.randomUUID(),
          cartId,
          variantId,
          quantity: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow()
    }
  )

  // Plan 02 extends: addToCart round-trip, mergeGuestCartOnLogin
})
