---
phase: 05-admin-panel
plan: 01
subsystem: payments
tags: [drizzle, postgres, neon, vitest, next.js, react-cache, payment-toggles]

# Dependency graph
requires:
  - phase: 04-checkout-payments
    provides: isPaymentMethodEnabled/enabledPaymentMethods sync gate, ~15 call sites across Server Actions/Route Handlers (Phase 4/7/7.1)
provides:
  - store_settings table (live in both dev and test DBs, seeded stripe/paypal/bank_transfer)
  - Async, DB-aware isPaymentMethodEnabled/enabledPaymentMethods (React.cache()-batched settings loader)
  - Server-side enforcement half of ADMN-04 (SC5) — every payment action/route now gated by a live DB flag for stripe/paypal/bank_transfer
affects: [05-admin-panel plan 06 (Settings page toggle UI will write to store_settings and this plan's gate enforces it)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-SQL-via-@neondatabase/serverless schema push fallback (drizzle-kit push hits a TTY prompt) — apply-store-settings-schema.mjs / apply-store-settings-schema-to-test-db.mjs mirror the existing apply-order-schema.mjs pair, run against both DATABASE_URL and TEST_DATABASE_URL"
    - "React.cache()-wrapped batched settings loader (getStoreSettingsMap) to avoid N+1 DB reads across enabledPaymentMethods()'s 8-method fan-out"
    - "In-place sync->async migration pattern: rename existing switch to a private hasEnvAndCredentials() helper, layer the DB check on top only for DB_BACKED_METHODS, keep the other 5 gateways env-only and DB-free"

key-files:
  created:
    - src/lib/payments/store-settings.ts
    - src/scripts/apply-store-settings-schema.mjs
    - src/scripts/apply-store-settings-schema-to-test-db.mjs
  modified:
    - src/lib/db/schema.ts
    - src/lib/payments/config.ts
    - tests/helpers/db.ts
    - tests/payments/config.test.ts
    - src/lib/actions/checkout.ts
    - src/lib/actions/paystack.ts
    - src/lib/actions/flutterwave.ts
    - src/lib/actions/interswitch.ts
    - src/lib/actions/gtpay.ts
    - src/lib/actions/remita.ts
    - src/app/checkout/page.tsx
    - src/app/api/webhooks/paystack/route.ts
    - src/app/api/webhooks/flutterwave/route.ts
    - src/app/api/webhooks/gtpay/route.ts
    - src/app/api/webhooks/remita/route.ts
    - src/app/api/payments/interswitch/callback/route.ts
    - src/app/api/payments/gtpay/callback/route.ts
    - src/app/api/payments/remita/callback/route.ts
    - tests/checkout/gtpay-callback.test.ts
    - tests/checkout/remita-callback.test.ts
    - tests/checkout/interswitch-callback.test.ts

key-decisions:
  - "store_settings seeds only stripe/paypal/bank_transfer (D-11 scope); NG gateways (paystack/flutterwave/interswitch/gtpay/remita) stay env-only and unseeded — config.ts's settings[method] ?? true fallback keeps their behavior unchanged"
  - "isPaymentMethodEnabled short-circuits to false before any DB read when env/credentials are absent, so the 5 non-DB-backed methods (and any unconfigured DB-backed method) never touch store_settings"

patterns-established:
  - "Sync-to-async gate migration is mechanical: rename old sync body to a private helper, wrap the public function async, add `await` at every call site — validated safe here across all 15 existing call sites plus 3 test-mock files"

requirements-completed: [ADMN-04]

# Metrics
duration: ~35min
completed: 2026-07-08
---

# Phase 5 Plan 01: Payment Toggle DB Migration (D-11) Summary

**store_settings table (live in both DBs) + async, DB-aware isPaymentMethodEnabled gating stripe/paypal/bank_transfer, with all 15 existing Phase 4/7/7.1 call sites migrated to `await` and zero regressions in the 325-test suite.**

## Performance

- **Duration:** ~35 min (includes a ~9 min full test-suite run and a production build)
- **Started:** 2026-07-08 (session start)
- **Completed:** 2026-07-08T16:24:36Z
- **Tasks:** 3/3 completed
- **Files modified:** 22 (3 created, 19 modified)

## Accomplishments
- `store_settings` table (text PK `method`, boolean `enabled`, `updatedAt`) created and seeded (stripe=true, paypal=false, bank_transfer=true) in BOTH the dev (`DATABASE_URL`) and test (`TEST_DATABASE_URL`) Neon databases via the established direct-SQL fallback pattern
- `isPaymentMethodEnabled`/`enabledPaymentMethods` converted from sync/env-only to async and DB-aware for stripe/paypal/bank_transfer, while staying env-only (unchanged) for the 5 NG gateways — mechanical migration, zero control-flow changes
- All 15 existing call sites (Server Actions, Route Handlers, and `checkout/page.tsx`'s Server Component) updated with `await`; 3 callback-test mock files converted from `mockReturnValue` to `mockResolvedValue` so `tsc --noEmit` stays clean under `strict: true`
- New async toggle-enforcement test suite (`tests/payments/config.test.ts`) covering all four D-11 gate combinations, plus preserved all pre-existing env-only assertions for the 5 non-DB-backed methods

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] Add store_settings table + direct-SQL push to both DBs + truncate helper** - `e387a1c` (feat)
2. **Task 2: Migrate isPaymentMethodEnabled sync→async (DB-aware) + await all 15 call sites** - `d022cfe` (feat)
3. **Task 3: Extend config tests with async toggle-enforcement cases + regression gate** - `0735b74` (test)

_No plan-metadata commit — STATE.md/ROADMAP.md are owned by the orchestrator in this environment._

## Files Created/Modified
- `src/lib/db/schema.ts` - Added `storeSettings` pgTable (mirrors `processedWebhookEvents` shape)
- `src/scripts/apply-store-settings-schema.mjs` / `apply-store-settings-schema-to-test-db.mjs` - Direct-SQL create+seed scripts run against DATABASE_URL and TEST_DATABASE_URL respectively
- `tests/helpers/db.ts` - Added `truncateStoreSettingsTable()` helper
- `src/lib/payments/store-settings.ts` - New `getStoreSettingsMap()` React.cache()-wrapped batched loader
- `src/lib/payments/config.ts` - `isPaymentMethodEnabled`/`enabledPaymentMethods` now async; old sync switch preserved verbatim as private `hasEnvAndCredentials()`; DB gate layered on top for stripe/paypal/bank_transfer only
- `src/lib/actions/{checkout,paystack,flutterwave,interswitch,gtpay,remita}.ts` - Added `await` at all 9 in-action call sites
- `src/app/checkout/page.tsx` - `const methods = await enabledPaymentMethods()`
- `src/app/api/webhooks/{paystack,flutterwave,gtpay,remita}/route.ts` - Added `await` at the 4 webhook toggle checks
- `src/app/api/payments/{interswitch,gtpay,remita}/callback/route.ts` - Added `await` at the 3 callback toggle checks
- `tests/checkout/{gtpay,remita,interswitch}-callback.test.ts` - Converted `isPaymentMethodEnabled` mocks from `mockReturnValue`/`mockReturnValueOnce` to `mockResolvedValue`/`mockResolvedValueOnce`
- `tests/payments/config.test.ts` - Rewrote to mock `getStoreSettingsMap`, `await` all assertions, and add the four D-11 toggle-enforcement cases + a DB-subset `enabledPaymentMethods` case

## Decisions Made
- Kept the exact env/credential-check logic unchanged (renamed to `hasEnvAndCredentials`) rather than rewriting it, per RESEARCH's "mechanical migration" guidance — minimizes regression risk across Phase 4/7/7.1
- Did not seed store_settings rows for the 5 NG gateways — the `settings[method] ?? true` fallback in `isPaymentMethodEnabled` keeps them functionally identical to pre-migration behavior with zero DB dependency (short-circuited before any DB read)

## Deviations from Plan

None - plan executed exactly as written. The environment-specific adaptations (plain git instead of gsd-sdk, `node --env-file=.env.local` instead of the plan's suggested `load-env.ts` invocation for the apply scripts, nvm 22 shell setup) are execution-environment mechanics, not plan deviations — the resulting schema, code, and test behavior match the plan's specification exactly.

## Issues Encountered
None - both direct-SQL apply scripts succeeded on the first run against both DATABASE_URL and TEST_DATABASE_URL; `tsc --noEmit` was clean on the first pass after the call-site migration.

## User Setup Required
None - no external service configuration required. `store_settings` is already live and seeded in both databases as part of this plan's execution.

## Next Phase Readiness
- The server-side enforcement half of ADMN-04 (SC5) is complete: every payment action/route now checks a live DB flag for stripe/paypal/bank_transfer.
- Plan 06 (admin Settings page) can now build `toggleStoreSetting()` and a UI that writes to `store_settings.enabled` — this plan's `isPaymentMethodEnabled` gate will immediately reflect those writes on the next request (no redeploy, no cache staleness risk beyond the per-request `React.cache()` batching).
- Full regression suite (325 tests, 30 files) passes with `TEST_DATABASE_URL` integration coverage enabled; `npx next build --webpack` succeeds cleanly.

---
*Phase: 05-admin-panel*
*Completed: 2026-07-08*

## Self-Check: PASSED

All created files verified present on disk (store-settings.ts, apply-store-settings-schema.mjs, apply-store-settings-schema-to-test-db.mjs, schema.ts, config.ts, tests/helpers/db.ts, tests/payments/config.test.ts, this SUMMARY.md). All 3 task commits (e387a1c, d022cfe, 0735b74) verified present in git log.
