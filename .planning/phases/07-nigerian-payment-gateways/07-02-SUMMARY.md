---
phase: "07-nigerian-payment-gateways"
plan: "02"
subsystem: "payments"
tags: ["paystack", "webhook", "gateway-adapter", "idempotency", "server-actions", "tdd"]
dependency_graph:
  requires: ["07-01"]
  provides: ["paystack-adapter", "paystack-server-actions", "paystack-webhook"]
  affects: ["07-04"]
tech_stack:
  added: []
  patterns:
    - "PaystackAdapter implementing GatewayAdapter interface (D-02)"
    - "toggle-first Server Actions (PAY-12, D-06)"
    - "HMAC SHA-512 webhook signature verification (T-07-05)"
    - "shared confirmOrderPaid path for webhook + verify-on-callback (D-04, T-07-07)"
    - "oversold → paystackRefund + payment_failed (T-07-08)"
    - "amount guard: verifiedKobo < order.totalKobo → reject (T-07-06)"
key_files:
  created:
    - "src/lib/payments/gateways/paystack.ts (PaystackAdapter: paystackInitialize/paystackVerify/paystackRefund + paystackAdapter)"
    - "src/lib/actions/paystack.ts (initPaystackPayment + verifyPaystackPayment)"
    - "tests/checkout/paystack-actions.test.ts (11 tests: toggle rejection, amount guard, eventId, oversold, DB happy path)"
  modified:
    - "src/app/api/webhooks/paystack/route.ts (replaced Wave 1 stub with full implementation)"
    - "tests/checkout/paystack-webhook.test.ts (completed: 7 tests including 4 DB-gated)"
    - "tests/payments/gateways.test.ts (filled Paystack status-mapping + amount-passthrough cases)"
    - "src/lib/actions/checkout.ts (added export keyword to buildOrderContext — minimal edit)"
decisions:
  - "paystackInitialize returns ref from Paystack response but actions use ctx.reference (our order ref) as gatewayReference for stable lookup"
  - "verifyPaystackPayment uses < (not !==) for amount guard — shortfall is tampering; exact kobo integer compare"
  - "Webhook toggle check is before req.text() per plan constraint (D-06, PAY-12) — disabled gateway rejects before body read"
  - "Non-DB unit tests for initPaystackPayment moved to DB-gated to avoid FK constraint failures from MOCK_CART variantId"
metrics:
  duration: "~55 minutes"
  tasks_completed: 3
  files_created: 3
  files_modified: 4
  completed_date: "2026-07-04"
---

# Phase 7 Plan 02: Paystack End-to-End (PAY-05/PAY-12) Summary

**One-liner:** PaystackAdapter (initialize/verify/refund against D-02 interface), initPaystackPayment + verifyPaystackPayment Server Actions (toggle-first, server-recompute, amount guard), and HMAC SHA-512 webhook route all funneling into the shared `confirmOrderPaid()` path; 26 tests green (including 8 DB-gated integration tests).

## What Was Built

### Task 1 — PaystackAdapter (TDD)
- Created `src/lib/payments/gateways/paystack.ts` (import server-only)
- `paystackInitialize`: POST `api.paystack.co/transaction/initialize`; body `{ email, amount: amountKobo, reference, currency: "NGN", metadata: { orderId } }`; amount is integer kobo — no ÷100 (Pitfall 1 avoided)
- `paystackVerify`: GET `api.paystack.co/transaction/verify/:reference`; maps `"success"` → `confirmed`, `"pending"` → `pending`, all else → `failed`; returns `amountKobo: data.amount` (kobo passthrough, no conversion)
- `paystackRefund`: POST `api.paystack.co/refund`; body `{ transaction: reference, ...(amountKobo ? { amount: amountKobo } : {}) }`
- `paystackAdapter: GatewayAdapter` object wiring provider="paystack", initPayment (returns `{ accessCode, reference, publicKey }` — only NEXT_PUBLIC key exposed)
- Filled Paystack status-mapping + amount-passthrough cases in `tests/payments/gateways.test.ts` (8 new tests)

### Task 2 — Server Actions (TDD)
- Exported `buildOrderContext` from `src/lib/actions/checkout.ts` (single keyword addition, no other changes)
- Created `src/lib/actions/paystack.ts` (use server + import server-only):
  - `initPaystackPayment(input: CheckoutInput)`: toggle FIRST, buildOrderContext, db.batch insert (pending_payment, gatewayProvider="paystack", gatewayReference=ctx.reference), paystackInitialize, rollback on failure, returns `{ accessCode, reference, publicKey, guestToken }` — secret never in return value (T-07-10)
  - `verifyPaystackPayment({ reference })`: toggle FIRST, getOrderByGatewayReference, paystackVerify, status guard, amount guard (`v.amountKobo < order.totalKobo` → reject), confirmOrderPaid with `eventId = "paystack:" + reference`, oversold → paystackRefund + `{ error }`, success → `{ guestToken }`
- Created `tests/checkout/paystack-actions.test.ts` (11 tests): toggle rejection for both actions, amount mismatch rejection, unconfirmed status rejection, order-not-found, eventId assertion, oversold refund path, DB-gated happy path with order verification

### Task 3 — Webhook Route (TDD)
- Replaced Wave 1 stub in `src/app/api/webhooks/paystack/route.ts` with full implementation:
  - Toggle FIRST before `req.text()` (D-06, PAY-12, T-07-09)
  - `await req.text()` raw body (Pitfall 4 — no re-serialisation)
  - HMAC SHA-512 `x-paystack-signature` verification (T-07-05)
  - `charge.success` filter; 200 for all other events
  - `getOrderByGatewayReference(reference)` → 400 on miss (Paystack retry-safe)
  - `confirmOrderPaid(order, { provider: "paystack", eventId: "paystack:" + reference })` (D-04, T-07-07)
  - Oversold → `paystackRefund(reference).catch(console.error)` + 200 (T-07-08)
  - No `export const runtime` (Node.js default; cacheComponents:true compatible)
