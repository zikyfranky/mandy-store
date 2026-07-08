# Phase 5: Admin Panel - Research

**Researched:** 2026-07-08
**Domain:** Next.js 16 admin CRUD (products/variants/images), order fulfillment state machine, DB-backed feature-flag migration, Vercel Blob image storage
**Confidence:** HIGH (grounded in direct codebase reads + official Next.js/Vercel source and docs); MEDIUM on a few forward-looking Next.js caching-API nuances flagged below.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A shared `/admin` layout with sidebar navigation — Products, Orders, Settings (payment toggles live under Settings). Reuse the existing indigo brand system and the admin dashboard stub at `src/app/admin/page.tsx`. Nav collapses responsibly on mobile but is desktop-first (owner tool).
- **D-02:** Dual-layer auth is mandatory and non-negotiable (SC5, CLAUDE.md): `proxy.ts` already redirects unauth/non-admin away from `/admin/*`, **and** `verifyAdminSession()` is re-called at the top of the admin layout **and as the first statement of every admin Server Action / Route Handler**. `proxy.ts` cannot protect Server Actions — re-verify everywhere.
- **D-03:** Image storage = Vercel Blob (not yet installed). Admin uploads product images through a server-mediated upload; store the returned blob URL + the required alt text on `product_image`. Alt text is validated as required server-side (SC1) — not just a UI hint. `BLOB_READ_WRITE_TOKEN` is a server-only env var, no `NEXT_PUBLIC_`.
- **D-04:** Product delete = soft delete/deactivate, not a hard row delete. A deleted product is hidden from the storefront (catalog queries exclude it) but its rows remain so historical orders keep referring to real variants and order line-item snapshots stay coherent.
- **D-05:** Variants are managed inside the product editor — each variant row is editable with its own `priceKobo` and `stock` (prices always in kobo). Admin can add/remove variants and their option-value combinations.
- **D-06:** Every mutating admin action that changes catalog-visible data (product fields, variant price/stock, images) calls the Phase-2-established cache invalidation hook for `product-<slug>` (and any catalog-list tag) so cached product content expires immediately (SC2). Stock/price on the PDP is already dynamic (never cached).
- **D-07:** Orders list shows all orders with a status filter (over the 8-value `order_status` enum) and links to an order detail view (line items, variant labels, shipping-address snapshot, totals, payment method, gateway reference).
- **D-08:** All fulfillment changes go through ONE shared server-side transition function (`updateOrderStatus(orderId, nextStatus)`), never a raw `UPDATE order SET status`. The function validates the transition (guided/constrained over the enum — reject illegal jumps), performs the write, and fires side effects (D-10 emails).
- **D-09 (locked — completes Phase 4 D-09):** Admin manually confirming a bank-transfer order (`awaiting_bank_transfer` → paid) routes through the existing idempotent `confirmOrderPaid()` path, NOT a bare status set. This is where the atomic stock decrement for bank transfers finally happens, reusing the same `UPDATE variant SET stock = stock - qty WHERE ... AND stock >= qty RETURNING` guard, idempotency key, oversold-refund/last-unit-race recovery, and confirmation email. No new payment plumbing.
- **D-10:** The shared transition function sends a status-change email on `shipped` and `delivered` only (SC4) — not on every transition. Reuse the Resend seam (`src/lib/email/`) + a new React Email template (`src/emails/`), modeled on the existing order-confirmation email. Send non-blocking.
- **D-11 (locked — the phase's biggest design decision):** Payment methods become DB-backed, live-toggleable via a small `store_settings` table (one row per method, boolean `enabled`). Admin flips them from Settings; effect is immediate, no redeploy. Secrets never move into DB/UI. A method is enabled only when BOTH (a) `store_settings.enabled` is true AND (b) credentials are present in server-only env. SC5 requires Stripe/PayPal/bank transfer — seed those three flags. PayPal stays effectively OFF (no NGN). NG gateways (Paystack/Flutterwave/Interswitch/GTPay/Remita) are NOT required to get admin UI toggles in this phase — they may adopt the same table opportunistically but remain server-env toggled, default OFF, if not migrated.
  - `isPaymentMethodEnabled()` is currently sync/env-only, called as the first statement in many actions/routes (Phase 4/7/7.1). Adding a DB read makes it async — ripples into every caller. A `db:push` for `store_settings` is required (both dev and test DBs).

### Claude's Discretion
- Exact `product` soft-delete column shape (`isActive` boolean vs `deletedAt` timestamp) and how the hidden state cascades to variants and existing catalog queries. **[Researched below — the column already exists; see Standard Stack / Don't Hand-Roll.]**
- Vercel Blob upload mechanics: client-upload-token flow vs. server-side `put()`, size/type validation, and whether old blobs are deleted on image replace. **[Researched below.]**
- `store_settings` schema shape (enum-keyed rows vs. columns) and the sync→async migration strategy for `isPaymentMethodEnabled` across all call sites. **[Researched below.]**
- The precise allowed state-transition graph over the 8-value `order_status` enum. **[Researched below.]**
- Admin form stack (reuse `react-hook-form` + `zod` as in checkout) and list pagination/sorting details for products and orders. **[Researched below.]**

### Deferred Ideas (OUT OF SCOPE)
- Customer-facing order history list → Phase 6 (Customer Accounts).
- Standalone admin toggle UI for each NG gateway (Paystack/Flutterwave/Interswitch/GTPay/Remita) → not required by SC5; stay server-env toggled, default OFF.
- Sales analytics/dashboards, discount codes, reviews, wishlists → v2.
- Bulk product import/CSV, inventory audit log, low-stock alerts → not in Phase 5 scope.
- PayPal enablement → still deferred (no NGN); toggle exists but credential gate keeps it off.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMN-01 | Admin can add, edit, and delete products with images | Vercel Blob `put()`/`del()` API (Standard Stack §Image Storage), soft-delete via existing `products.isActive` (Don't Hand-Roll §1), admin form patterns (Architecture Patterns §3) |
| ADMN-02 | Admin can manage product variants with individual prices and stock levels | Inline variant editor pattern (Architecture Patterns §3), `updateTag`/cache-invalidation (Architecture Patterns §2) |
| ADMN-03 | Admin can view all orders and update fulfillment status | Order status transition graph (Architecture Patterns §4), shared `updateOrderStatus()` design |
| ADMN-04 | Admin can toggle Stripe / PayPal / bank transfer on or off | `store_settings` schema + `isPaymentMethodEnabled` async migration (Standard Stack §Payment Toggle Migration, Don't Hand-Roll §2) |
| ORD-03 | Customer receives email when fulfillment status changes | Status-email side effect design in `updateOrderStatus()` (Architecture Patterns §4), Resend/React Email seam reuse (Code Examples) |
</phase_requirements>

## Summary

Phase 5 is almost entirely additive on top of infrastructure Phases 1–4 already built correctly: `verifyAdminSession()`, the `confirmOrderPaid()` idempotent confirmation path, the `cacheTag('product-<slug>')` hook, and — critically — **the product/variant soft-delete columns (`products.isActive`, `variants.isActive`) already exist in the schema and are already respected by `getCatalog`, `getBrandsForCategory`, and the cart's OOS logic.** The only schema gaps are (1) a new `store_settings` table for D-11, and (2) a missing `isActive` filter in `getProduct()` (the PDP query) — no new soft-delete column is needed.

The single highest-risk item is D-11: converting `isPaymentMethodEnabled()` from sync to async. Direct source inspection shows every one of its ~15 call sites is already inside an `async` function (Server Actions, Route Handlers, or an async Server Component) — so the migration is mechanical (add `await` at each site), not architectural. The recommended shape is a single `store_settings` row-per-method table, an async gate function that falls back to today's env-only behavior when a method has no DB row (keeping Phase 7/7.1 gateways untouched), and a request-scoped batched settings read to avoid N+1 queries from `enabledPaymentMethods()`.

The second important finding concerns Next.js 16's caching APIs under `cacheComponents: true` (already enabled in `next.config.ts`): reading the installed `next@16.2.7` source directly shows `revalidateTag(tag)` **without a second argument is deprecated** and `updateTag(tag)` is the correct API for Server Actions (read-your-own-writes semantics) — but `updateTag` throws if called from a Route Handler (must use `revalidateTag(tag, "max")` there instead). This directly resolves the ambiguity flagged in the existing `cacheTag` comment in `src/app/products/[slug]/page.tsx`.

**Primary recommendation:** Build admin CRUD as ordinary Server Actions guarded by `verifyAdminSession()` first-statement + Zod validation, mirroring `src/lib/actions/checkout.ts`; call `updateTag('product-<slug>')` (and a catalog-list tag) after every catalog-visible mutation; do the `isPaymentMethodEnabled` async migration as one mechanical PR touching all ~15 call sites plus the `store_settings` table; and implement `updateOrderStatus()` as a single function with an explicit transition allowlist that special-cases `payment_confirmed` to delegate to `confirmOrderPaid()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Admin auth (dual-layer) | API/Backend (Server Actions + layout) | Browser (proxy redirect UX only) | `proxy.ts` is a UI-visibility gate only; `verifyAdminSession()` in the DAL is the actual authorization boundary (CLAUDE.md, Pitfall 1) |
| Product/variant CRUD | API/Backend (Server Actions) | Database (Drizzle schema, existing `isActive` columns) | Business logic + validation lives server-side; DB enforces FK integrity for order-history preservation |
| Image upload | API/Backend (Server Action calling `put()`) | CDN/Static (Vercel Blob storage + `next/image` remotePatterns) | Upload mediation happens server-side (admin-only, low-volume, files typically <4.5MB); Blob CDN serves the resulting URL |
| Cache invalidation | API/Backend (Server Action calls `updateTag`) | Frontend Server/SSR (Next.js cache runtime) | Only Server Actions can call `updateTag`; the SSR cache runtime owns tag storage/expiry |
| Order fulfillment state machine | API/Backend (`updateOrderStatus()` shared function) | Database (`order_status` enum + `orders.status` column) | Enum is the DB-level guard; the shared function is the only writer, enforcing transition legality in application code |
| Payment-method enablement | API/Backend (`isPaymentMethodEnabled()` gate) | Database (`store_settings` table) + env (secrets) | Enforcement must happen at every action/route entry point, never the UI; DB supplies the live toggle, env supplies the credential presence check |
| Status-change email | API/Backend (Resend seam, fired from `updateOrderStatus()`) | — | Side effect of a state transition, not a rendering concern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vercel/blob` | 2.6.1 [VERIFIED: npm registry, `npm view @vercel/blob version`, 2026-07-08] | Product image storage | Already the project's planned stack choice (STACK.md, CLAUDE.md); native Vercel integration, no extra credential surface |
| `react-hook-form` | ^7.80.0 (already installed) [VERIFIED: package.json] | Admin form state (product/variant editor) | Already used identically for checkout (`CheckoutForm.tsx`) — same pattern, zero new dependency |
| `zod` | ^4.4.3 (already installed) [VERIFIED: package.json] | Admin form + Server Action input validation | Already used server + client side across the codebase; v4 API already proven working in this repo (no migration risk) |
| `@hookform/resolvers` | ^5.4.0 (already installed) [VERIFIED: package.json] | Bridges RHF + Zod | Already installed; `zodResolver` pattern already proven in `CheckoutForm.tsx` |
| `drizzle-orm` / `drizzle-kit` | ^0.45.2 / ^0.31.10 (already installed) [VERIFIED: package.json] | `store_settings` table definition + query | No version bump needed |
| `resend` / `@react-email/components` | ^6.12.4 / ^1.0.12 (already installed) [VERIFIED: package.json] | ORD-03 status-change email | Reuse the existing lazy-client seam (`src/lib/email/resend-client.ts`) fixed in commit `3207e49` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new required | — | — | This phase needs exactly one new dependency (`@vercel/blob`); everything else (forms, ORM, email, validation) is already installed and proven in this codebase. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@vercel/blob` server `put()` | `@vercel/blob/client` `upload()` + `handleUpload()` token flow | Client-upload avoids the 4.5MB Vercel Function request-body limit and offloads bandwidth from your server, at the cost of an extra Route Handler (`onBeforeGenerateToken`/`onUploadCompleted`) and more moving parts. For a single admin uploading product photos (typically well under 4.5MB), server-side `put()` inside a Server Action is simpler and sufficient — recommend server `put()` unless product photography requirements demand large uncompressed files. |
| `store_settings` row-per-method | Single-row table with one boolean column per method | Row-per-method is easier to extend (Paystack/Flutterwave/etc. can opt in later without a schema migration — just insert a row) and matches the CONTEXT D-11 wording ("one row per method"). Column-per-method would require an `ALTER TABLE` for every new gateway. |
| Per-call DB read in `isPaymentMethodEnabled` | `unstable_cache` or `React.cache()` wrapped settings loader | A raw `SELECT * FROM store_settings` per call is simplest and correct; batching via `React.cache()` avoids N+1 in `enabledPaymentMethods()` (which checks 8 methods) but its dedupe guarantee *inside a Server Action* is not officially documented with the same certainty as inside Server Component render — see Assumptions Log A1. Recommend: use `React.cache()` for the batched read as an optimization, but design `isPaymentMethodEnabled` so correctness does not depend on the dedupe actually firing (worst case: a few extra fast indexed reads, not a correctness bug). |

**Installation:**
```bash
npm install @vercel/blob
```

**Version verification:** `npm view @vercel/blob version` → `2.6.1`, published 2026-07-08 (dist-tags: `latest: 2.6.1`) [VERIFIED: npm registry, checked live in this research session]. All other packages needed for this phase are already installed at the versions in `package.json` — no upgrades required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────┐   proxy.ts (UI redirect only, NOT an auth boundary)
│   Browser   │──────────────────────────────────────────────────┐
└─────────────┘                                                   │
      │ GET /admin/*                                              ▼
      │                                              ┌─────────────────────────┐
      │                                              │ /admin layout (Server)  │
      │                                              │ verifyAdminSession() #1 │──▶ redirect if not admin
      │                                              └───────────┬─────────────┘
      │                                                          │
      │  Form submit (Server Action)                             ▼
      ▼                                              ┌─────────────────────────┐
┌──────────────────────┐   verifyAdminSession() #2   │ Admin page (Products/   │
│ Server Action         │◀─────FIRST STATEMENT────────│ Orders/Settings)       │
│ (e.g. updateVariant,  │                             └─────────────────────────┘
│  updateOrderStatus,   │
│  toggleStoreSetting)  │
└──────────┬────────────┘
           │
           ├─── product/variant write ──▶ Drizzle → Postgres (products/variants/product_image)
           │                                   │
           │                                   ▼
           │                         updateTag('product-<slug>')  (Server Action only)
           │                         + catalog-list tag                │
           │                                   ▼
           │                     Next.js cache runtime purges          │
           │                     'use cache' ProductContent            │
           │                     → next PDP request re-fetches fresh   │
           │
           ├─── image upload ──▶ put() [@vercel/blob] ──▶ Vercel Blob CDN
           │                        │                         │
           │                        ▼                         ▼
           │              store blob.url + alt text    served via next/image
           │              on product_image row          (remotePatterns)
           │
           ├─── order status change ──▶ updateOrderStatus(orderId, next)
           │                                │
           │                                ├─ if next === "payment_confirmed"
           │                                │     (only legal from awaiting_bank_transfer)
           │                                │     → confirmOrderPaid() [D-09, reused verbatim]
           │                                │         → idempotency insert
           │                                │         → atomic stock decrement
           │                                │         → order-confirmation email
           │                                │
           │                                └─ else: validate transition against allowlist
           │                                      → UPDATE order SET status
           │                                      → if next in {shipped, delivered}:
           │                                            sendStatusChangeEmail() [non-blocking]
           │
           └─── payment toggle flip ──▶ UPDATE store_settings SET enabled = ? WHERE method = ?
                                              │
                                              ▼
                                 isPaymentMethodEnabled(method) [now async]
                                 checked as FIRST statement in every
                                 checkout/gateway Server Action + webhook route
                                 (Phase 4/7/7.1 — unchanged call sites, added `await`)
```

### Recommended Project Structure
```
src/
├── app/admin/
│   ├── layout.tsx              # NEW — shared shell: sidebar nav, verifyAdminSession() #1 (D-01/D-02)
│   ├── page.tsx                # EXISTING stub — becomes dashboard landing (or redirect to /admin/products)
│   ├── products/
│   │   ├── page.tsx             # NEW — product list (paginated, search/filter)
│   │   ├── new/page.tsx         # NEW — create product form
│   │   └── [id]/page.tsx        # NEW — edit product + inline variant editor + image upload
│   ├── orders/
│   │   ├── page.tsx             # NEW — orders list + status filter (D-07)
│   │   └── [id]/page.tsx        # NEW — order detail + guided status transition control
│   └── settings/
│       └── page.tsx             # NEW — payment-method toggles (D-11)
├── lib/actions/
│   ├── admin-products.ts        # NEW — createProduct/updateProduct/deactivateProduct/upsertVariant Server Actions
│   ├── admin-orders.ts          # NEW — updateOrderStatus() shared transition function (D-08)
│   └── admin-settings.ts        # NEW — toggleStoreSetting() Server Action (D-11)
├── lib/catalog/
│   ├── queries.ts                # MODIFY — getProduct() needs products.isActive filter; add getProductForAdmin() (no filter)
│   └── admin-queries.ts          # NEW — listProductsForAdmin(), listOrdersForAdmin() w/ pagination + status filter
├── lib/payments/
│   ├── config.ts                 # MODIFY — isPaymentMethodEnabled becomes async, DB-aware (D-11)
│   └── store-settings.ts         # NEW — getStoreSettingsMap() request-scoped loader + toggleStoreSetting()
├── lib/db/schema.ts               # MODIFY — add storeSettings table only (products/variants isActive already exist)
├── lib/blob/
│   └── upload.ts                  # NEW — uploadProductImage()/deleteProductImage() wrapping @vercel/blob put()/del()
├── emails/
│   └── OrderStatusChangeEmail.tsx # NEW — React Email template for ORD-03 (shipped/delivered)
├── lib/email/
│   └── send-order-status-change.ts # NEW — Resend sender, mirrors send-order-confirmation.ts
└── components/admin/
    ├── AdminSidebar.tsx           # NEW
    ├── ProductForm.tsx            # NEW — RHF + Zod, mirrors CheckoutForm.tsx patterns
    ├── VariantEditor.tsx          # NEW — inline add/remove variant rows
    ├── ImageUploadField.tsx       # NEW — client island, required alt text input
    ├── OrderStatusControl.tsx     # NEW — guided next-state buttons (not a free dropdown)
    └── PaymentToggleRow.tsx       # NEW
```

### Pattern 1: Dual-layer admin auth (extends existing seam)
**What:** Every `/admin` route segment layout AND every admin Server Action calls `verifyAdminSession()` as the literal first statement.
**When to use:** All new admin surfaces — no exceptions, including read-only list pages (D-02, CLAUDE.md, Pitfall 1).
**Example:**
```typescript
// Source: src/app/admin/page.tsx (existing, verified in this codebase)
import { verifyAdminSession } from "@/lib/dal"

async function AdminContent() {
  const user = await verifyAdminSession() // DAL layer 2 — proxy.ts is layer 1, UI-only
  // ...
}
```
```typescript
// New pattern for Server Actions — mirrors src/lib/actions/checkout.ts structure
"use server"
import "server-only"
import { verifyAdminSession } from "@/lib/dal"

export async function updateVariant(input: unknown) {
  await verifyAdminSession() // FIRST statement — before any parsing or DB access
  const parsed = VariantSchema.parse(input)
  // ...
}
```

### Pattern 2: Cache invalidation with `updateTag` (Next.js 16, `cacheComponents: true`)
**What:** [VERIFIED: read directly from `node_modules/next/dist/server/web/spec-extension/revalidate.js` and `.d.ts`, next@16.2.7] Next.js 16 exports both `revalidateTag(tag, profile)` and `updateTag(tag)` from `next/cache`.
- `revalidateTag(tag)` **without** the second `profile` argument is deprecated and logs a console warning ("add second argument of 'max' or use 'updateTag'"). It works from Route Handlers, Server Actions, and anywhere else with access to the work store.
- `updateTag(tag)` performs immediate expiration (read-your-own-writes) but **throws an Error if called from a Route Handler** ("updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead").
- Both ultimately call the same internal `revalidate()` — the practical difference is `updateTag` defaults to full-immediate-expiry without a profile and is restricted to the Server Action context.

**When to use:** Every admin Server Action that mutates catalog-visible data (product name/description, variant price/stock, image add/remove/replace, product activate/deactivate) — per D-06.
**Example:**
```typescript
// Source: verified against next@16.2.7 installed source (node_modules/next/dist/server/web/spec-extension/revalidate.js)
"use server"
import { updateTag } from "next/cache"

export async function updateVariantPriceAndStock(variantId: string, priceKobo: number, stock: number) {
  await verifyAdminSession()
  const [variant] = await db
    .update(variants)
    .set({ priceKobo, stock })
    .where(eq(variants.id, variantId))
    .returning({ productSlug: /* join or second query to product.slug */ })
  // D-06: expire the cached PDP content immediately (Server Action → updateTag, not revalidateTag)
  updateTag(`product-${productSlug}`)
  // also expire any catalog-list cache tag if one is introduced later
}
```
This resolves the ambiguity in the existing code comment at `src/app/products/[slug]/page.tsx:9` ("Phase 5 admin `updateTag()` invalidates on edit") — the comment already anticipated the correct API name; this research confirms it against the actual installed Next.js source. **Note:** the PDP's `ProductContent` cache is currently tagged only with `product-<slug>` — there is no catalog-list tag yet (category/search/all-products pages read live via `getCatalog`, which has no `'use cache'` wrapper per Phase 2). So today only `updateTag('product-<slug>')` is strictly required; a catalog-list tag is only needed if a future phase adds caching to `getCatalog`.

### Pattern 3: Admin Server Action form pattern (mirrors checkout)
**What:** Reuse the exact `react-hook-form` + `zodResolver` + Server Action pattern already proven in `CheckoutForm.tsx` / `checkout.ts` for product/variant CRUD forms.
**When to use:** Product create/edit form, variant inline editor, image upload field, order status control, settings toggles.
**Example:**
```typescript
// Source: src/lib/actions/checkout.ts pattern, adapted
"use server"
import "server-only"
import { z } from "zod"
import { verifyAdminSession } from "@/lib/dal"
import { updateTag } from "next/cache"

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid(),
})

export async function updateProduct(productId: string, input: unknown) {
  await verifyAdminSession()                 // D-02 — first statement
  const data = ProductSchema.parse(input)    // never trust client shape
  const [updated] = await db.update(products).set(data)
    .where(eq(products.id, productId)).returning()
  updateTag(`product-${updated.slug}`)       // D-06
  return { success: true, id: updated.id }   // minimal DTO — never raw record (Pitfall 10)
}
```

### Pattern 4: Order status transition machine (D-07/D-08/D-09/D-10)
**What:** A single `updateOrderStatus(orderId, nextStatus)` function with an explicit transition allowlist. `payment_confirmed` is reachable ONLY from `awaiting_bank_transfer` and is special-cased to delegate to the existing `confirmOrderPaid()` (D-09) rather than a raw write. All other legal transitions perform a guarded `UPDATE` and fire the ORD-03 email side effect only for `shipped`/`delivered`.

**Proposed transition graph** (admin-initiated, via `updateOrderStatus`):

| From \ To | payment_confirmed | processing | shipped | delivered | cancelled |
|---|---|---|---|---|---|
| `pending_payment` | ✗ (only the gateway webhook/verify path can do this, via `confirmOrderPaid` directly — never admin) | ✗ | ✗ | ✗ | ✓ (abandon a stuck online-payment order) |
| `awaiting_bank_transfer` | ✓ **(delegates to `confirmOrderPaid`, D-09)** | ✗ | ✗ | ✗ | ✓ |
| `payment_confirmed` | — | ✓ | ✗ | ✗ | ✓ (pre-shipment cancellation — refund is a manual/offline step, out of scope for this phase) |
| `processing` | — | — | ✓ | ✗ | ✓ |
| `shipped` | — | — | — | ✓ | ✗ |
| `delivered` | — | — | — | — | ✗ (terminal) |
| `cancelled` | — | — | — | — | terminal |
| `payment_failed` | — | — | — | — | terminal (no admin transition out — oversold/failed orders need manual/offline resolution, out of scope) |

Rationale: `pending_payment` and `payment_failed` are gateway-owned states — admin can only abandon (`cancelled`) a stuck `pending_payment` order, never force it to `payment_confirmed` (that would bypass the atomic stock decrement and idempotency guarantees). This preserves every invariant Phase 4/7/7.1 built.

**Example:**
```typescript
// NEW — src/lib/actions/admin-orders.ts
"use server"
import "server-only"
import { verifyAdminSession } from "@/lib/dal"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { sendOrderStatusChangeEmail } from "@/lib/email/send-order-status-change"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  awaiting_bank_transfer: ["payment_confirmed", "cancelled"],
  payment_confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  payment_failed: [],
}

export async function updateOrderStatus(orderId: string, nextStatus: string) {
  await verifyAdminSession() // D-02 — first statement

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  })
  if (!order) throw new Error("Order not found")

  const allowed = LEGAL_TRANSITIONS[order.status] ?? []
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Illegal transition: ${order.status} -> ${nextStatus}`)
  }

  // D-09: bank-transfer confirm reuses the shared idempotent path verbatim
  if (nextStatus === "payment_confirmed") {
    const result = await confirmOrderPaid(order, {
      provider: "bank_transfer",
      eventId: `bank_transfer:${order.reference}`, // deterministic idempotency key
    })
    return { success: result.outcome === "confirmed", outcome: result.outcome }
  }

  await db.update(orders).set({ status: nextStatus as typeof order.status }).where(eq(orders.id, orderId))

  // D-10: email ONLY on shipped/delivered, non-blocking
  if (nextStatus === "shipped" || nextStatus === "delivered") {
    sendOrderStatusChangeEmail({
      customerEmail: order.customerEmail,
      reference: order.reference,
      guestToken: order.guestToken,
      newStatus: nextStatus,
    }).catch(console.error)
  }

  return { success: true }
}
```

### Anti-Patterns to Avoid
- **Raw `UPDATE order SET status`:** Any admin code path that writes `orders.status` outside `updateOrderStatus()` recreates Pitfall 7 (order status divergence) and bypasses the D-09 idempotent confirmation path for bank transfers.
- **`revalidateTag` without a profile arg in new Server Action code:** Works but is deprecated in Next 16.2.7 and prints a console warning; use `updateTag` inside Server Actions instead.
- **Calling `updateTag` from a Route Handler:** Throws at runtime. Admin mutations in this phase are all Server Actions, so this should not arise — but if any admin webhook-style Route Handler is ever added, it must use `revalidateTag(tag, "max")` instead.
- **Treating `isPaymentMethodEnabled` as free:** Once DB-backed, a naive implementation that queries `store_settings` on every single check (8 methods × N requests) adds avoidable DB round trips. Batch the read per request (see Don't Hand-Roll §2).
- **Free-form status dropdown:** A `<select>` with all 8 enum values invites illegal transitions in the UI even if the server rejects them; the UI should render only the states in `LEGAL_TRANSITIONS[current]` as buttons (matches the "guided track" language in CONTEXT `<specifics>`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Product soft-delete flag | A new `deletedAt` timestamp column + migration | The **already-existing** `products.isActive` boolean [VERIFIED: `src/lib/db/schema.ts:120`] | The column shipped in Phase 2 and is already respected by `getCatalog` (line 91) and `getBrandsForCategory` (line 240). No schema migration needed for this part of D-04 — only a code fix to `getProduct()` (PDP query) which currently does NOT filter `products.isActive` (gap, see below) and a new `deactivateProduct` admin action. |
| Cascading "hide variants of a deleted product" | A new cascade trigger or manual variant loop with new logic | The **already-existing** `variants.isActive` boolean [VERIFIED: `src/lib/db/schema.ts:168`], already treated as OOS by the cart layer (`src/lib/cart/logic.ts:190` — `isOOS = row.stock === 0 || !row.isActive`, `src/lib/actions/cart.ts:104`) | Setting `variants.isActive = false` for all of a deactivated product's variants in the same batch/transaction automatically makes the cart, checkout stock-clamp, and `getProduct`'s existing `variants: { where: eq(v.isActive, true) }` filter all treat them consistently — zero new logic needed in the cart layer. |
| Bank-transfer "mark as paid" logic | A second, admin-specific stock-decrement/idempotency implementation | The existing `confirmOrderPaid()` [VERIFIED: `src/lib/payments/shared/confirm-order-paid.ts`] called with `{ provider: "bank_transfer", eventId: "bank_transfer:<reference>" }` | It already does idempotency-guard insert, atomic `WHERE stock >= qty` decrement, last-unit-race → `payment_failed` + refund-needed signal, and non-blocking confirmation email. D-09 is explicit that this must be reused verbatim, not reimplemented. |
| Cache-tag invalidation timing/plumbing | A custom in-memory or Redis-based cache-bust mechanism | Next.js's built-in `updateTag()` (Server Actions) / `revalidateTag(tag, "max")` (Route Handlers) against the `product-<slug>` tag already wired into the PDP | Next 16's Cache Components model already ties `'use cache'` + `cacheTag` + `updateTag` together; building a parallel invalidation system would fight the framework and risk stale-cache bugs the framework already solves. |
| Payment-method sync→async migration | A parallel `isPaymentMethodEnabledAsync()` function kept alongside the old sync one, or a big-bang rewrite of all callers' control flow | A single signature change (`isPaymentMethodEnabled(): Promise<boolean>`) plus `await` added at each of the ~15 existing call sites (all already inside `async` functions — see Assumptions Log verification) | Every call site (`src/lib/actions/*.ts` Server Actions, `src/app/api/**/route.ts` Route Handlers, `src/app/checkout/page.tsx`'s async `CheckoutContent`) is *already* an `async` context. This is a mechanical, low-risk, single-PR change — not an architectural rewrite. |
| Admin form validation | Hand-rolled `FormData` parsing + manual error strings | `react-hook-form` + `zodResolver` + a Zod schema shared between client validation and the Server Action's own `schema.parse(input)` call | Already the proven, working pattern in this exact codebase (`CheckoutForm.tsx` + `checkout.ts`) — zero new library risk. |
| Vercel Blob credential handling | A custom presigned-URL signer | `@vercel/blob`'s `put()` (reads `BLOB_READ_WRITE_TOKEN` from env automatically) for server uploads | The SDK's built-in credential resolution order (explicit `token` → OIDC → `BLOB_READ_WRITE_TOKEN` → throw) is already correct and tested; a custom signer would duplicate this for no benefit. |

**Key insight:** This phase's schema work is smaller than the CONTEXT anticipated — the "Claude's Discretion" question about `isActive` vs `deletedAt` is already answered by Phase 2's schema (isActive won, and it's already load-bearing in three other query paths). The only new table is `store_settings`. Spend the phase's engineering effort on the admin UI/UX and the `isPaymentMethodEnabled` migration correctness, not on schema design.

## Common Pitfalls

### Pitfall 1: `getProduct()` (PDP query) does not filter `products.isActive`
**What goes wrong:** `src/lib/catalog/queries.ts::getProduct()` currently does `db.query.products.findFirst({ where: eq(products.slug, slug), ... })` with no `isActive` check — only its nested `variants` filter checks `variants.isActive`. If an admin "soft-deletes" (deactivates) a product, its PDP at `/products/<slug>` will still render (with all variants hidden, showing an empty/broken variant selector) instead of 404ing, and its `cacheTag('product-<slug>')`-tagged content will still exist in cache from before deactivation.
**Why it happens:** `getProduct()` was written in Phase 2 before soft-delete existed as a concept; `getCatalog`/`getBrandsForCategory` were updated to filter `isActive` but `getProduct` was missed (or intentionally deferred to Phase 5, per the CONTEXT note "Phase 5 will add Vercel Blob upload" at `productImages` and the general "Phase 5 admin" cache-tag comment).
**How to avoid:** Add `and(eq(products.slug, slug), eq(products.isActive, true))` to `getProduct()`'s `where` clause, call `notFound()` on a null result (as the page already does), and call `updateTag('product-<slug>')` in the `deactivateProduct` admin action so the cached content expires immediately. Add a separate `getProductForAdmin(id)` (no `isActive` filter) so the admin editor can still load and reactivate a deactivated product.
**Warning signs:** A deactivated product's PDP still returning 200 with stale/broken content in manual testing; the plan-checker should verify this filter exists before the phase is marked done.

### Pitfall 2: N+1 `store_settings` reads from `enabledPaymentMethods()`
**What goes wrong:** `enabledPaymentMethods()` calls `isPaymentMethodEnabled(method)` for all 8 `PaymentMethod` values sequentially. If each call independently queries `store_settings`, checkout page loads (which call `enabledPaymentMethods()` once per request) issue up to 8 avoidable DB round trips (in practice fewer, since most gateways short-circuit on the env check before ever touching the DB — see below).
**Why it happens:** The natural "just add `await db.select()...` inline" migration doesn't batch.
**How to avoid:** Only stripe/paypal/bank_transfer are DB-backed in this phase (per D-11 scope note); the switch's env/credential check runs FIRST and short-circuits before any DB read for the other 5 methods (unchanged behavior). For the 3 DB-backed methods, fetch all `store_settings` rows once per request via a small loader (batched `SELECT * FROM store_settings`, optionally wrapped in `React.cache()` for automatic request-scoped dedupe — see Assumptions Log A1) and look up from the in-memory map instead of querying per-method.
**Warning signs:** Checkout page response time regression after this phase; multiple near-identical `SELECT * FROM store_settings` queries in DB logs for a single request.

### Pitfall 3: Illegal order-status jump via a naive dropdown
**What goes wrong:** A `<select>` populated with all 8 `order_status` enum values lets an admin pick, e.g., `pending_payment → delivered` directly in the UI. Even though the shared `updateOrderStatus()` function rejects it server-side (D-08), a bad UX invites confusing errors and support burden.
**How to avoid:** Render only the states in `LEGAL_TRANSITIONS[order.status]` as explicit action buttons ("Mark as Processing", "Mark as Shipped", etc.) rather than a free-choice dropdown — matches the CONTEXT `<specifics>` "moving an order along a track" language.
**Warning signs:** UI offers a status option that the Server Action immediately rejects with a thrown error.

### Pitfall 4: Treating `updateTag` and `revalidateTag` as interchangeable
**What goes wrong:** Copy-pasting `revalidateTag('product-<slug>')` (single arg) into new Server Action code produces a deprecation warning and, more importantly, if the same tag/mutation pattern is later copied into a Route Handler, `updateTag` throws a hard runtime error ("can only be called from within a Server Action").
**How to avoid:** Use `updateTag(tag)` in Server Actions (this phase's actions are all Server Actions); if any future work needs to invalidate the same tag from a Route Handler, use `revalidateTag(tag, "max")` explicitly there instead.
**Warning signs:** Console warning "revalidateTag without the second argument is now deprecated"; or a thrown `Error` with code `E872` in server logs.

### Pitfall 5: Vercel Blob upload exceeding the 4.5MB Function body limit
**What goes wrong:** [CITED: vercel.com/docs/vercel-blob/server-upload, last_updated 2026-05-19] Vercel Functions have a 4.5MB request body limit; a server-side `put()` inside a Server Action will fail for larger product photos (some phone-camera photos or unoptimized DSLR exports can exceed this).
**How to avoid:** Validate file size client-side before submit (reject/warn above ~4MB) and server-side as a defense-in-depth check; if the store owner regularly uploads larger originals, switch to the client-upload token flow (`@vercel/blob/client`'s `upload()` + `handleUpload()`) instead of server `put()`. Given this is a single admin uploading a handful of product photos, recommend starting with server `put()` + a clear size-limit error message, and only build the client-token flow if that limit proves painful in practice.
**Warning signs:** Image upload silently fails or throws a generic 413/500 for certain photos during human-verify.

### Pitfall 6: Required alt text enforced only in the browser
**What goes wrong:** (Restates domain PITFALLS.md #16, directly relevant here) The image upload form's alt-text `required` HTML attribute is trivially bypassed via direct Server Action invocation (same IDOR-style risk as Pitfall 1 in PITFALLS.md).
**How to avoid:** The Zod schema for the image-upload Server Action must reject empty/whitespace-only alt text server-side (`z.string().trim().min(1, "Alt text is required")`), independent of any client-side `required` attribute (SC1 explicitly calls this out).
**Warning signs:** A `product_image` row with `altText: ""` or `altText: null` after using only the admin UI (should be structurally impossible if the Server Action validates correctly).

## Code Examples

### Async, DB-aware `isPaymentMethodEnabled` (D-11)
```typescript
// Source: adapted from existing src/lib/payments/config.ts (verified in this codebase)
// MODIFIED: sync -> async, DB-aware for stripe/paypal/bank_transfer only
import "server-only"
import { cache } from "react"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"

export type PaymentMethod =
  | "stripe" | "paypal" | "bank_transfer" | "paystack" | "flutterwave"
  | "interswitch" | "gtpay" | "remita"

// D-11 scope: only these three get a live DB toggle in this phase.
const DB_BACKED_METHODS: ReadonlySet<PaymentMethod> = new Set(["stripe", "paypal", "bank_transfer"])

// Request-scoped batched read — avoids N+1 from enabledPaymentMethods().
// NOTE: React.cache() dedupe inside Server Actions specifically is not as
// rigorously documented as inside Server Component render — see Assumptions Log A1.
// Correctness does not depend on the dedupe firing; worst case is extra fast reads.
const getStoreSettingsMap = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await db.select().from(storeSettings)
  return Object.fromEntries(rows.map((r) => [r.method, r.enabled]))
})

