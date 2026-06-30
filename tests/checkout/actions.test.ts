// tests/checkout/actions.test.ts
// Integration + unit tests for the checkout Server Actions.
// CHKT-01 (guest checkout), CHKT-02 (address validation), CHKT-03/04 (server-side totals),
// PAY-01 (Stripe PI in kobo NGN), PAY-03 (awaiting_bank_transfer), PAY-04 (toggle rejection).
//
// DB-gated tests run only with TEST_DATABASE_URL; pure unit / error-path tests always run.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCartTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────
// Pattern 14: always mock in this order (04-PATTERNS.md Shared Patterns 14)

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))
vi.mock("@/lib/email/send-bank-transfer-instructions", () => ({
  sendBankTransferInstructionsEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: "pi_test_123",
        client_secret: "cs_test_abc",
      }),
    },
  },
}))
// Mock getCart at the module level — individual tests override via vi.mocked(getCart)
vi.mock("@/lib/cart/queries", () => ({
  getCart: vi.fn(),
}))

// ─── Lazy imports after mocks ─────────────────────────────────────────────────
// Import after vi.mock so the mocked versions are used

import { getCart } from "@/lib/cart/queries"
import { auth } from "@/lib/auth"
import { sendBankTransferInstructionsEmail } from "@/lib/email/send-bank-transfer-instructions"
import { stripe } from "@/lib/payments/stripe"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_INPUT = {
  email: "customer@example.com",
  address: {
    fullName: "Ada Okafor",
    phone: "08012345678",
    street: "12 Marina Street",
    city: "Lagos Island",
    state: "Lagos" as const,
    landmark: "Near First Bank",
  },
}

// A single in-stock cart line. subtotalKobo = 10_000_000 (₦100,000).
const MOCK_CART_BASE = {
  items: [
    {
      variantId: "00000000-0000-0000-0000-000000000001",
      quantity: 1,
      stock: 10,
      priceKobo: 10_000_000,
      productName: "Test Phone",
      variantLabel: "Black / 128GB",
      imageUrl: null,
      lineTotalKobo: 10_000_000,
      isOOS: false,
      isClamped: false,
    },
  ],
  subtotalKobo: 10_000_000,
  totalQty: 1,
  hasOOS: false,
}

// ─── beforeEach / afterEach ───────────────────────────────────────────────────

beforeEach(() => {
  // Set all required env vars for both payment methods
  process.env.ENABLE_BANK_TRANSFER = "true"
  process.env.BANK_NAME = "First Bank"
  process.env.BANK_ACCOUNT_NUMBER = "1234567890"
  process.env.BANK_ACCOUNT_NAME = "Mandy Store Ltd"
  process.env.ENABLE_STRIPE = "true"
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder"
  process.env.FLAT_SHIPPING_KOBO = "200000"

  // Reset auth to guest (null) by default
  vi.mocked(auth).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>)

  // Default cart mock: one in-stock item
  vi.mocked(getCart).mockResolvedValue(MOCK_CART_BASE)
})

afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateCartTables()
    await truncateCatalogTables()
    // Also clean up any user rows seeded by tests (not covered by above truncations)
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    await db.delete(schema.users).catch(() => { /* ignore if already empty */ })
  }
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

// ─── Pure unit tests (always run — no DB required) ────────────────────────────

describe("createBankTransferOrder — pure unit tests", () => {
  it("returns { error } when bank_transfer toggle is disabled", async () => {
    process.env.ENABLE_BANK_TRANSFER = ""
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/not available/i)
  })

  it("returns { error } when BANK_NAME env var is missing (toggle requires credentials)", async () => {
    process.env.BANK_NAME = ""
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder(VALID_INPUT)
    expect(result).toHaveProperty("error")
  })

  it("returns { error } when address state is invalid (Zod validation)", async () => {
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder({
      ...VALID_INPUT,
      address: { ...VALID_INPUT.address, state: "Narnia" as never },
    })
    expect(result).toHaveProperty("error")
  })

  it("returns { error } when email is malformed (Zod validation)", async () => {
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder({
      ...VALID_INPUT,
      email: "not-an-email",
    })
    expect(result).toHaveProperty("error")
  })

  it("returns { error: 'Cart is empty' } when cart has no items", async () => {
    vi.mocked(getCart).mockResolvedValue({
      items: [],
      subtotalKobo: 0,
      totalQty: 0,
      hasOOS: false,
    })
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/empty/i)
  })

  it("returns { error } when cart has OOS items", async () => {
    vi.mocked(getCart).mockResolvedValue({
      ...MOCK_CART_BASE,
      hasOOS: true,
    })
    const { createBankTransferOrder } = await import("@/lib/actions/checkout")
    const result = await createBankTransferOrder(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/out-of-stock/i)
  })
})

