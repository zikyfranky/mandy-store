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

  it("initPayment returns { mode: 'popup', ... } (D-16 regression-safe migration)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { access_code: "acc_x", reference: "order-ref-x" } }),
    } as Response)

    const { paystackAdapter } = await import("@/lib/payments/gateways/paystack")
    const result = await paystackAdapter.initPayment({
      email: "test@example.com",
      amountKobo: 500_000,
      reference: "order-ref-x",
      orderId: "ord-1",
      customerName: "Ada",
    })
    expect(result.mode).toBe("popup")
    expect((result as Record<string, unknown>).accessCode).toBe("acc_x")
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

  it("initPayment returns { mode: 'popup', ... } (D-16 regression-safe migration)", async () => {
    const { flutterwaveAdapter } = await import("@/lib/payments/gateways/flutterwave")
    const result = await flutterwaveAdapter.initPayment({
      email: "test@example.com",
      amountKobo: 150_000,
      reference: "order-ref-x",
      orderId: "ord-1",
      customerName: "Ada",
    })
    expect(result.mode).toBe("popup")
    expect((result as Record<string, unknown>).tx_ref).toBe("order-ref-x")
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

// ─── Interswitch WebPay Adapter Tests (Plan 02 — RED until adapter lands) ──────
// Pitfall 2: request hash and requery hash use DIFFERENT concat orders — both pinned here.
import crypto from "crypto"

describe("interswitch adapter (PAY-09)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX")
    vi.stubEnv("INTERSWITCH_PRODUCT_ID", "1076")
    vi.stubEnv("INTERSWITCH_PAY_ITEM_ID", "101")
    vi.stubEnv("INTERSWITCH_MAC_KEY", "MAC")
    vi.stubEnv("INTERSWITCH_REDIRECT_URL", "https://x/cb")
  })

  it("initPayment: request hash = SHA-512(txn_ref+product_id+pay_item_id+amount+redirect+macKey) and returns POST redirect", async () => {
    const { interswitchAdapter } = await import("@/lib/payments/gateways/interswitch")
    const result = await interswitchAdapter.initPayment({
      email: "c@d.e",
      amountKobo: 125000,
      reference: "ORD123",
      orderId: "o1",
      customerName: "N",
    })
    const expected = crypto.createHash("sha512")
      .update("ORD123" + "1076" + "101" + "125000" + "https://x/cb" + "MAC")
      .digest("hex")
    expect(result.mode).toBe("redirect")
    expect((result as { method?: string }).method).toBe("POST")
    const fields = (result as { fields: Record<string, string> }).fields
    expect(fields.hash).toBe(expected)
    // POST target is the Interswitch host (D-12 — distinct from GTPay)
    expect((result as { url: string }).url).toContain("interswitchng.com")
  })

  it("verifyTransaction: ResponseCode '00' → confirmed, amount passthrough (kobo)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ResponseCode: "00", Amount: 125000 }),
    } as Response)
    const { interswitchAdapter } = await import("@/lib/payments/gateways/interswitch")
    const result = await interswitchAdapter.verifyTransaction("ORD123")
    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(125000)
    expect(result.currency).toBe("NGN")
  })

  it("verifyTransaction: non-'00' ResponseCode → failed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ResponseCode: "Z6", Amount: 0 }),
    } as Response)
    const { interswitchAdapter } = await import("@/lib/payments/gateways/interswitch")
    const result = await interswitchAdapter.verifyTransaction("ORD123")
    expect(result.status).toBe("failed")
  })

  it("provider is 'interswitch'", async () => {
    const { interswitchAdapter } = await import("@/lib/payments/gateways/interswitch")
    expect(interswitchAdapter.provider).toBe("interswitch")
  })
})

// ─── GTPay Adapter Tests (Plan 02 — RED until adapter lands) ──────────────────
// D-12: GTPay is a config variant over the SAME webpay-core, distinct host + field names.

