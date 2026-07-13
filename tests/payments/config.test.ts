// tests/payments/config.test.ts
// Unit tests for PAY-04 / ADMN-04 payment-method enablement.
//
// Enablement model (owner decision 2026-07-13): a method is enabled when
//   (1) its credentials are present (DB-first, env-fallback via getGatewayConfig), AND
//   (2) its store_settings toggle is ON (default ON when no row exists yet).
// The legacy per-gateway ENABLE_<GATEWAY> env flags are GONE — this suite proves a method
// is enabled purely from credentials + toggle, with no ENABLE_ flag anywhere.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"

// Mock server-only so it doesn't throw in the test environment
vi.mock("server-only", () => ({}))

// Mock the batched store_settings toggle loader so tests control the toggle independently.
vi.mock("@/lib/payments/store-settings", () => ({
  getStoreSettingsMap: vi.fn(),
}))

// Stub only the DB round trip (getGatewayCredentialsMap) so the REAL getGatewayConfig /
// FIELD_MANIFEST logic runs — with an empty DB map it falls through to process.env,
// exercising the genuine env-fallback credential path.
vi.mock("@/lib/payments/gateway-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/gateway-credentials")>()
  return { ...actual, getGatewayCredentialsMap: vi.fn().mockResolvedValue({}) }
})

import { isPaymentMethodEnabled, enabledPaymentMethods } from "@/lib/payments/config"
import { getStoreSettingsMap } from "@/lib/payments/store-settings"

// Credential env vars per method (must match FIELD_MANIFEST envVar names).
const CRED_VARS: Record<string, string[]> = {
  stripe: ["STRIPE_SECRET_KEY"],
  paypal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
  bank_transfer: ["BANK_NAME", "BANK_ACCOUNT_NUMBER", "BANK_ACCOUNT_NAME"],
  paystack: ["PAYSTACK_SECRET_KEY"],
  flutterwave: ["FLUTTERWAVE_SECRET_KEY"],
  interswitch: ["INTERSWITCH_MAC_KEY", "INTERSWITCH_MERCHANT_CODE"],
  gtpay: ["GTPAY_HASH_KEY", "GTPAY_MERCHANT_ID"],
  remita: ["REMITA_API_KEY", "REMITA_MERCHANT_ID"],
}

function setCreds(method: string) {
  for (const v of CRED_VARS[method]) vi.stubEnv(v, `test-${v}`)
}
// getGatewayConfig treats "" as absent (process.env[x] || undefined) — blanking clears a cred
// even when the real .env.local (loaded by vitest) provides a value.
function clearCreds(method: string) {
  for (const v of CRED_VARS[method]) vi.stubEnv(v, "")
}

const ALL = ["stripe", "paypal", "bank_transfer", "paystack", "flutterwave", "interswitch", "gtpay", "remita"] as const

beforeEach(() => {
  // Default: no store_settings rows => every configured method defaults to enabled (?? true).
  vi.mocked(getStoreSettingsMap).mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(getStoreSettingsMap).mockReset()
})

describe("isPaymentMethodEnabled — credentials + toggle model (no ENABLE_ flags)", () => {
  for (const method of ALL) {
    it(`${method}: credentials present + no toggle row => enabled (no ENABLE_ flag needed)`, async () => {
      setCreds(method)
      expect(await isPaymentMethodEnabled(method)).toBe(true)
    })

    it(`${method}: credentials present + toggle OFF => disabled`, async () => {
      setCreds(method)
      vi.mocked(getStoreSettingsMap).mockResolvedValue({ [method]: false })
      expect(await isPaymentMethodEnabled(method)).toBe(false)
    })

    it(`${method}: no credentials => disabled (short-circuits before the toggle read)`, async () => {
      clearCreds(method)
      expect(await isPaymentMethodEnabled(method)).toBe(false)
      expect(getStoreSettingsMap).not.toHaveBeenCalled()
    })
  }
})

describe("isPaymentMethodEnabled — partial credentials", () => {
  it("bank_transfer: missing account name => disabled even with the other two set", async () => {
    vi.stubEnv("BANK_NAME", "Test Bank")
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "0123456789")
    vi.stubEnv("BANK_ACCOUNT_NAME", "") // blank => absent
    expect(await isPaymentMethodEnabled("bank_transfer")).toBe(false)
  })

  it("interswitch: missing mac_key => disabled even with merchant code set", async () => {
    vi.stubEnv("INTERSWITCH_MERCHANT_CODE", "MX1")
    vi.stubEnv("INTERSWITCH_MAC_KEY", "")
    expect(await isPaymentMethodEnabled("interswitch")).toBe(false)
  })

  it("paypal: only client_id set => disabled (both required)", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "cid")
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "")
    expect(await isPaymentMethodEnabled("paypal")).toBe(false)
  })
})

describe("enabledPaymentMethods", () => {
  it("returns exactly the credential-configured, toggled-on methods", async () => {
    setCreds("stripe")
    setCreds("bank_transfer")
    setCreds("paystack")
    // stripe/bank default-on (no row); paystack explicitly toggled OFF
    vi.mocked(getStoreSettingsMap).mockResolvedValue({ paystack: false })

    const methods = await enabledPaymentMethods()
    expect(methods).toContain("stripe")
    expect(methods).toContain("bank_transfer")
    expect(methods).not.toContain("paystack") // configured but toggled off
    expect(methods).not.toContain("paypal")   // no credentials
    expect(methods).not.toContain("flutterwave")
  })

  it("surfaces paystack + flutterwave once their keys are configured (no env flag)", async () => {
    setCreds("paystack")
    setCreds("flutterwave")
    clearCreds("stripe") // .env.local provides a real Stripe key — blank it for this assertion
    const methods = await enabledPaymentMethods()
    expect(methods).toContain("paystack")
    expect(methods).toContain("flutterwave")
    expect(methods).not.toContain("stripe") // creds cleared
  })
})
