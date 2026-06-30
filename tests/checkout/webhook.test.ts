// tests/checkout/webhook.test.ts
// Integration + unit tests for the Stripe webhook handler and order-status route.
// PAY-01 (Stripe payment confirmation), ORD-01 (confirmation email), CHKT-05 (status polling).
//
// Covers: signature failure, happy-path confirm+decrement+email, idempotency (single decrement
// on duplicate delivery), last-unit-race refund, and order-status GET endpoint.
//
// DB-gated tests run only with TEST_DATABASE_URL; signature-failure test always runs.

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────
// Pattern 14 order: server-only, next/headers, next/cache, then feature mocks.

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Stripe mock: constructEvent and refunds.create are controllable per test.
const constructEvent = vi.fn()
const refundsCreate = vi.fn().mockResolvedValue({ id: "re_1" })

vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) },
    refunds: { create: (...a: unknown[]) => refundsCreate(...a) },
  },
}))

// ─── Env setup ────────────────────────────────────────────────────────────────
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal NextRequest-like stub for the webhook POST handler. */
function makeRequest(body: string, sig = "t=1,v1=abc") {
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === "stripe-signature" ? sig : null) },
  } as unknown as import("next/server").NextRequest
}

/** Build a minimal payment_intent.succeeded event payload. */
function makeSucceededEvent(eventId: string, piId: string, orderId: string) {
  return {
    id: eventId,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: piId,
        metadata: { orderId },
      },
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Stripe webhook handler", () => {
  afterEach(async () => {
    if (hasDatabase) {
      await truncateOrderTables()
      await truncateCatalogTables()
    }
    vi.clearAllMocks()
    refundsCreate.mockResolvedValue({ id: "re_1" }) // reset per-test overrides
  })

  // ── Test 1: Signature failure — always runs (no DB needed) ──────────────────
  it("returns 400 when stripe signature verification fails", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig")
    })

    const { POST } = await import("@/app/api/webhooks/stripe/route")
    const req = makeRequest("{}", "bad-sig")
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
  })

  // ── Test 2: Happy path — DB-gated ─────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "payment_intent.succeeded flips order to payment_confirmed, decrements stock, sends email",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import(
        "@/lib/email/send-order-confirmation"
      )

      // Seed: category → brand → product → variant (stock=5)
      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()
      const orderId = crypto.randomUUID()
      const piId = "pi_happy_1"
      const eventId = "evt_happy_1"

      await db.insert(schema.categories).values({
        id: categoryId,
        name: `Cat-${categoryId.slice(0, 6)}`,
        slug: `cat-${categoryId.slice(0, 6)}`,
      })
      await db.insert(schema.brands).values({
        id: brandId,
        name: `Brand-${brandId.slice(0, 6)}`,
      })
      await db.insert(schema.products).values({
        id: productId,
        name: "Test Phone",
        slug: `test-phone-${productId.slice(0, 6)}`,
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 10_000_00,
        stock: 5,
      })

      // Seed order (pending_payment) with the stripe PI id
      await db.insert(schema.orders).values({
        id: orderId,
        reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
        guestToken: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
        status: "pending_payment",
        customerEmail: "customer@example.com",
        subtotalKobo: 10_000_00,
        shippingKobo: 200_000,
        totalKobo: 12_000_00,
        shippingName: "Ada Okafor",
        shippingPhone: "08012345678",
        shippingStreet: "12 Marina",
        shippingCity: "Lagos",
        shippingState: "Lagos",
        stripePaymentIntentId: piId,
      })
      await db.insert(schema.orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        variantId,
        quantity: 2,
        priceKobo: 10_000_00,
        productName: "Test Phone",
        variantLabel: "Black",
        lineTotalKobo: 20_000_00,
      })

      // Configure mock: constructEvent returns succeeded event
      const event = makeSucceededEvent(eventId, piId, orderId)
      constructEvent.mockReturnValue(event)

      const { POST } = await import("@/app/api/webhooks/stripe/route")
      const res = await POST(makeRequest(JSON.stringify(event)))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual({ received: true })

      // Order should now be payment_confirmed
      const { eq } = await import("drizzle-orm")
      const updatedOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(updatedOrder?.status).toBe("payment_confirmed")
      expect(updatedOrder?.paidAt).not.toBeNull()

      // Variant stock should be decremented by 2 (5 - 2 = 3)
      const updatedVariant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(updatedVariant?.stock).toBe(3)

      // Confirmation email sent once
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    },
  )

  // ── Test 3: Idempotency — same event delivered twice ─────────────────────
  it.skipIf(!hasDatabase)(
    "duplicate event delivery is a no-op (idempotency via processed_webhook_events)",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import(
        "@/lib/email/send-order-confirmation"
      )

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()
      const orderId = crypto.randomUUID()
      const piId = "pi_idem_1"
      const eventId = "evt_idem_1"

      await db.insert(schema.categories).values({
        id: categoryId,
        name: `Cat-${categoryId.slice(0, 6)}`,
        slug: `cat-${categoryId.slice(0, 6)}`,
      })
      await db.insert(schema.brands).values({
        id: brandId,
        name: `Brand-${brandId.slice(0, 6)}`,
      })
      await db.insert(schema.products).values({
        id: productId,
        name: "Idem Phone",
        slug: `idem-phone-${productId.slice(0, 6)}`,
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 5_000_00,
        stock: 5,
      })
      await db.insert(schema.orders).values({
        id: orderId,
        reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
        guestToken: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
        status: "pending_payment",
        customerEmail: "idem@example.com",
        subtotalKobo: 5_000_00,
        shippingKobo: 200_000,
        totalKobo: 7_000_00,
        shippingName: "Idem User",
        shippingPhone: "08012345679",
        shippingStreet: "13 Marina",
        shippingCity: "Lagos",
        shippingState: "Lagos",
        stripePaymentIntentId: piId,
      })
      await db.insert(schema.orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        variantId,
        quantity: 2,
        priceKobo: 5_000_00,
        productName: "Idem Phone",
        variantLabel: "Silver",
        lineTotalKobo: 10_000_00,
      })

      const event = makeSucceededEvent(eventId, piId, orderId)
      constructEvent.mockReturnValue(event)

      const { POST } = await import("@/app/api/webhooks/stripe/route")

      // First delivery
      const res1 = await POST(makeRequest(JSON.stringify(event)))
      expect(res1.status).toBe(200)

      // Second delivery (same event id)
      const res2 = await POST(makeRequest(JSON.stringify(event)))
      expect(res2.status).toBe(200)

      const { eq } = await import("drizzle-orm")

      // Stock decremented ONCE (5 - 2 = 3), not twice
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(3)

      // Email sent only once
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    },
  )

  // ── Test 4: Last-unit race — variant stock below ordered qty ─────────────
  it.skipIf(!hasDatabase)(
    "last-unit race: stock below ordered qty → refund + payment_failed + refundReason",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()
      const orderId = crypto.randomUUID()
      const piId = "pi_race_1"
      const eventId = "evt_race_1"

      await db.insert(schema.categories).values({
        id: categoryId,
        name: `Cat-${categoryId.slice(0, 6)}`,
        slug: `cat-${categoryId.slice(0, 6)}`,
      })
      await db.insert(schema.brands).values({
        id: brandId,
        name: `Brand-${brandId.slice(0, 6)}`,
      })
      await db.insert(schema.products).values({
        id: productId,
        name: "Race Phone",
        slug: `race-phone-${productId.slice(0, 6)}`,
        categoryId,
        brandId,
      })
      // Stock=1, but order wants qty=2 → decrement will fail (stock < qty)
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 8_000_00,
        stock: 1,
      })
      await db.insert(schema.orders).values({
        id: orderId,
        reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
        guestToken: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
        status: "pending_payment",
        customerEmail: "race@example.com",
        subtotalKobo: 16_000_00,
        shippingKobo: 200_000,
        totalKobo: 18_000_00,
        shippingName: "Race User",
        shippingPhone: "08012345677",
        shippingStreet: "14 Marina",
        shippingCity: "Abuja",
        shippingState: "FCT",
        stripePaymentIntentId: piId,
      })
      await db.insert(schema.orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        variantId,
        quantity: 2, // ordered 2, but only 1 in stock → race
        priceKobo: 8_000_00,
        productName: "Race Phone",
        variantLabel: "Gold",
        lineTotalKobo: 16_000_00,
      })

      const event = makeSucceededEvent(eventId, piId, orderId)
      constructEvent.mockReturnValue(event)

      const { POST } = await import("@/app/api/webhooks/stripe/route")
      const res = await POST(makeRequest(JSON.stringify(event)))

      // Webhook should return 200 (so Stripe doesn't retry the already-refunded charge)
      expect(res.status).toBe(200)

      // Refund issued
      expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: piId })

      const { eq } = await import("drizzle-orm")

      // Order status should be payment_failed
      const failedOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(failedOrder?.status).toBe("payment_failed")
      expect(failedOrder?.refundReason).toBeTruthy()

      // Variant stock should be unchanged (decrement didn't succeed)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(1)
    },
  )
})

