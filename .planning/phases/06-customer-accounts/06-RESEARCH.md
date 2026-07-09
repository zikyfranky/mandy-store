# Phase 6: Customer Accounts - Research

**Researched:** 2026-07-09
**Domain:** Next.js 16 App Router — user-scoped Drizzle queries, IDOR-safe order detail, best-effort account linking on registration
**Confidence:** HIGH (this phase extends existing, proven patterns with zero new dependencies and no schema change)

## Summary

Phase 6 is small and entirely additive: it reuses the exact shapes already proven in Phase 4/5 (`getOrderByToken`, `getOrderForAdmin`, `listOrdersForAdmin`) and swaps the scoping key from `guestToken`/none to a session-verified `userId`. No new libraries, no schema migration (`orders.userId` and `order_user_idx` already exist from Phase 4), no new UI framework — only two new query functions, two new/grown pages, and one small addition to `register()`.

The two things that actually require care are (1) the IDOR scoping — `getOrderForUser` must return `null` for an order that exists but isn't owned by the caller, so the page can 404 rather than leak existence via a 403/redirect — and (2) the guest-order claim in `register()`, which must be a best-effort, non-blocking `UPDATE ... WHERE guestToken = ? AND userId IS NULL` so it can never turn a successful signup into a failure and can never reassign an order someone else already claimed or that already belongs to another account.

