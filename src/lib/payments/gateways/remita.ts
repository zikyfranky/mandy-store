import "server-only"
// src/lib/payments/gateways/remita.ts
// RemitaAdapter (PAY-11) — redirect-native NGN gateway.
//
// D-17: the RRR (Remita Retrieval Reference) is generated INSIDE initPayment before the
// redirect URL is returned — callers never see the RRR pre-step (the value is surfaced on the
// result so the action can persist it as gatewayReference).
// Amount unit: NAIRA (Pitfall 1) — ÷100 on init, ×100 on verify, with the >₦1M sanity guard.
// Pitfall 5: Remita e-channel responses are sometimes JSONP-wrapped — strip before JSON.parse.
// Plain SHA-512 (NOT HMAC); apiHash and statusHash use DIFFERENT concat orders (Pitfall 2).

import type { GatewayAdapter, InitResult, VerifyResult, NormalizedStatus } from "./types"
import crypto from "crypto"

const BASE = () => process.env.REMITA_BASE ?? "https://demo.remita.net"

const sha512 = (concat: string) => crypto.createHash("sha512").update(concat).digest("hex")

/**
 * Strip a JSONP wrapper (`callback({...})`) if present, then JSON.parse.
 * Handles clean JSON defensively too (Pitfall 5 / A2).
 */
function parseJsonp(raw: string): unknown {
  const stripped = raw
    .replace(/^\s*[A-Za-z_$][\w$]*\s*\(/, "")
    .replace(/\)\s*;?\s*$/, "")
  return JSON.parse(stripped)
}

export const remitaAdapter: GatewayAdapter = {
  provider: "remita",

  async initPayment(params): Promise<InitResult> {
    const merchantId = process.env.REMITA_MERCHANT_ID ?? ""
    const apiKey = process.env.REMITA_API_KEY ?? ""
    const serviceTypeId = process.env.REMITA_SERVICE_TYPE_ID ?? ""
    const base = BASE()

    // Pitfall 1: convert kobo → naira and guard against a 100× unit slip.
    const amountNaira = params.amountKobo / 100
    if (amountNaira > 1_000_000) {
      throw new Error("Remita amount > ₦1M — check unit conversion (Pitfall 1)")
    }

    // RESEARCH Pattern 5 — apiHash concat order is LOAD-BEARING (Pitfall 2):
    // merchantId + serviceTypeId + orderId + amount(naira) + apiKey
    const apiHash = sha512(merchantId + serviceTypeId + params.reference + String(amountNaira) + apiKey)

    // D-17: generate the RRR server-side before returning the redirect.
    const res = await fetch(
      `${base}/remita/exapp/api/v1/send/api/echannelsvc/merchant/api/paymentinit`,
      {
        method: "POST",
        headers: {
          Authorization: `remitaConsumerKey=${merchantId},remitaConsumerToken=${apiHash}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceTypeId,
          amount: String(amountNaira), // naira (Pitfall 1)
          orderId: params.reference,
          payerName: params.customerName,
          payerEmail: params.email,
          payerPhone: params.phone ?? "",
          description: `Order ${params.reference}`,
        }),
      },
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      throw new Error(`Remita paymentinit failed (${res.status}): ${errorText}`)
    }

    const data = parseJsonp(await res.text()) as { statuscode?: string; RRR?: string }
    if (!data.RRR) {
      throw new Error(`Remita paymentinit returned no RRR (statuscode=${data.statuscode ?? "?"})`)
    }

    // Plain GET redirect keyed on the RRR (D-13/D-16). RRR surfaced for gatewayReference storage.
    const url = `${base}/remita/onepage/payment/init.reg?rrr=${data.RRR}&channel=CARD,USSD,ENAIRA,TRANSFER`
    return { mode: "redirect", url, rrr: data.RRR }
  },

  async verifyTransaction(rrr: string): Promise<VerifyResult> {
    const merchantId = process.env.REMITA_MERCHANT_ID ?? ""
    const apiKey = process.env.REMITA_API_KEY ?? ""
    const base = BASE()

    // Pitfall 2: statusHash concat order (rrr + apiKey + merchantId) DIFFERS from apiHash.
    const statusHash = sha512(rrr + apiKey + merchantId)

    const res = await fetch(
      `${base}/remita/exapp/api/v1/send/api/echannelsvc/${merchantId}/${rrr}/${statusHash}/status.reg`,
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      throw new Error(`Remita status.reg failed (${res.status}): ${errorText}`)
    }

    const data = parseJsonp(await res.text()) as { status?: string; amount?: number | string }

    // A3: confirm exact success codes at sandbox (D-19). "00"/"01" → confirmed per RESEARCH.
    const status: NormalizedStatus =
      data.status === "00" || data.status === "01" ? "confirmed" : "failed"

    return {
      status,
      amountKobo: Math.round(Number(data.amount ?? 0) * 100), // naira → kobo (Pitfall 1)
      currency: "NGN",
      reference: rrr,
    }
  },

  // A5: Remita refund API availability uncertain at sandbox — degrade to log + manual until go-live.
  async refund(rrr: string, amountKobo?: number): Promise<void> {
    console.error(
      `[remita] refund not automated (A5) — manual refund required for rrr=${rrr}` +
        (amountKobo !== undefined ? ` amountKobo=${amountKobo}` : " (full)"),
    )
  },
}
