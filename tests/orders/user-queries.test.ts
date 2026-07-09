// tests/orders/user-queries.test.ts
// Phase 6 / AUTH-04 — customer-scoped order reads (D-04 IDOR-safety is the core here).
// Covers listOrdersForUser + getOrderForUser incl. the IDOR + nonexistent cases.
// DB-gated: runs only with TEST_DATABASE_URL (it.skipIf(!hasDatabase)).

import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateAuthTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks (top-level, hoisted) ───────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))

import { listOrdersForUser, getOrderForUser } from "@/lib/orders/queries"

afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateCatalogTables()
    await truncateAuthTables()
  }
  vi.clearAllMocks()
})

// Build a full FK-valid fixture: two users, a variant (for order items), and orders.
async function seed() {
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  const userAId = crypto.randomUUID()
  const userBId = crypto.randomUUID()
  await db.insert(schema.users).values([
    { id: userAId, email: `a-${userAId.slice(0, 8)}@example.com`, name: "User A", username: `usera_${userAId.slice(0, 8)}` },
    { id: userBId, email: `b-${userBId.slice(0, 8)}@example.com`, name: "User B", username: `userb_${userBId.slice(0, 8)}` },
  ])

  const categoryId = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const productId = crypto.randomUUID()
  const variantId = crypto.randomUUID()
  await db.insert(schema.categories).values({ id: categoryId, name: "UQ Cat", slug: "uq-cat-" + categoryId.slice(0, 8) })
  await db.insert(schema.brands).values({ id: brandId, name: "UQ Brand " + brandId.slice(0, 8) })
  await db.insert(schema.products).values({ id: productId, name: "UQ Product", slug: "uq-product-" + productId.slice(0, 8), categoryId, brandId })
  await db.insert(schema.variants).values({ id: variantId, productId, priceKobo: 1_000_000, stock: 5 })

  async function insertOrder(userId: string, ref: string, createdAt: Date, itemCount: number) {
    const orderId = crypto.randomUUID()
    await db.insert(schema.orders).values({
      id: orderId,
      reference: ref,
      guestToken: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 32),
      status: "payment_confirmed",
      userId,
      customerEmail: "buyer@example.com",
      subtotalKobo: 1_000_000,
      shippingKobo: 200_000,
      totalKobo: 1_200_000,
      shippingName: "Test",
      shippingPhone: "08000000000",
      shippingStreet: "1 Test St",
      shippingCity: "Lagos",
      shippingState: "Lagos",
      createdAt,
    })
    for (let i = 0; i < itemCount; i++) {
      await db.insert(schema.orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        variantId,
        quantity: 1,
        priceKobo: 1_000_000,
        productName: "UQ Product",
        variantLabel: "",
        lineTotalKobo: 1_000_000,
      })
    }
    return orderId
  }

  // userA: 2 orders (older + newer, different item counts); userB: 1 order
  const older = await insertOrder(userAId, "MS-UQA-OLD", new Date("2026-01-01T00:00:00Z"), 1)
  const newer = await insertOrder(userAId, "MS-UQA-NEW", new Date("2026-02-01T00:00:00Z"), 2)
  const orderB = await insertOrder(userBId, "MS-UQB-1", new Date("2026-01-15T00:00:00Z"), 1)

  return { userAId, userBId, older, newer, orderB }
}

describe("listOrdersForUser", () => {
  it.skipIf(!hasDatabase)("returns only the caller's orders, newest first, with correct item counts", async () => {
    const { userAId, newer } = await seed()
    const rows = await listOrdersForUser(userAId)
    expect(rows).toHaveLength(2)
    // newest first
    expect(rows[0].id).toBe(newer)
    expect(rows[0].reference).toBe("MS-UQA-NEW")
    expect(rows[0].itemCount).toBe(2)
    expect(rows[1].itemCount).toBe(1)
    // never leaks userB's order
    expect(rows.some((r) => r.reference === "MS-UQB-1")).toBe(false)
  })

  it.skipIf(!hasDatabase)("returns [] for a user with no orders (empty state)", async () => {
    await seed()
    const rows = await listOrdersForUser(crypto.randomUUID())
    expect(rows).toHaveLength(0)
  })
})

describe("getOrderForUser", () => {
  it.skipIf(!hasDatabase)("getOrderForUser — owned: returns the full order with items", async () => {
    const { userAId, newer } = await seed()
    const order = await getOrderForUser(userAId, newer)
    expect(order).not.toBeNull()
    expect(order!.id).toBe(newer)
    expect(Array.isArray(order!.items)).toBe(true)
    expect(order!.items.length).toBe(2)
  })

  it.skipIf(!hasDatabase)("IDOR: returns null for an order owned by a DIFFERENT user", async () => {
    const { userAId, orderB } = await seed()
    const order = await getOrderForUser(userAId, orderB)
    expect(order).toBeNull()
  })

  it.skipIf(!hasDatabase)("nonexistent: returns null for an unknown order id", async () => {
    const { userAId } = await seed()
    const order = await getOrderForUser(userAId, crypto.randomUUID())
    expect(order).toBeNull()
  })
})