describe("createStripePaymentIntent — pure unit tests", () => {
  it("returns { error } when stripe toggle is disabled", async () => {
    process.env.ENABLE_STRIPE = ""
    const { createStripePaymentIntent } = await import("@/lib/actions/checkout")
    const result = await createStripePaymentIntent(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/not available/i)
  })

  it("returns { error } when STRIPE_SECRET_KEY is missing", async () => {
    process.env.STRIPE_SECRET_KEY = ""
    const { createStripePaymentIntent } = await import("@/lib/actions/checkout")
    const result = await createStripePaymentIntent(VALID_INPUT)
    expect(result).toHaveProperty("error")
  })

  it("returns { error } when address state is invalid (Zod validation)", async () => {
    const { createStripePaymentIntent } = await import("@/lib/actions/checkout")
    const result = await createStripePaymentIntent({
      ...VALID_INPUT,
      address: { ...VALID_INPUT.address, state: "Narnia" as never },
    })
    expect(result).toHaveProperty("error")
  })

  it("returns { error: 'Cart is empty' } when cart has no items", async () => {
    vi.mocked(getCart).mockResolvedValue({
      items: [],
      subtotalKobo: 0,
      totalQty: 0,
      hasOOS: false,
    })
    const { createStripePaymentIntent } = await import("@/lib/actions/checkout")
    const result = await createStripePaymentIntent(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/empty/i)
  })
})

// ─── DB-gated integration tests ───────────────────────────────────────────────

describe("createBankTransferOrder — DB integration", () => {
  it.skipIf(!hasDatabase)(
    "creates awaiting_bank_transfer order as guest with correct totals",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      // Seed: category → brand → product → variant (FK chain for order_item)
      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()

      await db.insert(schema.categories).values({
        id: categoryId,
        name: "Test Cat",
        slug: "test-cat-" + categoryId.slice(0, 8),
      })
      await db.insert(schema.brands).values({ id: brandId, name: "Test Brand " + brandId.slice(0, 8) })
      await db.insert(schema.products).values({
        id: productId,
        name: "Test Phone",
        slug: "test-phone-" + productId.slice(0, 8),
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 10_000_000,
        stock: 10,
      })

      // Override getCart to use the seeded variantId
      vi.mocked(getCart).mockResolvedValue({
        ...MOCK_CART_BASE,
        items: [{ ...MOCK_CART_BASE.items[0], variantId }],
      })

      const { createBankTransferOrder } = await import("@/lib/actions/checkout")
      const result = await createBankTransferOrder(VALID_INPUT)

      // Should return a guestToken (no error)
      expect(result).not.toHaveProperty("error")
      expect(result).toHaveProperty("guestToken")
      const { guestToken } = result as { guestToken: string }
      expect(typeof guestToken).toBe("string")
      expect(guestToken.length).toBe(64)

      // Verify the order row in DB
      const order = await db.query.orders.findFirst({
        where: (o, { eq }) => eq(o.guestToken, guestToken),
        with: { items: true },
      })
      expect(order).toBeDefined()
      expect(order!.status).toBe("awaiting_bank_transfer")
      expect(order!.userId).toBeNull()
      expect(order!.customerEmail).toBe(VALID_INPUT.email)

      // Server-side total: 10_000_000 subtotal + 200_000 shipping = 10_200_000 (CHKT-03/04)
      expect(order!.subtotalKobo).toBe(10_000_000)
      expect(order!.shippingKobo).toBe(200_000)
      expect(order!.totalKobo).toBe(10_200_000)

      // Order items match cart snapshot
      expect(order!.items.length).toBe(1)
      expect(order!.items[0].variantId).toBe(variantId)
      expect(order!.items[0].quantity).toBe(1)
      expect(order!.items[0].priceKobo).toBe(10_000_000)
      expect(order!.items[0].lineTotalKobo).toBe(10_000_000)

      // Email was sent exactly once (ORD-02)
      expect(sendBankTransferInstructionsEmail).toHaveBeenCalledOnce()

      // Variant stock NOT changed — D-09
      const variant = await db.query.variants.findFirst({
        where: (v, { eq }) => eq(v.id, variantId),
      })
      expect(variant!.stock).toBe(10)
    }
  )

  it.skipIf(!hasDatabase)(
    "uses session email + userId for logged-in user (D-02)",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      // Seed: user + catalog
      const userId = crypto.randomUUID()
      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()

      await db.insert(schema.users).values({
        id: userId,
        email: "session-" + userId.slice(0, 8) + "@example.com",
        name: "Session User",
      })
      await db.insert(schema.categories).values({
        id: categoryId,
        name: "Test Cat 2",
        slug: "test-cat2-" + categoryId.slice(0, 8),
      })
      await db.insert(schema.brands).values({ id: brandId, name: "Brand2 " + brandId.slice(0, 8) })
      await db.insert(schema.products).values({
        id: productId,
        name: "Watch",
        slug: "watch-" + productId.slice(0, 8),
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 5_000_000,
        stock: 5,
      })

      // Override auth to return a session for this test
      const sessionEmail = "session-" + userId.slice(0, 8) + "@example.com"
      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email: sessionEmail, name: "Session User" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as unknown as Awaited<ReturnType<typeof auth>>)

      // Override getCart for the seeded variantId
      vi.mocked(getCart).mockResolvedValue({
        items: [{
          variantId,
          quantity: 1,
          stock: 5,
          priceKobo: 5_000_000,
          productName: "Watch",
          variantLabel: "",
          imageUrl: null,
          lineTotalKobo: 5_000_000,
          isOOS: false,
          isClamped: false,
        }],
        subtotalKobo: 5_000_000,
        totalQty: 1,
        hasOOS: false,
      })

      const { createBankTransferOrder } = await import("@/lib/actions/checkout")
      const result = await createBankTransferOrder(VALID_INPUT)
      expect(result).not.toHaveProperty("error")

      const { guestToken } = result as { guestToken: string }
      const order = await db.query.orders.findFirst({
        where: (o, { eq }) => eq(o.guestToken, guestToken),
      })

      // userId from session, email from session (D-02)
      expect(order!.userId).toBe(userId)
      expect(order!.customerEmail).toBe(sessionEmail)
    }
  )

  it.skipIf(!hasDatabase)(
    "returns { error } when toggle is off — creates no order row",
    async () => {
      process.env.ENABLE_BANK_TRANSFER = ""
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const { createBankTransferOrder } = await import("@/lib/actions/checkout")
      const result = await createBankTransferOrder(VALID_INPUT)
      expect(result).toHaveProperty("error")

      const allOrders = await db.select().from(schema.orders)
      expect(allOrders.length).toBe(0)
    }
  )

  it.skipIf(!hasDatabase)(
    "returns { error } on invalid address state — creates no order row",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const { createBankTransferOrder } = await import("@/lib/actions/checkout")
      const result = await createBankTransferOrder({
        ...VALID_INPUT,
        address: { ...VALID_INPUT.address, state: "Narnia" as never },
      })
      expect(result).toHaveProperty("error")

      const allOrders = await db.select().from(schema.orders)
      expect(allOrders.length).toBe(0)
    }
  )
})

