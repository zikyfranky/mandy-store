---
phase: 08-admin-managed-payment-credentials
plan: 07
subsystem: payments
tags: [gtpay, remita, webhooks, resolver-migration, fail-closed, ADMN-07]
requires:
  - phase: 08-admin-managed-payment-credentials
    provides: getGatewayConfig resolver (Plan 08-02), the 08-06 mock-strategy caveat
provides:
  - GTPay webhook route resolves hash_key via getGatewayConfig("gtpay"), fails closed (400) before any SHA-512 hash compute if empty
  - Remita webhook route resolves api_key + merchant_id via getGatewayConfig("remita"), fails closed (400) before any SHA-512 hash compute if either is empty
  - Two brand-new dedicated test files closing a pre-existing zero-coverage gap on these two webhook routes
affects: [ng-gateway-webhooks, admin-settings]
tech-stack:
  added: []
  patterns: ["resolve-then-guard-empty-then-hash for plain SHA-512 (non-HMAC) notification schemes", "mock getGatewayConfig directly (no actual-spread) for routes with no DB-gated test paths"]
key-files:
  created:
    - tests/checkout/gtpay-webhook.test.ts
    - tests/checkout/remita-webhook.test.ts
  modified:
    - src/app/api/webhooks/gtpay/route.ts
    - src/app/api/webhooks/remita/route.ts
key-decisions:
  - "Both webhook test files mock getGatewayConfig, getOrderByGatewayReference, and confirmOrderPaid wholesale (no real db import) — mirroring gtpay-callback.test.ts's fully-mocked structural template, since the plan's <interfaces> only required covering the credential-resolution + hash-verify + confirm-call boundary, not order-mutation side effects (those are covered separately by the callback-route tests and the shared confirmOrderPaid unit)."
  - "getGatewayConfig mocked directly as { getGatewayConfig: vi.fn() } (no importOriginal/actual spread) since neither of these two new test files has a DB-gated code path that needs the real db client left untouched — unlike 08-06's paystack/flutterwave files, which spread actual specifically to preserve real db.insert/db.query usage in their DB-gated happy-path tests."
duration: ~20min
completed: 2026-07-12
---

# Phase 8 Plan 07: GTPay + Remita Webhook Signing-Secret Fail-Closed Migration Summary

**Both GTPay and Remita webhook routes now resolve their plain SHA-512 notification-hash credential(s) via the Phase 8 resolver (DB-first, env-fallback) and reject with 400 "Gateway not configured" BEFORE any hash compute if resolution is empty — closing the last remaining unmigrated webhook credential reads in the phase, plus a pre-existing zero-test-coverage gap on both routes.**

## Performance
- **Duration:** ~20 min
- **Tasks:** 1/1 completed
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments
- `src/app/api/webhooks/gtpay/route.ts`: added `import { getGatewayConfig } from "@/lib/payments/gateway-credentials"`; the hash block now does `const hashKeyResolved = (await getGatewayConfig("gtpay")).hash_key`, guards `if (!hashKeyResolved) return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })` immediately after (before `crypto.createHash`), then trims and uses `hashKeyResolved` in the SHA-512 concat. The old `process.env.GTPAY_HASH_KEY` read is gone. Toggle-first ordering, body parsing, and everything downstream (order lookup, `confirmOrderPaid`, oversold-refund) are unchanged.
- `src/app/api/webhooks/remita/route.ts`: same shape — `const cfg = await getGatewayConfig("remita")`, guarded `if (!cfg.api_key || !cfg.merchant_id)` before the SHA-512 concat (`rrr + cfg.api_key + cfg.merchant_id`). The old `process.env.REMITA_MERCHANT_ID`/`REMITA_API_KEY` reads are gone; the `rrr`-based order lookup and confirm flow below are byte-for-byte unchanged.
- `tests/checkout/gtpay-webhook.test.ts` (NEW): 4 tests — toggle-disabled (200, no-op), not-configured (`getGatewayConfig` resolves `{}` → 400, `confirmOrderPaid` never called), signature-mismatch (400, never called), confirmed (`confirmOrderPaid` called with `{ provider: "gtpay", eventId: "gtpay:GTX1" }`). Mocks `isPaymentMethodEnabled`, `getGatewayConfig`, `getOrderByGatewayReference`, `confirmOrderPaid`, and `gtpayAdapter` wholesale — no DB.
- `tests/checkout/remita-webhook.test.ts` (NEW): equivalent 4 tests for Remita's `{ rrr, hash }` JSON body shape and `api_key`+`merchant_id` dual-field guard, asserting `confirmOrderPaid` called with `{ provider: "remita", eventId: "remita:RRR1" }` on the happy path.

