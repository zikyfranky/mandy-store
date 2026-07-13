# Phase 6: Customer Accounts - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 9 new/modified files (+ 1 net-new component, + 2 test files)
**Analogs found:** 9 / 9 (100%)

This phase is 100% additive against existing, proven patterns — no new libraries, no schema
change. Every analog below was read directly from the current codebase in this session.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/orders/queries.ts` — `getOrderForUser` (new fn) | service/query | CRUD (read, IDOR-scoped) | `getOrderForAdmin` in `src/lib/catalog/admin-queries.ts:233-240` | exact (same `null`-on-miss shape, swap id-only for id+userId) |
| `src/lib/orders/queries.ts` — `listOrdersForUser` (new fn) | service/query | CRUD (read, aggregate) | `listProductsForAdmin`'s subquery/join shape in `src/lib/catalog/admin-queries.ts:99-134` + `listOrdersForAdmin:184-206` | role-match (aggregate-join pattern ported to a new grouping key) |
| `src/app/account/orders/page.tsx` (grow stub) | route/page (Server Component, list) | request-response | `src/app/admin/orders/page.tsx:8-64,123-258` (list+Suspense) + itself (existing stub, dual-auth skeleton) | exact (same page grows into the admin list's shape, minus filters/pagination) |
| `src/app/account/orders/[id]/page.tsx` (new) | route/page (Server Component, detail) | request-response | `src/app/admin/orders/[id]/page.tsx:1-182` (detail shape) + `src/app/order/[token]/page.tsx:41-92,97-131` (styled-404 + skeleton, guest-token analog) | exact |
| `src/app/account/page.tsx` (new) | route/page (Server Component, minimal landing) | request-response | `src/app/account/orders/page.tsx` (dual-auth/Suspense skeleton) + `SiteHeader`/`AdminSidebar` sign-out block (logout button classes) | role-match (assembled from two small analogs, no single direct match) |
| `src/components/order/OrderHistoryCard.tsx` (new) | component (presentational, list row) | transform (props → JSX) | `src/app/admin/orders/page.tsx:215-244` (table row markup) + `src/components/cart/CartEmptyState.tsx` (empty-state tone, for the sibling empty state) | role-match (admin row porting to a card, no admin coupling) |
| `src/lib/actions/auth.ts` — `register()` (extend) | server action | event-driven (best-effort side-effect) | `register()`'s own existing verification-email try/catch, `src/lib/actions/auth.ts:100-116` | exact (same file, same "never block success" shape) |
| `src/components/auth/RegisterForm.tsx` (extend) | component (client, form) | request-response | itself — existing `useActionState<RegisterState, FormData>` wiring, `src/components/auth/RegisterForm.tsx:16-22,51` | exact |
| `src/app/(auth)/account/register/page.tsx` (extend) | route/page (Server Component) | request-response | itself, `src/app/(auth)/account/register/page.tsx:1-9` + async `searchParams` convention from `src/app/order/[token]/page.tsx:27-36` | exact |
| `tests/orders/user-queries.test.ts` (new) | test | CRUD (integration) | `tests/admin/orders.test.ts:1-55` (mock block + fixture-insert pattern) | exact |
| `tests/auth/register.test.ts` (extend) | test | event-driven (integration) | itself, `tests/auth/register.test.ts:1-31` (existing mock/skip scaffolding) | exact |

## Pattern Assignments

### `src/lib/orders/queries.ts` — add `getOrderForUser` (service, CRUD)

**Analog:** `getOrderForAdmin` — `src/lib/catalog/admin-queries.ts:228-240`

**Imports pattern** (mirror the existing file's own header, `src/lib/orders/queries.ts:1-9`):
```typescript
import "server-only"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
```
Add `and` to the `drizzle-orm` import for the ownership-AND-id clause.

**Core pattern — IDOR-safe single read** (`src/lib/catalog/admin-queries.ts:233-240`):
```typescript
export async function getOrderForAdmin(id: string) {
  if (!id) return null
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { items: true },
  })
  return order ?? null
}
```
Adapt by adding the `userId` equality into the `where` (never check ownership after fetch —
D-04 requires the filter to live in the SQL `WHERE`):
```typescript
export async function getOrderForUser(userId: string, orderId: string) {
  if (!userId || !orderId) return null
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    with: { items: true },
  })
  return order ?? null
}
```
Also mirror `getOrderByToken`'s doc-comment convention (`src/lib/orders/queries.ts:11-16`,
D-12 style: "Returns undefined/null on miss, no enumeration").

**Error handling:** none needed — Drizzle throws on genuine DB failure (uncaught, propagates
to the page's error boundary, same as every other query in this file); `null` is reserved
exclusively for "not found / not owned," per the codebase convention noted at
`src/lib/catalog/admin-queries.ts:230-231` ("Returns null (not undefined)").

---

### `src/lib/orders/queries.ts` — add `listOrdersForUser` (service, CRUD aggregate)

**Analog:** `listProductsForAdmin`'s variant-aggregate subquery — `src/lib/catalog/admin-queries.ts:98-134` — adapted to `orderItems` grouped by `orderId`; list shape (select + orderBy) from `listOrdersForAdmin` — `src/lib/catalog/admin-queries.ts:176-206`.

**Core pattern — leftJoin against a `groupBy` subquery aliased with `.as(...)`** (`src/lib/catalog/admin-queries.ts:98-109`):
```typescript
const variantAggSq = db
  .select({
    productId: variants.productId,
    variantCount: sql<number>`COUNT(*)`.as("variant_count"),
    // ...
  })
  .from(variants)
  .groupBy(variants.productId)
  .as("variant_agg_sq")

