# Phase 5: Admin Panel - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 24 (new/modified)
**Analogs found:** 22 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/actions/admin-products.ts` (createProduct/updateProduct/deactivateProduct/upsertVariant) | service (Server Action) | CRUD | `src/lib/actions/checkout.ts` | exact (auth-first + Zod + DB write pattern) |
| `src/lib/actions/admin-orders.ts` (`updateOrderStatus`) | service (Server Action, state machine) | event-driven / CRUD | `src/lib/payments/shared/confirm-order-paid.ts` (transition/side-effect shape) + `src/lib/actions/checkout.ts` (auth/Zod shell) | role-match (no existing state-machine analog; composite) |
| `src/lib/actions/admin-settings.ts` (`toggleStoreSetting`) | service (Server Action) | CRUD | `src/lib/actions/cart.ts` (`updateCartItem`) | role-match |
| `src/lib/blob/upload.ts` (`uploadProductImage`/`deleteProductImage`) | utility (I/O wrapper) | file-I/O | none in-repo — `src/lib/payments/stripe.ts`-style thin SDK wrapper is closest shape | no analog (external SDK, see below) |
| `src/app/admin/layout.tsx` | route/layout | request-response | `src/app/admin/page.tsx` (existing stub) | exact |
| `src/app/admin/page.tsx` (MODIFY → dashboard/redirect) | route | request-response | itself (existing) | exact |
| `src/app/admin/products/page.tsx` (list) | route/component | CRUD (read) | `src/app/products/[slug]/page.tsx` (Suspense/cache split shell) + storefront list patterns | role-match |
| `src/app/admin/products/new/page.tsx` | route/component | CRUD (create) | `src/app/checkout/page.tsx` (form-hosting Server Component wrapping a client form) | role-match |
| `src/app/admin/products/[id]/edit/page.tsx` | route/component | CRUD (update) | same as above + `src/app/products/[slug]/page.tsx` | role-match |
| `src/app/admin/orders/page.tsx` (list + filter) | route/component | CRUD (read) | `src/app/admin/products/page.tsx` (sibling, same phase) | role-match |
| `src/app/admin/orders/[id]/page.tsx` (detail + transition) | route/component | CRUD (read) + event-driven (transition) | `src/app/order/[token]/page.tsx` (reuses `OrderSummaryLines`/`ShippingAddressBlock`) | exact (component reuse) |
| `src/app/admin/settings/page.tsx` | route/component | CRUD | `src/app/checkout/page.tsx` (async Server Component reading `enabledPaymentMethods()`) | role-match |
| `src/lib/catalog/queries.ts` (MODIFY `getProduct` — add `isActive` filter) | model/query | CRUD | itself, adjacent to `getCatalog` (already filters `isActive`) | exact (in-file precedent) |
| `src/lib/catalog/admin-queries.ts` (`listProductsForAdmin`, `listOrdersForAdmin`, `getProductForAdmin`) | model/query | CRUD (read, paginated) | `src/lib/catalog/queries.ts` (`getProduct`/`getCatalog`) | role-match |
| `src/lib/payments/config.ts` (MODIFY — async `isPaymentMethodEnabled`) | config/service | CRUD (read) | itself (existing sync version) | exact (in-place migration) |
| `src/lib/payments/store-settings.ts` (`getStoreSettingsMap`, `toggleStoreSetting` helper) | service | CRUD | `src/lib/cart/queries.ts` (`getCartCount`-style small read helper) | role-match |
| `src/lib/db/schema.ts` (MODIFY — add `storeSettings` table) | model | CRUD | `processedWebhookEvents` table definition (same file, simple key-value shaped table) | exact |
| `src/emails/OrderStatusChangeEmail.tsx` | component (email template) | transform | `src/emails/OrderConfirmationEmail.tsx` | exact |
| `src/lib/email/send-order-status-change.ts` | service | request-response (outbound) | `src/lib/email/send-order-confirmation.ts` | exact |
| `src/components/admin/AdminSidebar.tsx` | component | request-response | `src/app/admin/page.tsx` sign-out block + `SiteHeader` nav | role-match |
| `src/components/admin/ProductForm.tsx` | component (client) | CRUD (form) | `src/components/checkout/CheckoutForm.tsx` | exact |
| `src/components/admin/VariantEditor.tsx` | component (client) | CRUD (form, list) | `src/components/cart/CartLineItem.tsx` (row + remove button pattern) | role-match |
| `src/components/admin/ImageUploadField.tsx` | component (client) | file-I/O (form) | `src/components/checkout/CheckoutForm.tsx` (`inputClass` + `role="alert"` field pattern) | role-match |
| `src/components/admin/OrderStatusControl.tsx` | component (client) | event-driven | `src/components/cart/CartStepper.tsx` (`useTransition` + Server Action button pattern) | role-match |
| `src/components/admin/PaymentToggleRow.tsx` | component (client) | CRUD (form) | `src/components/checkout/PaymentMethodSelector.tsx` (radio-row-with-icon shape); toggle switch itself is new (no analog, fully specified in UI-SPEC) | role-match |
| `tests/admin/products.test.ts` | test | CRUD | `tests/checkout/actions.test.ts` | exact |
| `tests/admin/orders.test.ts` | test | event-driven | `tests/checkout/webhook.test.ts` + `tests/checkout/actions.test.ts` | exact |
| `tests/admin/settings.test.ts` | test | CRUD | `tests/checkout/actions.test.ts` (toggle-rejection tests) | exact |
| `tests/payments/config.test.ts` (MODIFY — add async cases) | test | CRUD | itself (existing sync tests) | exact |
| `tests/helpers/db.ts` (MODIFY — add `truncateStoreSettingsTable`) | test utility | CRUD | itself (`truncateOrderTables`/`truncateCartTables`) | exact |

## Pattern Assignments

### `src/lib/actions/admin-products.ts` (service/Server Action, CRUD)

**Analog:** `src/lib/actions/checkout.ts`

**Header/module doc + imports pattern** (`src/lib/actions/checkout.ts:1-26`):
```typescript
"use server"
import "server-only"
// src/lib/actions/checkout.ts
// ...module doc block naming the REQ-IDs and security contracts...

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
```
For admin actions, swap `revalidatePath` for `updateTag` (see Shared Patterns → Cache Invalidation) and `auth` usage for `verifyAdminSession` from `@/lib/dal` (not raw `auth()` — checkout allows guests, admin must not).

**Auth-first + Zod pattern** (`src/lib/actions/checkout.ts:156-165`, `241-247`):
```typescript
export async function createBankTransferOrder(input: CheckoutInput): Promise<BankTransferResult> {
  // PAY-04 / D-13 — disabled method rejected server-side before any other work (T-04-11)
  if (!isPaymentMethodEnabled("bank_transfer")) {
    return { error: "Bank transfer is not available" }
  }
  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx
  ...
```
Admin equivalent — `verifyAdminSession()` must be the literal first statement (D-02), before even Zod parsing:
```typescript
"use server"
import "server-only"
import { verifyAdminSession } from "@/lib/dal"
import { updateTag } from "next/cache"
import { z } from "zod"

const ProductSchema = z.object({ /* ... */ })

export async function updateProduct(productId: string, input: unknown) {
  await verifyAdminSession()               // D-02 — FIRST statement, before parsing
  const data = ProductSchema.parse(input)  // never trust client shape
  const [updated] = await db.update(products).set(data)
    .where(eq(products.id, productId)).returning()
  updateTag(`product-${updated.slug}`)     // D-06
  return { success: true, id: updated.id } // minimal DTO — never raw record
}
```
(This exact block is already staged in `05-RESEARCH.md` Pattern 3 — copy verbatim as the starting skeleton.)

**Error-handling pattern** (`src/lib/actions/checkout.ts:171-199`, `256-284`, `308-318`): every DB write is wrapped in try/catch, returns `{ error: string }` on failure (never an unhandled throw reaching the client), and rolls back partial state where needed (see the orphaned-order cleanup at lines 308-318). Admin product/variant writes should follow the same `{ success }` / `{ error }` discriminated-union return shape — do not throw from the action for expected failure modes (Zod validation failure, not-found, illegal transition); reserve throws for truly unexpected errors.

**Soft-delete pattern** (`src/lib/db/schema.ts:120`, `168`; confirmed usage in `src/lib/cart/logic.ts:190` and `src/lib/actions/cart.ts:104`): `deactivateProduct` sets `products.isActive = false` AND cascades `variants.isActive = false` for all of that product's variants in the same batch — no new column, no new cascade logic needed; the cart/catalog layers already treat `!isActive` as OOS/hidden.

---

### `src/lib/actions/admin-orders.ts` (`updateOrderStatus`) (service, event-driven state machine)

**Analog:** `src/lib/payments/shared/confirm-order-paid.ts` (idempotency + side-effect contract) + `src/lib/actions/checkout.ts` (auth/Zod shell)

**Idempotent confirm delegation — reuse verbatim** (`src/lib/payments/shared/confirm-order-paid.ts:66-159`):
```typescript
export async function confirmOrderPaid(
  order: OrderWithItems,
  { provider, eventId }: { provider: string; eventId: string }
): Promise<ConfirmResult> {
  // 1. Idempotency guard — insert eventId, ON CONFLICT DO NOTHING
  const [idempotencyResult] = await db.batch([
    db.insert(processedWebhookEvents).values({ id: eventId, provider }).onConflictDoNothing(),
  ])
  if (idempotencyResult.rowCount === 0) return { outcome: "duplicate" }
  // 2. Already-confirmed guard
  if (order.status === "payment_confirmed") return { outcome: "duplicate" }
  // 3. Atomic batch: flip order + decrement stock (WHERE stock >= qty)
  // 4. Last-unit-race → payment_failed + refundNeeded: true (caller refunds)
  // 5. Non-blocking confirmation email
}
```
D-09: `updateOrderStatus(orderId, "payment_confirmed")` from `awaiting_bank_transfer` MUST call this function with `{ provider: "bank_transfer", eventId: "bank_transfer:<order.reference>" }` — do not reimplement any part of steps 1-5.

**Transition-graph + dispatch skeleton** (already drafted in `05-RESEARCH.md` Architecture Patterns §Pattern 4, lines 307-367) — copy this structure directly:
```typescript
"use server"
import "server-only"
import { verifyAdminSession } from "@/lib/dal"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { sendOrderStatusChangeEmail } from "@/lib/email/send-order-status-change"

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
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } })
  if (!order) throw new Error("Order not found")
  const allowed = LEGAL_TRANSITIONS[order.status] ?? []
  if (!allowed.includes(nextStatus)) throw new Error(`Illegal transition: ${order.status} -> ${nextStatus}`)

  if (nextStatus === "payment_confirmed") {
    const result = await confirmOrderPaid(order, { provider: "bank_transfer", eventId: `bank_transfer:${order.reference}` })
    return { success: result.outcome === "confirmed", outcome: result.outcome }
  }

  await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId))
  if (nextStatus === "shipped" || nextStatus === "delivered") {
    sendOrderStatusChangeEmail({ customerEmail: order.customerEmail, reference: order.reference,
      guestToken: order.guestToken, newStatus: nextStatus }).catch(console.error) // D-10 non-blocking
  }
  return { success: true }
}
```
Never write `orders.status` from any other file — this is the single writer (D-08 anti-pattern list, `05-RESEARCH.md` line 370).

---

### `src/lib/actions/admin-settings.ts` (`toggleStoreSetting`) (service, CRUD)

**Analog:** `src/lib/actions/cart.ts` (`updateCartItem`, lines 172-228) — simple auth + Zod-validated single-row upsert/update with a clean discriminated-union return.

```typescript
// Pattern from cart.ts:172-193 (validate → auth/verify → single update → return)
export async function toggleStoreSetting(method: string, enabled: boolean) {
  await verifyAdminSession() // D-02
  const parsed = z.object({ method: z.enum(["stripe", "paypal", "bank_transfer"]), enabled: z.boolean() })
    .safeParse({ method, enabled })
  if (!parsed.success) return { success: false, error: "Invalid input" }
  await db.update(storeSettings).set({ enabled: parsed.data.enabled, updatedAt: new Date() })
    .where(eq(storeSettings.method, parsed.data.method))
  return { success: true }
}
```

---

### `src/lib/payments/config.ts` (MODIFY — async migration) (config/service, CRUD)

**Analog:** itself (existing sync version, full file read above) — this is an in-place signature change, not a new-file pattern.

**Before** (`src/lib/payments/config.ts:16-40`, current sync switch):
```typescript
export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    ...
  }
}
export function enabledPaymentMethods(): PaymentMethod[] {
  return (["stripe", ...] as const).filter(isPaymentMethodEnabled)
}
```

**After** (mechanical migration — `05-RESEARCH.md` Code Examples, lines 427-482): keep `hasEnvAndCredentials()` as the exact current switch body (unchanged for the 5 non-DB-backed methods), add a `React.cache()`-wrapped batched `getStoreSettingsMap()` read, and gate only `stripe`/`paypal`/`bank_transfer` through the DB:
```typescript
import { cache } from "react"
const DB_BACKED_METHODS: ReadonlySet<PaymentMethod> = new Set(["stripe", "paypal", "bank_transfer"])
const getStoreSettingsMap = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await db.select().from(storeSettings)
  return Object.fromEntries(rows.map((r) => [r.method, r.enabled]))
})
export async function isPaymentMethodEnabled(method: PaymentMethod): Promise<boolean> {
  if (!hasEnvAndCredentials(method)) return false
  if (!DB_BACKED_METHODS.has(method)) return true
  const settings = await getStoreSettingsMap()
  return settings[method] ?? true // no row yet => fall back to current env-only behavior
}
```
**Call-site migration is mechanical** (every call site is already `async`) — add `await`:
```typescript
// src/lib/actions/checkout.ts:160 (BEFORE) → (AFTER)
if (!(await isPaymentMethodEnabled("bank_transfer"))) { ... }
```
Apply this same `await` addition at all ~15 existing call sites across `src/lib/actions/*.ts` and `src/app/**/route.ts` (Phase 4/7/7.1) — do not add a parallel async function.

---

### `src/lib/db/schema.ts` (MODIFY — add `storeSettings` table) (model, CRUD)

**Analog:** `processedWebhookEvents` (`src/lib/db/schema.ts:85-92`) — same shape: small lookup table, text primary key, boolean/text columns, no relations needed.

```typescript
// ADD — mirrors the processedWebhookEvents table style exactly
export const storeSettings = pgTable("store_settings", {
  method:    text("method").primaryKey(),
  enabled:   boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
})
```
Apply via the direct-SQL fallback script pattern already established for `order` tables — mirror `src/scripts/apply-order-schema.mjs` / `apply-order-schema-to-test-db.mjs` (per `05-RESEARCH.md` lines 514-536), run against **both** `DATABASE_URL` and `TEST_DATABASE_URL`.

---

### `src/emails/OrderStatusChangeEmail.tsx` + `src/lib/email/send-order-status-change.ts` (component + service)

**Analog:** `src/lib/email/send-order-confirmation.ts` (full file above) + `src/lib/email/resend-client.ts` (lazy client, full file above).

**Lazy-client pattern — copy verbatim** (`src/lib/email/resend-client.ts:1-15`, post commit `3207e49`):
```typescript
import "server-only"
import { Resend } from "resend"
export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}
```

**Sender pattern** (`src/lib/email/send-order-confirmation.ts:1-56`):
```typescript
import "server-only"
import { getResendClient } from "./resend-client"
import { OrderConfirmationEmail } from "@/emails/OrderConfirmationEmail"

