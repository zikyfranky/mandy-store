import "server-only"
// src/lib/payments/gateways/flutterwave.ts
// FlutterwaveAdapter — implements the D-02 GatewayAdapter interface for Flutterwave.
//
// CRITICAL amount units: Flutterwave uses NAIRA (major units), NOT kobo.
//   - Outbound (buildParams): amountKobo / 100 = naira  (÷100 before sending)
//   - Inbound (verify):       amountNaira × 100 = kobo  (×100 after receiving)
//
// Getting this wrong is the 100× pricing bug: ₦1,500 order → ₦150,000 charge (Pitfall 1).
// A unit guard throws if the resulting naira amount exceeds ₦1M (sanity sentinel).
//
// Endpoints (RESEARCH Pattern 2 + Code Examples):
//   - No server-side initialize — params assembled and returned to client for FlutterwaveCheckout()
//   - Verify:  GET  https://api.flutterwave.com/v3/transactions/:id/verify
//   - Refund:  POST https://api.flutterwave.com/v3/transactions/:id/refund
//
// Security: FLUTTERWAVE_SECRET_KEY never leaves server (D-08). Only NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY
// is returned to the client (T-07-16, PAY-12).

import type { GatewayAdapter, VerifyResult, NormalizedStatus } from "./types"
import { getGatewayConfig } from "../gateway-credentials"

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build Flutterwave inline checkout params for the client FlutterwaveCheckout() call.
 *
 * Amount is converted to NAIRA (amountKobo / 100) — CRITICAL unit conversion.
 * Pitfall 1: Passing kobo directly would charge 100× the actual price.
 *
 * Guard: if amountNaira > 1_000_000 (₦1M), throw — this almost certainly means kobo was
 * passed unintentionally (e.g., ₦150,000 order → amountKobo=15_000_000 → guard fires at ₦150,000 naira).
 */
export function flutterwaveBuildParams(params: {
  email: string
  amountKobo: number  // our internal unit — will be divided by 100
  txRef: string
  orderId: string
  customerName: string
  phone?: string
  publicKey: string
}) {
  const amountNaira = params.amountKobo / 100

  // Unit sanity guard (Pitfall 1, RESEARCH §Pitfall 1):
  // If the amount in naira exceeds ₦1M, something is almost certainly wrong with the conversion.
  if (amountNaira > 1_000_000) {
    throw new Error("FLW amount > ₦1M — check unit conversion")
  }

  return {
    public_key: params.publicKey,  // client-safe
    tx_ref: params.txRef,
    amount: amountNaira,  // NAIRA — Flutterwave's expected unit
    currency: "NGN",
    customer: {
      email: params.email,
      name: params.customerName,
      phone_number: params.phone,
    },
    meta: { orderId: params.orderId },
    customizations: {
      title: "YesBuy",
      description: "Payment for your order",
    },
  }
}

/**
 * Verify a Flutterwave transaction by its numeric transaction ID.
 * Returns a VerifyResult with normalized status and amountKobo (naira × 100).
 *
 * Status mapping (RESEARCH Pitfall 7):
 *   "successful" → "confirmed"   (Flutterwave uses "successful", NOT "success")
 *   "pending"    → "pending"
 *   other        → "failed"
 *
 * Amount normalization (Pitfall 1/8):
 *   Flutterwave returns naira → multiply by 100 to get kobo for uniform comparison.
 *   Math.round() handles floating-point edge cases (e.g., 1500.0 × 100 = 150000.0).
 */
export async function flutterwaveVerify(transactionId: number | string): Promise<VerifyResult> {
  const { secret_key: secretKey } = await getGatewayConfig("flutterwave")
  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    }
  )

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`Flutterwave verify failed (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  const raw = data.data

  // Normalize Flutterwave status strings to the unified NormalizedStatus type (D-02, Pitfall 7).
  // Flutterwave uses "successful" — NOT "success" (that's Paystack).
  let status: NormalizedStatus
  if (raw.status === "successful") {
    status = "confirmed"
  } else if (raw.status === "pending") {
    status = "pending"
  } else {
    // "failed" and any other string → failed
    status = "failed"
  }

  return {
    status,
    // Naira → kobo conversion (Pitfall 1/8): multiply by 100, round to int.
    // This normalizes the gateway-specific unit so callers always compare kobo to kobo.
    amountKobo: Math.round(raw.amount * 100),
    currency: raw.currency,
    reference: raw.tx_ref,  // Flutterwave's stable merchant reference
  }
}

/**
 * Issue a Flutterwave refund.
 * If amountKobo is omitted → full refund.
 * If amountKobo is provided → partial refund (converted to naira: amountKobo / 100).
 *
 * RESEARCH Code Examples: POST /transactions/:id/refund, body { amount?: naira }.
 * Minimum refund: NGN 100 (₦100) — omit amount for full refund.
 */
export async function flutterwaveRefund(transactionId: string, amountKobo?: number): Promise<void> {
  const { secret_key: secretKey } = await getGatewayConfig("flutterwave")
  const body: Record<string, unknown> = {}
  if (amountKobo !== undefined) {
    body.amount = amountKobo / 100  // convert to naira for Flutterwave
  }

  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    throw new Error(`Flutterwave refund failed (${res.status}): ${errorText}`)
  }
}

// ─── GatewayAdapter export ────────────────────────────────────────────────────

/**
 * FlutterwaveAdapter — implements the D-02 GatewayAdapter interface.
 *
 * initPayment builds and returns the client popup params (no server-side initialize endpoint).
 *   Returned params include only NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY — secret never returned (T-07-16).
 *
 * verifyTransaction normalizes Flutterwave's naira amount to kobo (× 100) and maps
 *   "successful" → "confirmed" (Pitfall 7 — different from Paystack's "success").
 *
 * refund delegates to flutterwaveRefund (full or partial, converts kobo → naira).
 */
export const flutterwaveAdapter: GatewayAdapter = {
  provider: "flutterwave",

  async initPayment(params) {
    const { public_key: publicKey } = await getGatewayConfig("flutterwave")
    // D-16: client opens the Flutterwave inline popup with these params
    return {
      mode: "popup",
      ...flutterwaveBuildParams({
        email: params.email,
        amountKobo: params.amountKobo,
        txRef: params.reference,
        orderId: params.orderId,
        customerName: params.customerName,
        phone: params.phone,
        publicKey,
      }),
    }
  },

  async verifyTransaction(reference: string): Promise<VerifyResult> {
    // reference is used as the transaction ID for Flutterwave verify endpoint
    return flutterwaveVerify(reference)
  },

  async refund(reference: string, amountKobo?: number): Promise<void> {
    return flutterwaveRefund(reference, amountKobo)
  },
}
