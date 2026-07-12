---
phase: 9
slug: admin-customer-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 09-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (node env, `fileParallelism:false`, 30s timeout) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/admin/customers.test.ts tests/actions/admin-customers.test.ts` |
| **Full suite command** | `npm test` (set `TEST_DATABASE_URL` to a separate Neon branch first so DB-gated tests run) |
| **Estimated runtime** | ~9–11 min full suite (DB-gated integration against Neon); quick run ~seconds |

**Env note:** shell defaults to Node 18 which breaks vitest — run `nvm use 22` (or 20) before any test/build. `[BLOCKING]` `users.createdAt` push (D-01) must hit BOTH `DATABASE_URL` and `TEST_DATABASE_URL` or DB-gated tests fail on the test branch.

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/admin/customers.test.ts tests/actions/admin-customers.test.ts`
- **After every plan wave:** `npm test` (with `TEST_DATABASE_URL` set)
- **Before `/gsd-verify-work`:** full suite green + `npx next build --webpack`
- **Max feedback latency:** ~15s for the quick run

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| ADMN-08 | `listCustomersForAdmin` returns minimal DTO — no `passwordHash`/token keys | unit (assert keys) | quick | ❌ W0 | ⬜ pending |
| ADMN-08 | Search `ilike` matches email OR name; pagination limit/offset + total/pageCount correct | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-08 | Order count = COUNT(orders.userId); guest orders (userId NULL) excluded | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | Reset token issued with `pwreset_` prefix + ~1h expiry; token NOT in action return | unit + integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | `resetPassword` round-trip: valid token → argon2 hash updated → token deleted (single-use) | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | Expired token rejected + deleted; bare-UUID (non-`pwreset_`) token rejected | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | Re-issuing reset deletes prior `pwreset_` token(s) for the email (only latest live) | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | (hardening) `resetPassword` deletes `sessions` rows for the user | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-09 | Resend unset → action still returns `{success}` (email seam mocked/null) | unit | quick | ❌ W0 | ⬜ pending |
| ADMN-10 | Promote customer→admin persists `role='admin'` | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-10 | Self role change rejected (`userId === session.user.id`) | unit | quick | ❌ W0 | ⬜ pending |
| ADMN-10 | Last-admin demote rejected (only 1 admin → role unchanged); atomic conditional UPDATE | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-10 | Demote succeeds when ≥2 admins remain | integration | quick | ❌ W0 | ⬜ pending |
| ADMN-10 | `newRole` outside `{customer,admin}` rejected by zod | unit | quick | ❌ W0 | ⬜ pending |
| ADMN-08/09/10 | Non-admin caller → `verifyAdminSession` redirect thrown (guard is first statement) | unit (mock throws) | quick | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/admin/customers.test.ts` — ADMN-08 (DTO no-PII, ilike search, pagination, order count)
- [ ] `tests/actions/admin-customers.test.ts` — ADMN-09 (reset token round-trip, single-use, expiry, prefix, session revocation, Resend-null) + ADMN-10 (promote/demote, self-guard, last-admin, zod, admin-gate)
- [ ] `[BLOCKING]` push `users.createdAt` (D-01) to BOTH `DATABASE_URL` and `TEST_DATABASE_URL`
- [ ] `TEST_DATABASE_URL` set to a separate Neon branch (CLAUDE.md) so DB-gated tests run
- [ ] Mock `@/lib/email/send-password-reset` (mirror `verify-email.test.ts`) and `@/lib/dal` `verifyAdminSession` in action tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Resend reset email deliverability + `/reset-password` click-through | ADMN-09 | Needs live `RESEND_API_KEY` + inbox | Trigger reset from `/admin/customers`, open emailed link, set new password, log in with it |
| Visual `/admin/customers` list, confirm dialog, disabled self-row toggle | ADMN-08/10 | Browser visual/interaction | Load list, exercise search/pagination, attempt self role toggle (disabled), promote/demote a test customer |

*Mirrors the 05/08 go-live human-verify posture — not automatable in CI.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (quick run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