const baseQuery = db
  .select({ /* ... */ })
  .from(products)
  .leftJoin(variantAggSq, eq(products.id, variantAggSq.productId))
  .where(where)
```
Port this to `orderItems` grouped by `orderId` for the item-count column, and filter/orderBy
per `listOrdersForAdmin` (`src/lib/catalog/admin-queries.ts:184-206`):
```typescript
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
No pagination (`.limit()`) per CONTEXT.md Claude's Discretion — unbounded `WHERE userId = ?`
is fine for v1 volume, matching `listOrdersForAdmin`'s columns minus the `count()`
total/pageCount machinery (not needed — no pagination UI for this list).

**Schema columns used** (exact names, `src/lib/db/schema.ts:283-326`):
```typescript
// orders: id, reference, guestToken, status, userId, customerEmail, subtotalKobo,
//   shippingKobo, totalKobo, shipping{Name,Phone,Street,City,State,Landmark},
//   createdAt, paidAt  — index("order_user_idx").on(table.userId) already exists (line 308)
// orderItems: id, orderId, variantId, quantity, priceKobo, productName, variantLabel,
//   lineTotalKobo — index("order_item_order_idx").on(table.orderId) already exists (line 325)
```

---

### `src/app/account/orders/page.tsx` (grow the stub) (route/page, request-response)

**Analog 1 (structure to keep):** the existing stub itself, `src/app/account/orders/page.tsx:1-32` — dual-auth `verifySession()`-first-inside-Suspense skeleton (D-08, do not restructure).

**Analog 2 (list rendering to add):** `src/app/admin/orders/page.tsx:123-138,201-249` — same "await searchParams-less list, map rows, empty-state branch" shape, minus status filter chips/pagination (not required here per D-01/D-02).

**Imports pattern** (compose from the stub + admin list, `src/app/account/orders/page.tsx:7-8` + `src/app/admin/orders/page.tsx:8-12`):
```typescript
import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { listOrdersForUser } from "@/lib/orders/queries"
import { OrderHistoryCard } from "@/components/order/OrderHistoryCard"
```

