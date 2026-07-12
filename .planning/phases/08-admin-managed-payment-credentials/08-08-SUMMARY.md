---
phase: 08-admin-managed-payment-credentials
plan: 08
subsystem: payments
tags: [stripe, webhooks, resolver-migration, fail-closed, ADMN-07]
provides:
  - Stripe webhook route resolves webhook_secret via getGatewayConfig("stripe"), fails closed (400) before any constructEvent attempt if empty
affects: [stripe-webhook, admin-settings]
tech-stack:
  added: []
  patterns: ["resolve-then-guard-empty-then-verify for webhook signing secrets (matches 08-06/08-07)", "mock getGatewayConfig (the public function) directly instead of the internally self-referenced getGatewayCredentialsMap export"]
key-files:
  created: []
  modified:
    - src/app/api/webhooks/stripe/route.ts
    - tests/checkout/webhook.test.ts
key-decisions:
  - "Mocked getGatewayConfig directly in webhook.test.ts (not getGatewayCredentialsMap via spread), per the 08-06 same-module self-reference caveat: getGatewayConfig's internal call to getGatewayCredentialsMap resolves against the module's own binding, not a re-exported override, so spreading `actual` and overriding only getGatewayCredentialsMap silently fails to intercept it. The mock reimplements the env-fallback half of the real resolver for the stripe provider only, keyed off process.env.STRIPE_WEBHOOK_SECRET per test."
  - "The 'not configured' test deletes/restores process.env.STRIPE_WEBHOOK_SECRET per-test rather than relying on afterEach's vi.clearAllMocks (which doesn't touch process.env), keeping the mutation local and explicit to avoid leaking an unset secret into later tests in the same file."
duration: ~25min
completed: 2026-07-12
---

# Phase 8 Plan 08: Stripe Webhook Signing-Secret Fail-Closed Migration Summary

**Stripe webhook route now resolves its `webhook_secret` via the Phase 8 resolver (DB-first, env-fallback) and rejects with 400 "Gateway not configured" BEFORE calling `constructEvent` if it resolves empty — completing ADMN-07's resolver-backed, fail-closed coverage across all 6 webhook routes (this was the last one, sequenced after 08-04's async `getStripe()` migration).**

## Performance
- **Duration:** ~25 min
- **Tasks:** 1/1 completed
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments
- `src/app/api/webhooks/stripe/route.ts`: added `import { getGatewayConfig } from "@/lib/payments/gateway-credentials"`. Inserted the fail-closed guard between `const stripeClient = await getStripe()` and the `constructEvent` try block: `const { webhook_secret: webhookSecret } = await getGatewayConfig("stripe")`, then `if (!webhookSecret) return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })`. `constructEvent` now uses `webhookSecret` instead of `process.env.STRIPE_WEBHOOK_SECRET!`. Everything downstream (order lookup, `confirmOrderPaid`, oversold-refund via `stripeClient.refunds.create`) is unchanged.
- `tests/checkout/webhook.test.ts`: the existing `getStripe` mock was already async-shaped from Plan 08-04 (no change needed there). Added a `vi.mock("@/lib/payments/gateway-credentials", ...)` that spreads `actual` and replaces `getGatewayConfig` with a `vi.fn()` reimplementing the env-fallback lookup for `stripe`/`webhook_secret`, keyed off `process.env.STRIPE_WEBHOOK_SECRET`. Added one new test, `"returns 400 when webhook_secret resolves empty (not configured)"`, which deletes the env var, POSTs, asserts 400 + `constructEvent` never called, then restores the env var for subsequent tests.

## Task Commits
1. **Task 1: Stripe webhook_secret resolver migration + fail-closed test** - `361c9d6`

## Files Created/Modified
- `src/app/api/webhooks/stripe/route.ts` - signing secret resolved via `getGatewayConfig("stripe")`, fail-closed 400 guard added before `constructEvent`
- `tests/checkout/webhook.test.ts` - `getGatewayConfig` mock (direct function override, not `getGatewayCredentialsMap` spread) + "not configured" test

## Decisions & Deviations

None — plan executed as written. One clarification worth noting: the plan's `<action>` text described the mock via `getGatewayCredentialsMap` spread-override in one place, but its own critical caveat (and the 08-06 precedent linked from the orchestrator's environment notes) makes clear the public `getGatewayConfig` function must be mocked directly for the override to actually take effect, since `getGatewayConfig`'s internal call to `getGatewayCredentialsMap` binds to the module's own internal reference, not the re-exported mock object. Followed the caveat (and 08-06 SUMMARY's documented pattern), not the literal snippet — this is the correct, working shape (verified: the "not configured" test passes and correctly short-circuits before `constructEvent`).

## Verification Results
- `npx vitest run tests/checkout/webhook.test.ts` — **7/7 passed** (6 pre-existing + 1 new "not configured" case).
- `npx vitest run tests/checkout/webhook.test.ts -t "not configured"` — 1 passed, 6 skipped.
- Greps: `process.env.STRIPE_WEBHOOK_SECRET` × 0 in `route.ts`; `getGatewayConfig("stripe")` × 1 in `route.ts`.
- `npx eslint src/app/api/webhooks/stripe/route.ts tests/checkout/webhook.test.ts` — 0 errors; 1 pre-existing warning (unused `db` import, predates this plan — confirmed via `git diff HEAD`, out of scope per Scope Boundary rule).
- `npx tsc --noEmit` — clean, no errors.
- `npm test` (full suite, Node 22) — **40 files / 394 tests, all green** (~590s wall time; +1 test vs. the 08-07 baseline, matching this plan's 1 new "not configured" case).
- `npx next build --webpack` — clean (only the known `@next/swc-darwin-arm64` dlopen warnings from the environment's Turbopack-native-bindings limitation, per CLAUDE.md; build succeeded, all routes generated).

## Threat Flags

None — this plan closes T-08-23 (Stripe webhook signature fail-closed guard) exactly as specified in the plan's `<threat_model>`. T-08-24 (shared `stripeClient`/config reuse) was accepted-risk per the plan, no code change needed. No new network surface, auth path, or schema change introduced.

## Next Phase Readiness
All 6 webhook routes in the application (Stripe, Paystack, Flutterwave, GTPay, Remita, and the Interswitch/GTPay per-call resolved configs from 08-05) are now resolver-backed with fail-closed guards on their signing secrets. ADMN-07's webhook-layer success criterion is fully satisfied. No blockers identified for subsequent phase-8 plans (if any remain, they would be UI/settings-page work rather than further credential-resolution migrations).

## Self-Check: PASSED
- `src/app/api/webhooks/stripe/route.ts` — FOUND
- `tests/checkout/webhook.test.ts` — FOUND
- Commit `361c9d6` — FOUND in `git log`
