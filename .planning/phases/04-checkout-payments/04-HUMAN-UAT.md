---
status: partial
phase: 04-checkout-payments
source: [04-VERIFICATION.md]
started: 2026-06-30
updated: 2026-06-30
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end Stripe card payment
expected: Add to cart → /checkout → pay with Stripe test card 4242 4242 4242 4242 → webhook (payment_intent.succeeded) fires → /order/<token> shows the confirmed state → order-confirmation email arrives. Requires live Stripe test keys (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) and `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
result: [pending]

### 2. End-to-end bank transfer order
expected: /checkout → select Bank Transfer → order created as awaiting_bank_transfer → /order/<token> renders bank name / account number / account name / MS-XXXXXX reference from server props (never client env) → bank-transfer-instructions email arrives. Requires BANK_NAME / BANK_ACCOUNT_NUMBER / BANK_ACCOUNT_NAME env set.
result: [pending]

### 3. Payment-processing polling interstitial
expected: Land on /order/<token> before the webhook lands → see the spinning "Payment processing…" view → it polls /api/order/status/<token> every 2s and transitions to the confirmed view without a full page reload → 30s fallback copy appears if still pending.
result: [pending]

### 4. Unknown-token 404 card
expected: Navigate to /order/<64 invalid hex chars> → styled "Order not found" card (not the default Next.js 404).
result: [pending]

### 5. Disabled payment method (server-side enforcement)
expected: Set ENABLE_BANK_TRANSFER=false and ENABLE_STRIPE=false, restart dev server → checkout UI hides the disabled methods AND the Server Actions return { error } if invoked directly (not merely hidden).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
