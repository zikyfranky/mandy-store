---
phase: 6
slug: customer-accounts
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract. Derived from `06-RESEARCH.md` §"Validation Architecture".
> Task IDs assigned by the planner; the requirement→test map is authoritative for Wave 0.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 (already configured) |
| **Config file** | `vitest.config.ts` (repoints db client at `TEST_DATABASE_URL`; loads `.env.local`) |
| **Quick run command** | `npx vitest run tests/orders tests/auth/register.test.ts` |
| **Full suite command** | `npm test` (DB-gated tests run — `TEST_DATABASE_URL` is set) |
| **Estimated runtime** | quick ~10–40s; full suite ~9–11 min (run backgrounded to a log) |

**Node reminder:** shell defaults to Node 18. Before any test/build: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`.

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/orders tests/auth/register.test.ts`
- **After every plan wave:** `npm test` (full suite) — regression gate (current baseline 340 tests green).
- **Before `/gsd-verify-work 6`:** full suite green.
- **Max feedback latency:** < 40s for per-task runs.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| AUTH-04 | `listOrdersForUser` returns only the caller's orders, newest first, correct item counts | integration (DB) | `npx vitest run tests/orders/user-queries.test.ts -t "listOrdersForUser"` | ❌ W0 | ⬜ |
| AUTH-04 | `listOrdersForUser` returns [] for a user with no orders (D-02 empty state) | integration (DB) | `... -t "no orders"` | ❌ W0 | ⬜ |
| AUTH-04 | `getOrderForUser` returns full order (with items) when owned by caller | integration (DB) | `... -t "getOrderForUser — owned"` | ❌ W0 | ⬜ |
| AUTH-04 / D-04 (IDOR) | `getOrderForUser` returns `null` for an order owned by a DIFFERENT user (core security test) | integration (DB) | `... -t "IDOR"` | ❌ W0 | ⬜ |
| AUTH-04 / D-04 | `getOrderForUser` returns `null` for a nonexistent id (indistinguishable from wrong-owner) | integration (DB) | `... -t "nonexistent"` | ❌ W0 | ⬜ |
| AUTH-04 / D-06 | `register()` with valid unclaimed `orderToken` links that order to the new user | integration (DB) | `npx vitest run tests/auth/register.test.ts -t "claims the guest order"` | ❌ W0 (extend) | ⬜ |
| AUTH-04 / D-06 | `register()` with an already-claimed `orderToken` does NOT reassign it, still succeeds | integration (DB) | `... -t "does not reassign"` | ❌ W0 | ⬜ |
| AUTH-04 / D-06 | `register()` with missing/garbage `orderToken` still succeeds (best-effort) | unit/integration | `... -t "invalid orderToken"` | ❌ W0 | ⬜ |
| AUTH-04 / SC3 | `/account/orders` + `/account/orders/[id]` re-verify session in-page (structurally enforced — queries require a `userId` that only comes from `verifySession()`) | e2e/manual | Playwright `/account/*` unauth-redirect suite (existing) | ✅ existing | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/orders/user-queries.test.ts` — new; covers `listOrdersForUser` + `getOrderForUser` incl. the IDOR + nonexistent cases. Mirror `tests/admin/orders.test.ts` mock block (`server-only`, `next/headers`, `next/cache` incl. `updateTag`) and its direct `db.insert(schema.orders).values({...})` fixture pattern; build two orders under two different `userId`s.
- [ ] Extend `tests/auth/register.test.ts` with the three D-06 claim cases; reuse `hasDatabase`/auth-truncate pattern + `truncateOrderTables()` (already in `tests/helpers/db.ts`) in before/after since these insert `orders` rows.
- [ ] Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-page dual-auth redirect UX | SC3 | Full browser session | Log out, visit `/account/orders` → redirected to login; log in → history renders. |
| Post-purchase register→claim end-to-end | D-06 | Full checkout+register flow | Place a guest order, click the post-purchase "Create account" offer, register; confirm the order appears in `/account/orders`. |

---

## Validation Sign-Off

- [x] All requirements have an `<automated>` verify or Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 40s (per-task)
- [x] `nyquist_compliant: true`

**Approval:** pending
