---
phase: 05-admin-panel
plan: 02
subsystem: catalog-data-layer + admin-test-scaffolding
tags: [admin, soft-delete, vercel-blob, tdd-scaffold, wave-0]
dependency-graph:
  requires: [05-01]
  provides: [getProduct-isActive-fix, admin-queries, vercel-blob-dep, wave-0-red-scaffolds]
  affects: [05-03, 05-04, 05-05, 05-06]
tech-stack:
  added: ["@vercel/blob@^2.6.1"]
  patterns: ["admin read-query DTOs (no isActive filter, minimal fields)", "Wave 0 RED test scaffolding with missing-module imports"]
key-files:
  created:
    - src/lib/catalog/admin-queries.ts
    - tests/admin/products.test.ts
    - tests/admin/orders.test.ts
    - tests/admin/settings.test.ts
  modified:
    - src/lib/catalog/queries.ts
    - package.json
    - package-lock.json
    - .env.local.example
decisions:
  - "getOrderForAdmin returns null (not undefined) for unknown id, matching getProductForAdmin's null-on-miss convention used by admin pages calling notFound()"
  - "listProductsForAdmin computes variant aggregates (count, min/max price, stock sum) via a single LEFT JOIN subquery rather than N+1 per-product queries"
metrics:
  duration: "~35 min"
  completed: 2026-07-08
---

# Phase 5 Plan 02: Catalog data layer fixes + Wave 0 admin test scaffolds Summary

Fixed the `getProduct()` soft-delete gap (deactivated products now 404 instead of rendering a broken variant selector), added a new `admin-queries.ts` with four admin-only read functions, installed `@vercel/blob`, and authored three Wave 0 RED test scaffolds (`tests/admin/{products,orders,settings}.test.ts`) that Wave 2 server actions will turn green.

## What Was Built

**Task 1 — `getProduct` isActive fix + `admin-queries.ts`:**
- `src/lib/catalog/queries.ts::getProduct` now filters `and(eq(products.slug, slug), eq(products.isActive, true))` — mirrors the existing `getCatalog` pattern. A soft-deleted product's PDP now 404s (the page already calls `notFound()` on a null result) instead of rendering with an empty variant list. Closes RESEARCH Pitfall 1 / threat T-05-05.
- New `src/lib/catalog/admin-queries.ts` (`import "server-only"`), exporting exactly the four functions required by the plan and by Plan 06:
  - `getProductForAdmin(id)` — loads a product by id with NO isActive filter (product or variants), full relation tree matching `getProduct`'s shape, so the admin editor can view and reactivate a deactivated product.
  - `listProductsForAdmin({ status, q, page })` — paginated (`ADMIN_PAGE_SIZE = 24`), filters by `isActive` per `status` (`"all"|"active"|"deactivated"`) and by name via parameterized `ilike`; returns `AdminProductCard[]` with `variantCount`, `minPriceKobo`/`maxPriceKobo`, and `stockTotal` computed via a single grouped LEFT JOIN subquery (no N+1).
  - `listOrdersForAdmin({ status, page })` — paginated, ordered by `createdAt desc`, optional status filter, returns minimal `AdminOrderRow[]` (reference, customerEmail, totalKobo, status, gatewayProvider, `hasStripePaymentIntent` boolean, createdAt, id) — no payment secrets.
  - `getOrderForAdmin(id)` — the single order-detail read for Plan 06's `/admin/orders/[id]`, mirrors `getOrderByToken`'s `with: { items: true }` shape; returns `null` for unknown id.