export async function sendOrderConfirmationEmail(order: OrderConfirmationInput): Promise<void> {
  const resend = getResendClient()
  if (!resend) throw new Error("RESEND_API_KEY is not configured — cannot send order confirmation email")
  const { error } = await resend.emails.send({
    from: "Mandy Store <onboarding@resend.dev>",
    to: order.customerEmail,
    subject: `Order confirmed — ${order.reference}`,
    react: OrderConfirmationEmail({ /* ...fields... */ }),
  })
  if (error) throw new Error(`Failed to send order confirmation email: ${error.message}`)
}
```
New `send-order-status-change.ts` follows this exact shape with a `newStatus`-conditional subject line (`05-RESEARCH.md` lines 538-564 has the drafted version — copy it). Caller (`updateOrderStatus`) invokes it with `.catch(console.error)` — non-blocking, matching how `confirmOrderPaid` calls `sendOrderConfirmationEmail` at `confirm-order-paid.ts:143-156`.

React Email template: base `OrderStatusChangeEmail.tsx` on `src/emails/OrderConfirmationEmail.tsx`'s structure (not read in full here — same directory, same `@react-email/components` primitives); swap the confirmation copy for shipped/delivered status copy.

---

### `src/components/admin/ProductForm.tsx` (client component, CRUD form)

**Analog:** `src/components/checkout/CheckoutForm.tsx`

**Form scaffold pattern** (`CheckoutForm.tsx:1-24`, `36-58`, `62-73`, `109-128`):
```typescript
"use client"
import { useState, useTransition, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const inputClass = (hasError?: boolean) =>
  [
    "w-full rounded-lg border bg-surface px-3 py-2.5",
    "text-sm text-foreground placeholder:text-muted",
    "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand",
    "transition-colors",
    hasError ? "border-stock-out ring-2 ring-stock-out" : "border-border",
  ].filter(Boolean).join(" ")

const { register, trigger, getValues, formState: { errors } } = useForm<FormValues>({
  mode: "onBlur",
  resolver: zodResolver(Schema),
  defaultValues: { /* ... */ },
})
```
UI-SPEC's Interaction Rules explicitly say: "copy this helper [`inputClass`] into an admin-shared module rather than reimplementing it." Extract `inputClass` into a shared `src/components/admin/formStyles.ts` (or similar) imported by `ProductForm`, `VariantEditor`, `ImageUploadField`.

**Submit/pending pattern** (`CheckoutForm.tsx:130-150`, `useTransition` + try/catch around the Server Action call, `startTransition`) — reuse for `ProductForm`'s save handler, swapping `createBankTransferOrder` for `updateProduct`/`createProduct`.

---

### `src/components/admin/VariantEditor.tsx` (client component, inline row editor)

**Analog:** `src/components/cart/CartLineItem.tsx` (full file above)

**Row + remove-button pattern** (`CartLineItem.tsx:23-41`, `132-163`):
```typescript
<div className="flex gap-3 items-start px-5 py-4 border-b border-border last:border-0">
  {/* row content */}
  <button
    type="button"
    onClick={handleRemove}
    disabled={isPending}
    aria-label={`Remove ${item.productName} from cart`}
    className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors
      text-muted hover:text-destructive hover:bg-red-50 dark:hover:bg-red-500/10
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
  >
    {/* Heroicons TrashIcon, 18px, inlined <svg> */}
  </button>
</div>
```
Copy the exact `TrashIcon` SVG markup (lines 150-162) and the 44×44px (`min-h-11 min-w-11`) touch-target button classes verbatim for each variant row's remove control (UI-SPEC §Spacing exceptions explicitly cites this as the reuse target).

---

### `src/components/admin/OrderStatusControl.tsx` (client component, guided transition buttons)

**Analog:** `src/components/cart/CartStepper.tsx` pattern (Server Action + `useTransition`, button disables during pending) combined with `CartLineItem.tsx`'s `isPending` disabled-button styling shown above. Render one button per entry in the server-supplied `getValidNextStatuses(currentStatus)` list — never a `<select>` (Pitfall 3, D-08). Each button's `onClick` wraps `updateOrderStatus(orderId, nextStatus)` in `startTransition`, disables all sibling buttons while pending, per UI-SPEC Surface 5 "Transition pending" state.

---

### `src/components/admin/PaymentToggleRow.tsx` (client component, toggle switch)

**Analog (row/icon shape):** `src/components/checkout/PaymentMethodSelector.tsx` (icon + label + description row layout — read for icon set reuse).
**Toggle switch itself:** No existing analog — UI-SPEC fully specifies it (track `w-11 h-6 rounded-full`, OFF `bg-zinc-300`/ON `bg-brand`, thumb `w-5 h-5 rounded-full bg-white shadow translate-x-0`/`translate-x-5`, `role="switch" aria-checked`, `focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`). Build fresh per the UI-SPEC Surface 6 contract; do not invent different track/thumb dimensions.

---

### `tests/admin/products.test.ts`, `tests/admin/orders.test.ts`, `tests/admin/settings.test.ts` (test files)

**Analog:** `tests/checkout/actions.test.ts` (full file, mock structure above)

**Mock-hoisting pattern — copy verbatim, but ADD `updateTag`** (`tests/checkout/actions.test.ts:11-39`):
```typescript
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null), signIn: vi.fn(), signOut: vi.fn(), handlers: {} }))
```
**Note (05-RESEARCH.md Wave 0 Gaps, line 647):** the current mock shape in `tests/checkout/*.test.ts` does NOT include `updateTag` — admin test files must add it or `updateTag` calls will throw "not a function" under test.

**Fixture + beforeEach/afterEach pattern** (`actions.test.ts:49-115`): set required env vars for payment methods in `beforeEach`, truncate via `tests/helpers/db.ts` helpers in `afterEach` guarded by `hasDatabase`, `vi.clearAllMocks()` + `vi.unstubAllEnvs()` at the end.

**Admin auth test pattern:** mock `@/lib/dal`'s `verifyAdminSession` (not `@/lib/auth`'s `auth`) to return a role-less/customer session and assert the action redirects/rejects — mirrors how checkout tests assert `isPaymentMethodEnabled` rejection (`actions.test.ts:119-126`).

---

### `tests/helpers/db.ts` (MODIFY — add `truncateStoreSettingsTable`)

**Analog:** itself — `truncateOrderTables()` (`tests/helpers/db.ts:68-80`) is the template:
```typescript
export async function truncateStoreSettingsTable() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")
  await db.delete(schema.storeSettings)
}
```

---

## Shared Patterns

### Dual-layer admin auth (D-01/D-02)
**Source:** `src/lib/dal.ts:52-60` (`verifyAdminSession`) + `src/app/admin/page.tsx:12-15` (call site)
**Apply to:** Every new `/admin/*` route/layout AND every admin Server Action — as the literal first statement, before any Zod parsing or DB access.
```typescript
import { verifyAdminSession } from "@/lib/dal"
export async function AdminContent() {
  const user = await verifyAdminSession() // DAL layer 2 — proxy.ts is layer 1, UI-only
}
```

### Cache invalidation (D-06)
**Source:** `src/app/products/[slug]/page.tsx:73-77` (existing `cacheTag('product-<slug>')` hook)
**Apply to:** Every admin Server Action that mutates catalog-visible data (product fields, variant price/stock, images, activate/deactivate).
```typescript
import { updateTag } from "next/cache" // NOT revalidateTag (single-arg) — deprecated under cacheComponents
updateTag(`product-${slug}`)
```
Use `updateTag` in Server Actions only; `revalidateTag(tag, "max")` if ever needed from a Route Handler (none in this phase).

### Zod-validated Server Action shell
**Source:** `src/lib/actions/checkout.ts` (whole file) + `src/lib/actions/cart.ts` (whole file)
**Apply to:** All admin Server Actions (products, variants, orders, settings).
Pattern: `"use server"` + `import "server-only"` → auth/session check → `z.object({...}).safeParse` or `.parse` → DB write → minimal DTO return (`{ success, id }` / `{ success, error }`), never a raw Drizzle record.

### Error handling / graceful failure
**Source:** `src/lib/actions/checkout.ts:171-199, 308-318`
**Apply to:** All mutating admin actions — wrap DB/external-service calls in try/catch, return `{ error: string }` for expected failures, never let a Server Action throw for a validation or business-rule failure (only for truly unexpected errors, per the D-08 illegal-transition throw which the UI is expected to never actually trigger since only legal buttons render).

### Idempotent payment confirmation (D-09)
**Source:** `src/lib/payments/shared/confirm-order-paid.ts` (whole file)
**Apply to:** `updateOrderStatus`'s `payment_confirmed` branch only — call `confirmOrderPaid(order, { provider: "bank_transfer", eventId: "bank_transfer:<reference>" })` verbatim; never duplicate the atomic decrement/idempotency logic.

### Lazy Resend client + non-blocking send
**Source:** `src/lib/email/resend-client.ts` (whole file, post commit `3207e49`) + `src/lib/payments/shared/confirm-order-paid.ts:143-156` (`.catch(console.error)` call-site pattern)
**Apply to:** `send-order-status-change.ts` and its call site inside `updateOrderStatus`.

### Design tokens (indigo brand system)
**Source:** `src/app/globals.css:4-60` (`--brand #4f46e5`/`--brand-strong`/`--brand-soft`, `--surface`, `--border`, `--muted`, `--stock-in/low/out`)
**Apply to:** All admin components — no new CSS variables (UI-SPEC U-02). Section cards: `rounded-2xl bg-surface border border-border p-6` (matches `CheckoutForm` section rhythm). Buttons/focus rings: `focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2` everywhere, zero exceptions.

### Shared input styling helper
**Source:** `src/components/checkout/CheckoutForm.tsx:62-73` (`inputClass`)
**Apply to:** Extract into a shared admin module (per UI-SPEC Interaction Rules) and reuse across `ProductForm`, `VariantEditor`, `ImageUploadField` rather than reimplementing per-component.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/lib/blob/upload.ts` | utility | file-I/O | No existing file-upload/Blob code in this codebase — first use of `@vercel/blob`. Use RESEARCH.md's cited official `put()`/`del()` API examples (Vercel Blob docs, `05-RESEARCH.md` Standard Stack + Pitfall 5) rather than a codebase analog. Structure it like other thin external-SDK wrappers (`src/lib/payments/stripe.ts` — a bare client export) but the call pattern (`put()`/`del()` inside a Server Action, after `verifyAdminSession()`) is documented directly in RESEARCH's Security Domain table (line 673). |
| `src/components/admin/PaymentToggleRow.tsx`'s toggle-switch control | component (UI primitive) | request-response | No toggle-switch precedent anywhere in the codebase — fully specified from scratch in `05-UI-SPEC.md` Surface 6 (track/thumb/focus classes given verbatim); do not adapt an existing checkbox/radio component for this, build to spec. |

## Metadata

**Analog search scope:** `src/lib/actions/`, `src/lib/payments/`, `src/lib/email/`, `src/lib/db/schema.ts`, `src/lib/dal.ts`, `src/app/admin/`, `src/app/products/[slug]/`, `src/app/checkout/`, `src/app/order/[token]/`, `src/components/checkout/`, `src/components/cart/`, `src/emails/`, `tests/checkout/`, `tests/helpers/`, `src/app/globals.css`
**Files read directly:** `src/lib/actions/checkout.ts`, `src/lib/actions/cart.ts`, `src/app/admin/page.tsx`, `src/lib/dal.ts`, `src/lib/payments/config.ts`, `src/lib/payments/shared/confirm-order-paid.ts`, `src/lib/db/schema.ts`, `src/app/products/[slug]/page.tsx`, `src/lib/email/resend-client.ts`, `src/lib/email/send-order-confirmation.ts`, `src/components/checkout/CheckoutForm.tsx`, `src/components/cart/CartLineItem.tsx`, `tests/checkout/actions.test.ts`, `tests/helpers/db.ts`, `src/app/globals.css` (tokens)
**Pattern extraction date:** 2026-07-08
