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
import { getGatewayConfig } from "../gateway-credentials"

// Phase 8 (08-05, Pitfall 1): webpay-core.ts's WebPayConfig hooks MUST stay synchronous
// and MUST NOT read process.env or the resolver themselves. So credentials are resolved
// here (in the already-async adapter methods) via getGatewayConfig, then a FRESH
// WebPayConfig object is built per call, closing over the resolved plain-data values —
// never a module-scope config, never an async hook. Mirrors interswitch.ts's
// buildInterswitchConfig — same shape, different field names + concat order.
function buildGtpayConfig(cfg: Record<string, string>): WebPayConfig {
  const payUrl = cfg.pay_url ?? "https://ibank.gtbank.com/GTPay/Tranx.aspx"
  const requeryUrl = cfg.requery_url ?? "https://ibank.gtbank.com/GTPayService/gettransactionstatus.json"
  const mertId = cfg.merchant_id ?? ""
  const hashKey = (cfg.hash_key ?? "").trim() // Pitfall 2: trim
  const notiUrl = cfg.noti_url ?? `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/gtpay`

  return {
    provider: "gtpay",
    payUrl,
    successCode: "00",

    // RESEARCH Pattern 4 — request hash concat order (Pitfall 2):
    // mert_id + tranx_id + amt + curr + cust_id + noti_url + hashkey
    buildRequestHash(p: WebPayInitParams): string {
      return sha512(mertId + p.txnRef + p.amountKobo + NGN_NUMERIC + p.custId + notiUrl + hashKey)
    },

    buildFields(p: WebPayInitParams, requestHash: string): Record<string, string> {
      return {
        gtpay_mert_id: mertId,
        gtpay_tranx_id: p.txnRef,
        gtpay_tranx_amt: String(p.amountKobo), // kobo passthrough (Pitfall 1)
        gtpay_tranx_curr: NGN_NUMERIC,
        gtpay_cust_id: p.custId,
        gtpay_tranx_noti_url: notiUrl,
        gtpay_hash: requestHash, // current field name (NOT deprecated gtpay_tranx_hash)
      }
    },

    // Requery hash: mert_id + tranx_id + hashkey
    buildRequeryRequest(reference: string): { url: string; headers: Record<string, string> } {
      const requeryHash = sha512(mertId + reference + hashKey)
      const url = `${requeryUrl}?mertid=${encodeURIComponent(mertId)}&tranxid=${encodeURIComponent(
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
}

function notiUrl(cfg: Record<string, string>): string {
  return cfg.noti_url ?? `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/gtpay`
}

export const gtpayAdapter: GatewayAdapter = {
  provider: "gtpay",

  async initPayment(params): Promise<InitResult> {
    const cfg = await getGatewayConfig("gtpay")
    return buildWebPayRedirect(buildGtpayConfig(cfg), {
      txnRef: params.reference,
      amountKobo: params.amountKobo,
      redirectUrl: notiUrl(cfg),
      custId: params.email,
    })
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    const cfg = await getGatewayConfig("gtpay")
    return verifyWebPay(buildGtpayConfig(cfg), reference)
  },

  // A5: GTPay refund automation unconfirmed at sandbox — degrade to log + manual until go-live.
  async refund(reference: string, amountKobo?: number): Promise<void> {
    console.error(
      `[gtpay] refund not automated (A5) — manual refund required for ref=${reference}` +
        (amountKobo !== undefined ? ` amountKobo=${amountKobo}` : " (full)"),
    )
  },
}