**Task 2 — `@vercel/blob` + env docs:**
- `npm install @vercel/blob@^2.6.1` (matches RESEARCH's verified version).
- Appended a server-only `BLOB_READ_WRITE_TOKEN=` block to `.env.local.example` under a new "Phase 5: Admin Panel" section, no `NEXT_PUBLIC_` prefix, no real token set (credential-gated — the image round-trip is a human-verify checkpoint in Plan 06).

**Task 3 — Wave 0 RED admin test scaffolds:**
- `tests/admin/products.test.ts` — `auth` (non-admin rejected for create/update/deactivate), `alt text` (empty/whitespace alt text rejected server-side via mocked `@vercel/blob` `put`), `soft delete` (DB-gated: `deactivateProduct` hides from `getCatalog`/`getProduct`, preserves `getProductForAdmin`), `cache invalidation` (`updateProduct`/`updateVariant` call `updateTag`).
- `tests/admin/orders.test.ts` — `illegal transition` (DB-gated: `pending_payment → delivered` rejected, order untouched), `bank transfer confirm` (DB-gated: `awaiting_bank_transfer → payment_confirmed` decrements stock atomically and is idempotent on a second call), `status email` (DB-gated: Resend-mocked email fires on `shipped`/`delivered`, not `processing`).
- `tests/admin/settings.test.ts` — `toggleStoreSetting`/toggle enforcement (non-admin rejected, invalid method enum rejected, valid update reaches the mocked `db.update`).
- All three add `updateTag` to the `next/cache` mock (`vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))`) — the checkout test mock shape omits it, and admin actions rely on it.
- Each file opens with `// WAVE 0 RED SCAFFOLD — expected to fail until Plan 05-03/05-04 implement the actions.` and statically imports its not-yet-existing Wave 2 module (`@/lib/actions/admin-products`, `@/lib/actions/admin-orders`, `@/lib/actions/admin-settings`, `@/lib/blob/upload`, `@/lib/email/send-order-status-change`) — this is the intended RED signal, not a bug.

## Verification Results

- `npx tsc --noEmit`: clean aside from 5 expected `TS2307: Cannot find module` errors, all pointing at the intentional Wave 0 RED imports (`@/lib/actions/admin-products`, `@/lib/blob/upload`, `@/lib/actions/admin-orders`, `@/lib/email/send-order-status-change`, `@/lib/actions/admin-settings`). No other type errors — the non-scaffold changes (`getProduct`, `admin-queries.ts`, `@vercel/blob` install) typecheck cleanly.
- `npx next build --webpack`: succeeds (27/27 static pages generated, no build errors).
- `npm test` (full suite, `TEST_DATABASE_URL` set): **325 pre-existing tests pass** (30 test files), **3 new suites fail** (`tests/admin/{products,orders,settings}.test.ts`), each failing to collect with exactly one `Error: Cannot find package '...'` — confirmed these are missing-module errors only, not assertion failures or unrelated regressions. This matches the plan's explicit RED-by-design expectation.
- Acceptance-criteria greps for all three tasks (isActive filter present, 4 admin-queries exports, `server-only` header, `@vercel/blob` in package.json, no `NEXT_PUBLIC_BLOB`, `updateTag` in all 3 admin test files, required test-name substrings present, WAVE 0 RED SCAFFOLD comment in all 3 files) all passed.

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed with their specified acceptance criteria met.

## Known Stubs / Wave 0 RED Scaffolds (intentional, by design)

These are NOT bugs — they are the plan's explicit Wave 0 deliverable and will turn green in later waves of this phase:

| File | Missing import | Turns green in |
|---|---|---|
| `tests/admin/products.test.ts` | `@/lib/actions/admin-products`, `@/lib/blob/upload` | Plan 05-03 |
| `tests/admin/orders.test.ts` | `@/lib/actions/admin-orders`, `@/lib/email/send-order-status-change` | Plan 05-04 |
| `tests/admin/settings.test.ts` | `@/lib/actions/admin-settings` | Plan 05-05 (per test file's own comment; settings action may land alongside 05-04/05-05 per phase plan) |

## Threat Flags

None — this plan's new surface (`admin-queries.ts`) is explicitly covered by the plan's own threat model (T-05-05 mitigated by the `getProduct` fix; T-05-06 mitigated by minimal DTOs in `listProductsForAdmin`/`listOrdersForAdmin`/`getOrderForAdmin`, no secrets or payment credentials returned).

## Self-Check: PASSED

- FOUND: src/lib/catalog/admin-queries.ts
- FOUND: tests/admin/products.test.ts
- FOUND: tests/admin/orders.test.ts
- FOUND: tests/admin/settings.test.ts
- FOUND commit: e2805f7 (feat getProduct fix + admin-queries)
- FOUND commit: 63fd918 (chore @vercel/blob install + env docs)
- FOUND commit: 000a386 (test Wave 0 RED scaffolds)
