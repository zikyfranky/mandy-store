---
phase: 08-admin-managed-payment-credentials
plan: 05
subsystem: payments
tags: [paystack, flutterwave, remita, interswitch, gtpay, resolver-migration, ADMN-07]
provides:
  - paystackInitialize/paystackVerify/paystackRefund/paystackAdapter.initPayment resolver-backed (secret_key/public_key)
  - flutterwaveBuildParams accepts publicKey as a param; flutterwaveVerify/flutterwaveRefund/flutterwaveAdapter.initPayment resolver-backed
  - remitaAdapter.initPayment/verifyTransaction resolve merchant_id/api_key/service_type_id/base_url via a single getGatewayConfig("remita") call
  - interswitchAdapter/gtpayAdapter resolve credentials per-call and build a fresh WebPayConfig object (webpay-core.ts's synchronous hooks unchanged)
affects: [checkout, ng-gateway-webhooks, admin-settings]
tech-stack:
  added: []
  patterns: ["per-function getGatewayConfig(provider) resolve at the top of an already-async gateway function", "resolve-then-build-a-fresh-per-call-config for shared synchronous cores (webpay-core.ts)"]
key-files:
  created: []
  modified:
    - src/lib/payments/gateways/paystack.ts
    - src/lib/payments/gateways/flutterwave.ts
    - src/lib/payments/gateways/remita.ts
    - src/lib/payments/gateways/interswitch.ts
    - src/lib/payments/gateways/gtpay.ts
    - tests/payments/gateways.test.ts
key-decisions:
  - "webpay-core.ts is byte-for-byte untouched — interswitch.ts/gtpay.ts each build a FRESH WebPayConfig object per initPayment/verifyTransaction call, closing over plain-data values already resolved via getGatewayConfig, never making the shared hooks async or process.env-aware"
  - "flutterwaveBuildParams stays synchronous (unit-testable, no async coloring) — publicKey is now a required param resolved by the async flutterwaveAdapter.initPayment caller instead of a direct process.env read inside the pure function"
  - "remita.ts's module-scope BASE() env helper was replaced by inlining `cfg.base_url ?? \"https://demo.remita.net\"` from a single per-function getGatewayConfig(\"remita\") call — same fallback behavior, one resolver call instead of scattered env reads"
  - "[Rule 1 - Bug] tests/payments/gateways.test.ts's DB-mock strategy (spread `actual` + override `getGatewayCredentialsMap` on the gateway-credentials module) does not work: getGatewayConfig's internal call to getGatewayCredentialsMap is an ESM same-module self-reference that bypasses the mocked export object entirely. This silently fell through to a REAL Neon network call every run (masked because the test DB's gateway_credentials table happens to be empty, so the real round trip coincidentally produced the same result as the intended mock) — until this file's beforeEach stubbed global fetch, which broke the real call outright and surfaced the bug. Fixed by mocking @/lib/db/client's db.select().from(...) chain directly instead, which lets the REAL resolver logic (FIELD_MANIFEST, fail-closed omission) run against a fake empty row set with zero real network calls."
duration: ~45min
completed: 2026-07-12
---

# Phase 8 Plan 05: NG Gateway Resolver Migration (Paystack/Flutterwave/Remita/Interswitch/GTPay) Summary

**All 5 NG-gateway modules now resolve credentials via the Phase 8 DB-first/env-fallback resolver (`getGatewayConfig`); Interswitch/GTPay use the "resolve-then-build-a-fresh-per-call-config" pattern so the shared `webpay-core.ts` never becomes async or process.env-aware.**

## Performance
- **Duration:** ~45 min
- **Tasks:** 2/2 completed
- **Files modified:** 6 (5 source, 1 test)

## Accomplishments
- `paystack.ts`: `paystackInitialize`, `paystackVerify`, `paystackRefund`, and `paystackAdapter.initPayment` each resolve their own `getGatewayConfig("paystack")` call at the top, replacing `process.env.PAYSTACK_SECRET_KEY` / `process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` reads.
- `flutterwave.ts`: `flutterwaveBuildParams` stays a pure synchronous function, now taking `publicKey` as an explicit param; `flutterwaveAdapter.initPayment` resolves `public_key` via the resolver and passes it in. `flutterwaveVerify`/`flutterwaveRefund` resolve `secret_key` directly.
- `remita.ts`: both `initPayment` and `verifyTransaction` replace their `process.env.REMITA_*` reads and the `BASE()` helper with a single `const cfg = await getGatewayConfig("remita")`, destructuring `merchant_id`/`api_key`/`service_type_id`/`base_url` (with the same `?? "https://demo.remita.net"` fallback preserved).
- `interswitch.ts`: the module-scope `interswitchConfig` (which read `process.env.*` inside its hook closures) was replaced with `buildInterswitchConfig(cfg)`, a function returning a fresh `WebPayConfig` object per call. `initPayment`/`verifyTransaction` resolve `getGatewayConfig("interswitch")` first, then build and pass in this fresh config. Hash concat order, kobo passthrough, and `successCode: "00"` are unchanged.
- `gtpay.ts`: identical restructuring — `buildGtpayConfig(cfg)` mirrors `buildInterswitchConfig`'s shape with GTPay's field names and concat order (`mertId + txnRef + amountKobo + NGN_NUMERIC + custId + notiUrl + hashKey`), byte-for-byte preserved.
- `webpay-core.ts` was not modified at all — confirmed via `git diff --stat` showing it absent from both commits' file lists.
- `tests/payments/gateways.test.ts`: replaced the (broken, see Deviations) `getGatewayCredentialsMap` export-override mock with a `@/lib/db/client` mock (`db.select().from(...) => Promise.resolve([])`), letting the real resolver logic run against a fake empty result set. All existing `vi.stubEnv(...)` assertions still exercise the genuine env-fallback path unchanged.

## Task Commits
1. **Task 1: Paystack, Flutterwave, Remita — mechanical resolver swap** - `7b2fc74`
2. **Task 2: Interswitch + GTPay — per-call resolved WebPayConfig (Pitfall 1)** - `370e6d1`

## Files Created/Modified
- `src/lib/payments/gateways/paystack.ts` - all 3 credential-reading functions + `initPayment` resolver-backed
- `src/lib/payments/gateways/flutterwave.ts` - `flutterwaveBuildParams` takes `publicKey` param; `initPayment`/`verifyTransaction`/`refund` resolver-backed
- `src/lib/payments/gateways/remita.ts` - single `getGatewayConfig("remita")` call per function replaces scattered env reads + `BASE()` helper
- `src/lib/payments/gateways/interswitch.ts` - `buildInterswitchConfig(cfg)` replaces module-scope `interswitchConfig`; `initPayment`/`verifyTransaction` resolve-then-build per call
- `src/lib/payments/gateways/gtpay.ts` - `buildGtpayConfig(cfg)` mirrors interswitch's structure with GTPay's field names/concat order
- `tests/payments/gateways.test.ts` - DB-mock strategy fixed to mock `@/lib/db/client` instead of `gateway-credentials`'s export object

## Decisions & Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/payments/gateways.test.ts`'s prescribed DB-mock pattern does not intercept the real DB call**
- **Found during:** Task 1 verification (`npx vitest run tests/payments/gateways.test.ts -t "PaystackAdapter"`)
- **Issue:** The plan's action block specified mocking `@/lib/payments/gateway-credentials` via `{ ...actual, getGatewayCredentialsMap: vi.fn().mockResolvedValue({}) }`. This does not work: `getGatewayConfig` (part of the same `actual` module) calls `getGatewayCredentialsMap` through its own internal module-scope binding — an ESM same-module self-reference that the spread-and-override pattern on the returned mock object does not affect. Every gateway test therefore silently made a REAL network round trip to the Neon `TEST_DATABASE_URL` branch on every run. This was masked as "passing" because that branch's `gateway_credentials` table is genuinely empty (by design, per 08-PATTERNS.md — "ships empty so env fallback reproduces current behavior exactly"), so the real round trip happened to produce the same empty-map result the mock was meant to produce. It only became visible as an outright failure once this file's `beforeEach(() => vi.stubGlobal("fetch", vi.fn()))` replaced global `fetch` — breaking the still-real underlying Neon HTTP call.
- **Fix:** Replaced the mock with `vi.mock("@/lib/db/client", () => ({ db: { select: () => ({ from: () => Promise.resolve([]) } ) } }))`. This intercepts at the true I/O boundary, letting the REAL `getGatewayConfig`/`FIELD_MANIFEST`/fail-closed-omission logic execute against a fake empty row set, with zero real network calls (test now runs in ~500ms vs. the multi-second real round trip previously).
- **Files modified:** `tests/payments/gateways.test.ts`
- **Commit:** `7b2fc74`
- **Note (not fixed, out of scope):** the identical export-spread mock pattern is used in several other Phase 8 test files (`tests/payments/config.test.ts`, `tests/checkout/{actions,paystack-actions,flutterwave-actions,interswitch-actions,remita-actions}.test.ts`, `tests/actions/gateway-credentials.test.ts` uses a different, correct pattern — mocking `getGatewayConfig` directly rather than `getGatewayCredentialsMap`). Those files are not in this plan's `files_modified` scope, and each one currently "passes" only because it silently performs a real Neon network call against the (empty) `TEST_DATABASE_URL` table on every unit-test run rather than truly mocking it out. Flagged for future cleanup — see Threat Flags below.

**2. Plan acceptance-criteria grep count discrepancy (not a code issue)**
- The plan's Task 2 acceptance criteria state `grep -c "process.env.INTERSWITCH_" src/lib/payments/gateways/interswitch.ts` should return `1` ("only the pre-existing APP_URL fallback line remains"). The actual, correct implementation (matching the plan's own provided code example verbatim) has the `redirectUrl` fallback read `process.env.APP_URL` only — which does not match the `INTERSWITCH_` grep pattern, so the true count is `0`. This matches the plan's own `<success_criteria>` ("zero direct process.env credential reads remaining, except the documented pre-existing APP_URL redirect-URL fallback, A4") — the specific grep pattern in the acceptance criteria appears to be a typo in the plan text, not a deviation in the implementation.

