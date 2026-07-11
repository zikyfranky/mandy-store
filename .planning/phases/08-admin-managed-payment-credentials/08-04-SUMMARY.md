---
phase: 08-admin-managed-payment-credentials
plan: 04
subsystem: payments
tags: [stripe, resolver-migration, async-refactor, ADMN-07]
provides:
  - hasEnvAndCredentials(method) resolver-backed for all 8 payment methods (via getGatewayConfig)
  - getStripe() async, DB-first/env-fallback resolver-backed, lazy singleton preserved
  - checkout.ts and the Stripe webhook route migrated to `await getStripe()`
affects: [checkout, stripe-webhook, admin-settings]
tech-stack:
  added: []
  patterns: ["async credential resolver call at the front of a payment-gate check", "lazy async singleton (replaces sync Proxy singleton)"]
key-files:
  created: []
  modified:
    - src/lib/payments/config.ts
    - src/lib/payments/stripe.ts
    - src/lib/actions/checkout.ts
    - src/app/api/webhooks/stripe/route.ts
    - tests/payments/config.test.ts
    - tests/checkout/actions.test.ts
    - tests/checkout/paystack-actions.test.ts
    - tests/checkout/flutterwave-actions.test.ts
    - tests/checkout/interswitch-actions.test.ts
    - tests/checkout/remita-actions.test.ts
    - tests/checkout/webhook.test.ts
key-decisions:
  - "getStripe() keeps its lazy-singleton caching shape; once resolved, a running server process will not pick up a credential change until restart (matches existing D-04 single-active-keyset scope)"
  - "ENABLE_<GATEWAY> feature flags stay direct process.env reads in every hasEnvAndCredentials case — D-03/D-03a scope is credential VALUES only"
  - "Stripe webhook-secret (STRIPE_WEBHOOK_SECRET) resolver migration intentionally left untouched — that's Plan 08-08's scope, sequenced after this plan"
duration: ~35min
completed: 2026-07-11
---

# Phase 8 Plan 04: Stripe/config Resolver Migration + Async Call-Site Fix Summary

**Migrated `hasEnvAndCredentials`/`getStripe()` off direct `process.env` reads onto the Phase 8 DB-first/env-fallback resolver, and fixed the resulting async-Stripe-client call sites in checkout and the Stripe webhook route.**