describe("gtpay adapter (PAY-10)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    vi.stubEnv("GTPAY_MERCHANT_ID", "GT")
    vi.stubEnv("GTPAY_HASH_KEY", "HK")
    vi.stubEnv("GTPAY_NOTI_URL", "https://x/noti")
  })

  it("initPayment: request hash = SHA-512(mert_id+tranx_id+amt+curr+cust_id+noti_url+hashkey)", async () => {
    const { gtpayAdapter } = await import("@/lib/payments/gateways/gtpay")
    const result = await gtpayAdapter.initPayment({
      email: "c@d.e",
      amountKobo: 125000,
      reference: "GTX1",
      orderId: "o1",
      customerName: "N",
    })
    const expected = crypto.createHash("sha512")
      .update("GT" + "GTX1" + "125000" + "566" + "c@d.e" + "https://x/noti" + "HK")
      .digest("hex")
    const fields = (result as { fields: Record<string, string> }).fields
    expect(fields.gtpay_hash).toBe(expected)
    // uses the current field name, NOT the deprecated gtpay_tranx_hash
    expect(fields.gtpay_tranx_hash).toBeUndefined()
  })

  it("shares webpay-core with a distinct config: GTPay uses the GTBank host (D-12)", async () => {
    const { gtpayAdapter } = await import("@/lib/payments/gateways/gtpay")
    const result = await gtpayAdapter.initPayment({
      email: "c@d.e",
      amountKobo: 125000,
      reference: "GTX1",
      orderId: "o1",
      customerName: "N",
    })
    expect((result as { url: string }).url).toContain("gtbank.com")
  })

  it("verifyTransaction: gtpay_tranx_status_code '00' → confirmed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ gtpay_tranx_status_code: "00", gtpay_tranx_amt: 125000 }),
    } as Response)
    const { gtpayAdapter } = await import("@/lib/payments/gateways/gtpay")
    const result = await gtpayAdapter.verifyTransaction("GTX1")
    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(125000)
  })

  it("provider is 'gtpay'", async () => {
    const { gtpayAdapter } = await import("@/lib/payments/gateways/gtpay")
    expect(gtpayAdapter.provider).toBe("gtpay")
  })
})

// ─── Remita Adapter Tests (Plan 03 — RED until adapter lands) ──────────────────
// D-17 RRR-inside-init; Pitfall 1 naira↔kobo; Pitfall 5 JSONP strip.

describe("remita adapter (PAY-11)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    vi.stubEnv("REMITA_MERCHANT_ID", "RM")
    vi.stubEnv("REMITA_API_KEY", "AK")
    vi.stubEnv("REMITA_SERVICE_TYPE_ID", "ST")
    vi.stubEnv("REMITA_BASE", "https://demo.remita.net")
  })

  it("initPayment: RRR generated inside (D-17), amount ÷100 (naira) in body, apiHash concat order, GET redirect", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      // JSONP-wrapped response (Pitfall 5) — must be stripped before parse
      text: async () => 'jsonp({"statuscode":"025","RRR":"123456789012"})',
    } as Response)

    const { remitaAdapter } = await import("@/lib/payments/gateways/remita")
    const result = await remitaAdapter.initPayment({
      email: "c@d.e",
      amountKobo: 150000,  // ₦1,500
      reference: "REMORD1",
      orderId: "o1",
      customerName: "Ada",
    })

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(url).toContain("paymentinit")
    expect(body.amount).toBe("1500")  // 150000 kobo ÷ 100 = 1500 naira (string)

    const apiHash = crypto.createHash("sha512")
      .update("RM" + "ST" + "REMORD1" + "1500" + "AK")
      .digest("hex")
    expect(String(options.headers?.["Authorization" as keyof HeadersInit] ?? (options.headers as Record<string, string>).Authorization)).toContain(apiHash)

    expect(result.mode).toBe("redirect")
    expect((result as { rrr?: string }).rrr).toBe("123456789012")
    expect((result as { url: string }).url).toContain("123456789012")
  })

  it("verifyTransaction: JSONP status '01' → confirmed, amount ×100 (naira→kobo)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'jsonp({"status":"01","amount":"1250"})',
    } as Response)
    const { remitaAdapter } = await import("@/lib/payments/gateways/remita")
    const result = await remitaAdapter.verifyTransaction("123456789012")
    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(125000)  // 1250 naira × 100
  })

  it("verifyTransaction: handles clean (non-JSONP) JSON defensively", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"status":"00","amount":"700"}',
    } as Response)
    const { remitaAdapter } = await import("@/lib/payments/gateways/remita")
    const result = await remitaAdapter.verifyTransaction("999")
    expect(result.status).toBe("confirmed")
    expect(result.amountKobo).toBe(70000)
  })

  it("provider is 'remita'", async () => {
    const { remitaAdapter } = await import("@/lib/payments/gateways/remita")
    expect(remitaAdapter.provider).toBe("remita")
  })
})