**Core pattern — keep the exact Suspense/verify-first shape** (`src/app/account/orders/page.tsx:10-32`):
```typescript
async function OrdersContent() {
  await verifySession()               // <-- change to `const session = await verifySession()`
  const orders = await listOrdersForUser(session.id)

  if (orders.length === 0) {
    return <EmptyOrdersState />        // D-02, mirrors CartEmptyState tone
  }

  return (
    <ul className="space-y-4">
      {orders.map((o) => (
        <li key={o.id}><OrderHistoryCard order={o} /></li>
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
Keep the file's own comment header verbatim (`src/app/account/orders/page.tsx:1-5`) — it
already documents the dual-layer security rationale correctly for this grown version.

**Empty state** (D-02) — mirror `src/components/cart/CartEmptyState.tsx:8-38`'s structure
exactly (icon 48px `text-zinc-300 dark:text-zinc-600`, `<h2>`, `<p>`, filled `bg-brand` CTA)
but swap icon/copy/href per UI-SPEC: heading "No orders yet", body "When you place an order,
it will show up here.", CTA "Browse products" → `/`.

---

### `src/app/account/orders/[id]/page.tsx` (new) (route/page, request-response, IDOR-safe)

**Analog 1 (detail structure):** `src/app/admin/orders/[id]/page.tsx:1-20,60-80,164-182` — async `params`, `getOrder*` call, `Suspense`+skeleton wrapper.
**Analog 2 (404 card + guest-token precedent):** `src/app/order/[token]/page.tsx:38-92` — styled `OrderNotFound` (do NOT call `notFound()`), `OrderPageSkeleton`.

**Imports pattern:**
```typescript
import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { getOrderForUser } from "@/lib/orders/queries"
import { formatNGN } from "@/lib/catalog/format"
import { OrderSummaryLines } from "@/components/order/OrderSummaryLines"
import { ShippingAddressBlock } from "@/components/order/ShippingAddressBlock"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"
```

**Core pattern — async params + IDOR scoping + verbatim component reuse**, adapted from
`src/app/admin/orders/[id]/page.tsx:60-92` (params/order load) and
`src/app/order/[token]/page.tsx:97-103,109-130` (component wiring):
```typescript
async function OrderDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()          // layer 2, CLAUDE.md dual-auth
  const { id } = await params                     // Next.js 16 async params
  const order = await getOrderForUser(session.id, id)

  if (!order) {
    return <OrderNotFound />   // D-04: styled card, NOT notFound() — identical for "missing" vs "not yours"
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6">
        <OrderStatusBadge status={order.status as OrderStatusValue} />
        <h1 className="text-2xl font-semibold text-foreground mt-3">Order {order.reference}</h1>
        <hr className="border-t border-border" />
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
        {/* payment method block — port paymentMethodLabel() from
            src/app/admin/orders/[id]/page.tsx:24-33, do not import (admin-scoped file) */}
      </div>
    </main>
  )
}
```
`order.items` from `getOrderForUser`'s `with: { items: true }` already carries `productName`,
`variantLabel`, `quantity`, `lineTotalKobo` — the exact `OrderSummaryLines` prop shape, no
mapping needed (verified against `src/components/order/OrderSummaryLines.tsx:8-13`).

**404/IDOR pattern** — copy `OrderNotFound` verbatim from
`src/app/order/[token]/page.tsx:41-77` (same icon SVG, same card classes), only changing copy
to the UI-SPEC text ("This order doesn't exist or isn't linked to your account...") and the
back-link `href` to `/account/orders`. **Do not** call `notFound()` — confirmed anti-pattern
per `06-UI-SPEC.md` Surface 3 and the existing precedent comment at
`src/app/order/[token]/page.tsx:39` ("do NOT call notFound() — we want the styled card").

**Payment method label** — port (do not import) `paymentMethodLabel()` from
`src/app/admin/orders/[id]/page.tsx:24-33` (a small pure function in an admin-scoped file);
same logic ("Card (Stripe)" if `stripePaymentIntentId`, else capitalized `gatewayProvider`,
else "Bank transfer").

**Skeleton** — copy `OrderPageSkeleton` from `src/app/order/[token]/page.tsx:81-92` verbatim
(`h-12 w-12 rounded-full`, `h-8 w-48`, `h-4 w-64`, `h-32 rounded-xl`, all `animate-pulse`).

---

### `src/app/account/page.tsx` (new minimal landing) (route/page, request-response)

**Analog:** dual-auth skeleton from `src/app/account/orders/page.tsx:1-32` (structure) +
sign-out button classes from the admin sidebar's `SignOutBlock` pattern (referenced in
UI-SPEC as `"rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground
hover:bg-brand-soft/50 …"`) + `logout` action from `src/lib/actions/auth.ts:235-237`.

**Core pattern:**
```typescript
import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { logout } from "@/lib/actions/auth"

async function AccountContent() {
  const session = await verifySession()   // layer 2, authoritative
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Your account</h1>
        <p className="text-sm text-muted">Signed in as {session.email}</p>
        <Link href="/account/orders" className="inline-flex items-center rounded-xl bg-brand hover:bg-brand-strong text-white px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
          View order history
        </Link>
        <hr className="border-t border-border" />
        <form action={logout}>
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 animate-pulse" aria-hidden="true" />}>
      <AccountContent />
    </Suspense>
  )
}
```
`logout()` is called by `<form action={logout}>` exactly as its own doc comment prescribes
(`src/lib/actions/auth.ts:228-237`) — no client wrapper needed (it is already an exported
`"use server"` action with no arguments).