No other deviations — both tasks' source-code changes match the plan's prescribed code exactly.

## Verification Results
- `npx vitest run tests/payments/gateways.test.ts -t "PaystackAdapter"` — 8 passed.
- `npx vitest run tests/payments/gateways.test.ts -t "FlutterwaveAdapter"` — passed (covered across 3 describe blocks).
- `npx vitest run tests/payments/gateways.test.ts -t "remita"` — 4 passed.
- `npx vitest run tests/payments/gateways.test.ts -t "interswitch adapter"` — 4 passed.
- `npx vitest run tests/payments/gateways.test.ts -t "gtpay adapter"` — 4 passed.
- `npx vitest run tests/payments/gateways.test.ts` (full file) — **32/32 passed**, same test count as pre-migration, ~500ms (no real network calls).
- Greps: `process.env.PAYSTACK_SECRET_KEY` × 0 in `paystack.ts`; `process.env.FLUTTERWAVE_SECRET_KEY`/`NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` × 0 in `flutterwave.ts`; `process.env.REMITA_` × 0 in `remita.ts`; `process.env.GTPAY_` × 0 in `gtpay.ts`; `successCode: "00"` × 1 in each of `interswitch.ts`/`gtpay.ts`.
- `git diff --stat src/lib/payments/gateways/webpay-core.ts` — empty (file not modified in either commit) — confirmed byte-for-byte unchanged.
- `npm test` (full suite, Node 22) — **38 files / 383 tests, all green** (~602s wall time).
- `npx next build --webpack` — compiled successfully, all 35 routes generated (including the 5 NG gateway webhook/callback routes). The `@next/swc-darwin-arm64` dlopen warning is the pre-existing, documented native-binding issue on this machine (CLAUDE.md build-commands note); build completes via WASM fallback, exit 0.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: test-isolation-gap | tests/payments/config.test.ts, tests/checkout/actions.test.ts, tests/checkout/paystack-actions.test.ts, tests/checkout/flutterwave-actions.test.ts, tests/checkout/interswitch-actions.test.ts, tests/checkout/remita-actions.test.ts | These "unit" test files use the same broken `getGatewayCredentialsMap`-export-override mock pattern documented in Deviations above. They currently pass only because they silently perform a real network round trip against `TEST_DATABASE_URL`'s (empty) `gateway_credentials` table on every run, rather than genuinely mocking the DB out. Not a security issue in production code, but a latent test-suite integrity gap (violates CLAUDE.md's stated "unit tests never touch a real DB" intent) that should be fixed by switching these files to the same `@/lib/db/client` mock used in `gateways.test.ts`, in a future cleanup plan. |

## Next Phase Readiness
All 5 NG gateway modules (Paystack, Flutterwave, Remita, Interswitch, GTPay) are now resolver-backed and consistent with Stripe (Plan 08-04) and `config.ts`'s `hasEnvAndCredentials` (Plan 08-03). `webpay-core.ts` remains a pure, provider-agnostic, synchronous core. The remaining webhook signing-secret resolver migrations (Plan 08-06/08-08) can build on this same convention. No blockers identified. The test-isolation gap flagged above should be addressed before/alongside those webhook plans, since webhook tests are especially sensitive to real-vs-mocked DB behavior.

## Self-Check: PASSED
- `src/lib/payments/gateways/paystack.ts` — FOUND
- `src/lib/payments/gateways/flutterwave.ts` — FOUND
- `src/lib/payments/gateways/remita.ts` — FOUND
- `src/lib/payments/gateways/interswitch.ts` — FOUND
- `src/lib/payments/gateways/gtpay.ts` — FOUND
- `tests/payments/gateways.test.ts` — FOUND
- Commit `7b2fc74` — FOUND in `git log`
- Commit `370e6d1` — FOUND in `git log`
