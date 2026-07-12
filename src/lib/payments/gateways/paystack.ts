import "server-only"
// src/lib/payments/gateways/paystack.ts
// PaystackAdapter — implements the D-02 GatewayAdapter interface for Paystack.
//
// Amount unit: Paystack uses KOBO (same minor unit as Stripe). Pass amountKobo directly —
// do NOT divide by 100. This is the critical difference vs Flutterwave (which uses naira).
//
// Endpoints (RESEARCH Pattern 1 + Code Examples):
//   - Initialize: POST https://api.paystack.co/transaction/initialize
//   - Verify:     GET  https://api.paystack.co/transaction/verify/:reference
//   - Refund:     POST https://api.paystack.co/refund
//
// Security: PAYSTACK_SECRET_KEY never leaves server (D-08). Only NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
// is returned to the client in initPayment's result (T-07-10, PAY-12).

import type { GatewayAdapter, VerifyResult, NormalizedStatus } from "./types"
import { getGatewayConfig } from "../gateway-credentials"

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Initialize a Paystack transaction.
 * Returns { accessCode, reference } — the client uses accessCode for resumeTransaction().
 *
 * Amount is passed as integer KOBO (Paystack's native unit — same as Stripe).
 * RESEARCH Pattern 1: amount field is kobo, NOT naira.
 */
export async function paystackInitialize(params: {
  email: string
  amountKobo: number  // integer kobo — passed UNCHANGED to Paystack
  reference: string
  orderId: string
  metadata?: Record<string, string>
}): Promise<{ accessCode: string; reference: string }> {
  const { secret_key: secretKey } = await getGatewayConfig("paystack")
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,  // integer kobo — NOT naira (Pitfall 1 anti-pattern avoided)
      reference: params.reference,
      currency: "NGN",
      metadata: { orderId: params.orderId, ...params.metadata },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`Paystack initialize failed (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  return {
    accessCode: data.data.access_code,
    reference: data.data.reference,
  }
}

/**
 * Verify a Paystack transaction by reference.
 * Returns a VerifyResult with normalized status and amountKobo (passthrough — no conversion).
 *
 * Status mapping (RESEARCH Pitfall 7):
 *   "success"   → "confirmed"
 *   "failed"    → "failed"
 *   "abandoned" → "failed"   (non-success treated as failed)
 *   other       → "pending"
 */
export async function paystackVerify(reference: string): Promise<VerifyResult> {
  const { secret_key: secretKey } = await getGatewayConfig("paystack")
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    }
  )

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`Paystack verify failed (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  const raw = data.data

  // Normalize Paystack status strings to the unified NormalizedStatus type (D-02, Pitfall 7).
  // Paystack uses "success" (NOT "successful" — that's Flutterwave).
  let status: NormalizedStatus
  if (raw.status === "success") {
    status = "confirmed"
  } else if (raw.status === "pending") {
    status = "pending"
  } else {
    // "failed", "abandoned", and any other string → failed
    status = "failed"
  }

  return {
    status,
    amountKobo: raw.amount,  // Paystack natively returns kobo — passthrough, no ÷100 (Pitfall 1)
    currency: raw.currency,
    reference: raw.reference,
  }
}

/**
 * Issue a Paystack refund.
 * If amountKobo is omitted → full refund.
 * If amountKobo is provided → partial refund (amount in KOBO).
 *
 * RESEARCH Code Examples / Paystack API: POST /refund, body { transaction, amount? }
 */
export async function paystackRefund(reference: string, amountKobo?: number): Promise<void> {
  const { secret_key: secretKey } = await getGatewayConfig("paystack")
  const res = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: reference,
      ...(amountKobo !== undefined ? { amount: amountKobo } : {}),
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`Paystack refund failed (${res.status}): ${errorText}`)
  }
}

// ─── GatewayAdapter export ────────────────────────────────────────────────────

/**
 * PaystackAdapter — implements the D-02 GatewayAdapter interface.
 *
 * initPayment returns:
 *   { accessCode, reference, publicKey } — client uses accessCode for resumeTransaction()
 *   publicKey is NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY (client-safe; secret never returned, T-07-10)
 *
 * verifyTransaction normalizes Paystack's status + amount to the VerifyResult shape.
 * refund delegates to paystackRefund (full or partial).
 */
export const paystackAdapter: GatewayAdapter = {
  provider: "paystack",

  async initPayment(params) {
    const { accessCode, reference } = await paystackInitialize({
      email: params.email,
      amountKobo: params.amountKobo,
      reference: params.reference,
      orderId: params.orderId,
    })

    const { public_key: publicKey } = await getGatewayConfig("paystack")

    return {
      mode: "popup",  // D-16: client opens the Paystack inline popup with this data
      accessCode,
      reference,
      // Only the PUBLIC key is returned to the client (T-07-10, D-08)
      publicKey,
    }
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    return paystackVerify(reference)
  },

  async refund(reference: string, amountKobo?: number): Promise<void> {
    return paystackRefund(reference, amountKobo)
  },
}
