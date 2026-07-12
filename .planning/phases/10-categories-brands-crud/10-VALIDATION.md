---
phase: 10
slug: categories-brands-crud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `10-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 (`vitest.config.ts`, repoints `db` at `TEST_DATABASE_URL`; `fileParallelism: false`; 30s timeouts) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `nvm use 22 && npx vitest run tests/actions/admin-taxonomy.test.ts` |
| **Full suite command** | `nvm use 22 && npm test` |
| **Estimated runtime** | ~9–11 min full suite (DB-gated integration vs Neon `TEST_DATABASE_URL`); quick file ~10–30s |

> **Node 22 is mandatory** — the shell defaults to Node 18, which breaks vitest startup (`node:util.styleText`). Prefix every run with `nvm use 22` (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`).

---

## Sampling Rate

- **After every task commit:** Run the quick command (or the specific file just touched)
- **After every plan wave:** Run the full suite
- **Before `/gsd-verify-work`:** Full suite must be green AND the D-11 `isActive` migration must be applied to BOTH `DATABASE_URL` and `TEST_DATABASE_URL` (a DB-gated *skip* is a red flag here, not the expected default)
- **Max feedback latency:** ~30s (quick) / ~11min (full)

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File | Status |
|-----|----------|-----------|-------------------|------|--------|
| ADMN-12 | `brand`/`category`.`is_active` column exists, `DEFAULT true NOT NULL` | integration (schema) | `npx vitest run tests/catalog/schema.test.ts` (or new taxonomy-schema test) | ❌ W0 | ⬜ |
| ADMN-12 | `createCategory` admin-gates (rejects non-admin), first statement `verifyAdminSession()` | unit (mocked dal) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ W0 | ⬜ |
| ADMN-12 | `createCategory` generates immutable slug via `uniqueSlug`; duplicate name → friendly error (D-05) | integration (DB) | admin-taxonomy.test.ts | ❌ W0 | ⬜ |
| ADMN-12 | `renameCategory` updates `name` only, slug unchanged (D-04) | integration (DB) | admin-taxonomy.test.ts | ❌ W0 | ⬜ |
| ADMN-12 | `deactivate/reactivateCategory` toggle `isActive`, do NOT touch `product.categoryId` (D-02 no-cascade) | integration (DB) | admin-taxonomy.test.ts | ❌ W0 | ⬜ |
| ADMN-12 | `listCategoriesForAdmin` product-count aggregate correct (incl. zero-product) | integration (DB) | `npx vitest run tests/catalog/admin-queries.test.ts` (extend) | ✅ extend | ⬜ |
| ADMN-12 | active-only slug resolution: unknown AND soft-deleted slug → route 404s | integration + route | `npx vitest run tests/catalog/queries.test.ts` (extend) | ✅ extend | ⬜ |
| ADMN-12 | nav/`generateStaticParams` list excludes soft-deleted categories | integration (DB) | tests/catalog/queries.test.ts | ✅ extend | ⬜ |
| ADMN-13 | `create/rename/(de)activateBrand` — admin-gate + uniqueness + no-cascade (no slug) | unit + integration | admin-taxonomy.test.ts | ❌ W0 | ⬜ |
| ADMN-13 | `listBrandsForAdmin` product-count aggregate | integration (DB) | tests/catalog/admin-queries.test.ts | ✅ extend | ⬜ |
| ADMN-13 | `getBrandsForCategory` excludes inactive brands from facet list | integration (DB) | tests/catalog/queries.test.ts | ✅ extend | ⬜ |
| ADMN-12/13 | Every new action re-verifies `verifyAdminSession()` first (D-10) | unit (mocked) | admin-taxonomy.test.ts | ❌ W0 | ⬜ |
| ADMN-12/13 | Cache invalidation fires on every mutation (`revalidatePath` mocked) | unit (mocked) | admin-taxonomy.test.ts | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/actions/admin-taxonomy.test.ts` — NEW file; ADMN-12/13 action behavior (admin-gate, Zod, uniqueness, no-cascade, cache invalidation). Mirror the RED-scaffold convention in `tests/actions/admin-customers.test.ts` (mock `server-only`, `next/cache`, `@/lib/dal`; unresolved import of the not-yet-created action module is the correct Wave 0 red signal).
- [ ] Extend `tests/catalog/admin-queries.test.ts` — `listCategoriesForAdmin` / `listBrandsForAdmin` cases.
- [ ] Extend `tests/catalog/queries.test.ts` — active-only slug resolution + nav list + inactive-brand-exclusion cases.
- [ ] Extend (or add) a schema test asserting `brand.is_active` / `category.is_active` exist with `DEFAULT true NOT NULL`.
- [ ] **[BLOCKING infra precondition]** `isActive` migration applied to BOTH `DATABASE_URL` and `TEST_DATABASE_URL` before any DB-gated test above can pass (D-11).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Newly-created category actually renders/browsable end-to-end in a real browser; soft-deleted one disappears from nav | ADMN-12 | PPR/`cacheComponents` + real nav render is not fully exercisable in unit/integration tests | In admin, create a category, assign a product, visit `/<slug>`; deactivate it, confirm it 404s and leaves the nav |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (quick ~30s)
- [ ] `nyquist_compliant: true` set once Wave 0 scaffolds exist

**Approval:** pending
