// tests/payments/config.test.ts
// Unit tests for PAY-04: server-only payment method toggle enforcement.
// Pure unit — no DB, no Resend, no env required at module load time.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"

// Mock server-only so it doesn't throw in the test environment
vi.mock("server-only", () => ({}))

// Import after mocking
import { isPaymentMethodEnabled, enabledPaymentMethods } from "@/lib/payments/config"

// Helper: set env vars for a test, restore in afterEach
const ORIGINAL_ENV = process.env

afterEach(() => {
  // Restore the original env after each test
  vi.unstubAllEnvs()
})

describe("isPaymentMethodEnabled — stripe", () => {
  it("returns true when ENABLE_STRIPE=true and STRIPE_SECRET_KEY is set", () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    expect(isPaymentMethodEnabled("stripe")).toBe(true)
  })

  it("returns false when ENABLE_STRIPE=false (key present)", () => {
    vi.stubEnv("ENABLE_STRIPE", "false")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123")
    expect(isPaymentMethodEnabled("stripe")).toBe(false)
  })

  it("returns false when ENABLE_STRIPE=true but STRIPE_SECRET_KEY is missing", () => {
    vi.stubEnv("ENABLE_STRIPE", "true")
    vi.unstubAllEnvs()
    vi.stubEnv("ENABLE_STRIPE", "true")
    // STRIPE_SECRET_KEY is unset
    delete process.env.STRIPE_SECRET_KEY
    expect(isPaymentMethodEnabled("stripe")).toBe(false)
  })

  it("returns false when neither env var is set", () => {
    delete process.env.ENABLE_STRIPE
    delete process.env.STRIPE_SECRET_KEY
    expect(isPaymentMethodEnabled("stripe")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — paypal (defaults OFF per D-05a)", () => {
  it("returns false by default (no env vars set)", () => {
    delete process.env.ENABLE_PAYPAL
    delete process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_SECRET
    expect(isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns false when ENABLE_PAYPAL=true but credentials missing", () => {
    vi.stubEnv("ENABLE_PAYPAL", "true")
    delete process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_SECRET
    expect(isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns false when ENABLE_PAYPAL=false even with credentials set", () => {
    vi.stubEnv("ENABLE_PAYPAL", "false")
    vi.stubEnv("PAYPAL_CLIENT_ID", "client_id")
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret")
    expect(isPaymentMethodEnabled("paypal")).toBe(false)
  })

  it("returns true only when ENABLE_PAYPAL=true AND both credentials are present", () => {
    vi.stubEnv("ENABLE_PAYPAL", "true")
    vi.stubEnv("PAYPAL_CLIENT_ID", "client_id")
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret")
    expect(isPaymentMethodEnabled("paypal")).toBe(true)
  })
})

describe("isPaymentMethodEnabled — bank_transfer", () => {
  it("returns false when no bank env vars are set", () => {
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.BANK_NAME
    delete process.env.BANK_ACCOUNT_NUMBER
    delete process.env.BANK_ACCOUNT_NAME
    expect(isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })

  it("returns false when ENABLE_BANK_TRANSFER=true but any bank var is missing", () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    // BANK_ACCOUNT_NAME is missing
    delete process.env.BANK_ACCOUNT_NAME
    expect(isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })

  it("returns true when ENABLE_BANK_TRANSFER=true and all three bank vars are set", () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "true")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    expect(isPaymentMethodEnabled("bank_transfer")).toBe(true)
  })

  it("returns false when ENABLE_BANK_TRANSFER=false even with all bank vars set", () => {
    vi.stubEnv("ENABLE_BANK_TRANSFER", "false")
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "Mandy Store Ltd")
    expect(isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — paystack", () => {
  it("returns true when ENABLE_PAYSTACK=true and PAYSTACK_SECRET_KEY is set", () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_abc123")
    expect(isPaymentMethodEnabled("paystack")).toBe(true)
  })

  it("returns false when ENABLE_PAYSTACK=false (key present)", () => {
    vi.stubEnv("ENABLE_PAYSTACK", "false")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_abc123")
    expect(isPaymentMethodEnabled("paystack")).toBe(false)
  })

  it("returns false when ENABLE_PAYSTACK=true but PAYSTACK_SECRET_KEY is missing", () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    delete process.env.PAYSTACK_SECRET_KEY
    expect(isPaymentMethodEnabled("paystack")).toBe(false)
  })

  it("returns false when neither env var is set", () => {
    delete process.env.ENABLE_PAYSTACK
    delete process.env.PAYSTACK_SECRET_KEY
    expect(isPaymentMethodEnabled("paystack")).toBe(false)
  })
})

describe("isPaymentMethodEnabled — flutterwave", () => {
  it("returns true when ENABLE_FLUTTERWAVE=true and FLUTTERWAVE_SECRET_KEY is set", () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-abc123")
    expect(isPaymentMethodEnabled("flutterwave")).toBe(true)
  })

  it("returns false when ENABLE_FLUTTERWAVE=false (key present)", () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "false")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-abc123")
    expect(isPaymentMethodEnabled("flutterwave")).toBe(false)
  })

  it("returns false when ENABLE_FLUTTERWAVE=true but FLUTTERWAVE_SECRET_KEY is missing", () => {
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    delete process.env.FLUTTERWAVE_SECRET_KEY
    expect(isPaymentMethodEnabled("flutterwave")).toBe(false)
  })

  it("returns false when neither env var is set", () => {
    delete process.env.ENABLE_FLUTTERWAVE
    delete process.env.FLUTTERWAVE_SECRET_KEY
    expect(isPaymentMethodEnabled("flutterwave")).toBe(false)
  })
})

describe("enabledPaymentMethods", () => {
  it("returns only enabled methods", () => {
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

    const methods = enabledPaymentMethods()
    expect(methods).toContain("stripe")
    expect(methods).toContain("bank_transfer")
    expect(methods).not.toContain("paypal")
    expect(methods).not.toContain("paystack")
    expect(methods).not.toContain("flutterwave")
  })

  it("returns paystack and flutterwave when both are enabled", () => {
    vi.stubEnv("ENABLE_PAYSTACK", "true")
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_paystack_xxx")
    vi.stubEnv("ENABLE_FLUTTERWAVE", "true")
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-xxx")
    delete process.env.ENABLE_STRIPE
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.ENABLE_PAYPAL

    const methods = enabledPaymentMethods()
    expect(methods).toContain("paystack")
    expect(methods).toContain("flutterwave")
    expect(methods).not.toContain("stripe")
    expect(methods).not.toContain("bank_transfer")
  })

  it("returns empty array when nothing is enabled", () => {
    delete process.env.ENABLE_STRIPE
    delete process.env.ENABLE_BANK_TRANSFER
    delete process.env.ENABLE_PAYPAL
    delete process.env.ENABLE_PAYSTACK
    delete process.env.ENABLE_FLUTTERWAVE
    expect(enabledPaymentMethods()).toEqual([])
  })
})
