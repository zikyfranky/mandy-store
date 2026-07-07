// tests/checkout/interswitch-actions.test.ts
// initInterswitchPayment (PAY-09 / PAY-12). ALWAYS-RUNS: toggle-first rejection.
// DB-GATED: happy path inserts order (gatewayProvider=interswitch) + returns POST redirect.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCartTables, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }))
vi.mock("@/lib/email/send-order-confirmation", () => ({ sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/cart/queries", () => ({ getCart: vi.fn() }))
vi.mock("@/lib/payments/gateways/interswitch", () => ({
  interswitchAdapter: { provider: "interswitch", initPayment: vi.fn(), verifyTransaction: vi.fn(), refund: vi.fn() },
}))

import { getCart } from "@/lib/cart/queries"
import { interswitchAdapter } from "@/lib/payments/gateways/interswitch"

const VALID_INPUT = {
  email: "ada@example.com",
  address: { fullName: "Ada Okafor", phone: "08012345678", street: "12 Marina", city: "Lagos Island", state: "Lagos" as const, landmark: "Near First Bank" },
}

beforeEach(() => {
  vi.stubEnv("ENABLE_INTERSWITCH", "true")
  vi.stubEnv("INTERSWITCH_MAC_KEY", "mac")
  vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX")
  vi.stubEnv("FLAT_SHIPPING_KOBO", "200000")
  vi.mocked(getCart).mockResolvedValue({
    items: [{ variantId: "00000000-0000-0000-0000-000000000001", quantity: 1, stock: 10, priceKobo: 10_000_000, productName: "Test Phone", variantLabel: "Black / 128GB", imageUrl: null, lineTotalKobo: 10_000_000, isOOS: false, isClamped: false }],
    subtotalKobo: 10_000_000, totalQty: 1, hasOOS: false,
  })
  vi.mocked(interswitchAdapter.initPayment).mockResolvedValue({
    mode: "redirect", url: "https://sandbox.interswitchng.com/collections/w/pay", method: "POST", fields: { hash: "h", txn_ref: "r" },
  })
})

afterEach(async () => {
  if (hasDatabase) { await truncateOrderTables(); await truncateCartTables(); await truncateCatalogTables() }
  vi.clearAllMocks(); vi.unstubAllEnvs()
})

describe("initInterswitchPayment — toggle rejection (PAY-12, toggle FIRST)", () => {
  it("returns { error } when ENABLE_INTERSWITCH is not set — adapter NOT called", async () => {
    vi.stubEnv("ENABLE_INTERSWITCH", "")
    const { initInterswitchPayment } = await import("@/lib/actions/interswitch")
    const result = await initInterswitchPayment(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect(interswitchAdapter.initPayment).not.toHaveBeenCalled()
  })

  it("returns { error } when INTERSWITCH_MAC_KEY is missing — gateway not configured", async () => {
    vi.stubEnv("INTERSWITCH_MAC_KEY", "")
    const { initInterswitchPayment } = await import("@/lib/actions/interswitch")
    const result = await initInterswitchPayment(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect(interswitchAdapter.initPayment).not.toHaveBeenCalled()
  })
})

describe("initInterswitchPayment — DB-gated happy path", () => {
  it.skipIf(!hasDatabase)("[DB] inserts pending order (gatewayProvider=interswitch) + returns POST redirect", async () => {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    const categoryId = crypto.randomUUID(), brandId = crypto.randomUUID(), productId = crypto.randomUUID(), variantId = crypto.randomUUID()
    await db.insert(schema.categories).values({ id: categoryId, name: "C", slug: `c-${categoryId.slice(0, 6)}` })
    await db.insert(schema.brands).values({ id: brandId, name: `B-${brandId.slice(0, 6)}` })
    await db.insert(schema.products).values({ id: productId, name: "Test Phone", slug: `p-${productId.slice(0, 6)}`, categoryId, brandId })
    await db.insert(schema.variants).values({ id: variantId, productId, priceKobo: 10_000_000, stock: 10 })
    vi.mocked(getCart).mockResolvedValue({
      items: [{ variantId, quantity: 1, stock: 10, priceKobo: 10_000_000, productName: "Test Phone", variantLabel: "Black / 128GB", imageUrl: null, lineTotalKobo: 10_000_000, isOOS: false, isClamped: false }],
      subtotalKobo: 10_000_000, totalQty: 1, hasOOS: false,
    })

    const { initInterswitchPayment } = await import("@/lib/actions/interswitch")
    const result = await initInterswitchPayment(VALID_INPUT)

    expect(result).not.toHaveProperty("error")
    const ok = result as { mode: string; method: string; fields: Record<string, string>; guestToken: string }
    expect(ok.mode).toBe("redirect")
    expect(ok.method).toBe("POST")
    expect(ok.fields).toBeTruthy()
    // server-computed total passed to adapter (never client price)
    expect(vi.mocked(interswitchAdapter.initPayment).mock.calls[0]?.[0].amountKobo).toBe(10_200_000)

    const { eq } = await import("drizzle-orm")
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.guestToken, ok.guestToken) })
    expect(order?.gatewayProvider).toBe("interswitch")
    expect(order?.status).toBe("pending_payment")
  })
})