**Primary recommendation:** Mirror `getOrderForAdmin`'s `db.query.orders.findFirst({ where: and(eq(orders.id, id), eq(orders.userId, userId)), with: { items: true } })` shape for the detail read, mirror `listOrdersForAdmin`'s select+subquery shape (swap the admin's `count(*)` pagination for a per-order item-count column) for the list, thread `orderToken` through `register()` as an ordinary optional `FormData` field (no signature change), and run the claim as a guarded `UPDATE` with no separate confirmation logic.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session verification (dual-auth) | Frontend Server (SSR) — `verifySession()` in `src/lib/dal.ts` | Browser/Client (redirect layer via `proxy.ts`) | `proxy.ts` cannot protect Server Components/Actions (CLAUDE.md); the DAL re-check is the authoritative layer, proxy is defense-in-depth only |
| Order-history list query | Database / Storage (Drizzle query, `orders` table) | — | Pure read scoped by an indexed column (`order_user_idx`); no business logic beyond ownership filter |
| Order detail query (IDOR-safe) | Database / Storage (Drizzle query) | Frontend Server (404 decision) | The query enforces ownership at the SQL `WHERE` clause (never trust an app-layer check alone); the page decides 404 vs render based on `null` |
| Guest-order claim | API / Backend (Server Action `register()`) | Database / Storage (guarded `UPDATE`) | Claim logic is a side-effect of the auth action, but the safety invariant (`WHERE guestToken = ? AND userId IS NULL`) is enforced by the database query itself, not application logic that could race |
| Order-history / detail UI | Browser / Client (rendered by RSC, no client JS needed) | — | Read-only display; no interactivity beyond `<Link>` navigation — no client component required |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-04 | Logged-in user can view their order history | `listOrdersForUser`/`getOrderForUser` query design (below), `/account/orders` + `/account/orders/[id]` page patterns, component-reuse mapping, dual-auth verification, guest-order claim completing the Phase 4 D-03 loop |
</phase_requirements>

## User Constraints (from CONTEXT.md)

> Copied verbatim from `.planning/phases/06-customer-accounts/06-CONTEXT.md`. These are LOCKED — do not relitigate.

### Locked Decisions

- **D-01:** Order history lives at `/account/orders` (the existing Phase 1 stub — grow it). Render a list of order cards, newest first, each showing: order reference (`MS-XXXXXX`), date, status badge (reuse `OrderStatusBadge` from Phase 5 `src/components/admin/`), item count, and total (`formatNGN`). Each card links to its detail page.
- **D-02:** Empty state — when the user has no orders, show a friendly "No orders yet" card with a link to browse products (`/`), consistent with the cart empty-state pattern.
- **D-03:** Order detail at `/account/orders/[id]`, an authenticated route scoped to the session user. Reuse `OrderSummaryLines` + `ShippingAddressBlock` verbatim (the same components the guest `/order/[token]` page and the admin order-detail use). Show line items with variant labels, shipping-address snapshot, payment method, and the final total as captured at purchase (from `order`/`order_item` snapshots — never recomputed).
- **D-04 (SECURITY — the core of this phase):** All customer order reads are scoped by the session `userId`, never a client-supplied id. `/account/orders/[id]` loads the order only if `order.userId === session.user.id`; otherwise 404 (not 403 — do not reveal existence). No IDOR: a customer can never see another user's order by guessing an id.
- **D-05:** Add to `src/lib/orders/queries.ts` (mirroring the existing `getOrderByToken` shape): `listOrdersForUser(userId: string)` — orders where `userId` matches, newest first, with the columns the list cards need (reference, createdAt, status, totalKobo, item count). `getOrderForUser(userId: string, orderId: string)` — single order with items + shipping snapshot, returning null unless it belongs to `userId`. Uses the existing `order_user_idx`. Both take `userId` from the verified session only, never from the URL/body.
- **D-06:** When a guest registers via `/account/register?orderToken=<token>`, after the account is created, link that one order to the new user: `UPDATE orders SET userId = <newUserId> WHERE guestToken = <token> AND userId IS NULL` (claim only an unclaimed guest order; never reassign an order already owned by someone). Scope = the single token-identified order only. The register page/action reads `orderToken` from `searchParams` and passes it through; the claim runs server-side in (or right after) the `register` action. If the token is missing/invalid/already claimed, registration still succeeds — the link is best-effort, never blocking.
- **D-07:** Keep it minimal (accounts off the critical path). `/account` is a lightweight landing showing the signed-in email, a logout control, and a link to Order history. `/account/orders` is the primary surface. Reuse the existing site header/auth patterns and the indigo system. No new nav framework.
- **D-08:** Order history and detail are per-user dynamic data — no `'use cache'`. Follow the established `cacheComponents`/PPR pattern: `verifySession()` + the user-scoped DB read run inside a `Suspense` boundary (mirror the existing `/account/orders` stub and `getCartCount` CartShell pattern), so static prerender of other routes isn't broken.

### Claude's Discretion

- Exact column selection / join shape for `listOrdersForUser` (item-count via subquery vs join).
- Whether `/account` is a distinct page or a redirect to `/account/orders` (either is fine; lean to a minimal landing page with the logout + link).
- Whether a logged-in user hitting `/account/register?orderToken=` (or a `login?orderToken=`) path should also trigger the claim — nice-to-have; the registration-time claim (D-06) is the required path. Planner may add a symmetric login-time claim if cheap.
- Pagination of order history (likely unnecessary for v1 volume; add a simple limit if desired).

### Deferred Ideas (OUT OF SCOPE)

- Profile editing, password change, saved/default addresses, wishlists, one-click re-order → v2.
- Bulk retro-claim of ALL past guest orders by matching email at registration → deferred (only the single `orderToken` order is claimed; email-based bulk claim risks mis-linking).
- Order-history pagination/search/filtering → add only if v1 volume warrants (Claude's discretion).
- Email notifications for account events → out of scope.

## Project Constraints (from CLAUDE.md)

- **Next.js 16 uses `proxy.ts`, not `middleware.ts`.** The proxy cannot protect Server Actions/Components — every protected surface must re-verify with `verifySession()` (already true of the `/account/orders` stub; the new detail page and the growing list page must keep this).
- **Never trust client-submitted identifiers.** `listOrdersForUser`/`getOrderForUser` take `userId` only from `verifySession()`'s return value, never from a route param, form field, or header — this is D-04/D-05's whole point and CLAUDE.md's general rule.
- **DB test isolation:** integration tests must run only against `TEST_DATABASE_URL` (confirmed set per the environment constraints for this phase), never `DATABASE_URL`. Truncate helpers already hard-refuse without it.
- Atomic-decrement and webhook-idempotency constraints are not implicated by this phase (no stock mutation, no payment webhook involved) — noted for completeness, not actionable here.
- Payment-method toggles are not implicated by this phase.

## Standard Stack

No new dependencies. This phase is 100% additive code against the existing stack:

| Library | Version (verified in `package.json`) | Purpose | Why Standard (here) |
|---------|------|---------|--------------------|
| next | 16.2.7 | App Router pages, async `params`/`searchParams`, `notFound()` | Already the project framework; Next 16 requires `params`/`searchParams` to be awaited (used by `register/page.tsx` and every `[id]`/`[token]` route already) |
| drizzle-orm | ^0.45.2 | `listOrdersForUser`/`getOrderForUser` queries | Same query builder used by every other order/admin query in the codebase — `db.query.orders.findFirst` (relational API) and `db.select()...sql` (raw subquery) are both established local patterns |
| next-auth (Auth.js v5 beta.31) | ^5.0.0-beta.31 | `auth()` session read inside `verifySession()` | Already wired; unchanged by this phase |
| zod | ^4.4.3 | Not newly needed — `RegisterSchema` in `src/lib/actions/auth.ts` does not need to validate `orderToken` (it's optional and best-effort; an invalid/garbage token is simply a no-op `UPDATE`, not a validation failure) | N/A — deliberately no schema addition |
| vitest | ^4.1.8 | New integration tests for the two queries + the claim | Existing test runner/config, no changes needed |

**No installation required for this phase.**

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Scoping via `WHERE userId = ?` at the query layer | Fetching by id only, then checking `order.userId === session.id` in the page/component | Rejected — an app-layer-only check is one refactor away from an IDOR bug (e.g., a future caller that forgets the check); pushing the ownership filter into the SQL `WHERE` clause is defense-in-depth and matches D-04's explicit security framing |
| Threading `orderToken` as a new `register()` parameter (`register(formData, orderToken)`) | Reading it as an ordinary optional `FormData` field (`formData.get("orderToken")`) | The codebase's `register()` is invoked via `useActionState<RegisterState, FormData>` from `RegisterForm` (a fixed `(prevState, formData) => Promise<State>` shape) — changing the exported signature would require also changing every call site and the `useActionState` wiring. A hidden `<input type="hidden" name="orderToken">` populated from `searchParams` keeps `register(formData)` unchanged and is backward-compatible with every existing test that builds `FormData` without the field (returns `null`, claim skipped) |

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │  GET /account/orders                 GET /account/orders/[id]
  ▼                                          ▼
proxy.ts  ── redirect if unauthenticated (layer 1, defense-in-depth)
  │
  ▼
Server Component (Suspense boundary, no 'use cache')
  │
  ├─ verifySession()  ── layer 2, authoritative — redirects to /account/login if no session
  │      │
  │      ▼
  │   session.user.id  (NEVER a URL/body-supplied id)
  │
  ├─ list page:   listOrdersForUser(userId)         ─┐
  │                                                   ├─ Drizzle → Postgres (order_user_idx)
  └─ detail page: getOrderForUser(userId, orderId)  ─┘      scoped WHERE userId = ?
         │
         ├─ null (not found OR not owned) → notFound() → styled 404 (D-04: no 403, no existence leak)
         └─ order → render OrderSummaryLines + ShippingAddressBlock + OrderStatusBadge (verbatim reuse)

Guest-order claim (separate flow, same phase):
Browser  GET /account/register?orderToken=<token>
  │
  ▼
register/page.tsx (async, reads searchParams) → RegisterForm(orderToken) → hidden <input name="orderToken">
  │
  ▼
register() Server Action
  ├─ existing flow: validate, create user, send verification email (UNCHANGED)
  └─ NEW: if formData.get("orderToken") → best-effort
           UPDATE orders SET userId = <newUserId>
           WHERE guestToken = <token> AND userId IS NULL
           (0 rows affected = silent no-op; never blocks the success response)
```

### Recommended Project Structure

No new top-level folders. Additions land in existing locations:

```
src/
├── lib/orders/queries.ts        # + listOrdersForUser, getOrderForUser
├── lib/actions/auth.ts          # register() gains the best-effort claim (D-06)
├── app/account/
│   ├── page.tsx                 # NEW — minimal landing (D-07)
│   ├── orders/page.tsx          # GROW — stub → real list (D-01/D-02)
│   └── orders/[id]/page.tsx     # NEW — detail (D-03/D-04)
├── app/(auth)/account/register/page.tsx   # reads searchParams, passes orderToken
├── components/auth/RegisterForm.tsx       # accepts orderToken prop, hidden input
└── components/account/                    # NEW (optional) — OrderCard / OrdersEmptyState,
                                            # or inline in orders/page.tsx if simple enough
```

### Pattern 1: IDOR-safe single-order read (mirrors `getOrderForAdmin`)

**What:** Scope the `WHERE` clause by the verified session id at the query layer, return `null` (not `undefined`, not throw) on any non-match — unknown id and wrong-owner id are indistinguishable to the caller.
**When to use:** `getOrderForUser(userId, orderId)`.
**Example:**
```typescript
// Source: src/lib/catalog/admin-queries.ts getOrderForAdmin (existing pattern to mirror)
// and src/lib/orders/queries.ts getOrderByToken (existing `with: { items: true }` shape)
import { and, eq } from "drizzle-orm"

export async function getOrderForUser(userId: string, orderId: string) {
  if (!userId || !orderId) return null
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    with: { items: true },
  })
  return order ?? null
}
```
The page then does:
```typescript
const order = await getOrderForUser(session.id, id)
if (!order) return notFound() // D-04: 404, never 403 — no existence leak
```

### Pattern 2: List with per-row item count (mirrors `listProductsForAdmin`'s variant-aggregate join)

**What:** A `leftJoin` against a `groupBy` subquery aliased with `.as(...)` is the codebase's established shape for "list + per-row aggregate" (used for `variantCount`/`minPriceKobo`/`stockTotal` in `listProductsForAdmin`). Reuse the same shape for `itemCount` instead of introducing a new correlated-subquery style.
**When to use:** `listOrdersForUser(userId)`.
**Example:**
```typescript
// Source: src/lib/catalog/admin-queries.ts listProductsForAdmin (existing pattern, adapted)
import { and, desc, eq, sql } from "drizzle-orm"
import { orders, orderItems } from "@/lib/db/schema"

export async function listOrdersForUser(userId: string) {
  const itemCountSq = db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`COUNT(*)`.as("item_count"),
    })
    .from(orderItems)
    .groupBy(orderItems.orderId)
    .as("item_count_sq")

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      createdAt: orders.createdAt,
      status: orders.status,
      totalKobo: orders.totalKobo,
      itemCount: itemCountSq.itemCount,
    })
    .from(orders)
    .leftJoin(itemCountSq, eq(orders.id, itemCountSq.orderId))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))

  return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount ?? 0) }))
}
```
No pagination unless volume warrants it (Claude's Discretion, D-08 in CONTEXT.md list) — a single unbounded `WHERE userId = ?` query is fine for v1 per-account order counts; add a `.limit()` only if the planner wants to be defensive.

### Pattern 3: Best-effort guest-order claim inside `register()`

**What:** Read an optional `orderToken` from the same `FormData` object `register()` already receives (no signature change), then run a single guarded `UPDATE` after the user row is created. The `WHERE guestToken = ? AND userId IS NULL` clause is the entire safety mechanism — it is a no-op (0 rows) for a missing/invalid/already-claimed token, so no separate "does this token exist and is it claimable" pre-check is needed.
**When to use:** Inside `register()`, after `db.insert(users)` succeeds and `userId` is known, before the function returns.
**Example:**
```typescript
// Source: pattern adapted from register()'s existing best-effort email-send try/catch
// (src/lib/actions/auth.ts lines ~100-116) — same "never let a side-effect fail the signup" shape
import { orders } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"

