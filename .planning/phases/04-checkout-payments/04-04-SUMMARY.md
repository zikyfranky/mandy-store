---
phase: 04-checkout-payments
plan: "04"
subsystem: webhooks/stripe,api/order-status
tags: [webhook, stripe, idempotency, atomic-decrement, last-unit-race, tdd, security, payments]
dependency_graph:
  requires: [04-01, 04-02, 04-03]
  provides: [stripe-webhook-handler, order-status-route]
  affects: [04-05, 04-06]
tech_stack:
  added: []
  patterns:
    - nodejs-runtime-webhook
    - req-text-raw-body
    - db-batch-idempotency
    - atomic-conditional-decrement-returning
    - last-unit-race-refund-recovery
    - tdd-red-green
key_files:
  created:
    - src/app/api/webhooks/stripe/route.ts
    - src/app/api/order/status/[token]/route.ts
    - tests/checkout/webhook.test.ts
  modified: []
decisions:
  - Use RETURNING id on UPDATE stock decrement (not rowCount) for portable affected-row detection across neon-http driver versions
  - Idempotency batch contains only the processedWebhookEvents insert; order update + decrements run in a second batch after the idempotency check (cleaner separation)
  - Refund failure is logged but does not prevent order being marked payment_failed (store owner reconciles manually)
  - Best-effort oversell notification is a console.error log in v1 (separate oversell email is a v2 improvement)
  - truncateCatalogTables in afterEach causes cross-file DB contamination in full parallel suite runs — pre-existing issue (documented in 04-02 and 04-03 summaries); each file passes in isolation
metrics:
  duration: "~14 minutes"
  completed: "2026-06-30T08:38:17Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 4 Plan 04: Stripe Webhook + Order Status Route Summary

**One-liner:** Stripe webhook Route Handler with nodejs runtime, req.text() raw body, idempotency via `processed_webhook_events` ON CONFLICT DO NOTHING, atomic conditional stock decrement (`WHERE stock >= qty RETURNING id`), last-unit-race refund recovery (D-09), and order-status polling GET endpoint — with 6 passing tests covering signature failure, happy path, idempotency, and last-unit race.

## What Was Built

### src/app/api/webhooks/stripe/route.ts (D-06, PAY-01, ORD-01, T-04-16..22)

The sole authority that flips an order to `payment_confirmed`. Key properties:

- `export const runtime = "nodejs"` — never edge; required for Node.js crypto HMAC timing-safe compare (Pitfall 1)
- `const body = await req.text()` — first statement, before any parse; raw body required for HMAC (Pitfall 1)
- `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — HMAC signature verification; 400 on failure
- Idempotency guard (T-04-17): `db.batch([INSERT INTO processed_webhook_events ... ON CONFLICT DO NOTHING])`; `idempotencyResult.rowCount === 0` short-circuits to 200 (no second decrement, no second email)
- Order lookup by `stripePaymentIntentId` (primary) with metadata.orderId fallback
- Atomic batch (T-04-18): `db.batch([order status update, ...decrements])` using raw SQL `UPDATE "variant" SET stock = stock - $qty WHERE id = $id AND stock >= $qty RETURNING id`
- Last-unit race detection (D-09, T-04-19): `decrementResult.rows.length === 0` → `stripe.refunds.create({ payment_intent })` + `status: "payment_failed"` + `refundReason: "oversold"` + 200 return
- Happy path: `sendOrderConfirmationEmail(...).catch(console.error)` — non-blocking; email failure never fails the webhook

### src/app/api/order/status/[token]/route.ts (CHKT-05/D-07, T-04-20)

Powers the "Payment processing…" confirmation page poller. GET `/api/order/status/:token`:
- `await params` — Next.js 16 async params pattern
- `getOrderStatusByToken(token)` — lightweight status-only DB read; returns null on miss
- Unknown token → 404 (no enumeration; token is 64-char unguessable hex per D-12)
- Returns only `{ status }` — no order IDs, emails, or payment details exposed

### tests/checkout/webhook.test.ts (6 tests, PAY-01, ORD-01, CHKT-05)

- **No DB (always runs):** Signature failure → 400, no DB writes
- **DB-gated (4 tests):** Happy path (payment_confirmed + stock -2 + email x1); Idempotency (duplicate delivery → single decrement + single email); Last-unit race (stock 1 < qty 2 → refund called + payment_failed + refundReason set + stock unchanged); Status route known/unknown token
- Uses `it.skipIf(!hasDatabase)` for all DB tests
- afterEach: `truncateOrderTables()` + `truncateCatalogTables()` + `vi.clearAllMocks()`

## Commits

| Hash | Message |
|------|---------|
| `2a87890` | test(04-04): add failing webhook tests (RED) — signature, idempotency, atomic decrement, last-unit race |
| `f2e798e` | feat(04-04): Stripe webhook handler + order-status route (GREEN) |

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — test commit | `2a87890` (`test(04-04)`) | PASSED |
| GREEN — feat commit | `f2e798e` (`feat(04-04)`) | PASSED |
| Tests pass at GREEN | 6/6 tests pass | PASSED |

## Test Results

- `tests/checkout/webhook.test.ts` — 6/6 passing (1 always-runs + 5 DB-gated)
- `tests/checkout/totals.test.ts` — 4/4 passing (always-runs)
- Full suite in isolation: all webhook tests pass
- Full suite parallel run: pre-existing cross-file DB contamination causes failures in schema.test.ts and webhook.test.ts when run after truncateCatalogTables from other test afterEach hooks (documented in 04-02 and 04-03 summaries; not caused by this plan)

## Deviations from Plan

### Implementation Choices

**1. [Plan Clarification] RETURNING id instead of rowCount for decrement result detection**
- **Found during:** Task 1 implementation
- **Issue:** Plan noted that `result.rowCount` may differ by driver version; recommended using `RETURNING id` for portability
- **Fix:** Used `UPDATE ... WHERE stock >= qty RETURNING id` and checked `result.rows.length === 0` as the zero-rows detector — portable and type-safe
- **Files modified:** `src/app/api/webhooks/stripe/route.ts`

**2. [Plan Clarification] Two separate db.batch calls for idempotency + atomic decrement**
- **Found during:** Task 1 implementation
- **Rationale:** The idempotency check must complete before we decide whether to proceed with the order update + decrements. Running the idempotency insert in one `db.batch`, checking `rowCount`, then running the order update + decrements in a second `db.batch` provides cleaner separation and allows the short-circuit path to work correctly
- **Files modified:** `src/app/api/webhooks/stripe/route.ts`

**3. [Pre-existing] Full-suite cross-file DB contamination**
- **Found during:** Task 1 verification (full `npm test` run)
- **Issue:** truncateCatalogTables in afterEach wipes brand/category/product rows that sequential test files seeded in the same Neon test branch. This is the same issue documented in 04-02-SUMMARY and 04-03-SUMMARY.
- **Impact:** webhook.test.ts fails in full suite context if run after other catalog-seeding tests that depend on their seed surviving into later tests. Isolated run: 6/6 pass.
- **Resolution:** Pre-existing issue; out of scope for this plan. Logged to deferred-items.

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-16 (forged webhook) | Mitigated | `stripe.webhooks.constructEvent(rawBody, sig, SECRET)` — HMAC timing-safe; `req.text()` first; nodejs runtime |
| T-04-17 (webhook replay) | Mitigated | `INSERT INTO processed_webhook_events ON CONFLICT DO NOTHING` first; `rowCount===0` short-circuits to 200 |
| T-04-18 (overselling race) | Mitigated | `UPDATE "variant" SET stock = stock - qty WHERE id=? AND stock >= qty` inside db.batch; never read-then-write |
| T-04-19 (last-unit oversell) | Mitigated | `rows.length===0` → `stripe.refunds.create` + `payment_failed` + `refundReason` + 200 (D-09, Pitfall 3) |
| T-04-20 (status enumeration) | Mitigated | Keyed by 64-char guestToken only; returns `{ status }` only; unknown token → 404 |
| T-04-21 (secret leakage) | Mitigated | Handler returns only `{ received }` or `{ status }`; never STRIPE_SECRET_KEY or webhook secret |
| T-04-22 (client claims paid) | Mitigated | Webhook is SOLE writer of payment_confirmed (D-06); no other path sets this status |

## Known Stubs

None — this plan creates server-side Route Handlers with no UI surface.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/app/api/webhooks/stripe/route.ts` exists | FOUND |
| `src/app/api/order/status/[token]/route.ts` exists | FOUND |
| `tests/checkout/webhook.test.ts` exists | FOUND |
| `grep 'export const runtime = "nodejs"' webhook route` | FOUND |
| `grep "await req.text()"` | FOUND |
| `grep "stripe.webhooks.constructEvent"` | FOUND |
| `grep "onConflictDoNothing"` | FOUND |
| `grep "stock - " && grep "stock >= "` | FOUND |
| `grep 'status: "payment_confirmed"'` | FOUND |
| `grep "refunds.create" && grep "payment_failed"` | FOUND |
| `grep "sendOrderConfirmationEmail"` | FOUND |
| `grep "getOrderStatusByToken"` in status route | FOUND |
| Commit `2a87890` exists (RED) | FOUND |
| Commit `f2e798e` exists (GREEN) | FOUND |
| 6/6 webhook tests pass in isolation | PASSED |
| `npx tsc --noEmit` exits 0 | PASSED |