describe("GET /api/order/status/[token]", () => {
  afterEach(async () => {
    if (hasDatabase) {
      await truncateOrderTables()
      await truncateCatalogTables()
    }
    vi.clearAllMocks()
  })

  it.skipIf(!hasDatabase)("returns { status } for a known token", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")

    const orderId = crypto.randomUUID()
    const token =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")

    // We need a minimal catalog chain for the order FK (variants → products → etc.)
    const categoryId = crypto.randomUUID()
    const brandId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    const variantId = crypto.randomUUID()

    await db.insert(schema.categories).values({
      id: categoryId,
      name: `Cat-${categoryId.slice(0, 6)}`,
      slug: `cat-${categoryId.slice(0, 6)}`,
    })
    await db.insert(schema.brands).values({
      id: brandId,
      name: `Brand-${brandId.slice(0, 6)}`,
    })
    await db.insert(schema.products).values({
      id: productId,
      name: "Status Phone",
      slug: `status-phone-${productId.slice(0, 6)}`,
      categoryId,
      brandId,
    })
    await db.insert(schema.variants).values({
      id: variantId,
      productId,
      priceKobo: 5_000_00,
      stock: 10,
    })

    await db.insert(schema.orders).values({
      id: orderId,
      reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
      guestToken: token,
      status: "payment_confirmed",
      customerEmail: "status@example.com",
      subtotalKobo: 5_000_00,
      shippingKobo: 200_000,
      totalKobo: 7_000_00,
      shippingName: "Status User",
      shippingPhone: "08099999999",
      shippingStreet: "1 Test St",
      shippingCity: "Lagos",
      shippingState: "Lagos",
    })

    const { GET } = await import("@/app/api/order/status/[token]/route")
    const res = await GET(
      {} as import("next/server").NextRequest,
      { params: Promise.resolve({ token }) },
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ status: "payment_confirmed" })
  })

  it.skipIf(!hasDatabase)("returns 404 for unknown token", async () => {
    const { GET } = await import("@/app/api/order/status/[token]/route")
    const res = await GET(
      {} as import("next/server").NextRequest,
      { params: Promise.resolve({ token: "nonexistent-token-xyz" }) },
    )

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json).toHaveProperty("error")
  })
})
