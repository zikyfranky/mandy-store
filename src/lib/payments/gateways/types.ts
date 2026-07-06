// src/lib/payments/gateways/types.ts
// D-02: Gateway adapter interface — the shared contract Paystack + Flutterwave implement.
// Adding a new NGN gateway (Phase 7.1) means: implement this interface + add a toggle case.

/**
 * Identifies the gateway provider.
 * "stripe" and "paypal" are handled separately (not via this adapter interface).
 */
export type GatewayProvider =
  | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

/**
 * Normalized payment status — gateway-agnostic.
 * Each adapter maps its gateway string ("success" / "successful" / etc.) to this type.
 * Pitfall 7: Paystack uses "success", Flutterwave uses "successful" — the adapter normalizes.
 */
export type NormalizedStatus = "confirmed" | "failed" | "pending"

/**
 * Authoritative result returned by verifyTransaction().
 * amountKobo is ALWAYS in kobo (minor units), regardless of gateway.
 * Pitfall 1: Flutterwave returns naira — the FlutterwaveAdapter multiplies × 100 before returning.
 */
export interface VerifyResult {
  status: NormalizedStatus
  amountKobo: number   // normalized to kobo (Flutterwave adapter: amountNaira × 100)
  currency: string     // "NGN"
  reference: string    // merchant reference (order ref for Paystack; tx_ref for Flutterwave)
}

/**
 * D-16: adapters declare how the client proceeds after initPayment.
 * - "popup":    Paystack/Flutterwave — client opens inline popup with the returned data.
 * - "redirect": Remita — plain GET redirect (window.location.assign(url)).
 * - "redirect" + method:"POST" + fields: Interswitch/GTPay — client builds a hidden
 *   auto-submit <form method="POST" action={url}> with one hidden input per field (WebPay POST).
 */
export type InitResult =
  | { mode: "popup"; [k: string]: unknown }
  | { mode: "redirect"; url: string }
  | { mode: "redirect"; url: string; method: "POST"; fields: Record<string, string> }

/**
 * Gateway adapter interface (D-02).
 * Each gateway implements this interface; callers use GatewayAdapter without knowing the provider.
 *
 * File layout:
 *   src/lib/payments/gateways/paystack.ts  — PaystackAdapter
 *   src/lib/payments/gateways/flutterwave.ts — FlutterwaveAdapter
 */
export interface GatewayAdapter {
  readonly provider: GatewayProvider

  /**
   * Server-side payment session creation.
   * Returns the data the client popup needs (e.g. accessCode for Paystack, tx_ref for Flutterwave).
   * Never exposes secrets — only public/session tokens are returned to the client.
   */
  initPayment(params: {
    email: string
    amountKobo: number
    reference: string
    orderId: string
    customerName: string
    phone?: string
  }): Promise<InitResult>

  /**
   * Authoritative server-side verification (re-fetch from gateway).
   * Called by: verify-on-callback Server Action AND can be called from webhook handlers.
   * amountKobo is normalized to kobo regardless of gateway (Pitfall 1 mitigation).
   */
  verifyTransaction(reference: string): Promise<VerifyResult>

  /**
   * Issue a refund for the given reference.
   * Backs the D-09 oversold last-unit-race recovery path.
   * amountKobo is optional — omit for full refund.
   */
  refund(reference: string, amountKobo?: number): Promise<void>
}
