---
phase: "07-nigerian-payment-gateways"
plan: "01"
subsystem: "payments"
tags: ["gateway", "paystack", "flutterwave", "webhook", "idempotency", "schema"]
dependency_graph:
  requires: ["04-04"]   # Stripe webhook (idempotency + atomic decrement pattern extracted from here)
  provides: ["gateway-adapter-interface", "confirm-order-paid", "gateway-schema-columns", "wave-0-test-scaffolds"]
  affects: ["07-02", "07-03", "07-04"]
tech_stack:
  added:
    - "@paystack/inline-js@2.23.1 (client-side Paystack popup)"
    - "flutterwave-react-v3@1.3.3 (client-side Flutterwave popup)"
    - "flutterwave-node-v3@1.4.1 (server-side Flutterwave verify/refund)"
  patterns:
    - "Gateway adapter interface with initPayment/verifyTransaction/refund (D-02)"
    - "Shared idempotent confirmOrderPaid() extracted from Stripe webhook (D-04)"
    - "Per-gateway webhook route stubs with HMAC signature verification"
    - "Schema columns via direct SQL (drizzle-kit TTY workaround — established in 03-01/04-01)"
key_files:
  created:
    - "src/lib/payments/gateways/types.ts (GatewayAdapter interface + VerifyResult types)"
    - "src/lib/payments/shared/confirm-order-paid.ts (shared idempotent confirmation path)"
    - "src/app/api/webhooks/paystack/route.ts (sig-verify stub; full in Plan 02)"
    - "src/app/api/webhooks/flutterwave/route.ts (sig-verify stub; full in Plan 03)"
    - "tests/payments/gateways.test.ts (Wave 0 unit todos)"
    - "tests/payments/confirm-order-paid.test.ts (4 DB-gated integration tests GREEN)"
    - "tests/checkout/paystack-webhook.test.ts (2 always-runs + todos for Plan 02)"
    - "tests/checkout/flutterwave-webhook.test.ts (3 always-runs + todos for Plan 03)"
  modified:
    - "src/lib/payments/config.ts (PaymentMethod type + toggle cases + enabledPaymentMethods)"
    - "src/lib/db/schema.ts (orders: gatewayProvider + gatewayReference + index)"
    - "src/lib/orders/queries.ts (getOrderByGatewayReference added)"
    - "src/app/api/webhooks/stripe/route.ts (refactored to call confirmOrderPaid)"
    - ".env.local.example (Paystack + Flutterwave env var blocks)"
    - "tests/payments/config.test.ts (8 new toggle tests for paystack + flutterwave)"
    - "package.json + package-lock.json (3 new SDK dependencies)"
decisions:
  - "GatewayProvider type is 'paystack' | 'flutterwave' (Stripe handled separately via its own pattern)"
  - "VerifyResult.amountKobo always in kobo regardless of gateway — Flutterwave adapter will multiply naira × 100"
  - "confirmOrderPaid returns { outcome: 'oversold', refundNeeded: true } — caller performs gateway-specific refund"
  - "Webhook stubs created in Wave 1 so signature-verification always-runs tests work in Plan 01"
  - "Schema applied via direct SQL to both DATABASE_URL and TEST_DATABASE_URL (drizzle-kit TTY workaround)"
  - "Task 4 checkpoint processed autonomously per environment_notes direction (direct SQL pattern)"
metrics:
  duration: "~20 minutes"
  tasks_completed: 4
  files_created: 8
  files_modified: 7
  completed_date: "2026-07-04"
---

# Phase 7 Plan 01: Foundation (SDKs, Schema, Toggle, Adapter Interface, Shared Confirm) Summary

**One-liner:** Paystack + Flutterwave SDKs installed; gateway-adapter interface (D-02) and shared idempotent `confirmOrderPaid()` helper (D-04) established; Stripe webhook refactored to call it; orders schema extended with `gatewayProvider` + `gatewayReference` columns applied to both databases; Wave 0 test scaffolds in place.

## What Was Built

