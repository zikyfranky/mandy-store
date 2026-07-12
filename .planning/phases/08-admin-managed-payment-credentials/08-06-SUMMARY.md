---
phase: 08-admin-managed-payment-credentials
plan: 06
subsystem: payments
tags: [paystack, flutterwave, webhooks, resolver-migration, fail-closed, ADMN-07]
provides:
  - Paystack webhook route resolves secret_key via getGatewayConfig("paystack"), fails closed (400) before any HMAC compute if empty
  - Flutterwave webhook route resolves webhook_hash via getGatewayConfig("flutterwave"), fails closed (400) before any HMAC compute if empty
affects: [ng-gateway-webhooks, admin-settings]
tech-stack:
  added: []
  patterns: ["resolve-then-guard-empty-then-verify for webhook signing secrets", "mock getGatewayConfig (the public function) directly instead of the internally self-referenced getGatewayCredentialsMap export"]
key-files:
  created: []
  modified:
    - src/app/api/webhooks/paystack/route.ts
    - src/app/api/webhooks/flutterwave/route.ts
    - tests/checkout/paystack-webhook.test.ts
    - tests/checkout/flutterwave-webhook.test.ts
key-decisions:
  - "Paystack's fail-closed guard is defense-in-depth, not independently reachable via env vars alone: secret_key gates BOTH isPaymentMethodEnabled's toggle check (config.ts) AND the route's own signing-secret resolution, since Paystack has no separate webhook secret field (08-RESEARCH.md interface note). The new 'not configured' test for Paystack is naturally satisfied by the pre-existing toggle-disabled short-circuit — both prove the property under test (400, no HMAC compute attempted)."
  - "Flutterwave's guard IS independently reachable and directly tested: webhook_hash is a DEDICATED field distinct from secret_key, so a state exists where the toggle check passes (secret_key present) but the route's own getGatewayConfig('flutterwave') call must independently reject on a missing webhook_hash before any HMAC compute."
  - "Test mock strategy: mocked getGatewayConfig itself (the public function both isPaymentMethodEnabled and the webhook routes import), NOT getGatewayCredentialsMap. Per the 08-05 deviation and this plan's explicit caveat, spreading `actual` and overriding only getGatewayCredentialsMap does not intercept getGatewayConfig's internal same-module self-reference call — mocking the public function every external caller imports properly intercepts both call sites and avoids any real DB round trip, while leaving these DB-gated test files' real `db` usage (seedCatalog/seedVariant/seedOrder, truncate helpers) completely untouched."
duration: ~35min
completed: 2026-07-12
---

# Phase 8 Plan 06: Webhook Signing-Secret Fail-Closed Migration (Paystack + Flutterwave) Summary

**Both Paystack and Flutterwave webhook routes now resolve their HMAC signing secret via the Phase 8 resolver (DB-first, env-fallback) and reject with 400 "Gateway not configured" BEFORE any HMAC compute if it resolves empty — closing the highest-stakes credential read in the phase.**

## Performance
- **Duration:** ~35 min
- **Tasks:** 1/1 completed
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments
- `src/app/api/webhooks/paystack/route.ts`: added `import { getGatewayConfig } from "@/lib/payments/gateway-credentials"`; the signature block now does `const { secret_key: secretKey } = await getGatewayConfig("paystack")`, guards `if (!secretKey) return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })` immediately after, then uses `secretKey` (not `process.env.PAYSTACK_SECRET_KEY!`) in `crypto.createHmac`. Toggle check (`isPaymentMethodEnabled`) remains the literal first statement, unchanged.
- `src/app/api/webhooks/flutterwave/route.ts`: same shape — `const { webhook_hash: secretHash } = await getGatewayConfig("flutterwave")`, guarded identically before the dual-scheme (HMAC + legacy plaintext) signature check. Everything downstream (event parsing, order lookup, `confirmOrderPaid`, oversold-refund) is byte-for-byte unchanged.
- Both routes' inline step-comments renumbered (1-6) to keep the "resolve → guard → verify → parse → lookup → confirm" sequence self-documenting; header security-contract comments updated to describe the resolver-backed, fail-closed guard.
- `tests/checkout/paystack-webhook.test.ts` / `tests/checkout/flutterwave-webhook.test.ts`: added a `vi.mock("@/lib/payments/gateway-credentials", ...)` that spreads `actual` but replaces `getGatewayConfig` with a `vi.fn()` reimplementing the env-fallback half of the real resolver (DB always empty) — see Key Decisions for why this shape (not the `getGatewayCredentialsMap`-override shape) is required. One new "not configured" `it(...)` added per file.

## Task Commits
1. **Task 1: Paystack + Flutterwave webhook signing-secret migration** - `601a1f3`

## Files Created/Modified
- `src/app/api/webhooks/paystack/route.ts` - signing secret resolved via `getGatewayConfig("paystack")`, fail-closed 400 guard added
- `src/app/api/webhooks/flutterwave/route.ts` - signing secret resolved via `getGatewayConfig("flutterwave")`, fail-closed 400 guard added
- `tests/checkout/paystack-webhook.test.ts` - `getGatewayConfig` mock + "not configured" test (naturally exercises the pre-existing toggle short-circuit, see Key Decisions)
- `tests/checkout/flutterwave-webhook.test.ts` - `getGatewayConfig` mock + "not configured" test (independently exercises the new guard, since `webhook_hash` diverges from `secret_key`)