## Performance
- **Duration:** ~35 min (mostly test-suite wall time; both tasks' code changes were already staged in the working tree when this run started)
- **Tasks:** 2/2 completed
- **Files modified:** 11 (4 source, 7 test)

## Accomplishments
- `src/lib/payments/config.ts`: `hasEnvAndCredentials` converted to `async`, all 8 gateway cases (`stripe`, `paypal`, `bank_transfer`, `paystack`, `flutterwave`, `interswitch`, `gtpay`, `remita`) now call `await getGatewayConfig(method)` for credential-value checks instead of raw `process.env.X` reads. `ENABLE_<GATEWAY>` flags remain direct env reads (unchanged scope). `isPaymentMethodEnabled` awaits the now-async call.
- `src/lib/payments/stripe.ts`: `getStripe()` is now `async`, resolves `secret_key` via `await getGatewayConfig("stripe")`, keeps the lazy-singleton cache. The old synchronous `stripe` Proxy export was removed entirely (a Proxy cannot transparently unwrap an async getter).
- `src/lib/actions/checkout.ts`: `createStripePaymentIntent`'s single `stripe.paymentIntents.create(...)` call site replaced with `const stripeClient = await getStripe(); ... stripeClient.paymentIntents.create(...)`. Import updated from `{ stripe }` to `{ getStripe }`.
- `src/app/api/webhooks/stripe/route.ts`: both call sites (`constructEvent`, `refunds.create`) now go through a per-request `const stripeClient = await getStripe()`. `process.env.STRIPE_WEBHOOK_SECRET!` deliberately left untouched (Plan 08-08's scope).
- Updated mocks in `tests/payments/config.test.ts` and all five checkout Server Action test files (`actions`, `paystack-actions`, `flutterwave-actions`, `interswitch-actions`, `remita-actions`) to stub `getGatewayCredentialsMap` (via `importOriginal` partial mock) so `isPaymentMethodEnabled`'s new resolver dependency falls through to the genuine env-fallback path rather than hitting a real DB call.
- Updated `tests/checkout/actions.test.ts`'s Stripe mock to the new `getStripe: vi.fn().mockResolvedValue({...})` async shape.

## Task Commits
1. **Task 1: config.ts — hasEnvAndCredentials resolver-backed for all 8 methods** - `aecd418` (committed in a prior session run of this plan; verified present and its acceptance criteria/tests still pass in this run)
2. **Task 2: stripe.ts async migration + checkout.ts/webhook call-site fix** - `67eec35`

## Files Created/Modified
- `src/lib/payments/config.ts` - `hasEnvAndCredentials` resolver-backed for all 8 gateways (async)
- `src/lib/payments/stripe.ts` - `getStripe()` async, resolver-backed, lazy singleton; sync Proxy removed
- `src/lib/actions/checkout.ts` - `createStripePaymentIntent` awaits `getStripe()` before creating the PaymentIntent
- `src/app/api/webhooks/stripe/route.ts` - webhook POST handler awaits `getStripe()` once per request, used for both `constructEvent` and the oversold-refund `refunds.create`
- `tests/payments/config.test.ts` - added `getGatewayCredentialsMap` partial mock (Task 1, pre-existing commit)
- `tests/checkout/actions.test.ts` - `getStripe` async mock + `getGatewayCredentialsMap` partial mock
- `tests/checkout/paystack-actions.test.ts`, `tests/checkout/flutterwave-actions.test.ts`, `tests/checkout/interswitch-actions.test.ts`, `tests/checkout/remita-actions.test.ts` - added `getGatewayCredentialsMap` partial mock (each action under test calls `isPaymentMethodEnabled` first, now resolver-backed)
- `tests/checkout/webhook.test.ts` - **not in the plan's file list**, but directly broken by the `stripe.ts` call-site migration (see Deviations below); updated its `@/lib/payments/stripe` mock to the async `getStripe` shape

## Decisions & Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/checkout/webhook.test.ts` mock not updated for async `getStripe()`**
- **Found during:** Task 2 full-suite verification (`npm test`)
- **Issue:** The plan's `files_modified` list for this plan did not include `tests/checkout/webhook.test.ts`, but that file directly exercises the real `POST` handler in `src/app/api/webhooks/stripe/route.ts` with a top-level `vi.mock("@/lib/payments/stripe", () => ({ stripe: {...} }))`. Once the route's call site changed to `const stripeClient = await getStripe()`, that old mock shape (no `getStripe` export) caused all 4 webhook tests exercising the real handler to fail with "No `getStripe` export is defined on the `@/lib/payments/stripe` mock."
- **Fix:** Updated the mock to `getStripe: vi.fn().mockResolvedValue({ webhooks: {...}, refunds: {...} })`, matching the same async-mock convention used in `tests/checkout/actions.test.ts`.
- **Files modified:** `tests/checkout/webhook.test.ts`
- **Commit:** `67eec35`

No other deviations — both tasks' source-code changes match the plan's prescribed code verbatim (verified via diff against the plan's `<action>` blocks before committing).

## Verification Results
- `npx vitest run tests/payments/config.test.ts` — 38 passed (Task 1 regression suite; resolver-backed for all 8 methods).
- `npx vitest run tests/checkout/actions.test.ts tests/checkout/paystack-actions.test.ts tests/checkout/flutterwave-actions.test.ts tests/checkout/interswitch-actions.test.ts tests/checkout/remita-actions.test.ts` — 42 passed.
- `npx vitest run tests/checkout/webhook.test.ts` — 6 passed (after the Rule 1 fix above).
- `npm test` (full suite, Node 22) — **38 files / 383 tests, all green.**
- `npx next build --webpack` — compiled successfully, TypeScript check passed, all 35 routes generated (including `/api/webhooks/stripe` and `/checkout`). The `@next/swc-darwin-arm64` dlopen warning is the pre-existing, documented native-binding issue on this machine (CLAUDE.md build-commands note) — build still completes via WASM fallback, exit 0.
- Acceptance-criteria greps (all matched plan's expected counts): `await getGatewayConfig` × 8 in `config.ts`; `process.env.ENABLE_` × 8 in `config.ts`; `getGatewayCredentialsMap: vi.fn` × 1 in `config.test.ts`; `export async function getStripe` × 1 and Proxy export × 0 in `stripe.ts`; `await getStripe()` present in both `checkout.ts` and the webhook route; `process.env.STRIPE_WEBHOOK_SECRET` unchanged at × 1 in the webhook route (confirming Task 2 did not encroach on Plan 08-08's scope).

## Next Phase Readiness
`isPaymentMethodEnabled` is now resolver-backed for all 8 gateways and `getStripe()` sources its key from the same DB-first/env-fallback path — Plan 08-05 (the remaining gateway modules: Paystack/Flutterwave/Remita/Interswitch/GTPay) and Plan 08-06/08-08 (webhook signing-secret migrations) can now build on a consistent async-resolver convention across every payment call site. No blockers identified for subsequent Wave 3/4 plans.

## Self-Check: PASSED
All files listed above confirmed present on disk; both task commits (`aecd418`, `67eec35`) confirmed present in `git log`.
