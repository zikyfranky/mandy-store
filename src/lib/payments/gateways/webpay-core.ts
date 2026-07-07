import "server-only"
// src/lib/payments/gateways/webpay-core.ts
// D-12: shared Interswitch WebPay core. Interswitch and GTPay are TWO CONFIGS over this
// ONE module — there is deliberately NO `if (provider === "gtpay")` branch here. All
// gateway-specific divergence (endpoints, field names, hash concat orders, response parsing)
// lives in the WebPayConfig object each adapter passes in.
//
// Hashing is PLAIN SHA-512 via Node crypto (NOT HMAC) — WebPay-family gateways sign by
// hashing a documented field concatenation + the merchant MAC/hash key.
// Amount unit: Interswitch/GTPay use KOBO (passthrough, like Paystack — Pitfall 1).

import crypto from "crypto"
import type { VerifyResult, NormalizedStatus, InitResult } from "./types"

/** NGN numeric ISO-4217 currency code used by WebPay (RESEARCH Pattern 2/4). */
export const NGN_NUMERIC = "566"

/** Inputs the adapter hands the core to build a redirect. */
export interface WebPayInitParams {
  txnRef: string
  amountKobo: number
  redirectUrl: string
  custId: string
}

/**
 * Everything that differs between Interswitch and GTPay. The core reads NOTHING
 * from process.env and branches on NOTHING — it only orchestrates these hooks.
 */
export interface WebPayConfig {
  provider: "interswitch" | "gtpay"
  /** POST target — the hosted WebPay page the client auto-submits to. */
  payUrl: string
  /** SHA-512 request hash in the gateway's documented concat order (Pitfall 2). */
  buildRequestHash(p: WebPayInitParams): string
  /** POST body field set with the gateway's field names + the request hash. */
  buildFields(p: WebPayInitParams, requestHash: string): Record<string, string>
  /** Server-side requery request (URL + headers) keyed on the merchant reference. */
  buildRequeryRequest(reference: string): { url: string; headers: Record<string, string> }
  /** Map the native requery JSON to a status code + kobo amount. */
  parseRequery(json: unknown): { statusCode: string; amountKobo: number }
  /** Gateway "success" status code ("00" for both, kept in config for clarity). */
  successCode: string
}

/**
 * Build the D-16 POST-redirect union for a WebPay gateway.
 * Client turns this into a hidden auto-submit <form method="POST" action={url}>.
 */
export function buildWebPayRedirect(cfg: WebPayConfig, params: WebPayInitParams): InitResult {
  const requestHash = cfg.buildRequestHash(params)
  const fields = cfg.buildFields(params, requestHash)
  return { mode: "redirect", url: cfg.payUrl, method: "POST", fields }
}

/**
 * Authoritative server-side requery (D-15). Never trusts redirect-return params — the caller
 * passes only the merchant reference; the status + amount come from this server-to-server call.
 */
export async function verifyWebPay(cfg: WebPayConfig, reference: string): Promise<VerifyResult> {
  const { url, headers } = cfg.buildRequeryRequest(reference)
  const res = await fetch(url, { headers })

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`${cfg.provider} requery failed (${res.status}): ${errorText}`)
  }

  const json = await res.json()
  const { statusCode, amountKobo } = cfg.parseRequery(json)

  // Pitfall 7: map the gateway's own success code to the unified NormalizedStatus.
  const status: NormalizedStatus = statusCode === cfg.successCode ? "confirmed" : "failed"

  return { status, amountKobo, currency: "NGN", reference }
}

/** Plain SHA-512 hex digest of a pre-concatenated string (shared helper — NOT HMAC). */
export function sha512(concat: string): string {
  return crypto.createHash("sha512").update(concat).digest("hex")
}
