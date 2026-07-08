// tests/payments/config.test.ts
// Unit tests for PAY-04 / D-11 / ADMN-04: server-only payment method toggle enforcement.
// Pure unit — no real DB; the store-settings loader is mocked to return controlled maps.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"

// Mock server-only so it doesn't throw in the test environment
vi.mock("server-only", () => ({}))

// D-11: isPaymentMethodEnabled is now async and DB-aware for stripe/paypal/bank_transfer.
// Mock the batched settings loader so tests control the "DB flag" independently of env.
vi.mock("@/lib/payments/store-settings", () => ({
  getStoreSettingsMap: vi.fn(),
}))

// Import after mocking
import { isPaymentMethodEnabled, enabledPaymentMethods } from "@/lib/payments/config"
import { getStoreSettingsMap } from "@/lib/payments/store-settings"

beforeEach(() => {
  // Default: no store_settings rows loaded => every DB-backed method falls back to
  // env-only "enabled" behavior (settings[method] ?? true) — matches pre-D-11 behavior
  // for the existing env-only test cases below.
  vi.mocked(getStoreSettingsMap).mockResolvedValue({})
})

afterEach(() => {
  // Restore the original env after each test
  vi.unstubAllEnvs()
  vi.mocked(getStoreSettingsMap).mockReset()
})

