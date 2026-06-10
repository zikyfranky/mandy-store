---
phase: 01-foundation
plan: 01
subsystem: dev-environment
tags: [drizzle, neon, auth-schema, vitest, playwright, node-upgrade]
dependency_graph:
  requires: []
  provides:
    - Node 22 toolchain with all runtime + dev deps installed
    - src/lib/db/schema.ts — auth tables + order_status enum + processed_webhook_events (ROADMAP SC5)
    - src/lib/db/client.ts — Drizzle + Neon db instance
    - drizzle.config.ts — drizzle-kit config
    - .env.local.example — env var template
    - vitest + playwright test infrastructure
    - Wave 0 test stubs (schema test green; auth/dal/e2e stubs red)
  affects:
    - All subsequent plans in Phase 1 (depend on db client + schema)
    - Phase 4 (processedWebhookEvents idempotency enforced here)
tech_stack:
  added:
    - next-auth@beta (5.0.0-beta.31)
    - "@auth/drizzle-adapter@1.11.2"
    - "@auth/core@0.41.2"
    - drizzle-orm@0.45.2
    - drizzle-kit@0.31.10
    - "@neondatabase/serverless@1.1.0"
    - argon2@0.44.0
    - resend@6.12.4
    - "@react-email/components@1.0.12"
    - zod@4.4.3
    - server-only@0.0.1
    - vitest@4.1.8
    - "@vitejs/plugin-react@6.0.2"
    - "@playwright/test@1.60.0"
    - tsx@4.22.4
  patterns:
    - Drizzle ORM with Neon HTTP driver (neon-http transport)
    - Drizzle pgEnum for type-safe DB enums
    - Vitest with node environment + @ path alias
    - Playwright with chromium + webServer config
key_files:
  created:
    - .nvmrc
    - .env.local.example
    - drizzle.config.ts
    - src/lib/db/schema.ts
    - src/lib/db/client.ts
    - vitest.config.ts
    - playwright.config.ts
    - tests/helpers/db.ts
    - tests/db/schema.test.ts
    - tests/auth/register.test.ts
    - tests/auth/login.test.ts
    - tests/auth/session.test.ts
    - tests/auth/verify-email.test.ts
    - tests/auth/logout.test.ts
    - tests/lib/dal.test.ts
    - tests/e2e/proxy.spec.ts
  modified:
    - package.json (added db:push, db:generate, seed, test, test:e2e scripts + all deps)
    - .gitignore (allow !.env.local.example to be committed)
decisions:
  - Used Drizzle ExtraConfigBuilder symbol introspection to test unique constraint name statically (no DB needed)
  - Added !.env.local.example negation to .gitignore so template is committed (Rule 1 fix)
  - Integration test (DB unique constraint) uses skipIf(!hasDatabase) guard — runs only when DATABASE_URL is present
metrics:
  duration_minutes: 25
  completed_date: "2026-06-10"
  tasks_completed: 3
  tasks_total: 5
  files_changed: 19
status: PAUSED_AT_CHECKPOINT
checkpoint: Task 4 — developer must populate .env.local before Task 5 (drizzle-kit push) can run
---

# Phase 1 Plan 1: Dev Environment + Schema Summary

**One-liner:** Node 22 toolchain, Drizzle schema with 8-value order_status enum + webhook idempotency table, and Wave 0 Vitest/Playwright test infrastructure — paused pending Neon DATABASE_URL.

## Status

**PAUSED at Task 4 (human-action checkpoint)** — Tasks 1-3 complete and committed. Task 5 (`drizzle-kit push`) requires a live Neon DATABASE_URL that must be provided by the developer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Upgrade Node, install deps, env template, drizzle config | 9ea16ce | `.nvmrc`, `.env.local.example`, `drizzle.config.ts`, `package.json` |
| 2 | Write Drizzle schema + Neon client | 0e3e48c | `src/lib/db/schema.ts`, `src/lib/db/client.ts` |
| 3 | Install test framework + write Wave 0 test infrastructure | 4a862e9 | `vitest.config.ts`, `playwright.config.ts`, `tests/**` |

## What Was Built

### Task 1: Toolchain
- `.nvmrc` pins Node 22 (v22.22.2)
- All runtime deps installed on Node 22 (argon2 native addon builds cleanly)
- `.env.local.example` documents all secrets without `NEXT_PUBLIC_` on server-only vars (T-01-01 mitigated)
- `drizzle.config.ts` configured for postgresql dialect, pointing at `./src/lib/db/schema.ts`
- npm scripts: `db:push`, `db:generate`, `seed`, `test`, `test:e2e`