function hasEnvAndCredentials(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    case "paypal":
      return process.env.ENABLE_PAYPAL === "true"
        && !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET
    case "bank_transfer":
      return process.env.ENABLE_BANK_TRANSFER === "true"
        && !!process.env.BANK_NAME && !!process.env.BANK_ACCOUNT_NUMBER && !!process.env.BANK_ACCOUNT_NAME
    // ... paystack/flutterwave/interswitch/gtpay/remita: unchanged env-only checks (D-11 scope note)
    default:
      return false // fill in from existing switch for the 5 non-DB-backed methods
  }
}

export async function isPaymentMethodEnabled(method: PaymentMethod): Promise<boolean> {
  if (!hasEnvAndCredentials(method)) return false // short-circuit — no DB read for disabled/unconfigured methods

  if (!DB_BACKED_METHODS.has(method)) return true // Phase 7/7.1 gateways: unchanged env-only behavior

  const settings = await getStoreSettingsMap()
  // No row for this method yet (table not seeded for it) => fall back to "enabled" (current env-only behavior)
  return settings[method] ?? true
}

export async function enabledPaymentMethods(): Promise<PaymentMethod[]> {
  const methods: PaymentMethod[] = ["stripe", "paypal", "bank_transfer", "paystack", "flutterwave", "interswitch", "gtpay", "remita"]
  const results = await Promise.all(methods.map(async (m) => [m, await isPaymentMethodEnabled(m)] as const))
  return results.filter(([, enabled]) => enabled).map(([m]) => m)
}
```

**Call-site migration is mechanical** — every existing call site is already `async`:
```typescript
// BEFORE (src/lib/actions/checkout.ts:160, verified)
if (!isPaymentMethodEnabled("bank_transfer")) { ... }
// AFTER
if (!(await isPaymentMethodEnabled("bank_transfer"))) { ... }
```
```typescript
// BEFORE (src/app/checkout/page.tsx:57, verified — CheckoutContent is already `async function`)
const methods = enabledPaymentMethods()
// AFTER
const methods = await enabledPaymentMethods()
```

### `store_settings` schema addition
```typescript
// ADD to src/lib/db/schema.ts — new table only; NO changes needed to products/variants (isActive already exists)
export const storeSettings = pgTable("store_settings", {
  method:    text("method").primaryKey(), // "stripe" | "paypal" | "bank_transfer" (extensible — no enum, so new gateways can insert a row later without a migration)
  enabled:   boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
})
```
Seed (idempotent upsert, mirrors `src/scripts/seed.ts` pattern):
```sql
INSERT INTO store_settings (method, enabled) VALUES
  ('stripe', true), ('paypal', false), ('bank_transfer', true)
