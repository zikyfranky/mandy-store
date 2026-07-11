// tests/checkout/paystack-actions.test.ts
// Unit tests for Paystack Server Actions: initPaystackPayment + verifyPaystackPayment.
// PAY-05 / PAY-12 (D-06 toggle enforcement, D-04 confirmOrderPaid, T-07-06 amount guard).
//
// ALWAYS-RUNS: toggle rejection, amount mismatch, verify path logic
// DB-GATED: initPaystackPayment happy path with real DB insert

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCartTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/email/send-bank-transfer-instructions", () => ({
  sendBankTransferInstructionsEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock the Paystack gateway functions (never call real Paystack)
vi.mock("@/lib/payments/gateways/paystack", () => ({
  paystackInitialize: vi.fn(),
  paystackVerify: vi.fn(),
  paystackRefund: vi.fn().mockResolvedValue(undefined),
  paystackAdapter: {
    provider: "paystack",
    initPayment: vi.fn(),
    verifyTransaction: vi.fn(),
    refund: vi.fn(),
  },
}))

// Mock confirmOrderPaid — assert calls and return values
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({
  confirmOrderPaid: vi.fn().mockResolvedValue({ outcome: "confirmed" }),
}))

// Mock order lookup for the verify path tests (non-DB)
vi.mock("@/lib/orders/queries", () => ({
  getOrderByGatewayReference: vi.fn(),
  getOrderByToken: vi.fn(),
  getOrderByStripePaymentIntentId: vi.fn(),
  getOrderStatusByToken: vi.fn(),
}))

// Mock getCart to control server-side total recompute
vi.mock("@/lib/cart/queries", () => ({
  getCart: vi.fn(),
}))

// Phase 8 (D-03 / ADMN-07): isPaymentMethodEnabled now touches getGatewayConfig /
// getGatewayCredentialsMap for every method (not just the 3 DB-toggled ones) — stub the
// DB round trip so these Server Action tests fall through to real env-fallback behavior.
vi.mock("@/lib/payments/gateway-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/gateway-credentials")>()
  return { ...actual, getGatewayCredentialsMap: vi.fn().mockResolvedValue({}) }
})

// ─── Lazy imports after mocks ──────────────────────────────────────────────────
import { getCart } from "@/lib/cart/queries"
import { paystackInitialize, paystackVerify, paystackRefund } from "@/lib/payments/gateways/paystack"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { getOrderByGatewayReference } from "@/lib/orders/queries"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_INPUT = {
  email: "ada@example.com",
  address: {
    fullName: "Ada Okafor",
    phone: "08012345678",
    street: "12 Marina Street",
    city: "Lagos Island",
    state: "Lagos" as const,
    landmark: "Near First Bank",
  },
}

// A mock order returned by getOrderByGatewayReference
const MOCK_ORDER = {
  id: "order-id-1",
  status: "pending_payment",
  customerEmail: "ada@example.com",
  reference: "MS-TEST01",
  guestToken: "guest-token-abc123",
  subtotalKobo: 10_000_000,
  shippingKobo: 200_000,
  totalKobo: 10_200_000,  // ₦102,000 total
  gatewayProvider: "paystack",
  gatewayReference: "ref-test",
  items: [{
    variantId: "00000000-0000-0000-0000-000000000001",
    quantity: 1,
    productName: "Test Phone",
    variantLabel: "Black / 128GB",
    lineTotalKobo: 10_000_000,
  }],
}

// ─── beforeEach / afterEach ────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("ENABLE_PAYSTACK", "true")
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_key")
  vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "pk_test_paystack_pub")
  vi.stubEnv("FLAT_SHIPPING_KOBO", "200000")
  // Reset mocked implementations each test (clearAllMocks wipes them)
  vi.mocked(getCart).mockResolvedValue({
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
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(paystackInitialize).mockResolvedValue({ accessCode: "acc_test_default", reference: "ref-default" })
  vi.mocked(paystackVerify).mockResolvedValue({ status: "confirmed", amountKobo: 10_200_000, currency: "NGN", reference: "ref-test" })
  vi.mocked(paystackRefund).mockResolvedValue(undefined)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
})

afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateCartTables()
    await truncateCatalogTables()
  }
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

// ─── initPaystackPayment — toggle rejection ────────────────────────────────────

describe("initPaystackPayment — toggle rejection (PAY-12)", () => {
  it("returns { error } when ENABLE_PAYSTACK is not set — toggle is FIRST statement", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "")

    const { initPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await initPaystackPayment(VALID_INPUT)

    expect(result).toHaveProperty("error")
    // Toggle must be first — paystackInitialize must NOT have been called
    expect(paystackInitialize).not.toHaveBeenCalled()
  })

  it("returns { error } when PAYSTACK_SECRET_KEY is missing — gateway not configured", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "")

    const { initPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await initPaystackPayment(VALID_INPUT)

    expect(result).toHaveProperty("error")
    expect(paystackInitialize).not.toHaveBeenCalled()
  })
})

// ─── verifyPaystackPayment — toggle rejection ─────────────────────────────────

describe("verifyPaystackPayment — toggle rejection (PAY-12)", () => {
  it("returns { error } when ENABLE_PAYSTACK is not set — toggle is FIRST statement", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "")

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    expect(result).toHaveProperty("error")
    // Toggle must be first — paystackVerify must NOT have been called
    expect(paystackVerify).not.toHaveBeenCalled()
  })

  it("returns { error } when PAYSTACK_SECRET_KEY is missing — toggle check", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "")

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    expect(result).toHaveProperty("error")
    expect(paystackVerify).not.toHaveBeenCalled()
  })
})

