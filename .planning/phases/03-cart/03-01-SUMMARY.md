---
phase: 03-cart
plan: "01"
subsystem: cart-data-layer
tags: [drizzle, schema, cart, pure-functions, unit-tests, neon]
dependency_graph:
  requires: [02-04]
  provides: [cart-schema, cart-logic-module, cart-test-scaffolds]
  affects: [03-02, 03-03]
tech_stack:
  added: []
  patterns: [pure-function-module, array-return-extra-config, fk-safe-truncate]
key_files:
  created:
    - src/lib/cart/logic.ts
    - tests/cart/cart-logic.test.ts
    - tests/cart/cart-cookie.test.ts
    - tests/cart/cart-db.test.ts
  modified:
    - src/lib/db/schema.ts
    - tests/helpers/db.ts
decisions:
  - "drizzle-kit push ran non-interactively without TTY; used direct SQL via @neondatabase/serverless to create cart + cart_item tables — functionally equivalent, constraints and indexes confirmed in Neon"
  - "cart-db.test.ts uses afterEach with tracked-IDs cleanup (not truncateCatalogTables in beforeEach) to avoid contaminating schema.test.ts that runs sequentially in the full suite"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-19"
  tasks: 3
  files: 6
---

# Phase 03 Plan 01: Cart Foundation — Schema + Pure Logic + Test Scaffolds Summary

**One-liner:** Cart + cart_item tables (no price columns) pushed to Neon; pure `hydrateCart/mergeCartItems/clampToStock/parseCartCookie` module with 35 unit tests; Wave 0 DB/cookie test scaffolds wired.

## What Was Built

### Task 1: cart + cart_item schema tables

Added to `src/lib/db/schema.ts` after `variantOptionValues` (before Phase 2 relations):

- `cart` table: `id` text PK, `user_id` FK → users (cascade), `created_at`/`updated_at` timestamps; `cart_user_unique` constraint, `cart_user_idx` index.
- `cartItems` table (`cart_item`): `id` text PK, `cart_id` FK → cart (cascade), `variant_id` FK → variants (cascade), `quantity` integer default 1, timestamps; `cart_item_variant_unique` (cartId, variantId), `cart_item_cart_idx`. **NO priceKobo column** (D-08/D-09, CLAUDE.md).
- `cartRelations` and `cartItemsRelations` appended to relations block.
- Both tables live in Neon. drizzle-kit push required TTY (deviation below); applied via direct SQL.

### Task 2: Pure cart-logic module + unit tests (TDD — RED → GREEN)

`src/lib/cart/logic.ts` — pure module, no `server-only` guard:
- `GuestCartItem`, `CartVariantRow`, `CartLineItem`, `CartResult` types (matching plan `<interfaces>` exactly)
- `CART_COOKIE = "ms_cart"`, `MAX_AGE = 2_592_000` (30 days)
- `parseCartCookie`: try/catch + Array.isArray + per-field typeof filter (T-03-02 malformed-cookie safety)
- `serializeCartCookie`: JSON.stringify
- `clampToStock`: `Math.max(0, Math.min(qty, stock))` (D-06/D-12)
- `mergeCartItems`: additive sum per variantId, clamped to stock, drops zero-qty (D-10)
- `hydrateCart`: drops unknown variantIds (T-03-03), marks OOS when stock===0 or !isActive (D-11), clamps qty to stock (D-12), computes lineTotalKobo from server priceKobo only (SC4)

`tests/cart/cart-logic.test.ts`: 6 describe blocks, 35 tests — all pure unit tests, no DB, no vi.mock.

### Task 3: Wave 0 test scaffolds + truncateCartTables

`tests/helpers/db.ts`: added `truncateCartTables()` — DATABASE_URL guard, lazy import, FK-safe delete `cartItems` before `cart`.

`tests/cart/cart-db.test.ts`: 3 DB integration tests validating:
- cart_item reads back with correct quantity, no `priceKobo`/`price_kobo` field (D-09, T-03-01)
- `cart_user_unique` constraint enforced
- `cart_item_variant_unique` constraint enforced
Uses `afterEach` with tracked-ID cleanup (not bulk catalog truncation) to avoid contaminating other test files.

