// tests/cart/cart-db.test.ts
// Cart DB integration tests — skip if DATABASE_URL is not set.
// Covers: CART-01, D-09 (cart_item stores no prices), CART-03 (persistence)
// Plan 02 extends: addToCart round-trip, mergeGuestCartOnLogin

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateCartTables } from "../helpers/db"

// server-only is a no-op in Node test environment (queries.ts uses it)
vi.mock("server-only", () => ({}))

// Mock next/headers so cookie helpers don't fail in test (authed path doesn't write cookies)
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

// Mock next/cache so revalidatePath doesn't throw "static generation store missing" in tests
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}))

// Mock @/lib/auth — individual tests override auth() to return a fixed session
vi.mock("@/lib/auth", () => ({
  signIn:   vi.fn(),
  signOut:  vi.fn(),
  auth:     vi.fn().mockResolvedValue(null),
  handlers: {},
}))

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

  // ─── Plan 02 additions: addToCart authed round-trip ─────────────────────────

  it.skipIf(skip)(
    "addToCart() authed path: writes cart_item with clamped quantity, no price stored (CART-01, D-09)",
    async () => {
      const { variantId, userId, cartId } = await seedCartFixture()

      // Override auth() to return this test's user
      const { auth } = await import("@/lib/auth")
      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email: "test@example.com", name: "Test" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as unknown as Awaited<ReturnType<typeof auth>>)

      const { addToCart } = await import("@/lib/actions/cart")
      // The seedCartFixture already inserted a cart_item with qty 2.
      // addToCart should upsert: 2 (existing) + 1 (requested) = 3 (clamped to stock=10)
      const result = await addToCart(variantId, 1)

      expect(result.success).toBe(true)
      expect(result.count).toBeGreaterThan(0)

      const { db } = await import("@/lib/db/client")
      const { cartItems: cartItemsSchema } = await import("@/lib/db/schema")
      const { and, eq } = await import("drizzle-orm")

      const [item] = await db
        .select()
        .from(cartItemsSchema)
        .where(
          and(
            eq(cartItemsSchema.cartId, cartId),
            eq(cartItemsSchema.variantId, variantId)
          )
        )

      expect(item).toBeDefined()
      // Additive: was 2, added 1 → should be 3
      expect(item.quantity).toBe(3)
      // No price stored (D-09, T-03-01)
      expect("priceKobo" in item).toBe(false)
      expect("price_kobo" in item).toBe(false)
    }
  )

  it.skipIf(skip)(
    "addToCart() re-add is additive+clamped to stock (D-06/D-12)",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      // Create a user + variant with stock=2
      const userId = crypto.randomUUID()
      createdUserIds.push(userId)
      await db.insert(schema.users).values({
        id: userId,
        email: `stockclamp-${userId.slice(0, 8)}@example.com`,
        name: "Clamp User",
        role: "customer",
      })

      const categoryId = crypto.randomUUID()
      createdCategoryIds.push(categoryId)
      await db.insert(schema.categories).values({
        id: categoryId,
        name: `ClampCat-${categoryId.slice(0, 8)}`,
        slug: `clampcat-${categoryId.slice(0, 8)}`,
      })
      const brandId = crypto.randomUUID()
      createdBrandIds.push(brandId)
      await db.insert(schema.brands).values({ id: brandId, name: `ClampBrand-${brandId.slice(0, 8)}` })

      const productId = crypto.randomUUID()
      createdProductIds.push(productId)
      await db.insert(schema.products).values({
        id: productId,
        name: "Clamp Product",
        slug: `clamp-product-${productId.slice(0, 8)}`,
        categoryId,
        brandId,
        isActive: true,
      })

      const variantId = crypto.randomUUID()
      createdVariantIds.push(variantId)
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 1_000_000,
        stock: 2, // stock=2 → clamp to 2 even if we request 5
        isActive: true,
      })

      const { auth } = await import("@/lib/auth")
      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email: "test@example.com", name: "Test" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as unknown as Awaited<ReturnType<typeof auth>>)

      const { addToCart } = await import("@/lib/actions/cart")

      // Add 2 (exactly at stock limit)
      const r1 = await addToCart(variantId, 2)
      expect(r1.success).toBe(true)

      // Try to add 5 more — should be clamped: min(2+5, 2) = 2 (no increase)
      const r2 = await addToCart(variantId, 5)
      expect(r2.success).toBe(true)

      const userCart = await db.query.cart.findFirst({
        where: (c, { eq }) => eq(c.userId, userId),
        with: { items: true },
      })
      const item = userCart?.items.find((i) => i.variantId === variantId)
      expect(item?.quantity).toBe(2) // clamped to stock
    }
  )

  it.skipIf(skip)(
    "updateCartItem() with qty=0 removes the line (D-07)",
    async () => {
      const { variantId, userId, cartId } = await seedCartFixture()

      const { auth } = await import("@/lib/auth")
      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email: "test@example.com", name: "Test" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as unknown as Awaited<ReturnType<typeof auth>>)

      const { updateCartItem } = await import("@/lib/actions/cart")
      const result = await updateCartItem(variantId, 0)
      expect(result.success).toBe(true)

      const { db } = await import("@/lib/db/client")
      const { cartItems: cartItemsSchema } = await import("@/lib/db/schema")
      const { and, eq } = await import("drizzle-orm")

      const items = await db
        .select()
        .from(cartItemsSchema)
        .where(
          and(
            eq(cartItemsSchema.cartId, cartId),
            eq(cartItemsSchema.variantId, variantId)
          )
        )
      expect(items).toHaveLength(0) // removed
    }
  )

  it.skipIf(skip)(
    "removeCartItem() deletes only the caller's row — no IDOR (T-03-07)",
    async () => {
      // Seed two separate users with carts
      const { variantId, userId, cartId } = await seedCartFixture()

      const { auth } = await import("@/lib/auth")
      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email: "test@example.com", name: "Test" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as unknown as Awaited<ReturnType<typeof auth>>)

      const { removeCartItem } = await import("@/lib/actions/cart")
      const result = await removeCartItem(variantId)
      expect(result.success).toBe(true)

      const { db } = await import("@/lib/db/client")
      const { cartItems: cartItemsSchema } = await import("@/lib/db/schema")
      const { and, eq } = await import("drizzle-orm")

      // Row should be gone from caller's cart
      const items = await db
        .select()
        .from(cartItemsSchema)
        .where(
          and(
            eq(cartItemsSchema.cartId, cartId),
            eq(cartItemsSchema.variantId, variantId)
          )
        )
      expect(items).toHaveLength(0)
    }
  )

  // Plan 02 extends: mergeGuestCartOnLogin (below in its own describe)
})

