// tests/payments/confirm-order-paid.test.ts
// Integration tests for the shared confirmOrderPaid() helper (D-04, T-07-01, T-07-02).
//
// Covers:
//  - Idempotency: second call with same eventId → no-op (no second decrement, no second email)
//  - Oversold detection: stock < qty → payment_failed + refundNeeded:true
//  - Already-confirmed guard: status="payment_confirmed" → duplicate
//
// DB-GATED: runs only when TEST_DATABASE_URL is set (separate Neon branch).
// Unit-only (no DB): nothing always-runs in this file by design — the helper is pure DB logic.
// See tests/payments/config.test.ts for the pure-unit toggle assertions.

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

// ─── Seed helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCatalog(db: any, schema: typeof import("@/lib/db/schema")) {
  const categoryId = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const productId = crypto.randomUUID()

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
    name: "Test Product",
    slug: `test-prod-${productId.slice(0, 6)}`,
    categoryId,
    brandId,
  })

  return { categoryId, brandId, productId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedVariant(db: any, productId: string, stock: number) {
  const variantId = crypto.randomUUID()
  await db.insert((await import("@/lib/db/schema")).variants).values({
    id: variantId,
    productId,
    priceKobo: 10_000_00,
    stock,
  })
  return variantId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedOrder(db: any, schema: typeof import("@/lib/db/schema"), variantId: string, quantity: number, status: string = "pending_payment") {
  const orderId = crypto.randomUUID()
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")

  await db.insert(schema.orders).values({
    id: orderId,
    reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
    guestToken: token,
    status: status as "pending_payment",
    customerEmail: "test@example.com",
    subtotalKobo: 10_000_00 * quantity,
    shippingKobo: 200_000,
    totalKobo: 10_000_00 * quantity + 200_000,
    shippingName: "Test User",
    shippingPhone: "08012345678",
    shippingStreet: "1 Test St",
    shippingCity: "Lagos",
    shippingState: "Lagos",
  })
  await db.insert(schema.orderItems).values({
    id: crypto.randomUUID(),
    orderId,
    variantId,
    quantity,
    priceKobo: 10_000_00,
    productName: "Test Product",
    variantLabel: "Default",
    lineTotalKobo: 10_000_00 * quantity,
  })

  return { orderId, token }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("confirmOrderPaid — shared idempotent confirmation helper", () => {
  afterEach(async () => {
    if (hasDatabase) {
      await truncateOrderTables()
      await truncateCatalogTables()
    }
    vi.clearAllMocks()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "first call confirms order, decrements variant stock, returns { outcome: 'confirmed' }",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { confirmOrderPaid } = await import("@/lib/payments/shared/confirm-order-paid")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 5)
      const { orderId } = await seedOrder(db, schema, variantId, 2)

      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      })

      const result = await confirmOrderPaid(order!, {
        provider: "paystack",
        eventId: "paystack:test-ref-1",
      })

      expect(result.outcome).toBe("confirmed")

      // Order should be processing (paid → auto-processing)
      const updatedOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(updatedOrder?.status).toBe("processing")
      expect(updatedOrder?.paidAt).not.toBeNull()

      // Stock should be decremented by 2 (5 - 2 = 3)
      const updatedVariant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(updatedVariant?.stock).toBe(3)

      // Confirmation email sent once
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    }
  )

  // ── Idempotency: second call with same eventId ──────────────────────────────
  it.skipIf(!hasDatabase)(
    "second call with same eventId returns { outcome: 'duplicate' } — no second decrement, no second email",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { confirmOrderPaid } = await import("@/lib/payments/shared/confirm-order-paid")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 5)
      const { orderId } = await seedOrder(db, schema, variantId, 2)

      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      })

      const eventId = "paystack:test-ref-idem-1"

      // First call
      const result1 = await confirmOrderPaid(order!, { provider: "paystack", eventId })
      expect(result1.outcome).toBe("confirmed")

      // Re-fetch order to get updated status
      const confirmedOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      })

      // Second call — same eventId
      const result2 = await confirmOrderPaid(confirmedOrder!, { provider: "paystack", eventId })
      expect(result2.outcome).toBe("duplicate")

      // Stock decremented ONCE (5 - 2 = 3), not twice
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(3)

      // Email sent only once
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    }
  )

  // ── Oversold detection ────────────────────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "when stock < qty, returns { outcome: 'oversold', refundNeeded: true } and sets order to payment_failed",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { confirmOrderPaid } = await import("@/lib/payments/shared/confirm-order-paid")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      // stock=1, quantity=2 → oversold
      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 1)
      const { orderId } = await seedOrder(db, schema, variantId, 2)

      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      })

      const result = await confirmOrderPaid(order!, {
        provider: "flutterwave",
        eventId: "flutterwave:test-ref-oversold-1",
      })

      expect(result.outcome).toBe("oversold")
      expect("refundNeeded" in result && result.refundNeeded).toBe(true)

      // Order marked payment_failed
      const failedOrder = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(failedOrder?.status).toBe("payment_failed")
      expect(failedOrder?.refundReason).toBe("oversold")

      // Stock unchanged (decrement didn't succeed)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(1)

      // No confirmation email on oversold
      expect(sendOrderConfirmationEmail).not.toHaveBeenCalled()
    }
  )

  // ── Already-confirmed guard ──────────────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "when order is already payment_confirmed, returns { outcome: 'duplicate' }",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { confirmOrderPaid } = await import("@/lib/payments/shared/confirm-order-paid")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 5)
      // Seed with status already confirmed
      const { orderId } = await seedOrder(db, schema, variantId, 1, "payment_confirmed")

      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
        with: { items: true },
      })

      // Use a FRESH eventId (not in processedWebhookEvents) to avoid the idempotency guard
      // — we want to test the already-confirmed guard specifically
      const result = await confirmOrderPaid(order!, {
        provider: "paystack",
        eventId: "paystack:test-ref-already-confirmed",
      })

      expect(result.outcome).toBe("duplicate")
    }
  )
})
