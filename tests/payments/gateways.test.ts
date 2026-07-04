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

// ─── Flutterwave Adapter Tests (Plan 03) ─────────────────────────────────────

describe("FlutterwaveAdapter — amount unit conversion (Pitfall 1/8)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-testkey"
    process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST-pubkey"
  })

  it("flutterwaveBuildParams({amountKobo: 150000}) → amount === 1500 (÷100 = naira, NOT kobo)", async () => {
    const { flutterwaveBuildParams } = await import("@/lib/payments/gateways/flutterwave")
    const params = flutterwaveBuildParams({
      email: "test@example.com",
      amountKobo: 150_000,  // ₦1,500 = 150,000 kobo
      txRef: "order-ref-abc",
      orderId: "ord-uuid-1",
      customerName: "Ada Okafor",
    })
    // Must be naira (÷100), NOT kobo — anti-pattern would charge ₦150,000 instead of ₦1,500
    expect(params.amount).toBe(1500)
    expect(params.tx_ref).toBe("order-ref-abc")
    expect(params.currency).toBe("NGN")
    expect(params.meta).toEqual({ orderId: "ord-uuid-1" })
  })

  it("flutterwaveBuildParams: throws if amountNaira > 1_000_000 (unit sanity guard — Pitfall 1)", async () => {
    const { flutterwaveBuildParams } = await import("@/lib/payments/gateways/flutterwave")
    // amountKobo = 101_000_000_000 → amountNaira = 1_010_000_000 > ₦1M → guard fires
    expect(() => flutterwaveBuildParams({
      email: "test@example.com",
      amountKobo: 101_000_000_000,
      txRef: "ref-guard",
      orderId: "ord-1",
      customerName: "Test",
    })).toThrow(/FLW amount > ₦1M/)
  })

  it("flutterwaveVerify: returns amountKobo = naira × 100 (Pitfall 8 normalization)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          status: "successful",
          amount: 1500,  // FLW returns NAIRA — must be converted to 150000 kobo
          currency: "NGN",
          tx_ref: "ref-1",
        },
      }),
    } as Response)

    const { flutterwaveVerify } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveVerify("txn-123")

    expect(result.amountKobo).toBe(150_000)  // 1500 naira × 100 = 150000 kobo
    expect(result.currency).toBe("NGN")
    expect(result.reference).toBe("ref-1")
  })

  it("flutterwaveAdapter.verifyTransaction: amountKobo === 70000 for amountNaira === 700", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "successful", amount: 700, currency: "NGN", tx_ref: "ref-4" },
      }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveAdapter.verifyTransaction("txn-700")
    // 700 naira × 100 = 70000 kobo — VerifyResult must always be in kobo (D-02, Pitfall 8)
    expect(result.amountKobo).toBe(70_000)
  })
})

// ─── Status String Normalization (Flutterwave — Plan 03) ─────────────────────
// Pitfall 7 (RESEARCH): Paystack uses "success", Flutterwave uses "successful".
// Each adapter maps to the unified NormalizedStatus type.

describe("FlutterwaveAdapter — status string normalization (Pitfall 7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-testkey"
  })

  it("status 'successful' → NormalizedStatus 'confirmed' (Flutterwave string, NOT 'success')", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "successful", amount: 1500, currency: "NGN", tx_ref: "ref-1" },
      }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveAdapter.verifyTransaction("txn-1")
    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(150_000)
  })

  it("status 'failed' → NormalizedStatus 'failed'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "failed", amount: 0, currency: "NGN", tx_ref: "ref-2" },
      }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveAdapter.verifyTransaction("txn-2")
    expect(result.status).toBe("failed")
  })

  it("status 'pending' → NormalizedStatus 'pending'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { status: "pending", amount: 0, currency: "NGN", tx_ref: "ref-3" },
      }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveAdapter.verifyTransaction("txn-3")
    expect(result.status).toBe("pending")
  })

  it("provider is 'flutterwave'", async () => {
    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    expect(flutterwaveAdapter.provider).toBe("flutterwave")
  })
})

// ─── Flutterwave refund ───────────────────────────────────────────────────────

describe("FlutterwaveAdapter — refund (kobo → naira conversion)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-testkey"
  })

  it("refund: posts to /transactions/:id/refund with no amount (full refund)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "success" }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    await flutterwaveAdapter.refund("txn-100")

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(url).toContain("api.flutterwave.com/v3/transactions/txn-100/refund")
    expect(body.amount).toBeUndefined()  // full refund — no amount field
  })

  it("refund: converts amountKobo to naira (÷100) in refund body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "success" }),
    } as Response)

    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    await flutterwaveAdapter.refund("txn-101", 50_000)  // 50000 kobo = ₦500

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.amount).toBe(500)  // 50000 kobo ÷ 100 = 500 naira
  })
})