### Task 2: Drizzle Schema
- `roleEnum`: `["customer", "admin"]`
- `orderStatusEnum`: 8 values in canonical order — `pending_payment`, `awaiting_bank_transfer`, `payment_confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `payment_failed` (ROADMAP SC5)
- `users` table: Auth.js adapter shape + `username` (unique), `password_hash`, `role` columns (D-03, D-04, D-09)
- `accounts`, `sessions`, `verificationTokens` tables matching `@auth/drizzle-adapter` shape
- `processedWebhookEvents` table with named unique constraint `processed_webhook_events_id_unique` (T-01-02 mitigated, ROADMAP SC5, CLAUDE.md webhook idempotency)
- No product/cart/order business tables (D-11 respected)

### Task 3: Test Infrastructure
- `vitest.config.ts`: node environment, `@` alias to `./src`, excludes `tests/e2e/**`
- `playwright.config.ts`: chromium project, baseURL `http://localhost:3000`, webServer with reuseExistingServer
- `tests/helpers/db.ts`: `getDb()`, `truncateAuthTables()`, `hasDatabase` guard
- `tests/db/schema.test.ts`: **3 tests pass** (enum values, table export, unique constraint name); 1 integration test skips until DATABASE_URL is set
- Failing stub tests: `register.test.ts`, `verify-email.test.ts`, `login.test.ts`, `session.test.ts`, `logout.test.ts`, `dal.test.ts` — all fail with `expect.fail("stub: implemented in Plan 01-02")`
- `tests/e2e/proxy.spec.ts`: Playwright stubs with `test.skip()`, implemented in Plan 01-02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] .gitignore blocked committing .env.local.example**
- **Found during:** Task 1 commit staging
- **Issue:** `.gitignore` has `.env*` pattern which matched `.env.local.example`, preventing the template from being committed
- **Fix:** Added `!.env.local.example` negation exception to `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** 9ea16ce

**2. [Rule 1 - Bug] Static unique constraint test needed Drizzle internal API**
- **Found during:** Task 3 verification (schema test failed initially)
- **Issue:** `processedWebhookEvents._?.config?.uniqueConstraints` returned empty — Drizzle 0.45.x stores extra config behind a symbol-keyed builder function, not a plain `_` property
- **Fix:** Updated test to use `Object.getOwnPropertySymbols()` to find `Symbol(drizzle:ExtraConfigBuilder)`, call the builder, and inspect the resulting config object for the constraint name
- **Files modified:** `tests/db/schema.test.ts`
- **Commit:** 4a862e9

## Known Stubs

| File | What | Reason |
|------|------|--------|
| `tests/auth/register.test.ts` | All 5 tests fail with `expect.fail()` | Auth.js + `register()` server action implemented in Plan 01-02 |
| `tests/auth/verify-email.test.ts` | All 4 tests fail with `expect.fail()` | Email verification implemented in Plan 01-02 |
| `tests/auth/login.test.ts` | All 4 tests fail with `expect.fail()` | Auth.js Credentials + `authorize()` implemented in Plan 01-02 |
| `tests/auth/session.test.ts` | All 3 tests fail with `expect.fail()` | D-08 workaround implemented in Plan 01-02 |
| `tests/auth/logout.test.ts` | All 2 tests fail with `expect.fail()` | `logout()` server action implemented in Plan 01-02 |
| `tests/lib/dal.test.ts` | All 4 tests fail with `expect.fail()` | `verifySession()` DAL implemented in Plan 01-02 |
| `tests/e2e/proxy.spec.ts` | All 3 tests skip with `test.skip()` | `proxy.ts` implemented in Plan 01-02 |
| `tests/db/schema.test.ts` | 1 integration test skips | Requires DATABASE_URL — runs after Task 5 (drizzle-kit push) |

These stubs are intentional — this is the Wave 0 pattern (stub-first, implement in owning plan).

## Threat Flags

No new threat surface beyond what was planned. Threat mitigations T-01-01 and T-01-02 are in place:
- T-01-01: `.env.local.example` has no `NEXT_PUBLIC_` on server secrets; verified by grep
- T-01-02: `processed_webhook_events_id_unique` constraint defined in schema; will be live after Task 5

## Pending (Task 4 + 5)

Task 4 is a human-action checkpoint — developer must:
1. Sign up at https://neon.tech and get `DATABASE_URL` (pooled, `?sslmode=require`)
2. Sign up at https://resend.com and get `RESEND_API_KEY`
3. Run `cp .env.local.example .env.local` and populate the values
4. Run `npx auth secret` to generate `AUTH_SECRET`

Task 5 (after Task 4): `npx drizzle-kit push` applies schema to live Neon DB, completing ROADMAP SC5 end-to-end.

## Self-Check: PARTIAL

Tasks 1-3 complete and verified. Tasks 4-5 pending human action.

**Created files verified:**
- `src/lib/db/schema.ts` — FOUND
- `src/lib/db/client.ts` — FOUND
- `drizzle.config.ts` — FOUND
- `.env.local.example` — FOUND
- `vitest.config.ts` — FOUND
- `playwright.config.ts` — FOUND
- `tests/db/schema.test.ts` — FOUND (3 tests pass)

**Commits verified:**
- 9ea16ce — Task 1 (chore: upgrade Node, deps, env, drizzle config)
- 0e3e48c — Task 2 (feat: Drizzle schema + Neon client)
- 4a862e9 — Task 3 (test: Wave 0 test infrastructure)
