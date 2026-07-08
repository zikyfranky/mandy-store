import "server-only"
// src/lib/payments/config.ts
// PAY-04 / D-13: server-only payment-method toggles. Enforced in actions/route handlers,
// never just the UI. PayPal deferred (D-05a) — defaults OFF because ENABLE_PAYPAL and
// credentials are not set. No NEXT_PUBLIC_ prefix — server-only env pattern (CLAUDE.md).
//
// D-11 / ADMN-04: stripe/paypal/bank_transfer are now ALSO gated by a live DB flag
// (store_settings) on top of the env/credential check — see isPaymentMethodEnabled below.
// The other 5 (NG gateway) methods remain env-only, unchanged from Phase 4/7/7.1.

import { getStoreSettingsMap } from "./store-settings"

export type PaymentMethod =
  | "stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

// D-11 scope: only these three get a live DB toggle in this phase.
const DB_BACKED_METHODS: ReadonlySet<PaymentMethod> = new Set(["stripe", "paypal", "bank_transfer"])

/**
 * Returns true if the payment method's server-only env config (and, for stripe/
 * paypal/bank_transfer, credentials) are present. This is the pre-existing env-only
 * check, unchanged in logic — isPaymentMethodEnabled layers the DB toggle on top.
 * PayPal always returns false until explicitly enabled with credentials (D-05a).
 * Paystack/Flutterwave: enabled only when ENABLE_<GATEWAY>=true AND secret key present (D-06, PAY-12).
 */
function hasEnvAndCredentials(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    case "paypal":
      return process.env.ENABLE_PAYPAL === "true"
        && !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET
    case "bank_transfer":
      return process.env.ENABLE_BANK_TRANSFER === "true"
        && !!process.env.BANK_NAME && !!process.env.BANK_ACCOUNT_NUMBER && !!process.env.BANK_ACCOUNT_NAME
    case "paystack":
      return process.env.ENABLE_PAYSTACK === "true" && !!process.env.PAYSTACK_SECRET_KEY
    case "flutterwave":
      return process.env.ENABLE_FLUTTERWAVE === "true" && !!process.env.FLUTTERWAVE_SECRET_KEY
    case "interswitch":
      return process.env.ENABLE_INTERSWITCH === "true"
        && !!process.env.INTERSWITCH_MAC_KEY && !!process.env.INTERSWITCH_MERCHANT_CODE
    case "gtpay":
      return process.env.ENABLE_GTPAY === "true"
        && !!process.env.GTPAY_HASH_KEY && !!process.env.GTPAY_MERCHANT_ID
    case "remita":
      return process.env.ENABLE_REMITA === "true"
        && !!process.env.REMITA_API_KEY && !!process.env.REMITA_MERCHANT_ID
  }
}

/**
 * Returns true only when a payment method is BOTH env/credential-configured AND
 * (for stripe/paypal/bank_transfer) the store_settings.enabled DB flag is true.
 * Short-circuits to false with NO DB read when env credentials are absent — this
 * keeps the 5 NG-gateway methods (and any unconfigured DB-backed method) free of
 * DB round trips (05-RESEARCH.md Pitfall 2).
 */
export async function isPaymentMethodEnabled(method: PaymentMethod): Promise<boolean> {
  if (!hasEnvAndCredentials(method)) return false          // short-circuit — no DB read for unconfigured methods
  if (!DB_BACKED_METHODS.has(method)) return true           // Phase 7/7.1 gateways: unchanged env-only behavior
  const settings = await getStoreSettingsMap()
  return settings[method] ?? true                           // no row yet => env-only fallback
}

/** List of enabled methods for the UI (server-computed; passed as a prop). */
export async function enabledPaymentMethods(): Promise<PaymentMethod[]> {
  const methods: PaymentMethod[] = ["stripe", "paypal", "bank_transfer", "paystack", "flutterwave", "interswitch", "gtpay", "remita"]
  const results = await Promise.all(methods.map(async (m) => [m, await isPaymentMethodEnabled(m)] as const))
  return results.filter(([, enabled]) => enabled).map(([m]) => m)
}
