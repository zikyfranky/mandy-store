// tests/payments/gateways.test.ts
// Wave 0 scaffold: PURE UNIT tests for gateway adapter behavior.
// No DB, no real gateway API — asserts adapter conversion logic.
//
// Status: Wave 0 — unit portions GREEN; adapter implementations land in Plans 02 (Paystack) / 03 (Flutterwave).
// Tests that depend on not-yet-created modules use it.todo with concrete expected values.

import { describe, it, expect } from "vitest"

// ─── Flutterwave Amount Conversion ───────────────────────────────────────────
// Pitfall 1 (RESEARCH): amountKobo / 100 = naira for Flutterwave popup.
// The adapter's initPayment must divide by 100 before sending to Flutterwave.
// The adapter's verifyTransaction must multiply amountNaira × 100 to get kobo.
// These values are used in Plan 03 tests (flutterwave.ts adapter).

describe("Flutterwave amount unit conversion", () => {
  it.todo(
    "[Plan 03] flutterwaveBuildParams({amountKobo: 150000}) → amount === 1500 (÷100 = naira). " +
    "Expected: params.amount === 1500, NOT 150000. " +
    "Anti-pattern: passing kobo directly charges 100× (₦1500 order → ₦150,000 charge)."
  )

  it.todo(
    "[Plan 03] flutterwaveVerify returns amountNaira; FlutterwaveAdapter.verifyTransaction multiplies × 100 → amountKobo. " +
    "Given stub response: { data: { status: 'successful', amount: 1500, currency: 'NGN', tx_ref: 'ref-1' } }, " +
    "FlutterwaveAdapter.verifyTransaction('ref-1') resolves to { status: 'confirmed', amountKobo: 150000, currency: 'NGN', reference: 'ref-1' }."
  )

  it.todo(
    "[Plan 03] Large amount guard: if amountKobo / 100 > 1_000_000 (₦1M), initPayment throws an error. " +
    "This catches accidental kobo→naira double-pass."
  )
})

// ─── Status String Normalization ─────────────────────────────────────────────
// Pitfall 7 (RESEARCH): Paystack uses "success", Flutterwave uses "successful".
// Each adapter maps to the unified NormalizedStatus type.

describe("Status string normalization", () => {
  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'successful' → NormalizedStatus 'confirmed'. " +
    "Stub response: { data: { status: 'successful', amount: 1500, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'confirmed', ... }."
  )

  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'failed' → NormalizedStatus 'failed'. " +
    "Stub response: { data: { status: 'failed', amount: 0, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'failed', ... }."
  )

  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction: status 'pending' → NormalizedStatus 'pending'. " +
    "Stub response: { data: { status: 'pending', amount: 0, currency: 'NGN', tx_ref: 'ref-1' } } → { status: 'pending', ... }."
  )

  it.todo(
    "[Plan 02] PaystackAdapter.verifyTransaction: status 'success' → NormalizedStatus 'confirmed'. " +
    "Stub response: { data: { status: 'success', amount: 150000, currency: 'NGN', reference: 'ref-1' } } → { status: 'confirmed', amountKobo: 150000, ... }."
  )

  it.todo(
    "[Plan 02] PaystackAdapter.verifyTransaction: status 'failed' → NormalizedStatus 'failed'. " +
    "Stub response: { data: { status: 'failed', amount: 0, currency: 'NGN', reference: 'ref-1' } } → { status: 'failed', ... }."
  )

  it.todo(
    "[Plan 02] PaystackAdapter.verifyTransaction: status 'abandoned' → NormalizedStatus 'failed'. " +
    "Stub response: { data: { status: 'abandoned', amount: 0, currency: 'NGN', reference: 'ref-1' } } → { status: 'failed', ... }."
  )
})

// ─── VerifyResult amountKobo normalization ────────────────────────────────────
// Adapters must always return amountKobo in minor units so the shared confirmation
// path can compare verifiedKobo to order.totalKobo without knowing the gateway.

describe("VerifyResult.amountKobo is always in kobo", () => {
  it.todo(
    "[Plan 02] PaystackAdapter.verifyTransaction returns amountKobo directly from Paystack response " +
    "(Paystack natively uses kobo; no conversion needed). " +
    "Given stub: { data: { amount: 70000, ... } } → VerifyResult.amountKobo === 70000."
  )

  it.todo(
    "[Plan 03] FlutterwaveAdapter.verifyTransaction multiplies amountNaira × 100. " +
    "Given stub: { data: { amount: 700, ... } } → VerifyResult.amountKobo === 70000."
  )
})