## Decisions & Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] Naive global `@/lib/db/client` mock broke DB-gated seed/query helpers**
- **Found during:** Task 1 first verification run (`npx vitest run tests/checkout/paystack-webhook.test.ts tests/checkout/flutterwave-webhook.test.ts`)
- **Issue:** Initial attempt mirrored `tests/payments/gateways.test.ts`'s `vi.mock("@/lib/db/client", () => ({ db: { select: () => ({ from: () => Promise.resolve([]) }) } }))` pattern. That file has zero real DB usage, so a full `db` replacement is safe there. These two webhook test files are DB-gated (`hasDatabase`), and their DB-gated tests call `db.insert`, `db.query.orders.findFirst`, and `truncateOrderTables`/`truncateCatalogTables` on the SAME `db` import — the naive mock replaced the whole client with an object exposing only `select`, breaking every DB-gated test with `TypeError: db.insert is not a function` / `db.delete is not a function`.
- **Fix:** Replaced the db-client mock with a `vi.mock("@/lib/payments/gateway-credentials", ...)` that spreads `actual` and replaces only `getGatewayConfig` (the public function both `isPaymentMethodEnabled` and the webhook routes call) with a `vi.fn()` that reimplements env-fallback lookups from `FIELD_MANIFEST`, keeping `db` completely untouched. Verified all 17 tests (15 existing + 2 new) pass, including the previously-broken DB-gated happy-path/idempotency/oversold/order-not-found cases.
- **Files modified:** `tests/checkout/paystack-webhook.test.ts`, `tests/checkout/flutterwave-webhook.test.ts`
- **Commit:** `601a1f3`

**2. [Rule 1 - Bug] Header-comment duplication tripped the acceptance-criteria grep count**
- **Found during:** Running the plan's acceptance-criteria greps after initial implementation
- **Issue:** The first draft of each route's updated header comment quoted the literal string `"Gateway not configured"` in addition to the actual code line, making `grep -c "Gateway not configured" <file>` return `2` instead of the plan's required `1`.
- **Fix:** Reworded both header comments to describe the guard ("fails closed (400, empty-config guard)") without repeating the exact error string, leaving exactly one literal occurrence (the code line) in each file.
- **Files modified:** `src/app/api/webhooks/paystack/route.ts`, `src/app/api/webhooks/flutterwave/route.ts`
- **Commit:** `601a1f3`

### Notes (not deviations, documented for clarity)

- The Paystack "not configured" test cannot independently isolate the route's own new guard from `isPaymentMethodEnabled`'s pre-existing toggle short-circuit, because both read the identical `secret_key` field (Paystack has no separate webhook secret — confirmed in this plan's own `<interfaces>` section). The test still validates the required behavior stated in the plan's `<behavior>` block verbatim ("POSTing any body+signature... returns 400 with an error body — the route must NOT attempt `crypto.createHmac` with an empty key"), just via the toggle path rather than the route's own guard line. The Flutterwave test, by contrast, genuinely isolates and exercises the new guard (toggle passes on `secret_key`, guard fires on absent `webhook_hash`), and asserts the exact `"Gateway not configured"` error message.

No other deviations — both routes' source-code changes match the plan's prescribed code exactly (byte-for-byte, including the unchanged toggle-check-first ordering and the unmodified confirm/oversold-refund logic below the signature block).

## Verification Results
- `npx vitest run tests/checkout/paystack-webhook.test.ts tests/checkout/flutterwave-webhook.test.ts` — **17/17 passed** (15 pre-existing + 2 new "not configured" cases), ~61s (DB-gated tests hit the real isolated `TEST_DATABASE_URL` branch).
- `npx vitest run tests/checkout/paystack-webhook.test.ts -t "not configured"` — 1 passed (7 skipped, unrelated tests).
- `npx vitest run tests/checkout/flutterwave-webhook.test.ts -t "not configured"` — 1 passed (8 skipped, unrelated tests).
- Greps: `process.env.PAYSTACK_SECRET_KEY` × 0 in `paystack/route.ts`; `process.env.FLUTTERWAVE_WEBHOOK_HASH` × 0 in `flutterwave/route.ts`; `"Gateway not configured"` × 1 in each file.
- `npm test` (full suite, Node 22) — **38 files / 385 tests, all green** (~594s wall time; +2 tests vs. the 08-05 baseline of 383, matching this plan's 2 new "not configured" cases).
- `npx eslint` on all 4 modified files — 0 errors; 2 pre-existing warnings (unused `paystackEnabled` param, unused eslint-disable directive) both predate this plan and are out of scope (Scope Boundary rule).
- `npx tsc --noEmit` — clean, no errors.

## Threat Flags

None — this plan closes T-08-19 (the fail-closed webhook signature guard) and T-08-20 (toggle-check-first ordering, unchanged) exactly as specified in the plan's `<threat_model>`. No new network surface, auth path, or schema change was introduced.

## Next Phase Readiness
Paystack and Flutterwave webhooks now match Stripe's (Plan 08-04) and the 5 NG-gateway modules' (Plan 08-05) resolver-backed convention. The remaining webhook signing-secret migrations noted in 08-05's "Next Phase Readiness" (GTPay/Remita — plain-hash scheme, likely Plan 08-08) can follow this exact resolve-then-guard-then-verify shape. No blockers identified.

## Self-Check: PASSED
- `src/app/api/webhooks/paystack/route.ts` — FOUND
- `src/app/api/webhooks/flutterwave/route.ts` — FOUND
- `tests/checkout/paystack-webhook.test.ts` — FOUND
- `tests/checkout/flutterwave-webhook.test.ts` — FOUND
- Commit `601a1f3` — FOUND in `git log`