- Completed `tests/checkout/paystack-webhook.test.ts` (7 tests): bad-sig → 400 (always-runs), non-charge.success → 200 (always-runs), disabled → 400 (always-runs), DB-gated: happy path, idempotency (same-ref duplicate → one decrement + one email), oversold+refund, order-not-found → 400

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/payments/gateways.test.ts | 8 Paystack + 7 Flutterwave todo | Green |
| tests/checkout/paystack-actions.test.ts | 11 (10 unit + 1 DB) | Green |
| tests/checkout/paystack-webhook.test.ts | 7 (3 always-runs + 4 DB-gated) | Green |
| **Total new** | **26 passing / 7 todo** | **All passing** |

Existing tests (confirm-order-paid.test.ts, config.test.ts, webhook.test.ts): all still green — no regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-DB unit tests for initPaystackPayment hit real DB FK constraint**
- **Found during:** Task 2 test GREEN phase — tests for "server-side total recompute" and "return value security" were calling `initPaystackPayment` which does a real DB insert; the mock cart's static `variantId` (`00000000-...`) doesn't exist in the test DB, causing FK constraint failure
- **Issue:** The plan's test scope implied these would be pure unit tests, but `initPaystackPayment` inserts order + orderItems before calling `paystackInitialize`; there's no way to test the `paystackInitialize` call args without reaching the DB insert
- **Fix:** Moved "server-side total recompute" assertion into the DB-gated happy path test (which seeds a real variant); removed the standalone non-DB recompute test. The DB-gated test asserts `callArgs?.amountKobo === 10_200_000`. The "return value security" test was similarly consolidated. Toggle rejection tests remain as pure unit tests (they exit before the DB insert)
- **Files modified:** `tests/checkout/paystack-actions.test.ts`

**2. [Rule 3 - Blocking] buildOrderContext not exported from checkout.ts**
- **Found during:** Task 2 implementation — `src/lib/actions/paystack.ts` needed to import `buildOrderContext` from checkout.ts but it was `async function` (unexported)
- **Fix:** Added `export` keyword to `buildOrderContext` — the plan explicitly specified this as the expected minimal edit
- **Files modified:** `src/lib/actions/checkout.ts`

**3. [Rule 1 - Bug] Mock state pollution between tests (clearAllMocks wipes implementations)**
- **Found during:** Task 2 test GREEN phase — `vi.clearAllMocks()` in `afterEach` clears the mock implementations, not just call history; subsequent tests got `undefined` back from mocked functions
- **Fix:** Added explicit `vi.mocked(...).mockResolvedValue(...)` calls in `beforeEach` to restore default implementations after each clear; makes test state predictable regardless of order
- **Files modified:** `tests/checkout/paystack-actions.test.ts`

## Known Stubs

None. All Wave 1 stubs resolved in this plan:
- `src/app/api/webhooks/paystack/route.ts` — full implementation (was stub)
- `tests/checkout/paystack-webhook.test.ts` — all tests implemented (was todo)
- `tests/payments/gateways.test.ts` — Paystack cases implemented (Flutterwave remains todo for Plan 03)

Remaining todos in `tests/payments/gateways.test.ts` are Flutterwave cases intentionally deferred to Plan 03.

## Threat Flags

No new threat surface beyond the plan's threat model. All mitigations implemented and tested:

| Threat ID | Mitigation | Test |
|-----------|-----------|------|
| T-07-05 (Spoofing) | HMAC SHA-512 x-paystack-signature; mismatch → 400 | webhook.test.ts: bad-sig → 400 |
| T-07-06 (Tampering) | verifiedKobo < order.totalKobo → reject | actions.test.ts: amount mismatch test |
| T-07-07 (Repudiation) | eventId "paystack:"+reference shared by callback + webhook | actions.test.ts: eventId assertion |
| T-07-08 (Elevation) | Oversold → paystackRefund + payment_failed | webhook.test.ts: oversold DB test |
| T-07-09 (Access Control) | isPaymentMethodEnabled("paystack") first statement | toggle rejection tests (both files) |
| T-07-10 (Info Disclosure) | Only NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY in return value | actions.test.ts: JSON.stringify check |

## Commits

| Hash | Message |
|------|---------|
| `92c64fd` | feat(07-02): PaystackAdapter (initialize/verify/refund) + gateways unit tests |
| `4aee74b` | feat(07-02): initPaystackPayment + verifyPaystackPayment Server Actions + toggle tests |
| `d485216` | feat(07-02): Paystack webhook route + complete webhook + action tests |

## Self-Check: PASSED

```
FOUND: src/lib/payments/gateways/paystack.ts
FOUND: src/lib/actions/paystack.ts
FOUND: src/app/api/webhooks/paystack/route.ts
FOUND: tests/checkout/paystack-actions.test.ts
FOUND: tests/checkout/paystack-webhook.test.ts
FOUND: tests/payments/gateways.test.ts (Paystack cases filled)
FOUND: 92c64fd (Task 1 commit)
FOUND: 4aee74b (Task 2 commit)
FOUND: d485216 (Task 3 commit)
TSC: clean (npx tsc --noEmit exits 0)
TESTS: 26 passing / 7 todo (Flutterwave) / 0 failing
GREP CHECKS: all 6 acceptance criteria pass for each task
```
