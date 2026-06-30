// tests/checkout/schema.test.ts
// DB-gated integration tests for the orders + order_item schema.
// Skips unless TEST_DATABASE_URL is set (see CLAUDE.md › Testing).

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))

const skip = !hasDatabase

describe("orders + order_item schema (DB-gated)", () => {
  afterEach(async () => {
    if (!hasDatabase) return
    // Cleanup order tables first (order_item → order → processed_webhook_events)
    await truncateOrderTables()
    // Cleanup catalog tables seeded for variantId FK
    await truncateCatalogTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("can insert an order + order_items and read back via relations", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")

    // Seed minimal catalog chain: category → brand → product → variant (for FK)
    const categoryId = crypto.randomUUID()
    const brandId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    const variantId1 = crypto.randomUUID()
    const variantId2 = crypto.randomUUID()

    await db.insert(schema.categories).values({
      id: categoryId,
      name: "Test Category",
      slug: "test-category",
    })
    await db.insert(schema.brands).values({
      id: brandId,
      name: "Test Brand",
    })
    await db.insert(schema.products).values({
      id: productId,
      name: "Test Product",
      slug: "test-product",
      categoryId,
      brandId,
    })
    await db.insert(schema.variants).values([
      { id: variantId1, productId, priceKobo: 50000, stock: 10 },
      { id: variantId2, productId, priceKobo: 80000, stock: 5 },
    ])

    // Create the order
    const orderId = crypto.randomUUID()
    await db.insert(schema.orders).values({
      id: orderId,
      reference: "MS-TESTA1",
      guestToken: "a".repeat(64),
      customerEmail: "test@example.com",
      subtotalKobo: 180000,
      shippingKobo: 200000,
      totalKobo: 380000,
      shippingName: "Test User",
      shippingPhone: "08012345678",
      shippingStreet: "123 Test Street",
      shippingCity: "Lagos",
      shippingState: "Lagos",
    })

    // Create order items
    const item1Id = crypto.randomUUID()
    const item2Id = crypto.randomUUID()
    await db.insert(schema.orderItems).values([
      {
        id: item1Id,
        orderId,
        variantId: variantId1,
        quantity: 2,
        priceKobo: 50000,
        productName: "Test Product",
        variantLabel: "Default",
        lineTotalKobo: 100000,
      },
      {
        id: item2Id,
        orderId,
        variantId: variantId2,
        quantity: 1,
        priceKobo: 80000,
        productName: "Test Product",
        variantLabel: "Variant 2",
        lineTotalKobo: 80000,
      },
    ])

    // Read back with relations
    const found = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
      with: { items: true },
    })

    expect(found).toBeDefined()
    expect(found!.id).toBe(orderId)
    expect(found!.status).toBe("pending_payment")   // default status
    expect(found!.totalKobo).toBe(380000)           // persisted correctly
    expect(found!.items).toHaveLength(2)
    expect(found!.items.map((i) => i.lineTotalKobo).sort((a, b) => a - b)).toEqual([80000, 100000])
  })

  it.skipIf(skip)("order.status defaults to pending_payment on insert", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")

    // Seed minimal catalog
    const categoryId = crypto.randomUUID()
    const brandId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    await db.insert(schema.categories).values({ id: categoryId, name: "Cat2", slug: "cat2" })
    await db.insert(schema.brands).values({ id: brandId, name: "Brand2" })
    await db.insert(schema.products).values({ id: productId, name: "Prod2", slug: "prod2", categoryId, brandId })

    const orderId = crypto.randomUUID()
    await db.insert(schema.orders).values({
      id: orderId,
      reference: "MS-TESTB2",
      guestToken: "b".repeat(64),
      customerEmail: "status@example.com",
      subtotalKobo: 10000,
      shippingKobo: 200000,
      totalKobo: 210000,
      shippingName: "Status User",
      shippingPhone: "08099999999",
      shippingStreet: "456 Status St",
      shippingCity: "Abuja",
      shippingState: "FCT",
    })

    const found = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
    })
    expect(found!.status).toBe("pending_payment")
  })

  it.skipIf(skip)("reference unique constraint rejects duplicate reference", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")

    // Seed minimal catalog
    const categoryId = crypto.randomUUID()
    const brandId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    await db.insert(schema.categories).values({ id: categoryId, name: "Cat3", slug: "cat3" })
    await db.insert(schema.brands).values({ id: brandId, name: "Brand3" })
    await db.insert(schema.products).values({ id: productId, name: "Prod3", slug: "prod3", categoryId, brandId })

    const sharedRef = "MS-TESTC3"

    await db.insert(schema.orders).values({
      id: crypto.randomUUID(),
      reference: sharedRef,
      guestToken: "c".repeat(64),
      customerEmail: "ref@example.com",
      subtotalKobo: 10000,
      shippingKobo: 200000,
      totalKobo: 210000,
      shippingName: "Ref User",
      shippingPhone: "08011111111",
      shippingStreet: "789 Ref Road",
      shippingCity: "Kano",
      shippingState: "Kano",
    })

    // Inserting a second row with the same reference should throw
    await expect(
      db.insert(schema.orders).values({
        id: crypto.randomUUID(),
        reference: sharedRef,  // same reference — should fail
        guestToken: "d".repeat(64),
        customerEmail: "ref2@example.com",
        subtotalKobo: 20000,
        shippingKobo: 200000,
        totalKobo: 220000,
        shippingName: "Ref2 User",
        shippingPhone: "08022222222",
        shippingStreet: "000 Ref2 Rd",
        shippingCity: "Port Harcourt",
        shippingState: "Rivers",
      })
    ).rejects.toThrow()
  })

  it.skipIf(skip)("guestToken unique constraint rejects duplicate guestToken", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")

    // Seed minimal catalog
    const categoryId = crypto.randomUUID()
    const brandId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    await db.insert(schema.categories).values({ id: categoryId, name: "Cat4", slug: "cat4" })
    await db.insert(schema.brands).values({ id: brandId, name: "Brand4" })
    await db.insert(schema.products).values({ id: productId, name: "Prod4", slug: "prod4", categoryId, brandId })

    const sharedToken = "e".repeat(64)

    await db.insert(schema.orders).values({
      id: crypto.randomUUID(),
      reference: "MS-TESTD4",
      guestToken: sharedToken,
      customerEmail: "token@example.com",
      subtotalKobo: 10000,
      shippingKobo: 200000,
      totalKobo: 210000,
      shippingName: "Token User",
      shippingPhone: "08033333333",
      shippingStreet: "111 Token St",
      shippingCity: "Ibadan",
      shippingState: "Oyo",
    })

    // Duplicate guestToken should throw
    await expect(
      db.insert(schema.orders).values({
        id: crypto.randomUUID(),
        reference: "MS-TESTE5",
        guestToken: sharedToken,  // same token — should fail
        customerEmail: "token2@example.com",
        subtotalKobo: 30000,
        shippingKobo: 200000,
        totalKobo: 230000,
        shippingName: "Token2 User",
        shippingPhone: "08044444444",
        shippingStreet: "222 Token2 Ave",
        shippingCity: "Enugu",
        shippingState: "Enugu",
      })
    ).rejects.toThrow()
  })
})