## Task Commits
1. **Task 1: GTPay + Remita webhook credential migration + new test files** - `259481d`

## Files Created/Modified
- `src/app/api/webhooks/gtpay/route.ts` - notification hash key resolved via `getGatewayConfig("gtpay")`, fail-closed 400 guard added before hash compute
- `src/app/api/webhooks/remita/route.ts` - notification hash fields resolved via `getGatewayConfig("remita")`, fail-closed 400 guard added before hash compute
- `tests/checkout/gtpay-webhook.test.ts` - NEW: toggle-disabled / not-configured / signature-mismatch / confirmed coverage for the GTPay webhook route
- `tests/checkout/remita-webhook.test.ts` - NEW: equivalent coverage for the Remita webhook route

## Decisions Made
See `key-decisions` in frontmatter — both new test files mock the credential/order/confirm boundary wholesale (no DB, no `actual` spread) since these two files have no DB-gated test paths, unlike 08-06's paystack/flutterwave files.

## Deviations from Plan

None - plan executed exactly as written. Source-code changes match the plan's prescribed code verbatim (including the exact error message `"Gateway not configured"`, the resolve-then-guard-then-hash placement after body parsing, and the unchanged toggle-check-first ordering and confirm/oversold-refund logic below the signature block). Both new test files were built from scratch per the plan's `<action>` spec, following the gtpay-callback.test.ts fully-mocked structural template and the paystack-webhook.test.ts webhook-route-specific `makeRequest`/toggle-first pattern, as instructed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification Results
- `npx vitest run tests/checkout/gtpay-webhook.test.ts tests/checkout/remita-webhook.test.ts` — **8/8 passed** (all new).
- `npx vitest run tests/checkout/gtpay-webhook.test.ts -t "not configured"` — 1 passed (3 skipped, unrelated tests).
- `npx vitest run tests/checkout/remita-webhook.test.ts -t "not configured"` — 1 passed (3 skipped, unrelated tests).
- `npx vitest run tests/checkout/gtpay-webhook.test.ts -t "confirmed"` — 1 passed, asserts `confirmOrderPaid` called with `eventId: "gtpay:GTX1"`.
- `npx vitest run tests/checkout/remita-webhook.test.ts -t "confirmed"` — 1 passed, asserts `confirmOrderPaid` called with `eventId: "remita:RRR1"`.
- `grep -c "process.env.GTPAY_HASH_KEY" src/app/api/webhooks/gtpay/route.ts` — `0`.
- `grep -c "process.env.REMITA_API_KEY\|process.env.REMITA_MERCHANT_ID" src/app/api/webhooks/remita/route.ts` — `0`.
- `npx eslint` on all 4 modified/created files — 0 errors, 0 warnings.
- `npx tsc --noEmit` — clean, no errors.
- `npm test` (full suite, Node 22) — **40 files / 393 tests, all green** (~593s wall time; +8 tests vs. the 08-06 baseline of 385, matching this plan's 8 new tests across the 2 new files).

## Threat Flags

None — this plan closes T-08-21 (fail-closed guard for the plain-hash, non-HMAC scheme) and T-08-22 (previously-untested webhook routes) exactly as specified in the plan's `<threat_model>`. No new network surface, auth path, or schema change was introduced.

## Next Phase Readiness
All 8 gateways' webhook/notification credential reads (Stripe via Plan 08-04, the 5 NG-gateway modules via Plan 08-05, Paystack+Flutterwave via Plan 08-06, GTPay+Remita via this plan) are now resolver-backed and fail closed. No further webhook credential-migration plans are outstanding for this phase; no blockers identified.

## Self-Check: PASSED
- `src/app/api/webhooks/gtpay/route.ts` — FOUND
- `src/app/api/webhooks/remita/route.ts` — FOUND
- `tests/checkout/gtpay-webhook.test.ts` — FOUND
- `tests/checkout/remita-webhook.test.ts` — FOUND
- Commit `259481d` — FOUND in `git log`
