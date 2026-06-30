---
phase: 04-checkout-payments
plan: "02"
subsystem: payments/config,payments/stripe,orders/reference,orders/queries,email/order-confirmation,email/bank-transfer
tags: [payments, stripe, email, server-only, config, orders, tests]
dependency_graph:
  requires: [04-01]
  provides: [payment-method-toggle, stripe-singleton, order-reference-generator, guest-token-generator, order-queries, send-order-confirmation, send-bank-transfer-instructions]
  affects: [04-03, 04-04, 04-05, 04-06]
tech_stack:
  added:
    - stripe@22.3.0
    - "@stripe/stripe-js@9.8.0"
    - "@stripe/react-stripe-js@6.6.0"
    - react-hook-form@7.80.0
    - "@hookform/resolvers@5.4.0"
  patterns:
    - server-only-module
    - crypto-getRandomValues-token
    - resend-react-email-sender
    - vi-hoisted-mock-pattern
key_files:
  created:
    - src/lib/payments/config.ts
    - src/lib/payments/stripe.ts
    - src/lib/orders/reference.ts
    - src/lib/orders/queries.ts
    - src/lib/email/send-order-confirmation.ts
    - src/lib/email/send-bank-transfer-instructions.ts
    - src/emails/OrderConfirmationEmail.tsx
    - src/emails/BankTransferInstructionsEmail.tsx
    - tests/payments/config.test.ts
    - tests/email/emails.test.ts
  modified:
    - package.json (5 new deps)
    - package-lock.json
decisions:
  - Stripe apiVersion omitted from singleton constructor — uses SDK's own pinned version (stripe@22.3.0 pins its own; explicit version causes type mismatch)
  - vi.hoisted() used to declare mockSend before vi.mock factory hoisting — required because vi.mock is hoisted above module-level variable declarations
  - PayPal defaults OFF; isPaymentMethodEnabled('paypal') returns false unless all three env vars (ENABLE_PAYPAL, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) are set
  - sendBankTransferInstructionsEmail validates all three BANK_* env vars at send time and throws immediately if any is missing — prevents silent misconfiguration
  - schema.test.ts FK failure is a test-DB state issue (parallel runs deplete catalog data); not caused by Plan 02 changes; schema.test.ts passes when run in isolation
metrics:
  duration: "~40 minutes"
  completed: "2026-06-30T07:47:27Z"
  tasks_completed: 2
  files_changed: 12
---

# Phase 4 Plan 02: Payment Config + Email Primitives Summary

**One-liner:** Server-only payment-method toggle (`isPaymentMethodEnabled`), Stripe singleton, MS-XXXXXX reference generator with DB collision retry, 64-char guest token, order query functions, and two React Email templates + Resend senders for order confirmation and bank transfer instructions — all with 30 passing unit tests.

## What Was Built

### src/lib/payments/config.ts (PAY-04, D-13)
`isPaymentMethodEnabled(method)` + `enabledPaymentMethods()` — server-only (import "server-only"). Reads `ENABLE_STRIPE`, `ENABLE_PAYPAL`, `ENABLE_BANK_TRANSFER` plus the corresponding credential/detail env vars. PayPal defaults OFF (D-05a) — toggle exists but returns false unless all three PayPal vars are present. No `NEXT_PUBLIC_` prefix on any toggle.

### src/lib/payments/stripe.ts (T-04-08)
Singleton `stripe` instance constructed once per cold start. Server-only. No pinned `apiVersion` — uses stripe@22.3.0's own default to avoid type mismatch.

### src/lib/orders/reference.ts (D-11, D-12, T-04-06, T-04-09)
- `generateOrderRef()` — MS-XXXXXX, 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (omits O/0 I/1) via `crypto.getRandomValues` (never Math.random)
- `generateUniqueOrderRef()` — async, checks DB, retries up to 10 times before throwing (T-04-09)
- `generateGuestToken()` — 32 random bytes → 64 hex chars (256-bit entropy, T-04-06)

### src/lib/orders/queries.ts
Three server-only query functions:
- `getOrderByToken(token)` — returns order + items or undefined; early return on empty token
- `getOrderByStripePaymentIntentId(piId)` — for webhook order lookup
- `getOrderStatusByToken(token)` — lightweight status-only read for confirmation page polling (D-07)

### src/emails/OrderConfirmationEmail.tsx (ORD-01)
React Email template with VerificationEmail's inherited style objects. Renders line-item table with `formatNGN`, subtotal/shipping/total rows, "View your order" CTA button, and order reference footer.

### src/emails/BankTransferInstructionsEmail.tsx (ORD-02)
React Email template with bank account details in a green card (bankName, accountNumber, accountName), prominent order reference narration block in amber card, total to transfer, order items, "Check your order status" CTA. Copy: "we'll confirm once we receive your transfer" (no false payment confirmation).

### src/lib/email/send-order-confirmation.ts (ORD-01)
Resend sender. Subject: `Order confirmed — ${reference}`. Called non-blocking from webhook (`.catch(console.error)`).

