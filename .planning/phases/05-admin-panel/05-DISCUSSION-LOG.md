# Phase 5: Admin Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 5-admin-panel
**Mode:** `--auto` (no interactive questions — Claude auto-selected the recommended option for each gray area and logged the choice; alternatives preserved below for human review)
**Areas discussed:** Admin shell & authorization, Product CRUD & image storage, Variant/stock/price management & cache invalidation, Order management & fulfillment transitions, Status-change emails, Payment-method toggle mechanism

---

## Admin shell & authorization

| Option | Description | Selected |
|--------|-------------|----------|
| Shared `/admin` layout + sidebar nav (Products/Orders/Settings), dual-auth in layout + every action | Owner-facing dashboard; reuse admin stub + indigo brand | ✓ |
| Flat top-nav tabs | Simpler but less scalable for an owner tool | |

**Auto choice:** Sidebar-nav `/admin` layout with `verifyAdminSession()` in the layout and as the first statement of every admin action (D-01, D-02).
**Notes:** `proxy.ts` cannot protect Server Actions (CLAUDE.md) — in-action re-verify is mandatory, not optional.

---

## Product CRUD & image storage (ADMN-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel Blob + required alt text; **soft-delete** products | Planned stack; preserves order-history integrity | ✓ |
| Hard-delete products | Simpler but risks orphaning historical order line items | |
| Base64/DB-stored images or S3 | Off-stack; more setup | |

**Auto choice:** Vercel Blob storage (server-only `BLOB_READ_WRITE_TOKEN`), server-validated required alt text, and **soft-delete/deactivate** so deleted products vanish from the storefront while historical orders stay coherent (D-03, D-04).
**Notes:** `@vercel/blob` not yet installed — planner confirms version + upload-token flow.

---

## Variant/stock/price management & cache invalidation (ADMN-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per-variant price/stock in the product editor + `revalidateTag('product-<slug>')` on every edit | Uses the cache hook Phase 2 stubbed for Phase 5 | ✓ |
| Separate variant-management screen | More clicks; no functional gain for a small catalog | |

**Auto choice:** Edit each variant's own `priceKobo`/`stock` inside the product editor; every catalog-visible mutation calls `revalidateTag` to expire the Phase 2 cache immediately (D-05, D-06).
**Notes:** PDP stock/price is already always-dynamic, so live buyers see fresh numbers regardless of cache.

---

## Order management & fulfillment transitions (ADMN-03, D-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Orders list + status filter + detail; ONE shared guarded `updateOrderStatus()`; bank-transfer confirm via existing `confirmOrderPaid()` | Reuses Phase 4/7 idempotent paid path; honors SC3 | ✓ |
| Free-form status dropdown writing the column directly | Violates SC3 ("shared status function"); allows illegal states | |
| Separate bespoke bank-transfer confirm logic | Duplicates payment plumbing; drift risk | |

**Auto choice:** Guided/constrained transitions through one shared server function; bank-transfer admin-confirm routes through the existing idempotent `confirmOrderPaid()` — this is where the deferred bank-transfer atomic stock decrement finally fires (D-07, D-08, D-09).
**Notes:** Phase 4 D-09 explicitly deferred bank-transfer stock decrement to admin-confirm in Phase 5.

---

## Status-change emails (ORD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Email on **shipped + delivered** only, non-blocking, via Resend seam | Matches SC4; avoids noise from internal states | ✓ |
| Email on every status transition | Noisy; emails on internal-only states (processing) | |

**Auto choice:** Shared transition fn fires a status-change email on `shipped`/`delivered` only, non-blocking, reusing the Resend seam + a new React Email template (D-10).

---

## Payment-method toggle mechanism (ADMN-04)

| Option | Description | Selected |
|--------|-------------|----------|
| DB-backed `store_settings` flags (live toggle) gated **AND** with env credential presence; secrets stay in env | Admin flips live, no redeploy; secrets never in DB/UI; server-enforced | ✓ |
| Admin UI is read-only display of env state (toggle via redeploy) | No live control — weak for SC5 "admin can toggle" | |
| Move toggles fully into DB (incl. credentials) | Puts secrets in DB/UI — rejected (security) | |

**Auto choice:** `store_settings` table (per-method boolean), admin toggles live from Settings; `isPaymentMethodEnabled` becomes DB-flag-AND-env-credentials, enforced server-side everywhere (D-11).
**Notes:** ⚠ Flagged for research/planner — `isPaymentMethodEnabled` is currently sync/env-only and called across Phase 4/7/7.1; making it DB-aware (async) ripples into all call sites. Requires a `db:push` to both DBs. SC5 scope is Stripe/PayPal/bank transfer only.

---

## Claude's Discretion

- Product soft-delete column shape and cascade to variants/catalog queries.
- Vercel Blob upload mechanics (client-token vs server `put()`), validation, replace-cleanup.
- `store_settings` schema shape + sync→async migration strategy for `isPaymentMethodEnabled`.
- Exact legal state-transition graph over the 8-value `order_status` enum.
- Admin form stack (reuse react-hook-form + zod) and list pagination/sorting.

## Deferred Ideas

- Customer-facing order history → Phase 6.
- Standalone admin toggles for NG gateways → not required by SC5 (env-toggled, default OFF).
- Sales analytics, discount codes, reviews, wishlists → v2.
- Bulk product import/CSV, inventory audit log, low-stock alerts → future admin milestone.
- PayPal enablement → still deferred (D-05a, no NGN).