---

### `src/components/order/OrderHistoryCard.tsx` (NEW component) (component, transform)

**Analog:** the admin orders table row, `src/app/admin/orders/page.tsx:215-244` (reference
link, date, status badge, total — same data, different container: `<tr>` → whole-card
`<Link>`). Also draw the whole-card-clickable pattern from nowhere existing exactly (net-new
per UI-SPEC), but the *contents* (badge/date/total layout) are a direct port.

**Props/shape — must match `listOrdersForUser`'s row shape exactly:**
```typescript
interface OrderHistoryCardProps {
  order: {
    id: string
    reference: string
    createdAt: Date
    status: OrderStatusValue
    totalKobo: number
    itemCount: number
  }
}
```

**Core pattern** (adapted from the admin row's cell contents, `src/app/admin/orders/page.tsx:219-242`, reshaped into UI-SPEC's whole-card-link markup):
```typescript
import Link from "next/link"
import { formatNGN } from "@/lib/catalog/format"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

export function OrderHistoryCard({ order }: OrderHistoryCardProps) {
  return (
    <Link
      href={`/account/orders/${order.id}`}
      className="block rounded-2xl bg-surface border border-border p-5 hover:border-brand/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-foreground">{order.reference}</p>
          <p className="text-sm text-muted mt-0.5">
            {order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
        <div className="text-right">
          <p className="text-sm text-muted">{order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
          <p className="text-sm font-semibold text-foreground">{formatNGN(order.totalKobo)}</p>
        </div>
      </div>
    </Link>
  )
}
```
**Deliberate divergence from the admin analog:** absolute `toLocaleDateString`, NOT
`relativeDate()` (`src/app/admin/orders/page.tsx:68-91`) — per UI-SPEC Decision Log #3, do
not port `relativeDate()` here.

---

### `src/lib/actions/auth.ts` — extend `register()` with the D-06 claim (server action, event-driven)

**Analog:** `register()`'s own existing best-effort email-send try/catch,
`src/lib/actions/auth.ts:100-116` — identical "never let a side-effect fail the signup" shape.

**Exact current signature to preserve** (`src/lib/actions/auth.ts:40-42`):
```typescript
export async function register(
  formData: FormData,
): Promise<{ error: string } | { success: true; message: string }>
```
Do NOT change this signature (breaks `useActionState` wiring in `RegisterForm.tsx:17-22` and
every test in `tests/auth/register.test.ts` that calls `register(formData)` directly).

**Insertion point** — after `db.insert(users).values({...})` succeeds and `userId` is known
(`src/lib/actions/auth.ts:78-89`), before the verification-email try/catch block:
```typescript
// D-06: best-effort guest-order claim — never blocks registration success
const orderToken = (formData.get("orderToken") as string | null) || null
if (orderToken) {
  try {
    await db
      .update(orders)
      .set({ userId })
      .where(and(eq(orders.guestToken, orderToken), isNull(orders.userId)))
    // 0-row result (bad/foreign/already-claimed token) is an intentional silent no-op.
  } catch (err) {
    console.error("[register] guest-order claim failed (account still created):", err)
  }
}
```
Add `orders` to the schema import (`src/lib/actions/auth.ts:8`) and `isNull` to the
`drizzle-orm` import (`src/lib/actions/auth.ts:12`).

**Error handling pattern to mirror exactly** (`src/lib/actions/auth.ts:103-109`):
```typescript
let emailSent = true
try {
  await sendVerificationEmail(email, token)
} catch (err) {
  emailSent = false
  console.error("[register] verification email failed (account still created):", err)
}
```
Same shape (try/catch, `console.error`, never rethrow, never branch the return value on
failure) applies to the claim block above.

**Anti-pattern to avoid** (explicit in RESEARCH.md Pitfall 3 and Anti-Patterns): no
pre-check ("does this order exist / is it claimable") before the `UPDATE` — the guarded
`WHERE guestToken = ? AND userId IS NULL` is the entire validation, atomic and race-free.

---

### `src/components/auth/RegisterForm.tsx` (extend) (component, request-response)