describe("createStripePaymentIntent — DB integration", () => {
  it.skipIf(!hasDatabase)(
    "creates pending_payment order and calls Stripe with server-computed kobo amount in NGN",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      // Seed: category → brand → product → variant
      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()

      await db.insert(schema.categories).values({
        id: categoryId,
        name: "Stripe Cat",
        slug: "stripe-cat-" + categoryId.slice(0, 8),
      })
      await db.insert(schema.brands).values({ id: brandId, name: "StrBrand " + brandId.slice(0, 8) })
      await db.insert(schema.products).values({
        id: productId,
        name: "Stripe Phone",
        slug: "stripe-phone-" + productId.slice(0, 8),
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 10_000_000,
        stock: 10,
      })

      // Override getCart to use the seeded variantId
      vi.mocked(getCart).mockResolvedValue({
        ...MOCK_CART_BASE,
        items: [{ ...MOCK_CART_BASE.items[0], variantId }],
      })

      const { createStripePaymentIntent } = await import("@/lib/actions/checkout")
      const result = await createStripePaymentIntent(VALID_INPUT)

      // Returns clientSecret + guestToken (no error)
      expect(result).not.toHaveProperty("error")
      const { clientSecret, guestToken } = result as { clientSecret: string; guestToken: string }
      expect(clientSecret).toBe("cs_test_abc")
      expect(typeof guestToken).toBe("string")
      expect(guestToken.length).toBe(64)

      // Order row: status = pending_payment; stripePaymentIntentId updated
      const order = await db.query.orders.findFirst({
        where: (o, { eq }) => eq(o.guestToken, guestToken),
      })
      expect(order!.status).toBe("pending_payment")
      expect(order!.stripePaymentIntentId).toBe("pi_test_123")

      // Server-recomputed amount in kobo, currency "ngn" (CLAUDE.md + A1)
      // subtotal 10_000_000 + shipping 200_000 = 10_200_000
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10_200_000,
          currency: "ngn",
        })
      )

      // Variant stock NOT changed — D-09
      const variant = await db.query.variants.findFirst({
        where: (v, { eq }) => eq(v.id, variantId),
      })
      expect(variant!.stock).toBe(10)
    }
  )
})
