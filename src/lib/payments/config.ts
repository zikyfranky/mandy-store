import "server-only"
// src/lib/payments/config.ts
// PAY-04 / ADMN-04: server-only payment-method enablement. Enforced in actions/route
// handlers, never just the UI.
//
// Enablement model (owner decision 2026-07-13): a gateway is LIVE when
//   (1) its credentials are configured — DB-first via the admin Settings UI, env-fallback
//       through the Phase 8 resolver (getGatewayConfig, D-03/ADMN-07), AND
//   (2) its store_settings.enabled toggle is ON (default ON once credentials exist).
// The legacy per-gateway ENABLE_<GATEWAY> env flags are REMOVED — the admin toggle is now
// the single on/off switch for every method (all 8 are DB-backed, no special-casing).

import { getStoreSettingsMap } from "./store-settings"
import { getGatewayConfig } from "./gateway-credentials"

export type PaymentMethod =
  | "stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

/** All payment methods, in display order. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "stripe", "paypal", "bank_transfer", "paystack", "flutterwave",
  "interswitch", "gtpay", "remita",
]

/**
 * Returns true when the method's credentials are present (DB-first, env-fallback via the
 * Phase 8 resolver — D-03/ADMN-07). This is the "is it configured?" gate; the live on/off
 * toggle is layered on top in isPaymentMethodEnabled. No ENABLE_<GATEWAY> env flag anymore.
 */
async function hasCredentials(method: PaymentMethod): Promise<boolean> {
  const cfg = await getGatewayConfig(method)
  switch (method) {
    case "stripe":       return !!cfg.secret_key
    case "paypal":       return !!cfg.client_id && !!cfg.client_secret
    case "bank_transfer":return !!cfg.bank_name && !!cfg.account_number && !!cfg.account_name
    case "paystack":     return !!cfg.secret_key
    case "flutterwave":  return !!cfg.secret_key
    case "interswitch":  return !!cfg.mac_key && !!cfg.merchant_code
    case "gtpay":        return !!cfg.hash_key && !!cfg.merchant_id
    case "remita":       return !!cfg.api_key && !!cfg.merchant_id
  }
}

/**
 * A method is enabled only when it is BOTH credential-configured AND its store_settings
 * toggle is ON. Short-circuits to false with NO DB toggle read when credentials are absent
 * (keeps unconfigured methods free of a store_settings round trip — 05-RESEARCH.md Pitfall 2).
 * Toggle default when no row exists yet: ON (configuring credentials makes a method available;
 * the admin turns it off from the Settings UI). PayPal ships with no NGN support, so it stays
 * disabled in practice until credentials are entered (D-05a).
 */
export async function isPaymentMethodEnabled(method: PaymentMethod): Promise<boolean> {
  if (!(await hasCredentials(method))) return false  // short-circuit — no toggle read for unconfigured methods
  const settings = await getStoreSettingsMap()
  return settings[method] ?? true                    // configured + no explicit OFF => enabled
}

/** List of enabled methods for the UI (server-computed; passed as a prop). */
export async function enabledPaymentMethods(): Promise<PaymentMethod[]> {
  const methods: PaymentMethod[] = ["stripe", "paypal", "bank_transfer", "paystack", "flutterwave", "interswitch", "gtpay", "remita"]
  const results = await Promise.all(methods.map(async (m) => [m, await isPaymentMethodEnabled(m)] as const))
  return results.filter(([, enabled]) => enabled).map(([m]) => m)
}
