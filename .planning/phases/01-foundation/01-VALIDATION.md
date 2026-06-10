---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 01-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (not yet installed — Wave 0 installs) + Playwright for e2e smoke |
| **Config file** | none — Wave 0 creates `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/auth/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (unit/integration); Playwright smoke separate |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/auth/` (fast subset)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + manual/Playwright proxy redirect smoke test
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | AUTH-01 | — | Register with email+password creates user | integration | `npx vitest run tests/auth/register.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-01 | — | Registration rejects duplicate email | integration | `npx vitest run tests/auth/register.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-01 | — | Registration rejects duplicate username | integration | `npx vitest run tests/auth/register.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-01 | — | Unverified email blocks login | integration | `npx vitest run tests/auth/verify-email.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-02 | — | Login accepts email OR username | integration | `npx vitest run tests/auth/login.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-02 | — | Session persists (DB row exists after login) | integration | `npx vitest run tests/auth/session.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-02 | — | Wrong password returns auth failure | integration | `npx vitest run tests/auth/login.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | AUTH-03 | — | Logout clears session cookie + DB row | integration | `npx vitest run tests/auth/logout.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 | T-route | /admin/* redirects unauthenticated user | smoke | `npx playwright test tests/e2e/proxy.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 | T-route | /admin/* redirects non-admin user | smoke | `npx playwright test tests/e2e/proxy.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 | T-route | verifySession() throws for unauth in action | unit | `npx vitest run tests/lib/dal.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC5 | — | order_status enum has all 8 values | unit | `npx vitest run tests/db/schema.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC5 | — | processed_webhook_events unique on event id | integration | `npx vitest run tests/db/schema.test.ts` | ❌ W0 | ⬜ pending |

*Task IDs to be assigned by the planner. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react` (+ Playwright for e2e)
- [ ] `tests/helpers/db.ts` — test DB setup/teardown utilities
- [ ] `tests/auth/register.test.ts` — stubs for AUTH-01
- [ ] `tests/auth/login.test.ts` — stubs for AUTH-02
- [ ] `tests/auth/session.test.ts` — stubs for AUTH-02 DB session persistence
- [ ] `tests/auth/verify-email.test.ts` — stubs for AUTH-01 email gate
- [ ] `tests/auth/logout.test.ts` — stubs for AUTH-03
- [ ] `tests/lib/dal.test.ts` — stubs for verifySession() / verifyAdminSession()
- [ ] `tests/db/schema.test.ts` — stubs for order_status enum + unique constraint
- [ ] `tests/e2e/proxy.spec.ts` — Playwright proxy redirect smoke

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real verification email arrives via Resend | AUTH-01 | Requires live Resend key + inbox | Register a real address, confirm email received, click link, confirm login unblocks |
| Session sliding expiry (`updateAge`) behavior | AUTH-02 | Auth.js DB-strategy `updateAge` not fully documented; needs observation | Log in, observe session row `expires` updates on activity near refresh threshold |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
