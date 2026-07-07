// tests/checkout/remita-actions.test.ts
// initRemitaPayment (PAY-11 / D-17). ALWAYS-RUNS: toggle-first.
// DB-GATED: RRR returned by the adapter is stored as gatewayReference (D-17).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCartTables, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }))
vi.mock("@/lib/email/send-order-confirmation", () => ({ sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/cart/queries", () => ({ getCart: vi.fn() }))
vi.mock("@/lib/payments/gateways/remita", () => ({
  remitaAdapter: { provider: "remita", initPayment: vi.fn(), verifyTransaction: vi.fn(), refund: vi.fn() },
}))

import { getCart } from "@/lib/cart/queries"
import { remitaAdapter } from "@/lib/payments/gateways/remita"

const RRR = "123456789012"
const VALID_INPUT = {
  email: "ada@example.com",
  address: { fullName: "Ada Okafor", phone: "08012345678", street: "12 Marina", city: "Lagos Island", state: "Lagos" as const, landmark: "Near First Bank" },
}

beforeEach(() => {
  vi.stubEnv("ENABLE_REMITA", "true")
  vi.stubEnv("REMITA_API_KEY", "ak")
  vi.stubEnv("REMITA_MERCHANT_ID", "RM")
  vi.stubEnv("FLAT_SHIPPING_KOBO", "200000")
  vi.mocked(getCart).mockResolvedValue({
    items: [{ variantId: "00000000-0000-0000-0000-000000000001", quantity: 1, stock: 10, priceKobo: 10_000_000, productName: "Test Phone", variantLabel: "Black / 128GB", imageUrl: null, lineTotalKobo: 10_000_000, isOOS: false, isClamped: false }],
    subtotalKobo: 10_000_000, totalQty: 1, hasOOS: false,
  })
  vi.mocked(remitaAdapter.initPayment).mockResolvedValue({
    mode: "redirect", url: `https://demo.remita.net/remita/onepage/payment/init.reg?rrr=${RRR}`, rrr: RRR,
  })
})

afterEach(async () => {
  if (hasDatabase) { await truncateOrderTables(); await truncateCartTables(); await truncateCatalogTables() }
  vi.clearAllMocks(); vi.unstubAllEnvs()
})

describe("initRemitaPayment — toggle rejection (PAY-12, toggle FIRST)", () => {
  it("returns { error } when ENABLE_REMITA is not set — adapter NOT called", async () => {
    vi.stubEnv("ENABLE_REMITA", "")
    const { initRemitaPayment } = await import("@/lib/actions/remita")
    const result = await initRemitaPayment(VALID_INPUT)
    expect(result).toHaveProperty("error")
    expect(remitaAdapter.initPayment).not.toHaveBeenCalled()
  })
})

describe("initRemitaPayment — DB-gated RRR→gatewayReference (D-17)", () => {
  it.skipIf(!hasDatabase)("[DB] stores the adapter's RRR as gatewayReference, returns redirect without leaking rrr", async () => {
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

    const { initRemitaPayment } = await import("@/lib/actions/remita")
    const result = await initRemitaPayment(VALID_INPUT)

    expect(result).not.toHaveProperty("error")
    const ok = result as { mode: string; url: string; guestToken: string }
    expect(ok.mode).toBe("redirect")
    // rrr is NOT surfaced separately to the client (already in the URL)
    expect(ok).not.toHaveProperty("rrr")

    const { eq } = await import("drizzle-orm")
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.guestToken, ok.guestToken) })
    expect(order?.gatewayProvider).toBe("remita")
    expect(order?.gatewayReference).toBe(RRR)  // D-17: RRR stored as gatewayReference
  })
})
