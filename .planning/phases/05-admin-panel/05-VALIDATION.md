---
phase: 5
slug: admin-panel
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` §"Validation Architecture". Task IDs are assigned by the planner;
> the requirement→test map below is authoritative for what Wave 0 must scaffold.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 [VERIFIED: package.json] — already configured |
| **Config file** | `vitest.config.ts` (repo root) — `fileParallelism: false`, 30s timeouts, `TEST_DATABASE_URL` isolation wired |
| **Quick run command** | `npx vitest run tests/admin/<file>.test.ts` (per touched file) |
| **Full suite command** | `npm test` (`vitest run` — DB-gated tests run because `TEST_DATABASE_URL` is set) |
| **Estimated runtime** | quick ~10–30s per file; full suite ~9–11 min (buffers output — run backgrounded to a log) |

**Node reminder:** shell defaults to Node 18 (breaks vitest). Before any test/build run:
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`.

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/admin/<file>.test.ts` for the file(s) touched.
- **After every plan wave:** `npm test` (full suite) — **critical**: the D-11 async migration touches ~15 files across Phases 4/7/7.1; the existing 319-test suite must stay green (regression gate).
- **Before `/gsd-verify-work`:** full suite green, including all DB-gated integration tests.
- **Max feedback latency:** < 30s for per-task unit runs.

---

## Per-Task Verification Map

*(Requirement→test map from research; `Task ID` filled by planner. Wave 0 = test scaffolds authored RED before implementation.)*

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| ADMN-01 | Non-admin/unauthenticated caller cannot invoke product create/update/delete actions | unit (always-runs) | `npx vitest run tests/admin/products.test.ts -t "auth"` | ❌ W0 | ⬜ pending |
| ADMN-01 | Image upload rejects empty/missing alt text server-side | unit (mock `@vercel/blob`) | `npx vitest run tests/admin/products.test.ts -t "alt text"` | ❌ W0 | ⬜ pending |
| ADMN-01 | Deactivating a product hides it from `getCatalog`/`getProduct`, preserves it for admin + order history | integration (DB-gated) | `npx vitest run tests/admin/products.test.ts -t "soft delete"` | ❌ W0 | ⬜ pending |
| ADMN-02 | Updating variant price/stock calls `updateTag('product-<slug>')` | unit (mock `next/cache`) | `npx vitest run tests/admin/products.test.ts -t "cache invalidation"` | ❌ W0 | ⬜ pending |
| ADMN-03 | `updateOrderStatus` rejects illegal transitions (e.g. `pending_payment → delivered`) | unit (always-runs) | `npx vitest run tests/admin/orders.test.ts -t "illegal transition"` | ❌ W0 | ⬜ pending |
| ADMN-03 / D-09 | Admin bank-transfer confirm (`awaiting_bank_transfer → payment_confirmed`) decrements stock atomically + idempotent on double-call | integration (DB-gated) | `npx vitest run tests/admin/orders.test.ts -t "bank transfer confirm"` | ❌ W0 | ⬜ pending |
| ORD-03 | Status email fires (mocked Resend) on `shipped`/`delivered` only, not `processing` | unit (always-runs) | `npx vitest run tests/admin/orders.test.ts -t "status email"` | ❌ W0 | ⬜ pending |
| ADMN-04 | Disabled method (DB flag off OR missing env credential) rejected at action/route level, not just UI | unit (always-runs) | `npx vitest run tests/payments/config.test.ts -t "toggle enforcement"` | ❌ W0 | ⬜ pending |
| ADMN-04 | All Phase 4/7/7.1 payment tests still pass after async migration (regression) | integration (existing) | `npm test` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/admin/products.test.ts` — ADMN-01, ADMN-02. Mirror `tests/checkout/actions.test.ts` mock structure: `vi.mock("server-only")`, `vi.mock("next/headers")`, and **`vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))`** — the mock MUST add `updateTag` (not in the current checkout mock shape).
- [ ] `tests/admin/orders.test.ts` — ADMN-03, ORD-03, D-09 bank-transfer-confirm reuse of `confirmOrderPaid`.
- [ ] `tests/admin/settings.test.ts` — ADMN-04 toggle Server Action.
- [ ] `tests/payments/config.test.ts` extension — async `isPaymentMethodEnabled` cases: DB flag off; DB flag on + no creds; DB flag on + creds present; method with no DB row (env-only fallback).
- [ ] `tests/helpers/db.ts` extension — `truncateStoreSettingsTable()` following existing `truncateOrderTables()`/`truncateCartTables()`.
- [ ] Framework install: none — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Product image upload round-trip (file → Vercel Blob → URL persisted → renders) | ADMN-01 | `@vercel/blob` not installed + `BLOB_READ_WRITE_TOKEN` not set locally; needs a real Blob store | After installing `@vercel/blob` and setting `BLOB_READ_WRITE_TOKEN`, create a product, upload an image with alt text, confirm the blob URL persists and renders on the storefront. Same credential-gated human-verify pattern as Phase 7/7.1 sandbox checkpoints. |
| Live payment-toggle flip visibly changes checkout availability | ADMN-04 | End-to-end UI effect across admin + storefront | Toggle a method OFF in `/admin` Settings, confirm it disappears from `/checkout` and the action/route rejects it if called directly. |

---

## Validation Sign-Off

- [x] All requirements have an `<automated>` verify or a Wave 0 dependency (image upload round-trip is manual-only, credential-gated)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (per-task unit runs)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
