import "server-only"
// src/lib/payments/gateways/interswitch.ts
// InterswitchAdapter (PAY-09) — a WebPayConfig over the shared webpay-core (D-12).
//
// Amount unit: KOBO passthrough (Pitfall 1). Hashing: plain SHA-512 (NOT HMAC).
// Request hash and requery hash use DIFFERENT concat orders (Pitfall 2).
// Secrets (MAC key, merchant code) are server-only; only the redirect URL + non-secret
// POST fields reach the client (T-71-05).

import type { GatewayAdapter, InitResult, VerifyResult } from "./types"
import {
  buildWebPayRedirect,
  verifyWebPay,
  sha512,
  NGN_NUMERIC,
  type WebPayConfig,
  type WebPayInitParams,
} from "./webpay-core"

// env read at call time (never module scope) so tests can stub per-case.
const PAY_URL = () =>
  process.env.INTERSWITCH_PAY_URL ?? "https://sandbox.interswitchng.com/collections/w/pay"
const REQUERY_URL = () =>
  process.env.INTERSWITCH_REQUERY_URL ??
  "https://sandbox.interswitchng.com/collections/api/v1/gettransaction.json"
const REDIRECT_URL = () =>
  process.env.INTERSWITCH_REDIRECT_URL ??
  `${process.env.APP_URL ?? "http://localhost:3000"}/api/payments/interswitch/callback`

const interswitchConfig: WebPayConfig = {
  provider: "interswitch",
  get payUrl() {
    return PAY_URL()
  },
  successCode: "00",

  // RESEARCH Pattern 2 — request hash concat order is LOAD-BEARING (Pitfall 2):
  // txn_ref + product_id + pay_item_id + amount + site_redirect_url + macKey
  buildRequestHash(p: WebPayInitParams): string {
    const productId = process.env.INTERSWITCH_PRODUCT_ID ?? ""
    const payItemId = process.env.INTERSWITCH_PAY_ITEM_ID ?? ""
    const macKey = (process.env.INTERSWITCH_MAC_KEY ?? "").trim() // Pitfall 2: trim whitespace
    return sha512(p.txnRef + productId + payItemId + p.amountKobo + p.redirectUrl + macKey)
  },

  buildFields(p: WebPayInitParams, requestHash: string): Record<string, string> {
    return {
      merchant_code: process.env.INTERSWITCH_MERCHANT_CODE ?? "",
      pay_item_id: process.env.INTERSWITCH_PAY_ITEM_ID ?? "",
      product_id: process.env.INTERSWITCH_PRODUCT_ID ?? "",
      amount: String(p.amountKobo), // kobo passthrough (Pitfall 1)
      currency: NGN_NUMERIC,
      site_redirect_url: p.redirectUrl,
      txn_ref: p.txnRef,
      cust_id: p.custId,
      hash: requestHash,
    }
  },

  // RESEARCH Pattern 3 — requery hash uses a DIFFERENT order: product_id + txn_ref + macKey
  buildRequeryRequest(reference: string): { url: string; headers: Record<string, string> } {
    const productId = process.env.INTERSWITCH_PRODUCT_ID ?? ""
    const macKey = (process.env.INTERSWITCH_MAC_KEY ?? "").trim()
    const requeryHash = sha512(productId + reference + macKey)
    const url = `${REQUERY_URL()}?merchantcode=${encodeURIComponent(
      process.env.INTERSWITCH_MERCHANT_CODE ?? "",
    )}&transactionreference=${encodeURIComponent(reference)}`
    return { url, headers: { Hash: requeryHash } }
  },

  parseRequery(json: unknown): { statusCode: string; amountKobo: number } {
    const j = json as { ResponseCode?: string; Amount?: number | string }
    return { statusCode: String(j.ResponseCode ?? ""), amountKobo: Number(j.Amount ?? 0) }
  },
}

export const interswitchAdapter: GatewayAdapter = {
  provider: "interswitch",

  async initPayment(params): Promise<InitResult> {
    return buildWebPayRedirect(interswitchConfig, {
      txnRef: params.reference,
      amountKobo: params.amountKobo,
      redirectUrl: REDIRECT_URL(),
      custId: params.email,
    })
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    return verifyWebPay(interswitchConfig, reference)
  },

  // A5 (RESEARCH): Interswitch refund API availability is uncertain at the sandbox bar.
  // Degrade to log + manual (acceptable per A5, mirrors the oversold-tolerance path) until
  // a live refund endpoint is confirmed during go-live.
  async refund(reference: string, amountKobo?: number): Promise<void> {
    console.error(
      `[interswitch] refund not automated (A5) — manual refund required for ref=${reference}` +
        (amountKobo !== undefined ? ` amountKobo=${amountKobo}` : " (full)"),
    )
  },
}