// ...after db.insert(users).values({...}) succeeds and userId is known...

const orderToken = (formData.get("orderToken") as string | null) || null
if (orderToken) {
  try {
    await db
      .update(orders)
      .set({ userId })
      .where(and(eq(orders.guestToken, orderToken), isNull(orders.userId)))
    // No need to check rowCount — a 0-row result (bad/foreign/already-claimed token)
    // is an intentional, silent no-op per D-06 ("best-effort, never blocking").
  } catch (err) {
    // Mirror the verification-email pattern: log, never throw — registration already succeeded.
    console.error("[register] guest-order claim failed (account still created):", err)
  }
}
```
And the page/form change to carry the token through:
```typescript
// src/app/(auth)/account/register/page.tsx — Next.js 16 async searchParams
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ orderToken?: string }>
}) {
  const { orderToken } = await searchParams
  return <RegisterForm orderToken={orderToken} />
}
```
```typescript
// src/components/auth/RegisterForm.tsx — accepts the prop, renders a hidden field
export default function RegisterForm({ orderToken }: { orderToken?: string }) {
  // ...unchanged useActionState wiring...
  return (
    <form action={formAction} className="space-y-4">
      {orderToken && <input type="hidden" name="orderToken" value={orderToken} />}
      {/* ...existing fields unchanged... */}
    </form>
  )
}
```

### Anti-Patterns to Avoid

- **Checking ownership after the fetch instead of in the `WHERE` clause:** `db.query.orders.findFirst({ where: eq(orders.id, orderId) })` followed by an `if (order.userId !== session.id)` check in the component works today but is a latent IDOR risk if any future code path calls the "unscoped" version of the query directly. D-04 requires the scoping to be inseparable from the query itself.
- **Validating the `orderToken` before claiming:** Do not add a "does this order exist / is it already claimed" read before the `UPDATE`. That's a redundant round-trip and a TOCTOU race (another claim or admin action could land between the check and the update). The single guarded `UPDATE` is already atomic and correct.
- **Changing `register()`'s exported signature to accept `orderToken` as a second parameter:** breaks the `useActionState` wiring and every existing call site/test unnecessarily. Use the `FormData` field approach (Pattern 3).
- **Returning `undefined` instead of `null` from `getOrderForUser`:** the codebase convention (`getOrderForAdmin`) is `null` for "not found for this caller" so pages can use a single `if (!order)` check; stay consistent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Order-status badges | A new set of colored `<span>`s for the 8 statuses on the account list | `OrderStatusBadge` from `src/components/admin/OrderStatusBadge.tsx` (already exported, already accessible icon+text) | D-01 explicitly calls this out; it's a pure, prop-driven component with no admin-specific coupling — safe to import from a customer route |
| Order summary / shipping display | New markup for line items + totals + address on the detail page | `OrderSummaryLines` + `ShippingAddressBlock` from `src/components/order/` | D-03 explicitly calls this out; both are already used by two other surfaces (guest confirmation, admin detail) with the exact prop shape `getOrderForUser`'s result will produce |
| NGN currency formatting | A new formatter | `formatNGN` from `src/lib/catalog/format.ts` | Used everywhere else in the codebase; `Intl.NumberFormat("en-NG", ...)` already handles kobo→₦ |
| Guest-order → account link safety | A pre-check + separate confirm step | The single guarded `UPDATE ... WHERE guestToken = ? AND userId IS NULL` | Atomic, race-free, and matches D-06's "best-effort, never blocking" requirement in one statement |

**Key insight:** This phase's entire component/query surface already exists in the codebase in a slightly different shape (admin-scoped or token-scoped). The work is almost pure "parameterize the existing pattern by a new key" — resist the urge to design new UI primitives or new query idioms.

## Common Pitfalls

### Pitfall 1: Confusing "order not found" with "not authorized" in the response
**What goes wrong:** Returning a 403/redirect for orders that exist but belong to someone else leaks which order IDs are valid (enumerable via timing/response-shape differences from a true 404).
**Why it happens:** It feels more "correct" to return 403 for an owned-by-someone-else resource.
**How to avoid:** `getOrderForUser` returns `null` for both cases; the page calls `notFound()` unconditionally on `null`. D-04 states this explicitly.
**Warning signs:** Any code path that fetches by id alone and then branches on `order.userId` to decide between two different HTTP-visible outcomes.

### Pitfall 2: Breaking `cacheComponents`/PPR static prerendering by awaiting session/DB reads outside Suspense
**What goes wrong:** STATE.md already documents this exact regression from Phase 3 (`getCartCount()` in `RootLayout` blocked static prerendering of `/account/register`). A new `/account` or `/account/orders/[id]` page that awaits `verifySession()`/the DB query directly in the page's default export (outside a `Suspense`-wrapped async child) reintroduces the same class of bug.
**Why it happens:** It's tempting to skip the Suspense-wrapper boilerplate for "just one more page."
**How to avoid:** Follow the exact shape already in `src/app/account/orders/page.tsx`: a `Suspense`-wrapped inner async component does `verifySession()` + the data read; the outer default export is a thin sync wrapper with a skeleton fallback.
**Warning signs:** `npx next build --webpack` output shows a route losing its `◐` (Partial Prerender) marker, or other previously-static routes regress to fully dynamic.

### Pitfall 3: Treating the guest-order claim as required-to-succeed
**What goes wrong:** Wrapping the claim in code that returns an error to the user (or throws unhandled) if the token is invalid/expired/already claimed turns a nice-to-have into a registration blocker — directly contradicting D-06 ("If the token is missing/invalid/already claimed, registration still succeeds").
**Why it happens:** Natural instinct to validate and report on invalid input.
**How to avoid:** No validation branch at all — the guarded `UPDATE`'s `WHERE` clause is the validation; a 0-row result is success from the user's point of view (they don't need to know their order didn't link).
**Warning signs:** Any `if (!orderExists) return { error: ... }` or `throw` between reading `orderToken` and returning from `register()`.

### Pitfall 4: Forgetting Next.js 16's async `searchParams`/`params`
**What goes wrong:** `RegisterPage` (or the new `/account/orders/[id]` page) destructuring `searchParams`/`params` synchronously throws or silently returns a Promise object instead of the resolved value.
**Why it happens:** Older Next.js tutorials (and even some existing code written before this convention was locked in) use sync destructuring.
**How to avoid:** Every existing dynamic route in this codebase already awaits `params`/`searchParams` (see `/order/[token]/page.tsx`, `/admin/orders/[id]/page.tsx`, `/verify-email/page.tsx`) — copy that shape exactly for `/account/orders/[id]` and the register page's new `searchParams` read.
**Warning signs:** TypeScript errors on `.orderToken`/`.id` access, or `[object Promise]` rendered in the UI.

### Pitfall 5: Double-querying or double-verifying inside the same request
**What goes wrong:** Calling `verifySession()` more than once per request tree (e.g., once in a layout and again in the page) is harmless but wasteful; more importantly, calling the order query with an id that hasn't been scoped by the *current* verified session (e.g., caching the id from a previous render) can staleness-leak across users in dev/test if singletons are misused.
**How to avoid:** Always pass `session.id` fresh from the same `verifySession()` call that guards the page into the query call — don't hoist or cache it across requests.

## Code Examples

Verified patterns from the existing codebase (all read directly from source in this session — treat as `[VERIFIED: codebase]`):

### Order-history list page shape (mirrors admin `/admin/orders/page.tsx` list + Suspense stub already in `/account/orders/page.tsx`)
```typescript
// src/app/account/orders/page.tsx (grown from the existing stub)
import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { listOrdersForUser } from "@/lib/orders/queries"
import { formatNGN } from "@/lib/catalog/format"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