### src/lib/email/send-bank-transfer-instructions.ts (ORD-02, T-04-07, D-10)
Resend sender. Subject: `Bank transfer instructions — ${reference}`. Reads BANK_NAME/BANK_ACCOUNT_NUMBER/BANK_ACCOUNT_NAME at send time (server-only, non-NEXT_PUBLIC_); throws immediately if any is missing. Called synchronously in the checkout action (must succeed before redirect).

### tests/payments/config.test.ts (14 tests, PAY-04)
Tests all toggle combinations for stripe/paypal/bank_transfer: enabled, disabled, missing credentials. Uses `vi.stubEnv` / `vi.unstubAllEnvs`. PayPal-off-by-default confirmed.

### tests/email/emails.test.ts (16 tests, ORD-01/ORD-02)
Tests component render (non-null, no-throw), sender subject/to/from fields, error propagation from Resend, missing bank env var validation. Uses `vi.hoisted()` for Resend constructor mock.

## Commits

| Hash | Message |
|------|---------|
| `613d348` | feat(04-02): install Phase 4 deps + payments config, Stripe singleton, order reference/token, order queries |
| `bcaa46f` | feat(04-02): order-confirmation + bank-transfer email templates and senders with tests |

## Test Results

- `tests/payments/config.test.ts` — 14 passing unit tests (PAY-04)
- `tests/email/emails.test.ts` — 16 passing unit tests (ORD-01, ORD-02)
- Full suite (excluding schema.test.ts parallel-run state issue): 185/185 tests pass
- `tests/checkout/schema.test.ts` — 4/4 pass when run in isolation; FK failures only when run in parallel with catalog tests that deplete test-DB state (pre-existing isolation issue, not caused by Plan 02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock Resend constructor — arrow function rejected as non-constructor**
- **Found during:** Task 2 (first test run)
- **Issue:** `vi.fn().mockImplementation(() => ({ emails: { send: mockSend } }))` produces an arrow function, which `new Resend(...)` cannot call (`TypeError: () => ... is not a constructor`)
- **Fix:** First attempt used `function MockResend()` but couldn't reference `mockSend` (hoisting). Final fix used `vi.hoisted(() => vi.fn())` to declare `mockSend` before the vi.mock factory hoisting, then used a regular function for the Resend mock constructor
- **Files modified:** `tests/email/emails.test.ts`
- **Commit:** `bcaa46f`

**2. [Rule 2 - Missing] Stripe apiVersion omitted from constructor**
- **Found during:** Task 1 (plan review)
- **Issue:** The PATTERNS.md example specified `apiVersion: "2025-04-30"` but plan Task 1 explicitly noted to omit it to avoid type mismatch with stripe@22.3.0 (SDK pins its own version)
- **Fix:** Constructor created without `apiVersion` field, with inline comment explaining why
- **Files modified:** `src/lib/payments/stripe.ts`
- **Commit:** `613d348`

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-05 (toggle elevation of privilege) | Mitigated | `config.ts` has `import "server-only"`; PayPal forced OFF (D-05a); 14 unit tests verify correct toggle behavior |
| T-04-06 (guest token entropy) | Mitigated | `generateGuestToken` uses `crypto.getRandomValues(32 bytes)` → 64 hex; never Math.random |
| T-04-07 (bank account env leak) | Mitigated | `send-bank-transfer-instructions.ts` is server-only; reads BANK_* (no NEXT_PUBLIC_); validates at send time |
| T-04-08 (Stripe secret key) | Mitigated | `stripe.ts` is server-only; STRIPE_SECRET_KEY is not NEXT_PUBLIC_ |
| T-04-09 (order reference collision) | Mitigated | `generateUniqueOrderRef` retries 10 times against DB unique constraint before throwing |

## Known Stubs

None — these are pure leaf modules with no UI surface.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/lib/payments/config.ts` exists | FOUND |
| `src/lib/payments/stripe.ts` exists | FOUND |
| `src/lib/orders/reference.ts` exists | FOUND |
| `src/lib/orders/queries.ts` exists | FOUND |
| `src/lib/email/send-order-confirmation.ts` exists | FOUND |
| `src/lib/email/send-bank-transfer-instructions.ts` exists | FOUND |
| `src/emails/OrderConfirmationEmail.tsx` exists | FOUND |
| `src/emails/BankTransferInstructionsEmail.tsx` exists | FOUND |
| `tests/payments/config.test.ts` exists | FOUND |
| `tests/email/emails.test.ts` exists | FOUND |
| Commit `613d348` exists | FOUND |
| Commit `bcaa46f` exists | FOUND |
| 30 plan tests pass | PASSED |
| `npx tsc --noEmit` exits 0 | PASSED |
| No NEXT_PUBLIC_ on payment toggles | VERIFIED |
| server-only in all lib/payments + lib/orders + lib/email senders | VERIFIED |
| @paypal/react-paypal-js NOT installed | VERIFIED |