### Task 1 — SDKs, Toggle, Env Template
- Installed `@paystack/inline-js@2.23.1`, `flutterwave-react-v3@1.3.3`, `flutterwave-node-v3@1.4.1` via npm
- Extended `PaymentMethod` type: `"stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"`
- Added `case "paystack"` and `case "flutterwave"` to `isPaymentMethodEnabled()` — enabled iff `ENABLE_<GATEWAY>=true` AND secret key present (mirrors Stripe pattern, D-06, PAY-12)
- Extended `enabledPaymentMethods()` array to include both new gateways
- Appended Paystack + Flutterwave env var blocks to `.env.local.example` (no `NEXT_PUBLIC_` on secrets, D-08)
- Added 8 new tests to `tests/payments/config.test.ts`; all 23 config tests green

### Task 2 — Adapter Interface + confirmOrderPaid + Stripe Webhook Refactor + Schema
- Created `src/lib/payments/gateways/types.ts` with `GatewayAdapter` interface (D-02), `VerifyResult` (amountKobo always normalized to kobo — Pitfall 1 mitigation), and `NormalizedStatus`
- Created `src/lib/payments/shared/confirm-order-paid.ts` (`import "server-only"`) — extracted verbatim from Stripe webhook body:
  - Idempotency insert into `processedWebhookEvents` ON CONFLICT DO NOTHING (T-07-01)
  - Order-already-confirmed guard
  - Atomic `db.batch` flip to `payment_confirmed` + per-line `UPDATE variant SET stock = stock - qty WHERE id = ? AND stock >= qty RETURNING id` (T-07-02)
  - Oversold detection → `payment_failed` + `refundReason` + returns `{ outcome: "oversold", refundNeeded: true }` (caller refunds)
  - Confirmation email non-blocking (T-07-04)
- Refactored `src/app/api/webhooks/stripe/route.ts` to call `confirmOrderPaid(order, { provider: "stripe", eventId: event.id })`; Stripe-specific parts retained: sig verify, event filter, order lookup, `stripe.refunds.create` on oversold
- Added `getOrderByGatewayReference(reference)` to `src/lib/orders/queries.ts` (mirrors `getOrderByStripePaymentIntentId`)
- Added `gatewayProvider` (text nullable) + `gatewayReference` (text nullable, indexed) to `orders` table in schema.ts
- **Applied to both databases:** direct SQL via `@neondatabase/serverless` (drizzle-kit TTY workaround — established pattern from 03-01/04-01)
- All 6 existing Stripe webhook tests GREEN after refactor (regression-safe, T-07-04)

### Task 3 — Wave 0 Test Scaffolds + Webhook Stubs
- Created `tests/payments/gateways.test.ts` — pure unit todos for Flutterwave amount conversion (÷100), status-string normalization, and VerifyResult.amountKobo normalization; Plans 02/03 fill them
- Created `tests/payments/confirm-order-paid.test.ts` — DB-gated integration: 4 tests GREEN (happy path, idempotency same-eventId, oversold → payment_failed, already-confirmed guard)
- Created `tests/checkout/paystack-webhook.test.ts` — bad-sig → 400 (always-runs), non-targeted event → 200 (always-runs); DB-gated todos for Plan 02; HMAC SHA-512 helper
- Created `tests/checkout/flutterwave-webhook.test.ts` — bad-sig → 400 (always-runs), non-targeted event/status → 200 (always-runs); DB-gated todos for Plan 03; HMAC SHA-256 base64 helper
- Created `src/app/api/webhooks/paystack/route.ts` stub — signature verification + toggle check; full processing in Plan 02
- Created `src/app/api/webhooks/flutterwave/route.ts` stub — signature verification + both-header fallback + toggle check; full processing in Plan 03