// ─── verifyPaystackPayment — amount guard (T-07-06 Tampering mitigation) ──────

describe("verifyPaystackPayment — server-side amount guard", () => {
  it("returns { error } when verified kobo amount is less than order.totalKobo (tamper protection)", async () => {
    // Paystack verify returns LESS than order.totalKobo (tampering simulation)
    vi.mocked(paystackVerify).mockResolvedValueOnce({
      status: "confirmed",
      amountKobo: 1_000,  // only ₦10 — obviously tampered (order.totalKobo = 10_200_000)
      currency: "NGN",
      reference: "ref-test",
    })

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    expect(result).toHaveProperty("error")
    const err = (result as { error: string }).error
    expect(err).toMatch(/amount mismatch/i)
    // confirmOrderPaid should NOT have been called (amount rejected before confirm)
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("returns { error } when Paystack reports payment is not confirmed (status=failed)", async () => {
    vi.mocked(paystackVerify).mockResolvedValueOnce({
      status: "failed",
      amountKobo: 0,
      currency: "NGN",
      reference: "ref-test",
    })

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    expect(result).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("returns { error: 'Order not found' } when reference has no matching order", async () => {
    vi.mocked(getOrderByGatewayReference).mockResolvedValueOnce(undefined)

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "unknown-ref" })

    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/not found/i)
  })
})

// ─── verifyPaystackPayment — eventId sharing with webhook (D-04, T-07-07) ─────

describe("verifyPaystackPayment — confirmOrderPaid called with correct eventId", () => {
  it("calls confirmOrderPaid with eventId = 'paystack:' + reference (shared with webhook)", async () => {
    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    await verifyPaystackPayment({ reference: "ref-test" })

    expect(confirmOrderPaid).toHaveBeenCalledWith(
      MOCK_ORDER,
      { provider: "paystack", eventId: "paystack:ref-test" }
    )
  })

  it("returns { guestToken } on successful confirmation", async () => {
    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    const ok = result as { guestToken: string }
    expect(ok.guestToken).toBe("guest-token-abc123")
  })
})

// ─── verifyPaystackPayment — oversold refund path (T-07-08) ───────────────────

describe("verifyPaystackPayment — oversold refund path", () => {
  it("calls paystackRefund and returns { error } when outcome is oversold", async () => {
    vi.mocked(confirmOrderPaid).mockResolvedValueOnce({
      outcome: "oversold",
      refundNeeded: true,
    })

    const { verifyPaystackPayment } = await import("@/lib/actions/paystack")
    const result = await verifyPaystackPayment({ reference: "ref-test" })

    expect(result).toHaveProperty("error")
    const err = (result as { error: string }).error
    expect(err).toMatch(/sold out|refunded/i)
    // paystackRefund must have been called to issue refund
    expect(paystackRefund).toHaveBeenCalledWith("ref-test")
  })
})

// ─── DB-gated happy path ──────────────────────────────────────────────────────

describe("initPaystackPayment — DB-gated happy path", () => {
  it.skipIf(!hasDatabase)(
    "[DB] initPaystackPayment creates order with gatewayProvider=paystack in DB, returns { accessCode, reference, publicKey, guestToken } without secret key",
    async () => {
      // Seed a real variant in DB so the orderItem FK constraint passes
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()

      await db.insert(schema.categories).values({ id: categoryId, name: "Test Cat", slug: `cat-${categoryId.slice(0, 6)}` })
      await db.insert(schema.brands).values({ id: brandId, name: `Brand-${brandId.slice(0, 6)}` })
      await db.insert(schema.products).values({ id: productId, name: "Test Phone", slug: `test-phone-${productId.slice(0, 6)}`, categoryId, brandId })
      await db.insert(schema.variants).values({ id: variantId, productId, priceKobo: 10_000_000, stock: 10 })

      // Override getCart to use the seeded variantId (not the static fixture)
      vi.mocked(getCart).mockResolvedValue({
        items: [{
          variantId,
          quantity: 1,
          stock: 10,
          priceKobo: 10_000_000,
          productName: "Test Phone",
          variantLabel: "Black / 128GB",
          imageUrl: null,
          lineTotalKobo: 10_000_000,
          isOOS: false,
          isClamped: false,
        }],
        subtotalKobo: 10_000_000,
        totalQty: 1,
        hasOOS: false,
      })

      vi.mocked(paystackInitialize).mockResolvedValue({
        accessCode: "acc_db_test",
        reference: "ref-db-test",
      })

      const { initPaystackPayment } = await import("@/lib/actions/paystack")
      const result = await initPaystackPayment(VALID_INPUT)

      expect(result).not.toHaveProperty("error")
      const ok = result as { accessCode: string; reference: string; publicKey: string; guestToken: string }
      expect(ok.accessCode).toBe("acc_db_test")
      expect(ok.publicKey).toBe("pk_test_paystack_pub")
      expect(ok.guestToken).toBeTruthy()
      // Secret key must NEVER appear in the returned value (T-07-10, D-08)
      expect(JSON.stringify(result)).not.toContain("sk_test")

      // Verify the order was written to DB with correct gateway fields
      const { eq } = await import("drizzle-orm")
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.guestToken, ok.guestToken),
      })
      expect(order?.gatewayProvider).toBe("paystack")
      expect(order?.gatewayReference).toBeTruthy()
      expect(order?.status).toBe("pending_payment")

      // Server-computed totalKobo was passed to Paystack (server-side recompute, T-07-06)
      const callArgs = vi.mocked(paystackInitialize).mock.calls[0]?.[0]
      expect(callArgs?.amountKobo).toBe(10_200_000)  // 10_000_000 subtotal + 200_000 shipping
    }
  )
})