**Analog:** itself — existing `useActionState<RegisterState, FormData>` wiring,
`src/components/auth/RegisterForm.tsx:16-22`.

**Change:** accept an optional `orderToken` prop, render a hidden field inside the existing
`<form action={formAction}>` (`src/components/auth/RegisterForm.tsx:51`):
```typescript
export default function RegisterForm({ orderToken }: { orderToken?: string }) {
  // ...unchanged useActionState wiring (lines 17-22)...
  return (
    <div>
      {/* ... */}
      <form action={formAction} className="space-y-4">
        {orderToken && <input type="hidden" name="orderToken" value={orderToken} />}
        {/* ...existing name/username/email/password fields unchanged... */}
      </form>
    </div>
  )
}
```
No other changes — the `error`/`success` branches (`src/components/auth/RegisterForm.tsx:25-43,131-144`) stay exactly as-is.

---

### `src/app/(auth)/account/register/page.tsx` (extend) (route/page, request-response)

**Analog:** itself, `src/app/(auth)/account/register/page.tsx:1-9` (currently a trivial sync
wrapper) + the async-`searchParams` convention already used at
`src/app/order/[token]/page.tsx:27-36` (`generateMetadata`'s `await params`) and
`src/app/admin/orders/page.tsx:14-16,123-124` (`await searchParams`).

**Change:**
```typescript
import RegisterForm from "@/components/auth/RegisterForm"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ orderToken?: string }>
}) {
  const { orderToken } = await searchParams
  return <RegisterForm orderToken={orderToken} />
}
```
Note: this page currently has no `Suspense` wrapper and reads no session/DB — adding
`searchParams` (a Next.js-provided Promise, not a DB/session read) does not reintroduce the
Pitfall 2 PPR regression; no `Suspense` boundary is required here.

---

### `tests/orders/user-queries.test.ts` (new) (test, CRUD integration)

**Analog:** `tests/admin/orders.test.ts:1-55` — mock block (`server-only`, `next/headers`,
`next/cache`) + `beforeEach`/`afterEach` truncation pattern + direct
`db.insert(schema.orders).values({...})` fixture-building with all required NOT NULL columns.

**Mock block to copy verbatim** (`tests/admin/orders.test.ts:15-21`):
```typescript
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))
```

**Fixture-insert pattern to copy** (`tests/admin/orders.test.ts:66-81`, minimal required
columns for an `orders` row): `id`, `reference`, `guestToken` (64-char), `status`,
`customerEmail`, `subtotalKobo`, `shippingKobo`, `totalKobo`, `shippingName`,
`shippingPhone`, `shippingStreet`, `shippingCity`, `shippingState` — add `userId` for the
two-different-owners IDOR fixture.

**Truncate/isolation pattern** (`tests/admin/orders.test.ts:48-55`, also needs
`truncateAuthTables` since these tests create `users` rows to own orders):
```typescript
afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateAuthTables()   // new orders own tests need real user rows for userId FK
  }
  vi.clearAllMocks()
})
```
Skip gate identical to the admin file: `it.skipIf(!hasDatabase)(...)`.

**IDOR test — the core new test** (no existing direct analog; construct from the fixture
pattern above): insert two orders with two different `userId`s, assert
`getOrderForUser(userA, orderB.id)` returns `null`, and
`getOrderForUser(userA, "nonexistent-id")` also returns `null` (same code path, per D-04).

---

### `tests/auth/register.test.ts` (extend) (test, event-driven integration)

**Analog:** itself — existing mock/skip scaffolding, `tests/auth/register.test.ts:1-31`.

**New test cases to add** (reuse the exact `FormData` + `register(formData)` call pattern
from `tests/auth/register.test.ts:41-60`), each needing an `orders` row fixture inserted
first (reuse the `tests/admin/orders.test.ts:66-81` shape) and
`truncateOrderTables()` added to `beforeEach`/`afterEach` alongside the existing
`truncateAuthTables()` (`tests/auth/register.test.ts:28-31`):
1. "claims the guest order" — insert an order with `guestToken: X, userId: null`; call
   `register(formData)` with `formData.set("orderToken", X)`; assert the order's `userId` now
   equals the new user's id.
2. "does not reassign an already-claimed order" — insert an order with `guestToken: X,
   userId: <existingOtherUserId>`; call `register` with that token; assert `userId` is
   unchanged (still the other user).
3. "invalid orderToken still succeeds" — call `register` with a garbage/missing
   `orderToken`; assert `result` still matches `{ success: true }` (never blocks, per D-06).

**Helper import to add** (`tests/helpers/db.ts:72-80`):
```typescript
import { hasDatabase, truncateAuthTables, truncateOrderTables } from "../helpers/db"
```

## Shared Patterns

### Dual-layer auth (`verifySession()` inside Suspense)
**Source:** `src/lib/dal.ts:30-42` + `src/app/account/orders/page.tsx:10-13` (existing stub)
**Apply to:** `src/app/account/orders/page.tsx`, `src/app/account/orders/[id]/page.tsx`,
`src/app/account/page.tsx` — every one of the three new/grown account pages must call
`verifySession()` as the FIRST statement inside an async Server Component that is itself
wrapped in `<Suspense>` by a thin sync default export. `proxy.ts` redirect is defense-in-depth
only (layer 1); `verifySession()` is authoritative (layer 2, CLAUDE.md).
```typescript
export async function verifySession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/account/login")
  }
  return { id: session.user.id, role: session.user.role ?? "customer", email: session.user.email ?? "" }
}
```

### IDOR-safe scoping — `WHERE userId = ?` at the query layer, never app-layer
**Source:** `getOrderForAdmin` pattern, `src/lib/catalog/admin-queries.ts:233-240`
**Apply to:** `getOrderForUser`, `listOrdersForUser` — the ownership filter must be inside the
Drizzle `where` clause of the query function itself, never a post-fetch `if (order.userId !==
session.id)` check in a page/component. Returns `null` (never `undefined`, never throws) for
both "doesn't exist" and "exists but not yours" — indistinguishable outcomes, per D-04.

### `formatNGN` — every kobo amount
**Source:** `src/lib/catalog/format.ts` (imported by `OrderSummaryLines.tsx:6`,
`admin/orders/page.tsx:11`, `admin/orders/[id]/page.tsx:12`)
**Apply to:** `OrderHistoryCard`, `/account/orders/[id]/page.tsx` — never hand-roll a
currency formatter or display raw kobo integers.

### Verbatim shared order components — no forking, no prop reshaping
**Source:** `src/components/order/OrderSummaryLines.tsx`, `ShippingAddressBlock.tsx`
**Apply to:** `/account/orders/[id]/page.tsx` — import and use exactly as
`/order/[token]/page.tsx` and `/admin/orders/[id]/page.tsx` already do. `getOrderForUser`'s
`with: { items: true }` result already produces the exact `OrderItem` shape
(`productName`, `variantLabel`, `quantity`, `lineTotalKobo`) these components expect — no
mapping/adapter layer needed.

### Best-effort side-effects — try/catch, log, never block the primary success path
**Source:** `register()`'s existing verification-email block, `src/lib/actions/auth.ts:103-109`
**Apply to:** the new guest-order claim in `register()` — same shape: `try { await db.update(...) } catch (err) { console.error(...) }`, no rethrow, no branching the returned `{success:true}` shape on claim outcome.

### `OrderStatusBadge` — icon+text, never color-only
**Source:** `src/components/admin/OrderStatusBadge.tsx:132-140`
**Apply to:** `OrderHistoryCard` and `/account/orders/[id]/page.tsx` — verbatim import, no
customer-facing variant needed (already accessible, already prop-driven, no admin coupling).

## No Analog Found

None — every file in this phase's scope has at least a role-match analog already in the
codebase (see table above). This is expected: RESEARCH.md's central finding is that Phase 6
is "almost pure parameterize-the-existing-pattern-by-a-new-key" work.

## Metadata

**Analog search scope:** `src/lib/orders/`, `src/lib/catalog/`, `src/app/admin/orders/`,
`src/app/order/[token]/`, `src/app/account/`, `src/app/(auth)/account/register/`,
`src/components/order/`, `src/components/admin/`, `src/components/auth/`,
`src/components/cart/`, `src/lib/actions/`, `src/lib/dal.ts`, `src/lib/db/schema.ts`,
`tests/admin/`, `tests/auth/`, `tests/helpers/`.
**Files scanned:** 19 read in full (all ≤ 280 lines; no file exceeded the 2,000-line
large-file threshold, so no `Grep`-first/`offset`-limited reads were needed).
**Pattern extraction date:** 2026-07-09