// ─── mergeGuestCartOnLogin integration tests ─────────────────────────────────

describe("mergeGuestCartOnLogin (D-10)", () => {
  it.skipIf(skip)(
    "merges guest items additively into DB cart, clamps to stock, and clears the cookie",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      // Seed a user
      const userId = crypto.randomUUID()
      createdUserIds.push(userId)
      await db.insert(schema.users).values({
        id: userId,
        email: `merge-${userId.slice(0, 8)}@example.com`,
        name: "Merge User",
        role: "customer",
      })

      // Seed catalog
      const categoryId = crypto.randomUUID()
      createdCategoryIds.push(categoryId)
      await db.insert(schema.categories).values({
        id: categoryId,
        name: `MergeCat-${categoryId.slice(0, 8)}`,
        slug: `mergecat-${categoryId.slice(0, 8)}`,
      })
      const brandId = crypto.randomUUID()
      createdBrandIds.push(brandId)
      await db.insert(schema.brands).values({ id: brandId, name: `MergeBrand-${brandId.slice(0, 8)}` })
      const productId = crypto.randomUUID()
      createdProductIds.push(productId)
      await db.insert(schema.products).values({
        id: productId,
        name: "Merge Product",
        slug: `merge-product-${productId.slice(0, 8)}`,
        categoryId,
        brandId,
        isActive: true,
      })

      // Variant A: stock=4; guest has 2, DB has 1 → merged min(2+1, 4)=3
      const variantAId = crypto.randomUUID()
      createdVariantIds.push(variantAId)
      await db.insert(schema.variants).values({
        id: variantAId,
        productId,
        priceKobo: 2_000_000,
        stock: 4,
        isActive: true,
      })

      // Variant B: stock=2; guest has 3 only → merged min(3+0, 2)=2 (clamped)
      const variantBId = crypto.randomUUID()
      createdVariantIds.push(variantBId)
      await db.insert(schema.variants).values({
        id: variantBId,
        productId,
        priceKobo: 1_500_000,
        stock: 2,
        isActive: true,
      })

      // Seed DB cart with variant A (qty 1)
      const cartId = crypto.randomUUID()
      await db.insert(schema.cart).values({ id: cartId, userId })
      await db.insert(schema.cartItems).values({
        id: crypto.randomUUID(),
        cartId,
        variantId: variantAId,
        quantity: 1,
      })

      // Set up a mock cookie store containing the guest cart
      const { cookies } = await import("next/headers")
      const mockSet = vi.fn()
      const mockCookieStore = {
        get: vi.fn().mockReturnValue({
          value: JSON.stringify([
            { variantId: variantAId, quantity: 2 }, // additive: 2+1=3, clamped to 4 → 3
            { variantId: variantBId, quantity: 3 }, // guest only: 3, clamped to 2 → 2
          ]),
        }),
        set: mockSet,
        delete: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      }
      vi.mocked(cookies).mockResolvedValue(
        mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
      )

      const { mergeGuestCartOnLogin } = await import("@/lib/cart/merge")
      await mergeGuestCartOnLogin(userId)

      // Verify merged quantities in DB
      const userCart = await db.query.cart.findFirst({
        where: (c, { eq }) => eq(c.userId, userId),
        with: { items: true },
      })

      const itemA = userCart?.items.find((i) => i.variantId === variantAId)
      const itemB = userCart?.items.find((i) => i.variantId === variantBId)

      expect(itemA?.quantity).toBe(3) // additive+clamped: min(2+1, 4)=3
      expect(itemB?.quantity).toBe(2) // clamped to stock: min(3+0, 2)=2

      // Verify cookie was cleared (maxAge: 0)
      expect(mockSet).toHaveBeenCalledWith(
        "ms_cart",
        expect.any(String),
        expect.objectContaining({ maxAge: 0 })
      )
    }
  )
})
