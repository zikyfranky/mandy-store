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
import { getGatewayConfig } from "./gateway-credentials"

export type PaymentMethod =
  | "stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

// D-11 scope: only these three get a live DB toggle in this phase.
const DB_BACKED_METHODS: ReadonlySet<PaymentMethod> = new Set(["stripe", "paypal", "bank_transfer"])

/**
 * Returns true if the payment method's credentials (DB-first, env-fallback via the
 * resolver — Phase 8 / D-03 / ADMN-07) and, for stripe/paypal/bank_transfer,
 * credentials) are present. isPaymentMethodEnabled layers the DB toggle on top.
 * PayPal always returns false until explicitly enabled with credentials (D-05a).
 * Paystack/Flutterwave: enabled only when ENABLE_<GATEWAY>=true AND secret key present (D-06, PAY-12).
 * The ENABLE_<GATEWAY> feature flag stays a direct process.env read in every case —
 * D-03/D-03a scope is credential VALUES only, not the independent on/off flags.
 */
async function hasEnvAndCredentials(method: PaymentMethod): Promise<boolean> {
  switch (method) {
    case "stripe": {
      const cfg = await getGatewayConfig("stripe")
      return process.env.ENABLE_STRIPE === "true" && !!cfg.secret_key
    }
    case "paypal": {
      const cfg = await getGatewayConfig("paypal")
      return process.env.ENABLE_PAYPAL === "true" && !!cfg.client_id && !!cfg.client_secret
    }
    case "bank_transfer": {
      const cfg = await getGatewayConfig("bank_transfer")
      return process.env.ENABLE_BANK_TRANSFER === "true"
        && !!cfg.bank_name && !!cfg.account_number && !!cfg.account_name
    }
    case "paystack": {
      const cfg = await getGatewayConfig("paystack")
      return process.env.ENABLE_PAYSTACK === "true" && !!cfg.secret_key
    }
    case "flutterwave": {
      const cfg = await getGatewayConfig("flutterwave")
      return process.env.ENABLE_FLUTTERWAVE === "true" && !!cfg.secret_key
    }
    case "interswitch": {
      const cfg = await getGatewayConfig("interswitch")
      return process.env.ENABLE_INTERSWITCH === "true" && !!cfg.mac_key && !!cfg.merchant_code
    }
    case "gtpay": {
      const cfg = await getGatewayConfig("gtpay")
      return process.env.ENABLE_GTPAY === "true" && !!cfg.hash_key && !!cfg.merchant_id
    }
    case "remita": {
      const cfg = await getGatewayConfig("remita")
      return process.env.ENABLE_REMITA === "true" && !!cfg.api_key && !!cfg.merchant_id
    }
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
  if (!(await hasEnvAndCredentials(method))) return false  // short-circuit — no DB read for unconfigured methods
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
