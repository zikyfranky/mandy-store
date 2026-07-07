import "server-only"
// src/lib/payments/gateways/gtpay.ts
// GtpayAdapter (PAY-10) — a SECOND WebPayConfig over the SAME shared webpay-core (D-12).
// GTPay is GTBank on Interswitch WebPay infrastructure: same mechanics, different host +
// field names + hash concat order. No shared code is copy-pasted — only this config differs.
//
// Amount unit: KOBO passthrough (Pitfall 1). Plain SHA-512 (NOT HMAC).
// Uses the current field name gtpay_hash (NOT the deprecated gtpay_tranx_hash).

import type { GatewayAdapter, InitResult, VerifyResult } from "./types"
import {
  buildWebPayRedirect,
  verifyWebPay,
  sha512,
  NGN_NUMERIC,
  type WebPayConfig,
  type WebPayInitParams,
} from "./webpay-core"

const PAY_URL = () =>
  process.env.GTPAY_PAY_URL ?? "https://ibank.gtbank.com/GTPay/Tranx.aspx"
const REQUERY_URL = () =>
  process.env.GTPAY_REQUERY_URL ??
  "https://ibank.gtbank.com/GTPayService/gettransactionstatus.json"
const NOTI_URL = () =>
  process.env.GTPAY_NOTI_URL ??
  `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/gtpay`

const gtpayConfig: WebPayConfig = {
  provider: "gtpay",
  get payUrl() {
    return PAY_URL()
  },
  successCode: "00",

  // RESEARCH Pattern 4 — request hash concat order (Pitfall 2):
  // mert_id + tranx_id + amt + curr + cust_id + noti_url + hashkey
  buildRequestHash(p: WebPayInitParams): string {
    const mertId = process.env.GTPAY_MERCHANT_ID ?? ""
    const hashKey = (process.env.GTPAY_HASH_KEY ?? "").trim() // Pitfall 2: trim
    return sha512(mertId + p.txnRef + p.amountKobo + NGN_NUMERIC + p.custId + NOTI_URL() + hashKey)
  },

  buildFields(p: WebPayInitParams, requestHash: string): Record<string, string> {
    return {
      gtpay_mert_id: process.env.GTPAY_MERCHANT_ID ?? "",
      gtpay_tranx_id: p.txnRef,
      gtpay_tranx_amt: String(p.amountKobo), // kobo passthrough (Pitfall 1)
      gtpay_tranx_curr: NGN_NUMERIC,
      gtpay_cust_id: p.custId,
      gtpay_tranx_noti_url: NOTI_URL(),
      gtpay_hash: requestHash, // current field name (NOT deprecated gtpay_tranx_hash)
    }
  },

  // Requery hash: mert_id + tranx_id + hashkey
  buildRequeryRequest(reference: string): { url: string; headers: Record<string, string> } {
    const mertId = process.env.GTPAY_MERCHANT_ID ?? ""
    const hashKey = (process.env.GTPAY_HASH_KEY ?? "").trim()
    const requeryHash = sha512(mertId + reference + hashKey)
    const url = `${REQUERY_URL()}?mertid=${encodeURIComponent(mertId)}&tranxid=${encodeURIComponent(
      reference,
    )}`
    return { url, headers: { Hash: requeryHash } }
  },

  parseRequery(json: unknown): { statusCode: string; amountKobo: number } {
    const j = json as { gtpay_tranx_status_code?: string; gtpay_tranx_amt?: number | string }
    return {
      statusCode: String(j.gtpay_tranx_status_code ?? ""),
      amountKobo: Number(j.gtpay_tranx_amt ?? 0),
    }
  },
}

export const gtpayAdapter: GatewayAdapter = {
  provider: "gtpay",

  async initPayment(params): Promise<InitResult> {
    return buildWebPayRedirect(gtpayConfig, {
      txnRef: params.reference,
      amountKobo: params.amountKobo,
      redirectUrl: NOTI_URL(),
      custId: params.email,
    })
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    return verifyWebPay(gtpayConfig, reference)
  },

  // A5: GTPay refund automation unconfirmed at sandbox — degrade to log + manual until go-live.
  async refund(reference: string, amountKobo?: number): Promise<void> {
    console.error(
      `[gtpay] refund not automated (A5) — manual refund required for ref=${reference}` +
        (amountKobo !== undefined ? ` amountKobo=${amountKobo}` : " (full)"),
    )
  },
}
