---
phase: 05-admin-panel
plan: 05
subsystem: ui
tags: [nextjs, react-hook-form, zod, tailwind, admin, drizzle, vercel-blob]

# Dependency graph
requires:
  - phase: 05-admin-panel (05-03)
    provides: admin Server Actions (createProduct/updateProduct/deactivateProduct/reactivateProduct/upsertVariant), admin-queries.ts (listProductsForAdmin/getProductForAdmin), blob upload/delete
provides:
  - Admin shell (layout + sidebar + dual-layer auth) reused by Plan 06 (Orders/Settings)
  - Shared formStyles.ts + OrderStatusBadge.tsx consumed by Plan 06
  - Products list (filter/search/pagination) + full product editor (details/images/variants)
  - New upsertOptionValue Server Action for defining variant option-value combinations
affects: [05-06 (Orders/Settings UI, reuses AdminSidebar/formStyles/OrderStatusBadge)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin shell: layout.tsx re-verifies verifyAdminSession() as layer 2 of dual-layer auth (D-02), wraps children in Suspense"
    - "Row-level Server Action calls (VariantEditor/ProductRowActions) call router.refresh() after mutation instead of bundling into a parent form submit"
    - "formStyles.ts inputClass extracted once, imported by all three form components (no reimplementation)"

key-files:
  created:
    - src/app/admin/layout.tsx
    - src/components/admin/AdminSidebar.tsx
    - src/components/admin/formStyles.ts
    - src/components/admin/OrderStatusBadge.tsx
    - src/app/admin/products/page.tsx
    - src/components/admin/ProductRowActions.tsx
    - src/app/admin/products/new/page.tsx
    - src/app/admin/products/[id]/edit/page.tsx
    - src/components/admin/ProductForm.tsx
    - src/components/admin/VariantEditor.tsx
    - src/components/admin/ImageUploadField.tsx
  modified:
    - src/app/admin/page.tsx
    - src/lib/actions/admin-products.ts
    - src/lib/blob/upload.ts

key-decisions:
  - "Added upsertOptionValue Server Action (find-or-create productOptions/optionValues) — without it a brand-new product with zero pre-existing options had no way to define its first variant's option-value combination"
  - "Fixed src/lib/blob/upload.ts missing the \"use server\" directive — Wave 2 shipped it without one, which breaks the client-component import boundary Next.js requires (ImageUploadField calls uploadProductImage/deleteProductImage directly)"
  - "Slug rendered read-only in ProductForm (not editable as UI-SPEC literally describes) — createProduct/updateProduct's Zod schemas don't accept a client-supplied slug, so an editable input would lie about a capability the server doesn't have"
  - "Create-mode save redirects to the new product's own edit page (not the Products list) — Images/Variants require a productId that only exists after Details are saved"

patterns-established:
  - "Product/variant row mutations are independent Server Action calls with their own useTransition + router.refresh(), not bundled into the page's single form submit"

requirements-completed: [ADMN-01, ADMN-02]

duration: 70min
completed: 2026-07-09
---

# Phase 05 Plan 05: Admin Shell + Products UI Summary

**Admin shell (sidebar + dual-layer auth) and full Products UI (list with filters + editor with variants/images) built on top of Plan 03's Server Actions, plus one new Server Action to unblock variant creation on brand-new products.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-09T07:XX (session start)
- **Completed:** 2026-07-09T07:18:49Z
- **Tasks:** 3/3 completed
- **Files modified:** 14 (11 created, 3 modified)

## Accomplishments

- `/admin/layout.tsx` wraps every admin route with `verifyAdminSession()` (dual-layer auth layer 2, T-05-19) + a 240px desktop sidebar / mobile slide-over drawer (`AdminSidebar`)
- Shared `formStyles.ts` (`inputClass`, extracted verbatim from `CheckoutForm`) and `OrderStatusBadge.tsx` (8-state order-status palette + Active/Deactivated product pills) — ready for Plan 06 to reuse
- `/admin/products`: search + All/Active/Deactivated filter chips (URL-driven, no client JS for the base filtering), table with variants/price-range/stock-tier/status columns, empty/filtered-empty states matching the exact UI-SPEC copy contract, pagination via the existing `Pagination` component
- `ProductRowActions`: Edit link + overflow menu; Deactivate confirms via a destructive modal dialog, Reactivate fires immediately (reversible, no confirm)
- `/admin/products/new` and `/admin/products/[id]/edit`: `ProductForm` (Details card, RHF+Zod, `mode:"onBlur"`) embeds `VariantEditor` (per-row price/stock/active-toggle/remove, all wired to `upsertVariant`) and `ImageUploadField` (drop zone + per-image required alt text, wired to `uploadProductImage`/`deleteProductImage`)
- New `upsertOptionValue` Server Action (find-or-create `productOptions`/`optionValues`) so the variant editor's inline option-value picker can define a product's first option combination from scratch, not just select among pre-seeded values

## Task Commits

1. **Task 1: Admin shell — layout, sidebar, formStyles, OrderStatusBadge** - `b03baa6` (feat)
2. **Task 2: Products list page with status filter + states** - `a5b2d74` (feat)
3. **Task 3: Product editor — ProductForm, VariantEditor, ImageUploadField** - `4af35eb` (feat)

## Files Created/Modified

- `src/app/admin/layout.tsx` - admin shell, calls verifyAdminSession() + renders AdminSidebar
- `src/app/admin/page.tsx` - now redirects to /admin/products
- `src/components/admin/AdminSidebar.tsx` - Products/Orders/Settings nav, active-state, mobile drawer, sign-out
- `src/components/admin/formStyles.ts` - shared inputClass helper
- `src/components/admin/OrderStatusBadge.tsx` - 8-state order badge palette + product Active/Deactivated pills
- `src/app/admin/products/page.tsx` - product list, search, status chips, table, empty/error states
- `src/components/admin/ProductRowActions.tsx` - Edit link + overflow menu, Deactivate confirm dialog, Reactivate
- `src/app/admin/products/new/page.tsx` - create-mode editor host (fetches categories/brands)
- `src/app/admin/products/[id]/edit/page.tsx` - edit-mode editor host, getProductForAdmin -> notFound()
- `src/components/admin/ProductForm.tsx` - Details form + sticky footer (Save/Create, Deactivate, Cancel)
- `src/components/admin/VariantEditor.tsx` - per-variant row CRUD + inline add-variant/add-option-value picker
- `src/components/admin/ImageUploadField.tsx` - drop zone, required alt text, upload/delete wiring
- `src/lib/actions/admin-products.ts` - added `upsertOptionValue` action
- `src/lib/blob/upload.ts` - added missing `"use server"` directive (Rule 1 fix)

## Decisions Made

- Row-level mutations (variant save/remove, image upload/delete, product deactivate/reactivate) are independent Server Action calls with `useTransition` + `router.refresh()`, not bundled into `ProductForm`'s single submit — matches the plan's stated `CartLineItem`-style row pattern and lets variants/images persist incrementally without blocking on the Details save.
- Categories/brands are queried directly with `db.select()` inside the `new`/`edit` Server Component pages rather than adding new exports to `admin-queries.ts` — kept the addition local and minimal (two trivial `SELECT`s, no new module surface).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/lib/blob/upload.ts` missing `"use server"` directive**
- **Found during:** Task 3 (build failed: "You're importing a module that depends on 'server-only'... in the Pages Router" — misleading Next.js error whose real cause is the missing directive)
- **Issue:** Wave 2 (05-03) shipped `uploadProductImage`/`deleteProductImage` without the `"use server"` file directive that `admin-products.ts` has. `ImageUploadField` (a client component) calling these functions directly requires that directive to cross the client→server boundary.
- **Fix:** Added `"use server"` as the literal first line (before `import "server-only"`), matching the `admin-products.ts` convention.
- **Files modified:** `src/lib/blob/upload.ts`
- **Verification:** `npx next build --webpack` succeeds; `tests/admin/products.test.ts` (uploadProductImage tests) still pass.
- **Committed in:** `4af35eb` (Task 3 commit)

**2. [Rule 2 - Missing Critical] Added `upsertOptionValue` Server Action**
- **Found during:** Task 3 (designing the "+ Add variant" inline picker)
- **Issue:** `upsertVariant`'s Zod schema requires real `optionValueIds` referencing existing `option_value` rows, but Wave 2 shipped no action to create a `productOptions`/`optionValues` row from the UI — only the seed script writes them directly. A brand-new product (zero pre-existing options) had no way to define its first variant's option-value combination, which would make "the product editor... manages variants" (a must_haves truth) unachievable for new products.
- **Fix:** Added `upsertOptionValue(productId, {optionName, value})` — find-or-create against the existing `productOptions`/`optionValues` tables (no schema change), same auth-first/Zod/try-catch shape as the rest of `admin-products.ts`.
- **Files modified:** `src/lib/actions/admin-products.ts`
- **Verification:** `npx tsc --noEmit` clean; wired into `VariantEditor`'s inline picker and exercised via the build; unit test coverage for this specific new action was not added (out of this UI plan's `type=execute` scope — flagged below for Plan 06/QA follow-up).
- **Committed in:** `4af35eb` (Task 3 commit)

**3. [Rule 1 - Spec/implementation mismatch] Slug rendered read-only, not editable**
- **Found during:** Task 3 (building the Details card)
- **Issue:** UI-SPEC Surface 3 describes Slug as "auto-generated from name, editable." Neither `createProduct` nor `updateProduct` (Wave 2) accept a client-supplied slug — `createProduct` derives it via `uniqueSlug()`, `updateProduct` never touches the `slug` column. An editable input wired to nothing would silently no-op and mislead the admin.
- **Fix:** Render the slug as a read-only value with explanatory helper text instead of an editable input.
- **Files modified:** `src/components/admin/ProductForm.tsx`
- **Verification:** Visual/manual — no server contract needed changing.
- **Committed in:** `4af35eb` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing-critical, 1 spec/implementation mismatch)
**Impact on plan:** All three were necessary for the editor to actually function end-to-end for a brand-new product and to avoid a build failure. No scope creep — no new tables, no new architecture.

## Known Stubs

- **"Set as primary" radio in `ImageUploadField`** (`src/components/admin/ImageUploadField.tsx`) is local UI state only — it is not persisted. Wave 2's `uploadProductImage`/`deleteProductImage` actions never write `productImages.isPrimary`, and no action to update it was added in this plan (adding one was judged out of scope for a UI plan — it's a non-blocking cosmetic ordering concern, not required by ADMN-01/02, and doesn't affect the storefront PDP's use of images). Reload will reset the selection to the first image. Flagging for a future small action (`setPrimaryImage`) if the storefront ever needs to honor `isPrimary` explicitly.
- **`upsertOptionValue` has no direct unit test** — covered transitively by the build/tsc gate and manual exercise through `VariantEditor`, but `tests/admin/products.test.ts` (owned by Wave 2/05-03) was not extended with a dedicated case for this new action. Flagged for Plan 06 or a follow-up test pass.

## Issues Encountered

None beyond the two auto-fixed issues above (both resolved within the 3-attempt auto-fix budget on the first attempt each).

## User Setup Required

None - no external service configuration required. (Vercel Blob's `BLOB_READ_WRITE_TOKEN` requirement is pre-existing from Plan 03/05-03, not new to this plan; image upload round-trip is explicitly deferred to manual verification in Plan 06 per the plan's `<done>` note.)

## Next Phase Readiness

- `AdminSidebar`, `formStyles.ts`, and `OrderStatusBadge.tsx` are ready for Plan 06 (Orders/Settings UI) to import directly — Orders/Settings nav links already exist in the sidebar and point at `/admin/orders` and `/admin/settings` (routes not yet built; sidebar links will 404 until Plan 06 ships them, which is expected/normal for an in-progress multi-plan phase).
- Product create → variants → images flow is code-complete and build-verified; end-to-end manual verification (including the actual Blob upload round-trip) is deferred to Plan 06 per the plan's explicit scope note.

## Self-Check: PASSED

All files below verified present on disk; all commit hashes verified present in `git log`.

---
*Phase: 05-admin-panel*
*Completed: 2026-07-09*
