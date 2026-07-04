// tests/payments/gateways.test.ts
// Unit tests for gateway adapter behavior.
// No DB, no real gateway API — asserts adapter conversion logic.
//
// Plan 02: Paystack status mapping + amount-passthrough cases
// Plan 03: Flutterwave amount conversion + status normalization cases

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))

// ─── Paystack Adapter Tests (Plan 02) ────────────────────────────────────────

describe("PaystackAdapter — status normalization and amount passthrough", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    // Provide a test key so "server-only" env reads don't throw
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack_key"
  })

  it("verifyTransaction: Paystack status 'success' → NormalizedStatus 'confirmed', amountKobo passthrough", async () => {
    const mockResponse = {
      data: {
        status: "success",
        amount: 150_000,   // Paystack returns kobo directly
        currency: "NGN",
        reference: "ref-1",
      },
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    const result = await paystackAdapter.verifyTransaction("ref-1")

    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(150_000)  // passthrough — Pitfall 1: no ÷100
    expect(result.currency).toBe("NGN")
    expect(result.reference).toBe("ref-1")
  })

  it("verifyTransaction: Paystack status 'failed' → NormalizedStatus 'failed'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "failed", amount: 0, currency: "NGN", reference: "ref-2" },
      }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    const result = await paystackAdapter.verifyTransaction("ref-2")

    expect(result.status).toBe("failed")
    expect(result.amountKobo).toBe(0)
  })

  it("verifyTransaction: Paystack status 'abandoned' → NormalizedStatus 'failed'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "abandoned", amount: 0, currency: "NGN", reference: "ref-3" },
      }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    const result = await paystackAdapter.verifyTransaction("ref-3")

    expect(result.status).toBe("failed")
  })

  it("verifyTransaction: amountKobo is NOT divided by 100 (Paystack natively uses kobo)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "success", amount: 700_000, currency: "NGN", reference: "ref-4" },
      }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    const result = await paystackAdapter.verifyTransaction("ref-4")

    // 700,000 kobo = ₦7,000. Must be 700000, NOT 7000.
    expect(result.amountKobo).toBe(700_000)
  })

  it("initPayment: posts amount as integer kobo (unconverted) with correct reference + metadata", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { access_code: "acc_test_123", reference: "order-ref-abc" },
      }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    await paystackAdapter.initPayment({
      email: "test@example.com",
      amountKobo: 500_000,
      reference: "order-ref-abc",
      orderId: "ord-uuid-1",
      customerName: "Ada Okafor",
    })

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)

    expect(url).toContain("api.paystack.co/transaction/initialize")
    // Amount must be kobo integer, NOT divided by 100
    expect(body.amount).toBe(500_000)
    expect(body.reference).toBe("order-ref-abc")
    expect(body.metadata.orderId).toBe("ord-uuid-1")
    expect(body.currency).toBe("NGN")
  })

  it("refund: posts to /refund with transaction reference (full refund, no amount)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    await paystackAdapter.refund("ref-5")

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)

    expect(url).toContain("api.paystack.co/refund")
    expect(body.transaction).toBe("ref-5")
    expect(body.amount).toBeUndefined()
  })

  it("refund: posts amount in kobo when partial refund amount provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    await paystackAdapter.refund("ref-6", 50_000)

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.amount).toBe(50_000)
  })

  it("verifyTransaction: provider is 'paystack'", async () => {
    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    expect(paystackAdapter.provider).toBe("paystack")
  })
})

// ─── Flutterwave Amount Conversion ───────────────────────────────────────────
// Pitfall 1 (RESEARCH): amountKobo / 100 = naira for Flutterwave popup.
// The adapter's initPayment must divide by 100 before sending to Flutterwave.
// The adapter's verifyTransaction must multiply amountNaira × 100 to get kobo.
// These values are used in Plan 03 tests (flutterwave.ts adapter).

describe("Flutterwave amount unit conversion", () => {
  it.todo(
    "[Plan 03] flutterwaveBuildParams({amountKobo: 150000}) → amount === 1500 (÷100 = naira). " +
    "Expected: params.amount === 1500, NOT 150000. " +
    "Anti-pattern: passing kobo directly charges 100× (₦1500 order → ₦150,000 charge)."
  )

  it.todo(
    "[Plan 03] flutterwaveVerify returns amountNaira; FlutterwaveAdapter.verifyTransaction multiplies × 100 → amountKobo. " +
    "Given stub response: { data: { status: 'successful', amount: 1500, currency: 'NGN', tx_ref: 'ref-1' } }, " +
    "FlutterwaveAdapter.verifyTransaction('ref-1') resolves to { status: 'confirmed', amountKobo: 150000, currency: 'NGN', reference: 'ref-1' }."
  )

  it.todo(
    "[Plan 03] Large amount guard: if amountKobo / 100 > 1_000_000 (₦1M), initPayment throws an error. " +
    "This catches accidental kobo→naira double-pass."
  )
})

// ─── Status String Normalization (Flutterwave — Plan 03) ─────────────────────
// Pitfall 7 (RESEARCH): Paystack uses "success", Flutterwave uses "successful".
// Each adapter maps to the unified NormalizedStatus type.

describe("Status string normalization (Flutterwave — Plan 03)", () => {
  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'successful' → NormalizedStatus 'confirmed'. " +
    "Stub response: { data: { status: 'successful', amount: 1500, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'confirmed', ... }."
  )

  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'failed' → NormalizedStatus 'failed'. " +
    "Stub response: { data: { status: 'failed', amount: 0, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'failed', ... }."
  )

  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'pending' → NormalizedStatus 'pending'. " +
    "Stub response: { data: { status: 'pending', amount: 0, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'pending', ... }."
  )
})

// ─── VerifyResult amountKobo normalization ────────────────────────────────────
// Adapters must always return amountKobo in minor units so the shared confirmation
// path can compare verifiedKobo to order.totalKobo without knowing the gateway.

describe("VerifyResult.amountKobo is always in kobo (Flutterwave — Plan 03)", () => {
  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction multiplies amountNaira × 100. " +
    "Given stub: { data: { amount: 700, ... } } → VerifyResult.amountKobo === 70000."
  )
})
