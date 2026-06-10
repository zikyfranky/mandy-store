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
    - Neon DB live with all Phase 1 tables and constraints applied
    - drizzle/0000_cool_juggernaut.sql — SQL migration artifact for record
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
    - drizzle-kit push for schema-first DB provisioning (no migration runner in dev)
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
    - drizzle/0000_cool_juggernaut.sql
    - drizzle/meta/0000_snapshot.json
    - drizzle/meta/_journal.json
  modified:
    - package.json (added db:push, db:generate, seed, test, test:e2e scripts + all deps)
    - .gitignore (allow !.env.local.example to be committed)
decisions:
  - Used Drizzle ExtraConfigBuilder symbol introspection to test unique constraint name statically (no DB needed)
  - Added !.env.local.example negation to .gitignore so template is committed
  - Integration test (DB unique constraint) uses skipIf(!hasDatabase) guard — runs only when DATABASE_URL is present
  - drizzle-kit push used (not drizzle-kit migrate) — appropriate for initial dev provisioning
  - drizzle-kit generate also run to emit SQL migration artifact for auditing purposes
metrics:
  duration_minutes: 35
  completed_date: "2026-06-10"
  tasks_completed: 5
  tasks_total: 5
  files_changed: 22
status: COMPLETE
---

# Phase 1 Plan 1: Dev Environment + Schema Summary

**One-liner:** Node 22 toolchain, Drizzle schema with 8-value order_status enum + webhook idempotency constraint pushed live to Neon, and Wave 0 Vitest/Playwright test infrastructure — ROADMAP SC5 satisfied end-to-end.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Upgrade Node, install deps, env template, drizzle config | 9ea16ce | `.nvmrc`, `.env.local.example`, `drizzle.config.ts`, `package.json` |
| 2 | Write Drizzle schema + Neon client | 0e3e48c | `src/lib/db/schema.ts`, `src/lib/db/client.ts` |
| 3 | Install test framework + write Wave 0 test infrastructure | 4a862e9 | `vitest.config.ts`, `playwright.config.ts`, `tests/**` |
| 4 | Developer populates .env.local (human-action gate) | — | `.env.local` (gitignored; populated with valid Neon/Resend secrets) |
| 5 | Push schema to live Neon DB | b02f77e | `drizzle/0000_cool_juggernaut.sql`, `drizzle/meta/**` |

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
- `tests/db/schema.test.ts`: 4 tests — 3 static (always pass), 1 integration (skips without DATABASE_URL)
- Failing stub tests: `register.test.ts`, `verify-email.test.ts`, `login.test.ts`, `session.test.ts`, `logout.test.ts`, `dal.test.ts`
- `tests/e2e/proxy.spec.ts`: Playwright stubs with `test.skip()`, implemented in Plan 01-02

### Task 5: Schema Push to Neon
- `npx drizzle-kit push` applied schema to live Neon DB — 5 tables created, 2 enums created
- All 4 schema tests pass including the DB-backed unique constraint integration test
- `npx drizzle-kit generate` emitted `drizzle/0000_cool_juggernaut.sql` for audit record
- Tables confirmed live in Neon: `user`, `account`, `session`, `verificationToken`, `processed_webhook_events`

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

## Auth Gates

**Task 4 (human-action gate):** Developer provided `.env.local` with valid Neon DATABASE_URL (pooled), AUTH_SECRET (64-char), RESEND_API_KEY, and ADMIN_EMAILS. Gate completed successfully — user responded "env ready". Task 5 ran immediately after.

## Known Stubs

| File | What | Reason |
|------|------|--------|
| `tests/auth/register.test.ts` | All tests fail with `expect.fail()` | Auth.js + `register()` server action implemented in Plan 01-02 |
| `tests/auth/verify-email.test.ts` | All tests fail with `expect.fail()` | Email verification implemented in Plan 01-02 |
| `tests/auth/login.test.ts` | All tests fail with `expect.fail()` | Auth.js Credentials + `authorize()` implemented in Plan 01-02 |
| `tests/auth/session.test.ts` | All tests fail with `expect.fail()` | D-08 workaround implemented in Plan 01-02 |
| `tests/auth/logout.test.ts` | All tests fail with `expect.fail()` | `logout()` server action implemented in Plan 01-02 |
| `tests/lib/dal.test.ts` | All tests fail with `expect.fail()` | `verifySession()` DAL implemented in Plan 01-02 |
| `tests/e2e/proxy.spec.ts` | All tests skip with `test.skip()` | `proxy.ts` implemented in Plan 01-02 |

These stubs are intentional — this is the Wave 0 pattern (stub-first, implement in owning plan). None prevent this plan's goals from being achieved.

## Threat Flags

No new threat surface beyond what was planned. Both threat mitigations are now fully enforced:
- T-01-01: `.env.local.example` has no `NEXT_PUBLIC_` on server secrets; `.env*` gitignored
- T-01-02: `processed_webhook_events_id_unique` UNIQUE constraint is live in Neon DB, verified by integration test

## Self-Check: PASSED

**Created files verified:**
- `src/lib/db/schema.ts` — FOUND
- `src/lib/db/client.ts` — FOUND
- `drizzle.config.ts` — FOUND
- `.env.local.example` — FOUND
- `vitest.config.ts` — FOUND
- `playwright.config.ts` — FOUND
- `tests/db/schema.test.ts` — FOUND (4 tests pass)
- `drizzle/0000_cool_juggernaut.sql` — FOUND

**Commits verified:**
- 9ea16ce — Task 1 (chore: upgrade Node, deps, env, drizzle config)
- 0e3e48c — Task 2 (feat: Drizzle schema + Neon client)
- 4a862e9 — Task 3 (test: Wave 0 test infrastructure)
- 69e5893 — Partial summary (prior executor checkpoint)
- b02f77e — Task 5 (chore: push schema to Neon + SQL migration artifact)

**Test results:**
- `npx vitest run tests/db/schema.test.ts` — 4/4 passed (including DB unique constraint integration test)
- `drizzle-kit push` — completed with "Changes applied"
- ROADMAP SC5 — satisfied end-to-end
