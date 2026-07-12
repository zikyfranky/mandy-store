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
import { getGatewayConfig } from "../gateway-credentials"

// Phase 8 (08-05, Pitfall 1): webpay-core.ts's WebPayConfig hooks MUST stay synchronous
// and MUST NOT read process.env or the resolver themselves. So credentials are resolved
// here (in the already-async adapter methods) via getGatewayConfig, then a FRESH
// WebPayConfig object is built per call, closing over the resolved plain-data values —
// never a module-scope config, never an async hook.
function buildInterswitchConfig(cfg: Record<string, string>): WebPayConfig {
  const payUrl = cfg.pay_url ?? "https://sandbox.interswitchng.com/collections/w/pay"
  const requeryUrl =
    cfg.requery_url ?? "https://sandbox.interswitchng.com/collections/api/v1/gettransaction.json"
  const productId = cfg.product_id ?? ""
  const payItemId = cfg.pay_item_id ?? ""
  const macKey = (cfg.mac_key ?? "").trim() // Pitfall 2: trim whitespace, unchanged
  const merchantCode = cfg.merchant_code ?? ""

  return {
    provider: "interswitch",
    payUrl,
    successCode: "00",

    // RESEARCH Pattern 2 — request hash concat order is LOAD-BEARING (Pitfall 2):
    // txn_ref + product_id + pay_item_id + amount + site_redirect_url + macKey
    buildRequestHash(p: WebPayInitParams): string {
      return sha512(p.txnRef + productId + payItemId + p.amountKobo + p.redirectUrl + macKey)
    },

    buildFields(p: WebPayInitParams, requestHash: string): Record<string, string> {
      return {
        merchant_code: merchantCode,
        pay_item_id: payItemId,
        product_id: productId,
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
      const requeryHash = sha512(productId + reference + macKey)
      const url = `${requeryUrl}?merchantcode=${encodeURIComponent(
        merchantCode,
      )}&transactionreference=${encodeURIComponent(reference)}`
      return { url, headers: { Hash: requeryHash } }
    },

    parseRequery(json: unknown): { statusCode: string; amountKobo: number } {
      const j = json as { ResponseCode?: string; Amount?: number | string }
      return { statusCode: String(j.ResponseCode ?? ""), amountKobo: Number(j.Amount ?? 0) }
    },
  }
}

// A4 (pre-existing inconsistency, not introduced here): reads process.env.APP_URL
// directly, NOT NEXT_PUBLIC_APP_URL — leave as-is, out of this plan's scope to fix.
function redirectUrl(cfg: Record<string, string>): string {
  return (
    cfg.redirect_url ??
    `${process.env.APP_URL ?? "http://localhost:3000"}/api/payments/interswitch/callback`
  )
}

export const interswitchAdapter: GatewayAdapter = {
  provider: "interswitch",

  async initPayment(params): Promise<InitResult> {
    const cfg = await getGatewayConfig("interswitch")
    return buildWebPayRedirect(buildInterswitchConfig(cfg), {
      txnRef: params.reference,
      amountKobo: params.amountKobo,
      redirectUrl: redirectUrl(cfg),
      custId: params.email,
    })
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    const cfg = await getGatewayConfig("interswitch")
    return verifyWebPay(buildInterswitchConfig(cfg), reference)
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
