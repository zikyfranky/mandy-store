import "server-only"
// src/lib/payments/config.ts
// PAY-04 / D-13: server-only payment-method toggles. Enforced in actions/route handlers,
// never just the UI. PayPal deferred (D-05a) — defaults OFF because ENABLE_PAYPAL and
// credentials are not set. No NEXT_PUBLIC_ prefix — server-only env pattern (CLAUDE.md).

export type PaymentMethod = "stripe" | "paypal" | "bank_transfer"

/**
 * Returns true if the payment method is enabled via server-only env config.
 * PayPal always returns false until explicitly enabled with credentials (D-05a).
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
  }
}

/** List of enabled methods for the UI (server-computed; passed as a prop). */
export function enabledPaymentMethods(): PaymentMethod[] {
  return (["stripe", "paypal", "bank_transfer"] as const).filter(isPaymentMethodEnabled)
}
