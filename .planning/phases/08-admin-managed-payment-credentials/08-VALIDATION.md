---
phase: 8
slug: admin-managed-payment-credentials
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-11
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 08-RESEARCH.md §Validation Architecture + §Security Domain.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 [VERIFIED: package.json] |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/payments/crypto.test.ts tests/payments/gateway-credentials.test.ts tests/actions/gateway-credentials.test.ts` |
| **Full suite command** | `npm test` (DB integration tests skip unless `TEST_DATABASE_URL` is set, per CLAUDE.md) |
| **Estimated runtime** | ~30–60 seconds (unit); +Neon cold-start for DB-gated |

---

## Sampling Rate

- **After every task commit:** Run the quick command above.
- **After every plan wave:** Run `npm test` (confirms no regression in `config.test.ts`, `gateways.test.ts`, `confirm-order-paid.test.ts`, all `*-webhook.test.ts`).
- **Before `/gsd-verify-work`:** Full suite green; if `TEST_DATABASE_URL` set, also run the DB-gated env-only-regression test with an EMPTY `gateway_credentials` table (proves D-09 "safe to ship pre-migration").
- **Max feedback latency:** ~60 seconds (unit path).

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| ADMN-06 | `encrypt`/`decrypt` round-trip returns original plaintext | unit | `npx vitest run tests/payments/crypto.test.ts -t "round-trip"` | ❌ W0 | ⬜ pending |
| ADMN-06 | `decrypt` throws on wrong-length/missing `CREDENTIALS_ENCRYPTION_KEY` (fail-loud, D-07) | unit | `npx vitest run tests/payments/crypto.test.ts -t "invalid key"` | ❌ W0 | ⬜ pending |
| ADMN-06 | `decrypt` throws on tampered ciphertext/authTag (GCM integrity) | unit | `npx vitest run tests/payments/crypto.test.ts -t "tamper"` | ❌ W0 | ⬜ pending |
| ADMN-06 | Stored `value` for `is_secret` field is never raw plaintext (envelope prefix `v1:`) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "encrypts"` | ❌ W0 | ⬜ pending |
| ADMN-07 | `getGatewayConfig` returns DB value when non-empty DB row exists (DB wins) | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "DB-first"` | ❌ W0 | ⬜ pending |
| ADMN-07 | `getGatewayConfig` falls back to `process.env` when no DB row | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "env fallback"` | ❌ W0 | ⬜ pending |
| ADMN-07 | `getGatewayConfig` omits field (fail-closed) when DB+env both empty | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "fail-closed"` | ❌ W0 | ⬜ pending |
| ADMN-07 | Empty-string DB row treated as absent, not a DB hit (Pitfall 3) | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "empty string"` | ❌ W0 | ⬜ pending |
| ADMN-07 | Existing 8-gateway `config.test.ts` still passes post-migration (regression) | unit | `npx vitest run tests/payments/config.test.ts` | ✅ existing | ⬜ pending |
| ADMN-07 | Webhook route fails closed (reject) when resolved signing secret empty (hot path) | unit/integ | `npx vitest run tests/checkout/*-webhook.test.ts -t "not configured"` | ❌ W0 | ⬜ pending |
| ADMN-05 | `saveGatewayCredentials` persists new field, admin-gated (rejects non-admin) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "admin-gated"` | ❌ W0 | ⬜ pending |
| ADMN-05 | Empty submit leaves existing field unchanged (no blank overwrite, D-04) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "empty submit"` | ❌ W0 | ⬜ pending |
| ADMN-05/07 | Env-only regression: EMPTY `gateway_credentials` ⇒ all 8 gateways behave as pre-Phase-8 | integration (DB-gated) | `TEST_DATABASE_URL=… npx vitest run tests/payments/gateway-credentials-integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/payments/crypto.test.ts` — round-trip, invalid-key throw, tamper-detection throw (ADMN-06)
- [ ] `tests/payments/gateway-credentials.test.ts` — DB-first / env-fallback / fail-closed / empty-string branches for `getGatewayConfig` (ADMN-07); mirror `tests/payments/config.test.ts` mock style (`vi.mock` db client, mock `getGatewayCredentialsMap`)
- [ ] `tests/actions/gateway-credentials.test.ts` — `saveGatewayCredentials` admin-gate, Zod allowlist, empty-submit-preserves, encrypt-before-persist (ADMN-05/06); mirror `tests/admin/settings.test.ts` (`vi.hoisted` db chain mock, `vi.mock("@/lib/dal")`)
- [ ] Extend `tests/checkout/webhook.test.ts`, `paystack-webhook.test.ts`, `flutterwave-webhook.test.ts` (+ new gtpay/remita webhook tests if absent) with "resolved secret empty → fail closed" case (ADMN-07 hot path)
- [ ] `src/scripts/apply-gateway-credentials-schema.mjs` + `-to-test-db.mjs` — Wave 0 prerequisite for DB-gated tests (mirrors `apply-store-settings-schema*.mjs`; direct-SQL `@neondatabase/serverless` fallback for the drizzle-kit TTY issue)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin enters/replaces a gateway secret in `/admin/settings` and it persists without redeploy | ADMN-05 | Requires a live admin session + browser | Log in as admin, open Settings, enter a Paystack test secret key, save, reload — field shows "Configured ••••" not the value |
| Secret value never appears in client bundle/props | ADMN-06 | Requires inspecting network/DOM payload | In DevTools, inspect the Settings page HTML + RSC payload — assert no `sk_`/secret substring present |
| Test-connection button reports pass/fail for Stripe/Paystack/Flutterwave test keys | ADMN-05 | Needs real gateway sandbox creds | Enter valid then invalid test key; button reports success then failure without persisting on failure |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 complete)

**Approval:** pending
