// tests/checkout/flutterwave-actions.test.ts
// Unit tests for Flutterwave Server Actions: initFlutterwavePayment + verifyFlutterwavePayment.
// PAY-06 / PAY-12 (D-06 toggle enforcement, D-04 confirmOrderPaid, T-07-12 amount guard).
//
// ALWAYS-RUNS: toggle rejection, amount mismatch, verify path logic
// DB-GATED: initFlutterwavePayment happy path with real DB insert

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

// Mock the Flutterwave gateway functions (never call real Flutterwave)
vi.mock("@/lib/payments/gateways/flutterwave", () => ({
  flutterwaveBuildParams: vi.fn(),
  flutterwaveVerify: vi.fn(),
  flutterwaveRefund: vi.fn().mockResolvedValue(undefined),
  flutterwaveAdapter: {
    provider: "flutterwave",
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
import { flutterwaveVerify, flutterwaveRefund } from "@/lib/payments/gateways/flutterwave"
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
  id: "order-id-flw-1",
  status: "pending_payment",
  customerEmail: "ada@example.com",
  reference: "MS-FLWTEST",
  guestToken: "guest-token-flw-abc",
  subtotalKobo: 10_000_000,
  shippingKobo: 200_000,
  totalKobo: 10_200_000,  // ₦102,000 total
  gatewayProvider: "flutterwave",
  gatewayReference: "MS-FLWTEST",
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
  vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
  vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-testkey")
  vi.stubEnv("NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY", "FLWPUBK_TEST-pubkey")
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
  vi.mocked(flutterwaveVerify).mockResolvedValue({
    status: "confirmed",
    amountKobo: 10_200_000,
    currency: "NGN",
    reference: "MS-FLWTEST",
  })
  vi.mocked(flutterwaveRefund).mockResolvedValue(undefined)
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

// ─── initFlutterwavePayment — toggle rejection ─────────────────────────────────

describe("initFlutterwavePayment — toggle rejection (PAY-12)", () => {
  it("returns { error } when ENABLE_FLUTTERWAVE is not set — toggle is FIRST statement", async () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "")

    const { initFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await initFlutterwavePayment(VALID_INPUT)

    expect(result).toHaveProperty("error")
    // Toggle must be first — flutterwaveBuildParams must NOT have been called
    const { flutterwaveBuildParams } = await import("@/lib/payments/gateways/flutterwave")
    expect(flutterwaveBuildParams).not.toHaveBeenCalled()
  })

  it("returns { error } when FLUTTERWAVE_SECRET_KEY is missing — gateway not configured", async () => {
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "")

    const { initFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await initFlutterwavePayment(VALID_INPUT)

    expect(result).toHaveProperty("error")
    const { flutterwaveBuildParams } = await import("@/lib/payments/gateways/flutterwave")
    expect(flutterwaveBuildParams).not.toHaveBeenCalled()
  })
})

// ─── verifyFlutterwavePayment — toggle rejection ───────────────────────────────

describe("verifyFlutterwavePayment — toggle rejection (PAY-12)", () => {
  it("returns { error } when ENABLE_FLUTTERWAVE is not set — toggle is FIRST statement", async () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "")

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    expect(result).toHaveProperty("error")
    // Toggle must be first — flutterwaveVerify must NOT have been called
    expect(flutterwaveVerify).not.toHaveBeenCalled()
  })

  it("returns { error } when FLUTTERWAVE_SECRET_KEY is missing — toggle check", async () => {
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "")

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    expect(result).toHaveProperty("error")
    expect(flutterwaveVerify).not.toHaveBeenCalled()
  })
})

// ─── verifyFlutterwavePayment — amount guard (T-07-12 Tampering / Pitfall 1/8) ─

