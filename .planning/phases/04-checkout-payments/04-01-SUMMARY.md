---
phase: 04-checkout-payments
plan: "01"
subsystem: orders/schema
tags: [schema, orders, shipping, test-infra, env-vars, neon]
dependency_graph:
  requires: [01-01, 02-01, 03-01]
  provides: [orders-schema, order-items-schema, flat-shipping-helper, truncate-order-tables]
  affects: [04-02, 04-03, 04-04, 04-05, 04-06]
tech_stack:
  added: []
  patterns: [drizzle-pg-table, neon-direct-sql-fallback, tdd-red-green, server-only-constant]
key_files:
  created:
    - src/lib/db/schema.ts (orders + orderItems tables appended)
    - src/lib/orders/shipping.ts
    - tests/checkout/totals.test.ts
    - tests/checkout/schema.test.ts
    - src/scripts/apply-order-schema.mjs
    - src/scripts/apply-order-schema-to-test-db.mjs
    - drizzle/0001_quiet_fat_cobra.sql
  modified:
    - tests/helpers/db.ts
    - .env.local.example
decisions:
  - FLAT_SHIPPING_KOBO defaults to 200000 kobo (₦2,000) via server-only env var
  - drizzle-kit push TTY fallback: apply via @neondatabase/serverless direct SQL (documented pattern)
  - Schema must be applied to both DATABASE_URL and TEST_DATABASE_URL separately
  - order + order_item use unique constraints on reference + guestToken (IDOR-safe)
metrics:
  duration: "~45 minutes"
  completed: "2026-06-30T07:14:37Z"
  tasks_completed: 3
  files_changed: 9
---

# Phase 4 Plan 01: Order Schema + Shipping Foundation Summary

**One-liner:** Drizzle `order`/`order_item` tables with price snapshots and denormalized address fields, flat-shipping helper (`FLAT_SHIPPING_KOBO=200000`), and Phase 4 test infrastructure live in Neon.

## What Was Built

### orders table (src/lib/db/schema.ts)
Twenty-column Drizzle table including:
- UUID `id` (primaryKey), `reference` (unique `MS-XXXXXX`), `guestToken` (unique 64-char hex, IDOR-safe)
- `status` reusing the existing `orderStatusEnum` (default `pending_payment`) — NOT redefined
- Nullable `userId` FK to `user` (guests get NULL per CHKT-01)
- Server-computed totals: `subtotalKobo`, `shippingKobo`, `totalKobo` (never client-trusted)
- Denormalized shipping address snapshot: `shippingName`, `shippingPhone`, `shippingStreet`, `shippingCity`, `shippingState`, `shippingLandmark`
- Payment fields: `stripePaymentIntentId`, `paypalOrderId` (reserved, PAY-02 deferred)
- `refundReason` for last-unit-race edge case (D-09)
- Indexes: `order_user_idx`, `order_guest_token_idx`, `order_stripe_pi_idx`

### order_item table
Eight-column table with price+label snapshot at purchase time:
- `orderId` FK to `order` (cascade delete), `variantId` FK to `variant`
- Price snapshot: `priceKobo`, `productName`, `variantLabel`, `lineTotalKobo`
- Index: `order_item_order_idx`

### src/lib/orders/shipping.ts
Server-only module with `FLAT_SHIPPING_KOBO` (default 200000 via env) and `computeOrderTotal({ subtotalKobo })` returning `{ subtotalKobo, shippingKobo, totalKobo }`.

### tests/helpers/db.ts
`truncateOrderTables()` added — FK-safe order: `orderItems` → `orders` → `processedWebhookEvents`. Calls `assertTestDatabase()` to refuse without `TEST_DATABASE_URL`.

### .env.local.example
Phase 4 env vars appended: `STRIPE_*`, `PAYPAL_*`, `BANK_*`, `ENABLE_STRIPE/PAYPAL/BANK_TRANSFER`, `FLAT_SHIPPING_KOBO=200000`.

### Neon DB
Both `order` and `order_item` tables live in the dev Neon database and the separate test branch (`TEST_DATABASE_URL`).

## Commits

| Hash | Message |
|------|---------|
| `284a5c9` | feat(04-01): add orders + order_item schema tables and flat-shipping helper |
| `ccd66d7` | feat(04-01): Wave 0 test infra — truncateOrderTables, schema test, Phase 4 env vars |
| `c630069` | feat(04-01): push order + order_item schema to Neon (dev + test databases) |

## Test Results

- `tests/checkout/totals.test.ts` — 4 passing unit tests (no DB, always run)
- `tests/checkout/schema.test.ts` — 4 passing integration tests (DB-gated, run with TEST_DATABASE_URL)
- Full suite: **159/159 tests pass**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JavaScript default .sort() is lexicographic, not numeric**
- **Found during:** Task 3 (first schema test run)
- **Issue:** `[80000, 100000].sort()` produces `[100000, 80000]` (lexicographic "1" < "8"), causing the assertion `toEqual([80000, 100000])` to fail
- **Fix:** Changed to `.sort((a, b) => a - b)` for numeric sort
- **Files modified:** `tests/checkout/schema.test.ts`
- **Commit:** `c630069`

### Infrastructure Deviations

**2. [Rule 3 - Blocking] drizzle-kit push stalled on TTY prompt**
- **Found during:** Task 3
- **Issue:** `npm run db:push` stalled on an interactive constraint prompt (`option_value_unique`) — known documented pattern (STATE.md)
- **Fix:** Applied CREATE TABLE statements directly via `@neondatabase/serverless` (Phase 2/3 documented fallback). Created `src/scripts/apply-order-schema.mjs` and `src/scripts/apply-order-schema-to-test-db.mjs`.
- **Commit:** `c630069`

**3. [Rule 2 - Missing] Schema push required on TEST_DATABASE_URL separately**
- **Found during:** Task 3 (schema.test.ts ran against TEST_DATABASE_URL but tables didn't exist there)
- **Issue:** The plan only mentioned pushing to the dev DATABASE_URL; the test database (a separate Neon branch) also needed the new tables for integration tests to run
- **Fix:** Ran the same SQL script against TEST_DATABASE_URL; manually cleared orphaned test data from the previous failed test run
- **Commit:** `c630069`

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-01 (totalKobo tampering) | Mitigated | `computeOrderTotal` is server-only; tests assert it ignores client amounts |
| T-04-02 (guestToken IDOR) | Mitigated | Schema enforces UNIQUE on `guest_token`; 64-char hex token |
| T-04-03 (server env leak) | Mitigated | `shipping.ts` has `import "server-only"`; BANK_* env vars are non-NEXT_PUBLIC_ |
| T-04-04 (test DB isolation) | Mitigated | `truncateOrderTables()` calls `assertTestDatabase()` |

## Known Stubs

None — this plan creates foundational infrastructure with no UI surface.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/lib/orders/shipping.ts` exists | FOUND |
| `tests/checkout/totals.test.ts` exists | FOUND |
| `tests/checkout/schema.test.ts` exists | FOUND |
| `tests/helpers/db.ts` exists | FOUND |
| Commit `284a5c9` exists | FOUND |
| Commit `ccd66d7` exists | FOUND |
| Commit `c630069` exists | FOUND |
| 159 tests pass | PASSED |
| `npx tsc --noEmit` exits 0 | PASSED |
| `order` + `order_item` tables in Neon | VERIFIED |