### Task 4 — Schema Applied (Autonomous, per environment_notes)
- Plan designated Task 4 as a `checkpoint:human-action` gate, but environment_notes explicitly authorized autonomous execution via direct SQL
- Applied `gateway_provider` + `gateway_reference` columns and `order_gateway_ref_idx` index to:
  - `DATABASE_URL` (dev Neon) — verified 2 columns present
  - `TEST_DATABASE_URL` (test Neon branch) — verified 2 columns present

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/payments/config.test.ts | 23 | Green |
| tests/checkout/webhook.test.ts | 6 | Green (regression-safe) |
| tests/payments/confirm-order-paid.test.ts | 4 (DB) + todos | Green |
| tests/checkout/paystack-webhook.test.ts | 2 always-runs + todos | Green |
| tests/checkout/flutterwave-webhook.test.ts | 3 always-runs + todos | Green |
| tests/payments/gateways.test.ts | todos only | Skipped (Wave 0) |
| **Total** | **38 green / 20 todo** | **All passing** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Schema applied before Task 2 tests could pass**
- **Found during:** Task 2 test run — Stripe webhook DB-gated tests failed with `column "gateway_provider" of relation "order" does not exist`
- **Issue:** Adding `gatewayProvider` / `gatewayReference` to schema.ts causes Drizzle to include them in all INSERT statements immediately. Tests could not seed orders until the columns existed in the DB.
- **Fix:** Applied the SQL migration (Task 4's action) during Task 2 execution before running regression tests. Task 4 was marked as already complete.
- **Files:** Applied via direct SQL, no file change (schema.ts already edited)
- **Commits:** Included in `669884d`

**2. [Rule 2 - Missing functionality] Webhook stub routes created in Task 3**
- **Found during:** Task 3 scaffolding — test files import `@/app/api/webhooks/paystack/route` and `@/app/api/webhooks/flutterwave/route` which did not exist
- **Issue:** Without stub routes, the always-runs signature-failure tests would fail at import (module not found)
- **Fix:** Created minimal stub routes with complete signature verification (HMAC + toggle check) so the always-runs tests work in Wave 1. Full processing body (order lookup + confirmOrderPaid) deferred to Plans 02/03 as intended
- **Files:** `src/app/api/webhooks/paystack/route.ts`, `src/app/api/webhooks/flutterwave/route.ts`
- **Commits:** `3dadedf`

**3. [Rule 3 - Blocking] npm cache corruption required custom cache directory**
- **Found during:** Task 1 SDK install — npm reported `EEXIST` permission error on a root-owned cache file
- **Fix:** Used `npm install --cache /tmp/npm-cache-$$` to bypass the corrupted cache entry. Packages installed successfully.
- **Files:** No source file change

## Commits

| Hash | Message |
|------|---------|
| `4d0ce5a` | feat(07-01): install gateway SDKs, extend toggle for paystack + flutterwave |
| `669884d` | feat(07-01): gateway adapter interface, confirmOrderPaid helper, Stripe webhook refactor + schema |
| `3dadedf` | feat(07-01): scaffold Wave 0 test files + Paystack/Flutterwave webhook stubs |

## Known Stubs

| File | What's Stubbed | Resolves In |
|------|---------------|-------------|
| `src/app/api/webhooks/paystack/route.ts` | Full charge.success processing (order lookup + confirmOrderPaid + refund) | Plan 02 |
| `src/app/api/webhooks/flutterwave/route.ts` | Full charge.completed processing (order lookup + confirmOrderPaid + refund) | Plan 03 |
| `tests/payments/gateways.test.ts` | All test cases (adapter modules don't exist yet) | Plans 02/03 |
| `tests/checkout/paystack-webhook.test.ts` | DB-gated happy path / idempotency / race tests | Plan 02 |
| `tests/checkout/flutterwave-webhook.test.ts` | DB-gated happy path / idempotency / amount-unit / race tests | Plan 03 |

These stubs are intentional — this is the Wave 1 contracts-first deliverable. The stub routes compile, type-check, and serve the always-runs security tests. Plans 02/03 fill them.

## Threat Flags

No new threat surface beyond what is in the plan's `<threat_model>`. The webhook stubs include signature verification as their first security gate (T-07-04 contract preserved).

## Self-Check: PASSED

```
FOUND: src/lib/payments/gateways/types.ts
FOUND: src/lib/payments/shared/confirm-order-paid.ts
FOUND: src/app/api/webhooks/paystack/route.ts
FOUND: src/app/api/webhooks/flutterwave/route.ts
FOUND: tests/payments/confirm-order-paid.test.ts
FOUND: tests/payments/gateways.test.ts
FOUND: tests/checkout/paystack-webhook.test.ts
FOUND: tests/checkout/flutterwave-webhook.test.ts
FOUND: 4d0ce5a (Task 1 commit)
FOUND: 669884d (Task 2 commit)
FOUND: 3dadedf (Task 3 commit)
TSC: clean (npx tsc --noEmit exits 0)
DB: gateway_provider + gateway_reference columns verified in both dev and test databases
TESTS: 38 passing / 0 failing / 20 todo (Wave 0 expected)
```