ON CONFLICT (method) DO NOTHING;
```

### Direct-SQL schema push fallback (established pattern)
```javascript
// NEW — src/scripts/apply-store-settings-schema.mjs
// Mirrors src/scripts/apply-order-schema.mjs (documented fallback: drizzle-kit push
// hits a TTY prompt for new-table creation in this environment).
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
await sql`
  CREATE TABLE IF NOT EXISTS "store_settings" (
    "method" text PRIMARY KEY NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )
`
await sql`
  INSERT INTO "store_settings" (method, enabled) VALUES
    ('stripe', true), ('paypal', false), ('bank_transfer', true)
  ON CONFLICT (method) DO NOTHING
`
// Run against BOTH DATABASE_URL and TEST_DATABASE_URL (CLAUDE.md Testing section) —
// duplicate the script or parameterize on an env var, same as the order-schema pair
// (apply-order-schema.mjs / apply-order-schema-to-test-db.mjs).
```

### Status-change email sender (ORD-03, mirrors existing lazy-client pattern)
```typescript
// NEW — src/lib/email/send-order-status-change.ts
// Source pattern: src/lib/email/send-order-confirmation.ts + resend-client.ts (verified, incl. lazy-client fix from commit 3207e49)
import "server-only"
import { getResendClient } from "./resend-client"
import { OrderStatusChangeEmail } from "@/emails/OrderStatusChangeEmail"