describe("verifyFlutterwavePayment — server-side amount guard", () => {
  it("returns { error } when verified amountKobo is less than order.totalKobo (tamper + unit mismatch protection)", async () => {
    // Flutterwave verify returns LESS than order.totalKobo (adapter already normalized to kobo)
    vi.mocked(flutterwaveVerify).mockResolvedValueOnce({
      status: "confirmed",
      amountKobo: 1_000,  // only 10 kobo = ₦0.10 — obviously tampered or wrong unit
      currency: "NGN",
      reference: "MS-FLWTEST",
    })

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    expect(result).toHaveProperty("error")
    const err = (result as { error: string }).error
    expect(err).toMatch(/amount mismatch/i)
    // confirmOrderPaid should NOT have been called (amount rejected before confirm)
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("returns { error } when Flutterwave reports payment is not confirmed (status=failed)", async () => {
    vi.mocked(flutterwaveVerify).mockResolvedValueOnce({
      status: "failed",
      amountKobo: 0,
      currency: "NGN",
      reference: "MS-FLWTEST",
    })

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    expect(result).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("returns { error: 'Order not found' } when txRef has no matching order", async () => {
    vi.mocked(getOrderByGatewayReference).mockResolvedValueOnce(undefined)

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "unknown-txref" })

    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/not found/i)
  })
})

// ─── verifyFlutterwavePayment — eventId sharing with webhook (D-04, T-07-13) ──

describe("verifyFlutterwavePayment — confirmOrderPaid called with correct eventId", () => {
  it("calls confirmOrderPaid with eventId = 'flutterwave:' + txRef (shared with webhook)", async () => {
    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    expect(confirmOrderPaid).toHaveBeenCalledWith(
      MOCK_ORDER,
      { provider: "flutterwave", eventId: "flutterwave:MS-FLWTEST" }
    )
  })

  it("returns { guestToken } on successful confirmation", async () => {
    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-123", txRef: "MS-FLWTEST" })

    const ok = result as { guestToken: string }
    expect(ok.guestToken).toBe("guest-token-flw-abc")
  })
})

// ─── verifyFlutterwavePayment — oversold refund path (T-07-14) ─────────────────

describe("verifyFlutterwavePayment — oversold refund path", () => {
  it("calls flutterwaveRefund(transactionId) and returns { error } when outcome is oversold", async () => {
    vi.mocked(confirmOrderPaid).mockResolvedValueOnce({
      outcome: "oversold",
      refundNeeded: true,
    })

    const { verifyFlutterwavePayment } = await import("@/lib/actions/flutterwave")
    const result = await verifyFlutterwavePayment({ transactionId: "txn-oversold-123", txRef: "MS-FLWTEST" })

    expect(result).toHaveProperty("error")
    const err = (result as { error: string }).error
    expect(err).toMatch(/sold out|refunded/i)
    // flutterwaveRefund must be called with the transactionId (numeric FLW txn id)
    expect(flutterwaveRefund).toHaveBeenCalledWith("txn-oversold-123")
  })
})

// ─── initFlutterwavePayment — return value security (T-07-16, D-08) ───────────

describe("initFlutterwavePayment — secret never in return value", () => {
  it.skipIf(!hasDatabase)(
    "[DB] returns { publicKey, txRef, amountNaira, guestToken } without exposing secret key",
    async () => {
      // Seed a real variant in DB so the orderItem FK constraint passes
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()

      await db.insert(schema.categories).values({ id: categoryId, name: "Test Cat FLW", slug: `cat-flw-${categoryId.slice(0, 6)}` })
      await db.insert(schema.brands).values({ id: brandId, name: `Brand-FLW-${brandId.slice(0, 6)}` })
      await db.insert(schema.products).values({ id: productId, name: "Test Phone FLW", slug: `test-phone-flw-${productId.slice(0, 6)}`, categoryId, brandId })
      await db.insert(schema.variants).values({ id: variantId, productId, priceKobo: 10_000_000, stock: 10 })

      // Override getCart to use the seeded variantId
      vi.mocked(getCart).mockResolvedValue({
        items: [{
          variantId,
          quantity: 1,
          stock: 10,
          priceKobo: 10_000_000,
          productName: "Test Phone FLW",
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

      const { initFlutterwavePayment } = await import("@/lib/actions/flutterwave")
      const result = await initFlutterwavePayment(VALID_INPUT)

      expect(result).not.toHaveProperty("error")
      const ok = result as {
        publicKey: string
        txRef: string
        amountNaira: number
        guestToken: string
      }

      // Public key returned (client-safe)
      expect(ok.publicKey).toBe("FLWPUBK_TEST-pubkey")
      // txRef is the order reference
      expect(ok.txRef).toBeTruthy()
      // amountNaira = totalKobo / 100 = (10_000_000 + 200_000) / 100 = 102000 (₦102,000)
      expect(ok.amountNaira).toBe(102_000)
      expect(ok.guestToken).toBeTruthy()

      // Secret key must NEVER appear in the returned value (T-07-16, D-08)
      expect(JSON.stringify(result)).not.toContain("FLWSECK")

      // Verify the order was written to DB with correct gateway fields
      const { eq } = await import("drizzle-orm")
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.guestToken, ok.guestToken),
      })
      expect(order?.gatewayProvider).toBe("flutterwave")
      expect(order?.gatewayReference).toBeTruthy()
      expect(order?.status).toBe("pending_payment")
    }
  )
})