describe("isPaymentMethodEnabled — stripe", () => {
  it("returns true when ENABLE_STRIPE=true and STRIPE_SECRET_KEY is set", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    expect(await isPaymentMethodEnabled("stripe")).toBe(true)
  })

  it("returns false when ENABLE_STRIPE=false (key present)", async () => {
    vi.stubEnv("ENABLE_STRIPE", "false")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    expect(await isPaymentMethodEnabled("stripe")).toBe(false)
  })

  it("returns false when ENABLE_STRIPE=true but STRIPE_SECRET_KEY is missing", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.unstubAllEnvs()
    vi.stubEnv("ENABLE_STRIPE", "true")
    // STRIPE_SECRET_KEY is unset
    delete process.env.STRIPE_SECRET_KEY
    expect(await isPaymentMethodEnabled("stripe")).toBe(false)
  })

  it("returns false when neither env var is set", async () => {
    delete process.env.ENABLE_STRIPE
    delete process.env.STRIPE_SECRET_KEY
    expect(await isPaymentMethodEnabled("stripe")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — paypal (defaults OFF per D-05a)", () => {
  it("returns false by default (no env vars set)", async () => {
    delete process.env.ENABLE_PAYPAL
    delete process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_SECRET
    expect(await isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns false when ENABLE_PAYPAL=true but credentials missing", async () => {
    vi.stubEnv("ENABLE_PAYPAL", "true")
    delete process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_SECRET
    expect(await isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns false when ENABLE_PAYPAL=false even with credentials set", async () => {
    vi.stubEnv("ENABLE_PAYPAL", "false")
    vi.stubEnv("PAYPAL_CLIENT_ID", "client_id")
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret")
    expect(await isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns true only when ENABLE_PAYPAL=true AND both credentials are present", async () => {
    vi.stubEnv("ENABLE_PAYPAL", "true")
    vi.stubEnv("PAYPAL_CLIENT_ID", "client_id")
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret")
    expect(await isPaymentMethodEnabled("paypal")).toBe(true)
  })
})

describe("isPaymentMethodEnabled — bank_transfer", () => {
  it("returns false when no bank env vars are set", async () => {
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.BANK_NAME
    delete process.env.BANK_ACCOUNT_NUMBER
    delete process.env.BANK_ACCOUNT_NAME
    expect(await isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })

  it("returns false when ENABLE_BANK_TRANSFER=true but any bank var is missing", async () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    // BANK_ACCOUNT_NAME is missing
    delete process.env.BANK_ACCOUNT_NAME
    expect(await isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })

  it("returns true when ENABLE_BANK_TRANSFER=true and all three bank vars are set", async () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    expect(await isPaymentMethodEnabled("bank_transfer")).toBe(true)
  })

  it("returns false when ENABLE_BANK_TRANSFER=false even with all bank vars set", async () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "false")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    expect(await isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — paystack", () => {
  it("returns true when ENABLE_PAYSTACK=true and PAYSTACK_SECRET_KEY is set", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_abc123")
    expect(await isPaymentMethodEnabled("paystack")).toBe(true)
  })

  it("returns false when ENABLE_PAYSTACK=false (key present)", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "false")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_abc123")
    expect(await isPaymentMethodEnabled("paystack")).toBe(false)
  })

  it("returns false when ENABLE_PAYSTACK=true but PAYSTACK_SECRET_KEY is missing", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    delete process.env.PAYSTACK_SECRET_KEY
    expect(await isPaymentMethodEnabled("paystack")).toBe(false)
  })

  it("returns false when neither env var is set", async () => {
    delete process.env.ENABLE_PAYSTACK
    delete process.env.PAYSTACK_SECRET_KEY
    expect(await isPaymentMethodEnabled("paystack")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — flutterwave", () => {
  it("returns true when ENABLE_FLUTTERWAVE=true and FLUTTERWAVE_SECRET_KEY is set", async () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-abc123")
    expect(await isPaymentMethodEnabled("flutterwave")).toBe(true)
  })

  it("returns false when ENABLE_FLUTTERWAVE=false (key present)", async () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "false")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-abc123")
    expect(await isPaymentMethodEnabled("flutterwave")).toBe(false)
  })

  it("returns false when ENABLE_FLUTTERWAVE=true but FLUTTERWAVE_SECRET_KEY is missing", async () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    delete process.env.FLUTTERWAVE_SECRET_KEY
    expect(await isPaymentMethodEnabled("flutterwave")).toBe(false)
  })

  it("returns false when neither env var is set", async () => {
    delete process.env.ENABLE_FLUTTERWAVE
    delete process.env.FLUTTERWAVE_SECRET_KEY
    expect(await isPaymentMethodEnabled("flutterwave")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — interswitch (PAY-09/PAY-12, default OFF D-19)", () => {
  it("returns true when ENABLE_INTERSWITCH=true and both secrets are set", async () => {
    vi.stubEnv("ENABLE_INTERSWITCH", "true")
    vi.stubEnv("INTERSWITCH_MAC_KEY", "mac_key_abc")
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX123")
    expect(await isPaymentMethodEnabled("interswitch")).toBe(true)
  })

  it("returns false when ENABLE_INTERSWITCH unset (default OFF)", async () => {
    delete process.env.ENABLE_INTERSWITCH
    vi.stubEnv("INTERSWITCH_MAC_KEY", "mac_key_abc")
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX123")
    expect(await isPaymentMethodEnabled("interswitch")).toBe(false)
  })

  it("returns false when a required secret is missing", async () => {
    vi.stubEnv("ENABLE_INTERSWITCH", "true")
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX123")
    delete process.env.INTERSWITCH_MAC_KEY
    expect(await isPaymentMethodEnabled("interswitch")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — gtpay (PAY-10/PAY-12, default OFF D-19)", () => {
  it("returns true when ENABLE_GTPAY=true and both secrets are set", async () => {
    vi.stubEnv("ENABLE_GTPAY", "true")
    vi.stubEnv("GTPAY_HASH_KEY", "hash_key_abc")
    vi.stubEnv("GTPAY_MERCHANT_ID", "GT123")
    expect(await isPaymentMethodEnabled("gtpay")).toBe(true)
  })

  it("returns false when ENABLE_GTPAY unset (default OFF)", async () => {
    delete process.env.ENABLE_GTPAY
    vi.stubEnv("GTPAY_HASH_KEY", "hash_key_abc")
    vi.stubEnv("GTPAY_MERCHANT_ID", "GT123")
    expect(await isPaymentMethodEnabled("gtpay")).toBe(false)
  })

  it("returns false when a required secret is missing", async () => {
    vi.stubEnv("ENABLE_GTPAY", "true")
    vi.stubEnv("GTPAY_MERCHANT_ID", "GT123")
    delete process.env.GTPAY_HASH_KEY
    expect(await isPaymentMethodEnabled("gtpay")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — remita (PAY-11/PAY-12, default OFF D-19)", () => {
  it("returns true when ENABLE_REMITA=true and both secrets are set", async () => {
    vi.stubEnv("ENABLE_REMITA", "true")
    vi.stubEnv("REMITA_API_KEY", "api_key_abc")
    vi.stubEnv("REMITA_MERCHANT_ID", "RM123")
    expect(await isPaymentMethodEnabled("remita")).toBe(true)
  })

  it("returns false when ENABLE_REMITA unset (default OFF)", async () => {
    delete process.env.ENABLE_REMITA
    vi.stubEnv("REMITA_API_KEY", "api_key_abc")
    vi.stubEnv("REMITA_MERCHANT_ID", "RM123")
    expect(await isPaymentMethodEnabled("remita")).toBe(false)
  })

  it("returns false when a required secret is missing", async () => {
    vi.stubEnv("ENABLE_REMITA", "true")
    vi.stubEnv("REMITA_MERCHANT_ID", "RM123")
    delete process.env.REMITA_API_KEY
    expect(await isPaymentMethodEnabled("remita")).toBe(false)
  })
})

// ─── D-11 / ADMN-04: async DB-backed toggle enforcement ────────────────────────
describe("isPaymentMethodEnabled — toggle enforcement (D-11 DB-backed gate)", () => {
  it("DB flag off + creds present => resolves false (stripe)", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    vi.mocked(getStoreSettingsMap).mockResolvedValue({ stripe: false })
    expect(await isPaymentMethodEnabled("stripe")).toBe(false)
  })

  it("DB flag on + creds present => resolves true (stripe)", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    vi.mocked(getStoreSettingsMap).mockResolvedValue({ stripe: true })
    expect(await isPaymentMethodEnabled("stripe")).toBe(true)
  })

  it("DB flag on + missing env credential => resolves false (short-circuit, no DB dependency)", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    delete process.env.STRIPE_SECRET_KEY
    vi.mocked(getStoreSettingsMap).mockResolvedValue({ stripe: true })
    expect(await isPaymentMethodEnabled("stripe")).toBe(false)
    // Short-circuit: env/credential check fails BEFORE any DB read.
    expect(getStoreSettingsMap).not.toHaveBeenCalled()
  })

  it("method with NO db row (paystack) falls back to env-only (true when env creds present)", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_abc123")
    // paystack is not DB-backed — getStoreSettingsMap must never be consulted for it.
    vi.mocked(getStoreSettingsMap).mockResolvedValue({})
    expect(await isPaymentMethodEnabled("paystack")).toBe(true)
    expect(getStoreSettingsMap).not.toHaveBeenCalled()
  })
})

describe("enabledPaymentMethods", () => {
  it("returns only enabled methods", async () => {
    // Enable stripe + bank_transfer, keep paypal/paystack/flutterwave OFF
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx")
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    delete process.env.ENABLE_PAYPAL
    delete process.env.ENABLE_PAYSTACK
    delete process.env.ENABLE_FLUTTERWAVE

    const methods = await enabledPaymentMethods()
    expect(methods).toContain("stripe")
    expect(methods).toContain("bank_transfer")
    expect(methods).not.toContain("paypal")
    expect(methods).not.toContain("paystack")
    expect(methods).not.toContain("flutterwave")
  })

  it("returns paystack and flutterwave when both are enabled", async () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_xxx")
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-xxx")
    delete process.env.ENABLE_STRIPE
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.ENABLE_PAYPAL

    const methods = await enabledPaymentMethods()
    expect(methods).toContain("paystack")
    expect(methods).toContain("flutterwave")
    expect(methods).not.toContain("stripe")
    expect(methods).not.toContain("bank_transfer")
  })

  it("returns empty array when nothing is enabled", async () => {
    delete process.env.ENABLE_STRIPE
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.ENABLE_PAYPAL
    delete process.env.ENABLE_PAYSTACK
    delete process.env.ENABLE_FLUTTERWAVE
    delete process.env.ENABLE_INTERSWITCH
    delete process.env.ENABLE_GTPAY
    delete process.env.ENABLE_REMITA
    expect(await enabledPaymentMethods()).toEqual([])
  })

  it("returns interswitch/gtpay/remita when all three are enabled", async () => {
    delete process.env.ENABLE_STRIPE
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.ENABLE_PAYPAL
    delete process.env.ENABLE_PAYSTACK
    delete process.env.ENABLE_FLUTTERWAVE
    vi.stubEnv("ENABLE_INTERSWITCH", "true")
    vi.stubEnv("INTERSWITCH_MAC_KEY", "mac")
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX")
    vi.stubEnv("ENABLE_GTPAY", "true")
    vi.stubEnv("GTPAY_HASH_KEY", "hash")
    vi.stubEnv("GTPAY_MERCHANT_ID", "GT")
    vi.stubEnv("ENABLE_REMITA", "true")
    vi.stubEnv("REMITA_API_KEY", "api")
    vi.stubEnv("REMITA_MERCHANT_ID", "RM")

    const methods = await enabledPaymentMethods()
    expect(methods).toEqual(["interswitch", "gtpay", "remita"])
  })

  it("returns only the DB-enabled subset among DB-backed methods (toggle enforcement)", async () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx")
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    delete process.env.ENABLE_PAYPAL
    delete process.env.ENABLE_PAYSTACK
    delete process.env.ENABLE_FLUTTERWAVE
    delete process.env.ENABLE_INTERSWITCH
    delete process.env.ENABLE_GTPAY
    delete process.env.ENABLE_REMITA

    // Both configured in env, but the DB flag disables stripe.
    vi.mocked(getStoreSettingsMap).mockResolvedValue({ stripe: false, bank_transfer: true })

    const methods = await enabledPaymentMethods()
    expect(methods).not.toContain("stripe")
    expect(methods).toContain("bank_transfer")
  })
})