async function OrdersContent() {
  const session = await verifySession() // layer 2, authoritative (CLAUDE.md)
  const orders = await listOrdersForUser(session.id)

  if (orders.length === 0) {
    return (
      // D-02: mirror CartEmptyState's structure/tone
      <EmptyOrdersState />
    )
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/${o.id}`} className="block rounded-2xl border border-border p-4 hover:border-brand transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-foreground">{o.reference}</p>
                <p className="text-sm text-muted">{o.createdAt.toLocaleDateString("en-NG")}</p>
              </div>
              <OrderStatusBadge status={o.status as OrderStatusValue} />
            </div>
            <div className="flex justify-between mt-2 text-sm text-muted">
              <span>{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>
              <span className="font-semibold text-foreground">{formatNGN(o.totalKobo)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-10 animate-pulse" aria-hidden="true" />}>
      <OrdersContent />
    </Suspense>
  )
}
```

### Order-detail page shape (mirrors `/admin/orders/[id]/page.tsx`, minus the fulfillment-control sidebar)
```typescript
// src/app/account/orders/[id]/page.tsx
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { verifySession } from "@/lib/dal"
import { getOrderForUser } from "@/lib/orders/queries"
import { OrderSummaryLines } from "@/components/order/OrderSummaryLines"
import { ShippingAddressBlock } from "@/components/order/ShippingAddressBlock"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

interface Props { params: Promise<{ id: string }> }

async function OrderDetailContent({ params }: Props) {
  const session = await verifySession() // layer 2 (CLAUDE.md dual-auth)
  const { id } = await params           // Next.js 16 async params
  const order = await getOrderForUser(session.id, id)

  if (!order) notFound() // D-04: 404, not 403 — indistinguishable from "id doesn't exist"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Order {order.reference}</h1>
        <OrderStatusBadge status={order.status as OrderStatusValue} />
      </div>
      <OrderSummaryLines
        items={order.items}
        subtotalKobo={order.subtotalKobo}
        shippingKobo={order.shippingKobo}
        totalKobo={order.totalKobo}
      />
      <ShippingAddressBlock
        shippingName={order.shippingName}
        shippingPhone={order.shippingPhone}
        shippingStreet={order.shippingStreet}
        shippingCity={order.shippingCity}
        shippingState={order.shippingState}
        shippingLandmark={order.shippingLandmark ?? null}
      />
    </div>
  )
}

export default function OrderDetailPage(props: Props) {
  return (
    <Suspense fallback={<div className="animate-pulse" aria-hidden="true" />}>
      <OrderDetailContent {...props} />
    </Suspense>
  )
}
```
`order.items` from `getOrderForUser`'s `with: { items: true }` shape carries `productName`, `variantLabel`, `quantity`, `lineTotalKobo` — the exact fields `OrderSummaryLines`' `OrderItem` type expects, no mapping needed.

## State of the Art

Not applicable — this phase makes no framework/library version choices; it extends existing, already-current patterns (Next.js 16 async params, Drizzle relational + select-with-subquery queries, Auth.js v5 session). No deprecated approach is being replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An unbounded `WHERE userId = ?` query (no `LIMIT`) is acceptable for v1 order-history volume | Pattern 2 / Recommended Project Structure | Low — CONTEXT.md already flags pagination as Claude's Discretion "likely unnecessary for v1 volume"; if a store owner's customers accumulate hundreds of orders this would need a `.limit()`/cursor added, but that's a trivial follow-up, not a redesign |
| A2 | No dedicated `/account` layout is needed beyond the existing bare App Router structure (no shared account-shell layout.tsx exists yet) | Recommended Project Structure, D-07 | Low — D-07 asks for a "minimal landing," not a shared shell; if the planner wants a persistent account sidebar/nav across `/account/*`, a `src/app/account/layout.tsx` would need to be added, which is a small additive task, not a blocker |

**If this table is empty:** N/A — two low-risk assumptions logged above.

## Open Questions (RESOLVED)

> RESOLVED: Q1 (/account landing vs redirect) → Plan 06-02 Task 3 builds the minimal landing page per the recommendation. Q2 (symmetric login-time claim) → deliberately NOT added; only the required D-06 registration-time claim is implemented, consistent with CONTEXT.md framing it as nice-to-have/discretion.


1. **Should `/account` be a separate page or a redirect to `/account/orders`?**
   - What we know: D-07 says either is fine, leaning toward a minimal landing page.
   - What's unclear: Whether the "minimal landing" adds enough value (signed-in email + logout + link) to justify a distinct route vs. just redirecting `/account` → `/account/orders` and putting a logout control in the site header.
   - Recommendation: Build the minimal landing page — it's a few lines, matches CONTEXT.md's explicit lean, and gives a natural home for a future "Edit profile" link in v2 without another routing change.

2. **Symmetric login-time claim?**
   - What we know: D-06 requires the claim at registration; CONTEXT.md flags a login-time claim (`/account/login?orderToken=`) as a nice-to-have, not required.
   - What's unclear: Whether `PostPurchaseAccountOffer`'s "Sign in to link this order" copy (already shipped in Phase 4) implies users will actually land on `/account/login?orderToken=` — if so, the claim should probably be symmetric or that copy is misleading.
   - Recommendation: Check `PostPurchaseAccountOffer`'s existing "Sign in" link — it currently points to `/account/login` **without** forwarding `orderToken` (confirmed by reading the component in this session). Either (a) forward the token on that link and add the same guarded `UPDATE` inside `login()` right after `mergeGuestCartOnLogin`, or (b) leave the copy but accept it's aspirational for v1 and fix in a follow-up. Flag for the planner to decide — low cost either way (same one-line guarded `UPDATE`, just called from `login()` too).

## Environment Availability

Skipped — this phase has no new external dependencies (no new SDKs, services, or CLIs). It runs entirely against the already-provisioned Neon Postgres (`DATABASE_URL`/`TEST_DATABASE_URL`, both confirmed set per this session's environment constraints) and the already-installed npm packages.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 |
| Config file | `vitest.config.ts` (repoints db client at `TEST_DATABASE_URL` when set; loads `.env.local`) |
| Quick run command | `npx vitest run tests/orders tests/auth/register.test.ts` |
| Full suite command | `npm test` (DB-gated tests run because `TEST_DATABASE_URL` is set per this session) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-04 | `listOrdersForUser` returns only the caller's orders, newest first, with correct item counts | integration (DB-gated) | `npx vitest run tests/orders/user-queries.test.ts -t "listOrdersForUser"` | ❌ Wave 0 |
| AUTH-04 | `listOrdersForUser` returns empty array for a user with no orders (feeds D-02 empty state) | integration (DB-gated) | `npx vitest run tests/orders/user-queries.test.ts -t "no orders"` | ❌ Wave 0 |
| AUTH-04 | `getOrderForUser` returns the full order (with items) when the order belongs to the caller | integration (DB-gated) | `npx vitest run tests/orders/user-queries.test.ts -t "getOrderForUser — owned"` | ❌ Wave 0 |
| AUTH-04 (D-04, IDOR) | `getOrderForUser` returns `null` when the order belongs to a *different* user (the core security test of this phase) | integration (DB-gated) | `npx vitest run tests/orders/user-queries.test.ts -t "IDOR"` | ❌ Wave 0 |
| AUTH-04 (D-04) | `getOrderForUser` returns `null` for a nonexistent order id (same code path as "wrong owner" — both must be indistinguishable) | integration (DB-gated) | `npx vitest run tests/orders/user-queries.test.ts -t "nonexistent"` | ❌ Wave 0 |
| AUTH-04 (D-06) | `register()` with a valid, unclaimed `orderToken` links that order to the new user | integration (DB-gated) | `npx vitest run tests/auth/register.test.ts -t "claims the guest order"` | ❌ Wave 0 (extend existing file) |
| AUTH-04 (D-06) | `register()` with an already-claimed (`userId` not null) `orderToken` does NOT reassign it, and still succeeds | integration (DB-gated) | `npx vitest run tests/auth/register.test.ts -t "does not reassign"` | ❌ Wave 0 |
| AUTH-04 (D-06) | `register()` with a missing/garbage `orderToken` still succeeds (best-effort, non-blocking) | unit/integration | `npx vitest run tests/auth/register.test.ts -t "invalid orderToken"` | ❌ Wave 0 |
| AUTH-04 (SC3, dual-auth) | `/account/orders/[id]` and `/account/orders` re-verify session in-page (not proxy-only) — covered by existing `proxy.ts` e2e pattern + the fact that `getOrderForUser`/`listOrdersForUser` require a `userId` argument that only comes from `verifySession()` | e2e / manual-only | Playwright redirect suite already covers `/account/*` unauth redirect (extend if a dedicated case is wanted); in-page re-verify is structurally enforced by the page code requiring `session.id` before any query call | ✅ existing pattern (`tests/e2e`), manual confirmation recommended |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/orders tests/auth/register.test.ts`
- **Per wave merge:** `npm test` (full suite, DB-gated tests included since `TEST_DATABASE_URL` is set)
- **Phase gate:** Full suite green before `/gsd-verify-work 6`

### Wave 0 Gaps
- [ ] `tests/orders/user-queries.test.ts` — new file covering `listOrdersForUser` + `getOrderForUser` (including the IDOR case above). Mirror `tests/admin/orders.test.ts`'s `vi.mock` block (`server-only`, `next/headers`, `next/cache`) and its direct `db.insert(schema.orders).values({...})` fixture-building pattern for constructing two orders owned by two different `userId`s.
- [ ] Extend `tests/auth/register.test.ts` with the three D-06 claim cases above — reuse its existing `hasDatabase`/`truncateAuthTables` pattern; will also need `truncateOrderTables()` (from `tests/helpers/db.ts`, already exists) in `beforeEach`/`afterEach` since these tests insert `orders` rows too.
- [ ] No new framework install needed — Vitest, the `next/cache` mock convention, and `TEST_DATABASE_URL` gating are all already in place project-wide.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes (indirect) | Unchanged — Auth.js v5 credentials + `verifySession()`, already implemented Phase 1 |
| V3 Session Management | yes (indirect) | Unchanged — DB-backed JWT session per D-08 (Phase 1); this phase only *reads* `session.user.id`, does not touch session issuance |
| V4 Access Control | **yes — core of this phase** | Object-level authorization: every order read scoped by `userId` in the SQL `WHERE` clause (D-04/D-05); this is exactly ASVS V4's "insecure direct object reference" (IDOR) control |
| V5 Input Validation | yes (minor) | `orderId` route param used only as an opaque equality-comparison key in a parameterized Drizzle query (no string interpolation); `orderToken` from `searchParams` is likewise only ever used as a parameterized equality comparison — no validation needed beyond "is a string" since an invalid value simply matches zero rows |
| V6 Cryptography | no | Not touched — `guestToken` generation (crypto.getRandomValues-based) already exists from Phase 4 and is unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| IDOR — guessing/incrementing another customer's order id to view their order | Information Disclosure | Query-layer `WHERE userId = ?` scoping (D-04) + `null`→404 (never 403) so existence isn't leaked |
| Guest-order hijack — an attacker submits someone else's `guestToken` at registration to steal their order into the attacker's new account | Tampering / Elevation of Privilege | `WHERE guestToken = ? AND userId IS NULL` — an order already claimed (by the real customer, via their own registration) cannot be reassigned; the token space is 64-char hex crypto-random (Phase 4), making guessing infeasible, but the `userId IS NULL` guard is the actual defense even if a token *were* guessed/leaked (best it does is claim an otherwise-unclaimed guest order, same as intended for the legitimate flow) |
| Session-fixation / cross-user data bleed from caching a `userId` across requests | Tampering | Always read `session.id` fresh from the same `verifySession()` call that guards the current request (Pitfall 5); no module-level caching of session state |

## Sources

### Primary (HIGH confidence — read directly from the codebase this session)
- `src/lib/orders/queries.ts` — `getOrderByToken`/`getOrderByStripePaymentIntentId`/`getOrderStatusByToken`/`getOrderByGatewayReference` shapes to mirror
- `src/lib/catalog/admin-queries.ts` — `listOrdersForAdmin`, `getOrderForAdmin`, `listProductsForAdmin` (subquery/join pattern for `itemCount`)
- `src/lib/dal.ts` — `verifySession()` exact return shape (`{ id, role, email }`)
- `src/app/account/orders/page.tsx` — existing Suspense/dual-auth stub to grow
- `src/app/admin/orders/[id]/page.tsx` — detail-page shape (Suspense, `notFound`-style 404 card, component wiring) to adapt
- `src/lib/actions/auth.ts` — exact `register()`/`login()` current implementation and signatures
- `src/components/auth/RegisterForm.tsx` — `useActionState<RegisterState, FormData>` wiring that constrains how `orderToken` can be threaded
- `src/components/order/{OrderSummaryLines,ShippingAddressBlock,PostPurchaseAccountOffer}.tsx` — exact prop shapes to feed from `getOrderForUser`
- `src/components/admin/OrderStatusBadge.tsx` — exact export/prop shape (`OrderStatusValue`, `OrderStatusBadge`)
- `src/lib/db/schema.ts` — `orders`/`orderItems` column list, `order_user_idx`, `guestToken` uniqueness, nullable `userId`
- `src/components/cart/CartEmptyState.tsx` — empty-state tone/structure to mirror for D-02
- `tests/admin/orders.test.ts`, `tests/auth/register.test.ts`, `tests/helpers/db.ts` — test-mock and fixture-insertion conventions
- `.planning/phases/06-customer-accounts/06-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `CLAUDE.md`, `package.json` — scope, requirements, cross-phase constraints, installed versions

### Secondary (MEDIUM confidence)
- None needed — no external/web research was required; every claim above is grounded directly in the existing codebase and planning docs.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, versions confirmed from `package.json`
- Architecture: HIGH — every pattern cited is copied from working code already in this repo (admin order queries/pages, guest order queries, register action)
- Pitfalls: HIGH — four of five pitfalls are documented regressions/conventions already recorded in `STATE.md` or enforced by existing code; the IDOR pitfall is the phase's explicit design driver (D-04)

**Research date:** 2026-07-09
**Valid until:** No expiry driver — this research is tied to the current state of this specific codebase, not to external library versions/docs that could go stale. Re-research only if the underlying schema, `register()` signature, or shared order components change before planning executes.