`tests/cart/cart-cookie.test.ts`: 4 cookie-harness tests validating:
- `CART_COOKIE = "ms_cart"`, `MAX_AGE = 2_592_000`
- Mock cookie store asserts `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: MAX_AGE`
- Malformed cookie gracefully returns `[]` (T-03-02)
- 3 `it.todo()` stubs for Plan 02 round-trip tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit push requires TTY — bypassed with direct SQL**
- **Found during:** Task 1 (BLOCKING db:push step)
- **Issue:** `drizzle-kit push` attempted to add `option_value_unique` constraint (already exists in DB from Phase 2) and requires interactive TTY confirmation. Neither `--force` flag nor `echo ""` pipe bypassed the prompt; the tool checked `process.stdin.isTTY`.
- **Fix:** Used `@neondatabase/serverless` neon client directly to execute `CREATE TABLE IF NOT EXISTS cart (...)` and `CREATE TABLE IF NOT EXISTS cart_item (...)` with `DO $$ BEGIN ... END $$` guards for idempotent constraint creation.
- **Verified:** Queried `information_schema.tables` — both `cart` and `cart_item` confirmed live in Neon with correct columns, PKs, FKs, indexes, and unique constraints.
- **Files modified:** none (direct DB operation)

**2. [Rule 1 - Bug] cart-db.test.ts beforeEach truncated catalog tables causing schema.test.ts failures**
- **Found during:** Task 3 full-suite verification
- **Issue:** Initial `beforeEach` called `truncateCatalogTables()` which wiped all products/variants. With `fileParallelism: false`, `schema.test.ts` ran after `cart-db.test.ts` and found no variants.
- **Fix:** Replaced `beforeEach` + `truncateCatalogTables` with `afterEach` using tracked ID arrays — only the rows inserted by each cart test are deleted, catalog seed data is left intact.
- **Files modified:** `tests/cart/cart-db.test.ts`

**3. [Rule 1 - Bug] Comment containing "server-only" text triggered acceptance criterion grep**
- **Found during:** Task 2 verification
- **Issue:** Module header comment read `// No DB, no server-only —` which caused `grep -qE 'server-only' src/lib/cart/logic.ts` to match, failing the "no server-only import" check.
- **Fix:** Changed comment to `// No DB, no import restrictions —`
- **Files modified:** `src/lib/cart/logic.ts`

## Threat Model Coverage

| Threat | Mitigation | Verified |
|--------|------------|---------|
| T-03-01: price in cart_item | NO priceKobo column in schema + cart-db.test.ts asserts `"priceKobo" in item === false` | YES |
| T-03-02: forged cookie JSON | `parseCartCookie` try/catch + Array.isArray + typeof filters; 7 test cases | YES |
| T-03-03: forged variantId in cookie | `hydrateCart` drops items absent from server-fetched variantRows | YES |
| T-03-04: info disclosure | cart_item stores only {variantId, quantity} — no PII, no prices | YES |

## Known Stubs

None — this plan is foundational (schema + pure functions). No UI stubs created.

## Self-Check

**Created files exist:**
- `src/lib/cart/logic.ts`: YES
- `tests/cart/cart-logic.test.ts`: YES
- `tests/cart/cart-cookie.test.ts`: YES
- `tests/cart/cart-db.test.ts`: YES
- `tests/helpers/db.ts` (modified): YES

**Commits exist:**
- `43548e4`: feat(03-01): add cart + cart_item Drizzle tables to schema + push to Neon
- `e5e54e3`: feat(03-01): pure cart-logic module + Wave 0 unit tests (35 passing)
- `75196cd`: feat(03-01): Wave 0 cart test scaffolds + truncateCartTables FK-safe helper

**Test results:**
- `npx vitest run tests/cart/cart-logic.test.ts`: 35/35 passing
- `npx vitest run tests/cart/`: 43 passing + 3 todo
- `npx vitest run` (full suite): 143 passing + 3 todo, 0 failures
- `npx tsc --noEmit`: clean

## Self-Check: PASSED
