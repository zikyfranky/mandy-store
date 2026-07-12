---
phase: 10-categories-brands-crud
requirements: [ADMN-12, ADMN-13]
status: browser-verify-pending
created: 2026-07-12
---

# Phase 10 — Human UAT: Categories & Brands CRUD

## Automated gate (Task 1)

- **Full suite:** ✅ **436/436 passed, 44 files, 0 failures, 0 skips** (`npm test`, Node 22, ~13 min). Up from 415 at Phase 9 completion → +21 new taxonomy tests, and the DB-gated taxonomy tests RAN against `TEST_DATABASE_URL` (not skipped — Pitfall 2 satisfied).
- **Build (`next build --webpack`):** clean; `/` and `/[categorySlug]` retain `◐` (Partial Prerender) — verified in Plans 10-04/10-05.
- **D-11 migration:** `is_active` confirmed live on `brand` + `category` in BOTH `DATABASE_URL` and `TEST_DATABASE_URL` (idempotent apply scripts print SUCCESS). DB-gated taxonomy tests RUN (not skipped).

## Browser UAT — PENDING (Task 2, human-verify)

Run `nvm use 22 && npm run dev`, sign in as admin, then:

1. **/admin/categories** — Electronics/Watches/Phones show Slug + Products count + Active pill. Create **"Laptops"** → appears with slug `laptops`, count 0, Active.
2. **Storefront nav** — "Laptops" appears in the top-nav; visiting **/laptops** renders an (empty) category page, NOT a 404.
3. **Immutable slug (D-04)** — Rename "Laptops" → "Notebooks"; URL stays **/laptops**, nav label updates to "Notebooks".
4. **Soft-delete → 404 (D-01/D-03)** — Deactivate "Notebooks": it leaves the nav, **/laptops returns 404**, admin pill flips to "Deactivated". Reactivate → returns to nav and browses again.
5. **/admin/brands** — Create a brand; deactivate an existing brand → it no longer appears in the brand-filter facet on a category page; per-brand product counts render.
6. **Friendly duplicate error (D-05)** — Create a category/brand with a duplicate name → "…already exists" message, not a 500.

**Outcome:** ⏳ **PENDING — genuine browser walkthrough not yet performed.** The `--auto` chain acknowledged this human-verify checkpoint so the pipeline could complete, but a human must still run the 6 steps above in a real browser (same bar as the Phase 5/6/7/8/9 browser human-verify items). Every behavior that CAN be automated is covered green (436/436). Type "approved" after the walkthrough, or report any issue and I'll open a fix plan.

## Notes
- Rails/home copy uses the generic `New in ${name}` template (D-03) — a cosmetic choice flagged for review.
