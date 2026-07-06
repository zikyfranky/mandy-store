import "server-only"
// src/lib/payments/config.ts
// PAY-04 / D-13: server-only payment-method toggles. Enforced in actions/route handlers,
// never just the UI. PayPal deferred (D-05a) — defaults OFF because ENABLE_PAYPAL and
// credentials are not set. No NEXT_PUBLIC_ prefix — server-only env pattern (CLAUDE.md).

export type PaymentMethod =
  | "stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

/**
 * Returns true if the payment method is enabled via server-only env config.
 * PayPal always returns false until explicitly enabled with credentials (D-05a).
 * Paystack/Flutterwave: enabled only when ENABLE_<GATEWAY>=true AND secret key present (D-06, PAY-12).
 */
export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
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

/** List of enabled methods for the UI (server-computed; passed as a prop). */
export function enabledPaymentMethods(): PaymentMethod[] {
  return (["stripe", "paypal", "bank_transfer", "paystack", "flutterwave", "interswitch", "gtpay", "remita"] as const).filter(isPaymentMethodEnabled)
}