export async function sendOrderStatusChangeEmail(input: {
  customerEmail: string
  reference: string
  guestToken: string
  newStatus: "shipped" | "delivered"
}): Promise<void> {
  const resend = getResendClient()
  if (!resend) throw new Error("RESEND_API_KEY is not configured — cannot send status email")
  const { error } = await resend.emails.send({
    from: "Mandy Store <onboarding@resend.dev>",
    to: input.customerEmail,
    subject: input.newStatus === "shipped"
      ? `Your order ${input.reference} has shipped`
      : `Your order ${input.reference} was delivered`,
    react: OrderStatusChangeEmail(input),
  })
  if (error) throw new Error(`Failed to send status-change email: ${error.message}`)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `revalidateTag(tag)` single-argument | `revalidateTag(tag, profile)` (2-arg) or `updateTag(tag)` in Server Actions | Next.js 16 Cache Components (`cacheComponents: true`) [VERIFIED: installed next@16.2.7 source] | New admin cache-invalidation code must use `updateTag` (Server Actions) — the single-arg `revalidateTag` still works but is deprecated and console-warns |
| Manual product-soft-delete design | Already-shipped `isActive` boolean on `products`/`variants` (Phase 2) | Already in the codebase since Phase 2 (2026-06-11) | Phase 5 does not need a new soft-delete column or migration — only a `getProduct()` query fix and a new admin action |

**Deprecated/outdated:**
- Single-argument `revalidateTag(tag)` in `cacheComponents: true` mode: still functional but explicitly flagged deprecated by the framework itself (console warning), in favor of `updateTag`/`revalidateTag(tag, profile)`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `React.cache()` reliably deduplicates a database read across multiple calls *within a single Server Action invocation* (not just within Server Component render) in Next.js 16.2.7. | Architecture Patterns §Anti-Patterns, Code Examples (`getStoreSettingsMap`) | If it does NOT dedupe inside Server Actions, `enabledPaymentMethods()` issues up to 3 DB reads (for the 3 DB-backed methods) instead of 1 per request — a minor performance cost, not a correctness bug, since each call still returns correct data. Low risk; if this matters, planner should test directly (log query count) rather than trust this claim, or simply avoid `cache()` and call the loader function once at the top of each Server Action and thread the result down manually. |
| A2 | A single admin user's product photography will stay under Vercel's 4.5MB Function request-body limit, making server-side `put()` (not the client-upload token flow) sufficient for this phase. | Architecture Patterns §Alternatives Considered, Common Pitfalls §5 | If product photos regularly exceed 4.5MB (e.g., unresized DSLR exports), server `put()` uploads will fail with a body-size error; the fix is a follow-up to the client-upload flow (`@vercel/blob/client`), not a redesign. |
| A3 | No refund-initiation flow is needed when an admin cancels a `payment_confirmed` order (the transition graph allows `payment_confirmed → cancelled` but does not call any gateway refund API). | Architecture Patterns §4 (transition graph) | If the store owner expects cancelling a paid order to automatically refund the customer, this phase's implementation would leave the customer charged with no refund triggered — a business-process gap, not a code bug. Confirm with the user before implementation; flagged in Open Questions. |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Does cancelling a `payment_confirmed` order need to trigger a gateway refund?**
   - What we know: The Phase 4/7 gateway adapters (`stripe.refunds.create`, Flutterwave refund path) already exist for the *oversold* recovery case inside `confirmOrderPaid`'s caller.
   - What's unclear: Whether ADMN-03/ORD-03 expect admin-initiated cancellation of an already-paid order to also issue a refund via the original payment method, or whether refunds are handled entirely offline (bank transfer back, manual Stripe dashboard action) for v1.
   - Recommendation: Treat as offline/manual for this phase (matches "not in Phase 5 scope" tone of the Deferred Ideas list) unless the user says otherwise during planning; do not build a refund API call into `updateOrderStatus()`.

2. **Should reactivating a soft-deleted product also reactivate all of its variants?**
   - What we know: Deactivating a product should cascade `isActive = false` to all its variants (reuses existing cart OOS logic, see Don't Hand-Roll).
   - What's unclear: On reactivation, some variants might have been individually deactivated for legitimate reasons (e.g., discontinued color) before the product-level deactivation — blindly reactivating all variants could resurface stock the owner intended to keep hidden.
   - Recommendation: Reactivating a product should NOT automatically reactivate variants; the admin variant editor already lets the owner flip individual variant `isActive` back on as a separate, explicit action.

3. **Do NG gateways (Paystack/Flutterwave/Interswitch/GTPay/Remita) get `store_settings` rows in this phase, even without admin UI?**
   - What we know: CONTEXT explicitly excludes standalone toggle UI for them but says the mechanism "may adopt... opportunistically."
   - What's unclear: Whether seeding rows now (defaulting to mirror current env state) is worth the small effort vs. leaving them purely env-gated until a future phase builds their UI.
   - Recommendation: Do NOT seed rows for them in this phase — the `isPaymentMethodEnabled` fallback (`settings[method] ?? true`) already keeps them working unchanged with zero DB rows, which is the simplest, lowest-risk choice.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@vercel/blob` npm package | ADMN-01 image upload | ✗ (not installed) [VERIFIED: `grep vercel/blob package.json` → no match] | latest on npm: 2.6.1 | `npm install @vercel/blob` — no fallback needed, trivial install |
| `BLOB_READ_WRITE_TOKEN` env var | Image upload `put()`/`del()` calls | ✗ (not set in `.env.local`) [VERIFIED: grep against `.env.local`] | — | Human-verify checkpoint required before image upload can be tested end-to-end (create a Vercel Blob store, pull the token) — mirrors the existing pattern of Stripe/Paystack live-verify checkpoints already in this project. Admin CRUD for text fields (name/price/stock) can be built and tested without this token; only the image-upload path is blocked. |
| `TEST_DATABASE_URL` | DB integration tests for new admin actions + `store_settings` | ✓ (set, per environment constraints) | — | — |
| Node 22 (for `npm`/`npx`/vitest) | Any build/test/install command in this phase | ✓ via `nvm use 22` | — | Shell defaults to Node 18 — must `nvm use 22` before any npm/npx/vitest command (per environment constraints) |

**Missing dependencies with no fallback:**
- None blocking — `@vercel/blob` is a trivial `npm install`; `BLOB_READ_WRITE_TOKEN` blocks only the live human-verify step, not the code-complete milestone (same pattern as prior phases' sandbox-credential-gated checkpoints).

**Missing dependencies with fallback:**
- `BLOB_READ_WRITE_TOKEN` — code can be written and unit-tested (mocking `@vercel/blob`'s `put`/`del`) before a real token is available; only the human-verify checkpoint needs it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (repo root) — `fileParallelism: false`, 30s timeouts, `TEST_DATABASE_URL` isolation already wired |
| Quick run command | `npx vitest run tests/admin` (once created) |
| Full suite command | `npm test` (runs `vitest run` — all `tests/**`, DB-gated tests skip without `TEST_DATABASE_URL`, which IS set in this environment) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMN-01 | Non-admin/unauthenticated user cannot call product create/update/delete actions | unit (always-runs) | `npx vitest run tests/admin/products.test.ts -t "auth"` | ❌ Wave 0 |
| ADMN-01 | Product image upload rejects empty/missing alt text server-side | unit (always-runs, mocks `@vercel/blob`) | `npx vitest run tests/admin/products.test.ts -t "alt text"` | ❌ Wave 0 |
| ADMN-01 | Deactivating a product hides it from `getCatalog`/`getProduct` but preserves it for `getProductForAdmin` and existing order history | integration (DB-gated) | `npx vitest run tests/admin/products.test.ts -t "soft delete"` | ❌ Wave 0 |
| ADMN-02 | Updating variant price/stock calls `updateTag('product-<slug>')` | unit (mock `next/cache`) | `npx vitest run tests/admin/products.test.ts -t "cache invalidation"` | ❌ Wave 0 |
| ADMN-03 | `updateOrderStatus` rejects illegal transitions (e.g. `pending_payment → delivered`) | unit (always-runs) | `npx vitest run tests/admin/orders.test.ts -t "illegal transition"` | ❌ Wave 0 |
| ADMN-03 / D-09 | Admin bank-transfer confirm (`awaiting_bank_transfer → payment_confirmed`) decrements stock atomically and is idempotent on double-call | integration (DB-gated) | `npx vitest run tests/admin/orders.test.ts -t "bank transfer confirm"` | ❌ Wave 0 |
| ORD-03 | Status email fires (mocked Resend) on `shipped`/`delivered` only, not on `processing` | unit (always-runs) | `npx vitest run tests/admin/orders.test.ts -t "status email"` | ❌ Wave 0 |
| ADMN-04 | Disabled payment method (DB flag off OR missing env credential) is rejected at the Server Action/Route level, not just hidden in UI | unit (always-runs) | `npx vitest run tests/payments/config.test.ts -t "toggle enforcement"` | ❌ Wave 0 |
| ADMN-04 | All existing Phase 4/7/7.1 payment action tests still pass after the async migration (regression) | integration (existing suite) | `npm test` (full suite) | ✓ existing (`tests/checkout/*.test.ts`) |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run tests/admin/<file>.test.ts` for the file(s) touched
- **Per wave merge:** `npm test` (full suite) — critical given the D-11 migration touches ~15 files across Phases 4/7/7.1; regression risk is real and must be caught by the existing 319-test suite passing unchanged
- **Phase gate:** Full suite green (including all pre-existing DB-gated tests, since `TEST_DATABASE_URL` is set in this environment) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/admin/products.test.ts` — covers ADMN-01, ADMN-02 (mirrors `tests/checkout/actions.test.ts` mock structure: `vi.mock("server-only")`, `vi.mock("next/headers")`, `vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))` — note the mock must add `updateTag` since it doesn't exist in the current mock shape used by `tests/checkout/*.test.ts`)
- [ ] `tests/admin/orders.test.ts` — covers ADMN-03, ORD-03, D-09 bank-transfer-confirm reuse
- [ ] `tests/admin/settings.test.ts` — covers ADMN-04 toggle Server Action
- [ ] `tests/payments/config.test.ts` extension — add async `isPaymentMethodEnabled` cases (DB flag off, DB flag on + no creds, DB flag on + creds present, method with no DB row falls back to env-only)
- [ ] `tests/helpers/db.ts` extension — add `truncateStoreSettingsTable()` following the existing `truncateOrderTables()`/`truncateCartTables()` pattern
- [ ] Framework install: none — Vitest already configured; no new test framework needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Existing Auth.js v5 session (`auth()`) — no new auth mechanism introduced |
| V3 Session Management | Yes | Existing DB-backed session via Auth.js JWT+DB workaround (D-08, Phase 1) — unchanged |
| V4 Access Control | Yes | `verifyAdminSession()` re-verified as the FIRST statement of every admin Server Action/Route/layout (D-02) — role read exclusively from the verified session, never from client input (Pitfall 7 in domain PITFALLS.md) |
| V5 Input Validation | Yes | `zod` schemas for every admin Server Action input (product fields, variant price/stock as positive integers in kobo, alt text non-empty, order status against the enum) |
| V6 Cryptography | No new surface | No new secrets/crypto introduced; `BLOB_READ_WRITE_TOKEN` and payment secrets remain server-only env vars, never DB/UI (D-11 explicit) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Server Action called directly (bypassing proxy/UI) to mutate a product/order/setting | Elevation of Privilege | `verifyAdminSession()` as literal first statement in every admin Server Action (D-02, already the established pattern in this codebase) |
| Admin Server Action returns raw Drizzle record including internal fields | Information Disclosure | Return minimal DTOs only (`{ success, id }`), per existing Pitfall 10 in domain PITFALLS.md |
| Payment-toggle UI-only enforcement (flag hidden in UI but action/route still reachable) | Tampering / Elevation of Privilege | `isPaymentMethodEnabled()` checked as the first statement of every payment action/route — this pattern already exists for all Phase 4/7/7.1 call sites and must be preserved through the D-11 async migration, not weakened |
| Anonymous/unauthenticated Vercel Blob upload | Elevation of Privilege | Server-side `put()` call only ever reached after `verifyAdminSession()` passes inside the Server Action — no public upload Route Handler is created in this phase (the client-upload `handleUpload()` token flow, if adopted later, MUST authenticate inside `onBeforeGenerateToken`, per the official Vercel Blob docs warning: "Without this check, anyone can upload to your Blob store") |
| Illegal order-status forcing (e.g. skip straight to `delivered` without payment) | Tampering | `updateOrderStatus()`'s `LEGAL_TRANSITIONS` allowlist rejects any transition not explicitly listed, server-side, regardless of what the UI sends |

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/server/web/spec-extension/revalidate.js` + `.d.ts` — installed next@16.2.7 source, read directly in this session — `revalidateTag`/`updateTag` exact semantics
- `src/lib/db/schema.ts` — read directly — confirms `products.isActive`, `variants.isActive` already exist
- `src/lib/catalog/queries.ts` — read directly — confirms `getCatalog`/`getBrandsForCategory` filter `isActive`, `getProduct` does not (gap)
- `src/lib/cart/logic.ts`, `src/lib/actions/cart.ts`, `src/lib/cart/merge.ts` — read directly — confirms cart already treats `!variant.isActive` as OOS
- `src/lib/payments/config.ts` + full-repo grep for `isPaymentMethodEnabled`/`enabledPaymentMethods` — read/grepped directly — confirms all ~15 call sites and that all are inside `async` functions
- `src/lib/payments/shared/confirm-order-paid.ts` — read directly — confirms the exact idempotency/decrement/refund-signal contract D-09 must reuse
- `src/app/products/[slug]/page.tsx` — read directly — confirms existing `cacheTag('product-<slug>')` hook and its code comment anticipating `updateTag`
- `src/lib/email/send-order-confirmation.ts`, `src/lib/email/resend-client.ts` — read directly — confirms the lazy-Resend-client pattern (post commit `3207e49`) to mirror for the new status-change email
- npm registry (`npm view @vercel/blob version`, `dist-tags`) — checked live in this session — `2.6.1` is latest
- [@vercel/blob using-blob-sdk](https://vercel.com/docs/vercel-blob/using-blob-sdk) — fetched directly, `last_updated: 2026-05-19` — `put()`/`del()`/`head()`/`list()`/`copy()` full parameter tables, client-upload `handleUpload()`/`onBeforeGenerateToken` auth warning
- [@vercel/blob server-upload](https://vercel.com/docs/vercel-blob/server-upload) — fetched directly, `last_updated: 2026-05-19` — 4.5MB Vercel Function body-size limit

### Secondary (MEDIUM confidence)
- WebSearch on React `cache()` dedupe scope — general confirmation it dedupes "within a single render pass" for Server Components; Server Action-specific dedupe guarantee is asserted with lower certainty (see Assumptions Log A1)

### Tertiary (LOW confidence)
- None used as load-bearing claims in this document — all Standard Stack/Architecture claims above are VERIFIED or CITED.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package is either already installed and proven in this exact codebase, or freshly verified against the npm registry
- Architecture: HIGH — order-status graph and cache-invalidation API are grounded in direct source reads of the installed Next.js version and the existing `confirmOrderPaid`/`isPaymentMethodEnabled` code; MEDIUM only on the `React.cache()` dedupe-in-Server-Actions nuance (A1)
- Pitfalls: HIGH — Pitfalls 1–4, 6 are derived from direct code reads (real gaps found, not speculative); Pitfall 5 is CITED from official Vercel docs

**Research date:** 2026-07-08
**Valid until:** 30 days for the Next.js/Vercel Blob API claims (stable, versioned APIs); re-verify `@vercel/blob` version if installation is delayed past that window.
