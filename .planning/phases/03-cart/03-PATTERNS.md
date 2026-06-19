# Phase 3: Cart — Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` | model | CRUD | `src/lib/db/schema.ts` (existing Phase 2 tables) | exact — same file, same pgTable array-ExtraConfig style |
| `src/lib/cart/logic.ts` | utility | transform | `src/lib/catalog/variant.ts` | exact — pure module, no server-only, same export style |
| `src/lib/cart/queries.ts` | service | CRUD | `src/lib/catalog/queries.ts` | exact — server-only DAL, Drizzle joins, typed return |
| `src/lib/actions/cart.ts` | service | request-response | `src/lib/actions/auth.ts` | exact — `'use server'` at top, Zod validation, typed return |
| `src/lib/actions/auth.ts` (modify login) | service | request-response | `src/lib/actions/auth.ts` | exact — same file |
| `src/components/cart/CartProvider.tsx` | provider | event-driven | `src/components/product/VariantSelector.tsx` | role-match — client component with React state |
| `src/components/cart/CartDrawer.tsx` | component | event-driven | `src/components/product/VariantSelector.tsx` | role-match — client island with useTransition |
| `src/components/cart/CartLineItem.tsx` | component | request-response | `src/components/product/VariantSelector.tsx` | role-match — client component with server action calls |
| `src/components/cart/CartStepper.tsx` | component | request-response | `src/components/product/VariantSelector.tsx` | role-match — client component, useTransition, disabled state |
| `src/components/cart/CartEmptyState.tsx` | component | request-response | `src/components/catalog/EmptyState.tsx` | exact — same Server Component empty-state pattern |
| `src/components/layout/SiteHeader.tsx` (modify) | component | request-response | `src/components/layout/SiteHeader.tsx` | exact — same file |
| `src/components/product/VariantSelector.tsx` (modify) | component | request-response | `src/components/product/VariantSelector.tsx` | exact — same file |
| `src/app/layout.tsx` (modify) | config | request-response | `src/app/layout.tsx` | exact — same file |
| `src/app/cart/page.tsx` | component | request-response | `src/app/products/page.tsx` | exact — async Server Component, Suspense wrapper, calls DAL |
| `tests/cart/cart-logic.test.ts` | test | transform | `tests/catalog/variant-resolver.test.ts` | exact — pure unit tests, no DB, fixtures as inline objects |
| `tests/cart/cart-cookie.test.ts` | test | request-response | `tests/auth/login.test.ts` | role-match — integration test, vi.mock, hasDatabase guard |
| `tests/cart/cart-db.test.ts` | test | CRUD | `tests/catalog/queries.test.ts` | exact — DB integration, beforeEach truncate, it.skipIf(skip) |
| `tests/helpers/db.ts` (modify) | utility | CRUD | `tests/helpers/db.ts` | exact — same file, add truncateCartTables() |

---

## Pattern Assignments

### `src/lib/db/schema.ts` — ADD cart + cart_item tables

**Analog:** `src/lib/db/schema.ts` (existing products/variants section)

**Imports pattern** (lines 1-9):
```typescript
import {
  pgTable, pgEnum, text, timestamp, integer,
  primaryKey, unique, boolean, index
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
```
No new imports needed — `text`, `timestamp`, `integer`, `unique`, `index` are already imported.

**Core pgTable pattern — array-return ExtraConfig** (lines 113-127, the products table):
```typescript
export const products = pgTable("product", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("product_category_idx").on(table.categoryId),
  index("product_slug_idx").on(table.slug),
])
```
Copy this exact style: array-return `(table) => [...]`, `timestamp({ mode: "date" })`, `text("id").primaryKey()`, `crypto.randomUUID()` IDs.

**Unique constraint pattern** (lines 144-147, productOptions):
```typescript
}, (table) => [
  unique("product_option_name_unique").on(table.productId, table.name),
])
```
Use `unique("cart_user_unique").on(table.userId)` and `unique("cart_item_variant_unique").on(table.cartId, table.variantId)`.

**FK reference pattern with cascade** (lines 131-132, productImages):
```typescript
productId:  text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
```

**Relations pattern** (lines 188-227):
```typescript
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(variants),
}))
export const variantsRelations = relations(variants, ({ one, many }) => ({
  product: one(products, { fields: [variants.productId], references: [products.id] }),
}))
```
Add `cartRelations` and `cartItemsRelations` immediately after the Phase 2 relations block.

**Placement:** Insert cart tables after the last Phase 2 table block (after `variantOptionValues`, line 185), before the Phase 2 relations section. Add relations at the end of the relations block (after line 227).

---

### `src/lib/cart/logic.ts` — NEW pure functions

**Analog:** `src/lib/catalog/variant.ts`

**Module header pattern** (lines 1-6):
```typescript
// src/lib/catalog/variant.ts
// Pure variant-resolution and stock-tier utilities.
// No DB, no server-only — safe to import in Client Components AND unit tests.
```
Follow the same no-`'server-only'` convention for `logic.ts` — these functions are pure, testable in unit tests without DB.

**Type export pattern** (lines 13-26):
```typescript
export type VariantForSelector = {
  id: string
  sku: string | null
  priceKobo: number
  stock: number
  // ...
}
```
Define `GuestCartItem`, `CartLineItemRaw`, `CartResult` types at the top using the same inline-object export style.

**Pure function export pattern** (lines 40-50, resolveVariant):
```typescript
export function resolveVariant(
  variants: VariantForSelector[],
  selected: Record<string, string>
): VariantForSelector | undefined {
  const selectedIds = Object.values(selected)
  return variants.find((v) =>
    selectedIds.every((valId) =>
      v.optionValues.some((ov) => ov.optionValue.id === valId)
    )
  )
}
```
Copy this pattern for `parseCartCookie`, `mergeCartItems`, `hydrateCart`, `clampToStock`, `subtotal` — each is a named export function with typed params and typed return.

**Utility with guard** (lines 63-73, stockTier):
```typescript
export function stockTier(stock: number, threshold = 5): "in" | "low" | "out" {
  if (stock === 0) return "out"
  if (stock <= threshold) return "low"
  return "in"
}
```
Use the same early-return guard style for `clampToStock(qty, stock): number` → `return Math.min(qty, stock)`.

---

### `src/lib/cart/queries.ts` — NEW server-only cart DAL

**Analog:** `src/lib/catalog/queries.ts`

**Header + server-only guard** (lines 1-29):
```typescript
import "server-only"
// src/lib/catalog/queries.ts
// Catalog data access layer — server-only (never imported in client bundles).

import { db } from "@/lib/db/client"
import {
  brands, categories, products, productImages,
  productOptions, optionValues, variants, variantOptionValues,
} from "@/lib/db/schema"
import { and, or, ilike, eq, gte, lte, asc, desc, sql, count } from "drizzle-orm"
```
`src/lib/cart/queries.ts` opens with `import "server-only"` then named Drizzle imports. Import `cart`, `cartItems`, `variants`, `products`, `productImages` from `@/lib/db/schema`. Import `auth` from `@/lib/auth` for session detection.

**Typed return object pattern** (lines 35-50):
```typescript
export type CatalogCard = {
  id: string
  slug: string
  name: string
  // ...
}
export type CatalogResult = {
  products: CatalogCard[]
  total: number
  // ...
}
```
Define `CartLineItem` and `CartResult` types at the top of queries.ts in the same style.

**Drizzle query with relations** (lines 195-223, getProduct):
```typescript
const product = await db.query.products.findFirst({
  where: eq(products.slug, slug),
  with: {
    brand: true,
    images: { orderBy: (i, { asc: a }) => [a(i.position)] },
    variants: {
      where: (v, { eq: e }) => e(v.isActive, true),
      with: {
        optionValues: {
          with: { optionValue: { with: { option: true } } },
        },
      },
    },
  },
})
return product ?? null
```
Use `db.query.cartItems.findMany` with `with: { variant: { with: { product: true } } }` for DB cart hydration.

**Null-safe return** (line 223): `return product ?? null` — always return null not undefined for "not found".

**Promise.all pattern** (lines 164-169):
```typescript
const [rows, countResult] = await Promise.all([
  baseQuery.orderBy(sortExpr).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  countQuery,
])
```
Use `Promise.all` when fetching cart items + variant stock simultaneously.

---

### `src/lib/actions/cart.ts` — NEW Server Actions

**Analog:** `src/lib/actions/auth.ts`

**`'use server'` file directive + header** (lines 1-14):
```typescript
"use server"
// src/lib/actions/auth.ts
// Authentication Server Actions: register, login, logout, verifyEmail

import { db } from "@/lib/db/client"
import { users, verificationTokens } from "@/lib/db/schema"
import { signIn, signOut } from "@/lib/auth"
import { z } from "zod"
import { AuthError } from "next-auth"
```
`cart.ts` opens with `"use server"` (top-of-file directive, not per-function). Imports: `cookies` from `next/headers`, `revalidatePath` from `next/cache`, `auth` from `@/lib/auth`, `db` from `@/lib/db/client`, `z` from `zod`.

**Zod schema pattern** (lines 18-23, RegisterSchema):
```typescript
const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})
```
Validate cart inputs at the top of the file:
```typescript
const AddToCartSchema = z.object({
  variantId: z.string().uuid(),
  quantity:  z.number().int().min(1).max(1000),
})
```

**Typed return union pattern** (lines 38-40):
```typescript
export async function register(
  formData: FormData,
): Promise<{ error: string } | { success: true; message: string }> {
```
Use the same union for cart actions: `Promise<{ success: boolean; count: number; error?: string }>`.

**Zod safeParse + early return** (lines 43-46):
```typescript
const parsed = RegisterSchema.safeParse(Object.fromEntries(formData))
if (!parsed.success) {
  return { error: "Invalid input: " + parsed.error.issues[0]?.message }
}
```
Copy this exact pattern for `addToCart`: `AddToCartSchema.safeParse({ variantId, quantity })`.

**Try/catch with AuthError re-throw** (lines 179-193, login):
```typescript
try {
  await signIn("credentials", { identifier, password, redirectTo: "/" })
} catch (error) {
  if (error instanceof Error && error.message === "NEXT_REDIRECT") {
    throw error   // re-throw Next.js redirects
  }
  if (error instanceof AuthError) {
    return { error: "Invalid credentials" }
  }
  throw error
}
```
Apply the same re-throw pattern for `NEXT_REDIRECT` in cart actions that trigger redirects.

**Auth check pattern** (from `verifySession` in dal.ts, lines 30-42):
```typescript
const session = await auth()
if (!session?.user?.id) {
  redirect("/account/login")
}
```
In cart actions: use `const session = await auth()` to detect guest vs authed — do NOT call `verifySession()` (which redirects); instead branch on `session?.user?.id` being present.

---

### `src/lib/actions/auth.ts` — MODIFY login() for D-10 merge

**Analog:** `src/lib/actions/auth.ts` (same file)

**Injection point** — the `login()` function (lines 173-194). After `await signIn("credentials", ...)` succeeds and BEFORE the NEXT_REDIRECT is re-thrown, inject:
```typescript
// D-10: merge guest cart into DB cart immediately after successful sign-in
// (within the same Server Action scope — has access to cookies())
await mergeGuestCartOnLogin(userId)
```

The NEXT_REDIRECT throw pattern (line 183-185):
```typescript
if (error instanceof Error && error.message === "NEXT_REDIRECT") {
  throw error
}
```
The merge must run BEFORE this re-throw. Capture the userId from the session immediately after `signIn` resolves (call `auth()` to get it, or pass it through the merge helper).

---

### `src/components/cart/CartProvider.tsx` — NEW context provider

**Analog:** `src/components/product/VariantSelector.tsx`

**`'use client'` directive + imports pattern** (lines 1-14 of VariantSelector):
```typescript
"use client"
// src/components/product/VariantSelector.tsx
// Interactive variant selection client component

import { useState, useEffect } from "react"
import { formatNGN } from "@/lib/catalog/format"
```
CartProvider opens with `"use client"`. Imports: `createContext`, `useContext`, `useState`, `ReactNode` from `react`.

**useState pattern** (lines 59-63 of VariantSelector):
```typescript
const [selected, setSelected] = useState<Record<string, string>>(
  buildInitialSelected
)
```
Use the same `useState<T>(initialValue)` with explicit type param for `isOpen: boolean` and `optimisticCount: number`.

**Props interface pattern** (lines 24-30 of VariantSelector):
```typescript
export interface VariantSelectorProps {
  options: OptionForSelector[]
  variants: VariantForSelector[]
  lowStockThreshold?: number
  onVariantImageChange?: (url: string | null) => void
}
```
Define `CartProviderProps` with `children: ReactNode` and `initialCount: number`.

**Exported hook pattern** — no direct analog exists; use the `createContext` / `useContext` + throw pattern from RESEARCH.md Pattern 4. The hook exports (`useCart`) follow the same single-named-export style as `resolveVariant`.

---

### `src/components/cart/CartDrawer.tsx` — NEW client drawer

**Analog:** `src/components/product/VariantSelector.tsx`

**`'use client'` + useTransition pattern** (lines 1-7 of VariantSelector):
```typescript
"use client"
import { useState, useEffect } from "react"
```
CartDrawer uses `useTransition`, `useCart` from CartProvider, and `FocusTrap` from `focus-trap-react`.

**Conditional rendering pattern** (lines 75-195 of VariantSelector — options.map):
```typescript
{options.map((option) => {
  const isColor = isColorOption(option.name)
  return (
    <div key={option.id}>
      {isColor ? <SwatchButton ... /> : <PillButton ... />}
    </div>
  )
})}
```
Apply same conditional render for `isOpen ? <DrawerPanel /> : null` and for `items.length === 0 ? <CartEmptyState /> : <LineItemList />`.

**Disabled state pattern** (lines 184-190 of VariantSelector, Add-to-cart CTA):
```typescript
<button
  type="button"
  disabled={isOOS}
  aria-disabled={isOOS}
  className="... disabled:opacity-50 disabled:cursor-not-allowed ..."
>
```
Use `disabled={hasOOS}` on the Checkout CTA in the drawer footer.

**Tailwind class composition pattern** (lines 132-142):
```typescript
className={[
  "relative w-8 h-8 rounded-full border-2 transition-all",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
  isSelected ? "border-blue-600 ring-2 ring-blue-600 ring-offset-2" : "border-transparent hover:border-zinc-400",
  !available ? "opacity-40 cursor-not-allowed" : "",
].filter(Boolean).join(" ")}
```
Use the same array + `.filter(Boolean).join(" ")` pattern for all conditional Tailwind classes in drawer components (replace `ring-blue-600` with `ring-brand`).

---

### `src/components/cart/CartLineItem.tsx` — NEW line item component

**Analog:** `src/components/product/VariantSelector.tsx`

**`'use client'` + server action call pattern** (lines 1-7 of VariantSelector):
```typescript
"use client"
import { useState, useEffect } from "react"
```
CartLineItem is `'use client'`. It imports `removeCartItem`, `updateCartItem` from `@/lib/actions/cart`. It uses `useTransition` for pending state on trash and stepper buttons.

**Button disabled+aria pattern** (lines 128-131 of VariantSelector):
```typescript
disabled={!available}
aria-pressed={isSelected}
aria-disabled={!available}
title={!available ? "Out of stock" : val.value}
aria-label={`${val.value}${!available ? " — Out of stock" : ""}`}
```
Apply same `disabled` + `aria-disabled` + `aria-label` pattern to trash button and stepper buttons when OOS or isPending.

**`formatNGN` usage** (line 8 of VariantSelector):
```typescript
import { formatNGN } from "@/lib/catalog/format"
```
Import and use `formatNGN` for unit price and line total display. All price display in CartLineItem uses `formatNGN(priceKobo)` — never raw numbers.

---

### `src/components/cart/CartStepper.tsx` — NEW stepper component

**Analog:** `src/components/product/VariantSelector.tsx` (button group within the selector)

**`'use client'` + useTransition pattern:**
```typescript
"use client"
import { useTransition } from "react"
```
CartStepper wraps `updateCartItem` call in `startTransition`. During `isPending`, both + and − buttons are `disabled`.

**Button interaction disabled pattern** (lines 184-190 of VariantSelector):
```typescript
<button
  type="button"
  disabled={isOOS}
  aria-disabled={isOOS}
  className="... disabled:opacity-50 disabled:cursor-not-allowed ..."
>
  {ctaLabel}
</button>
```
Apply to stepper: minus `disabled={isPending || quantity <= 0}`, plus `disabled={isPending || quantity >= stock}`.

**aria-live for screen reader announcement** (lines 81-91 of VariantSelector):
```typescript
<div aria-live="polite" aria-atomic="true">
  {resolvedVariant ? (
    <p>...</p>
  ) : (
    <p>—</p>
  )}
</div>
```
The stepper quantity count element needs `aria-live="polite"` and `aria-atomic="true"` (UI-SPEC accessibility contract).

---

### `src/components/cart/CartEmptyState.tsx` — NEW empty state

**Analog:** `src/components/catalog/EmptyState.tsx`

**Full component structure** (entire file, 45 lines):
```typescript
// src/components/catalog/EmptyState.tsx
import Link from "next/link"

interface EmptyStateProps {
  hasFilters?: boolean
  basePath?: string
}

export function EmptyState({ hasFilters = false, basePath = "/products" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Heroicons MagnifyingGlassIcon (48px, inline SVG) */}
      <svg ... className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
        ...
      </svg>
      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-4">
        No products found
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        Try adjusting your filters or search term.
      </p>
      <Link
        href={basePath}
        className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 ..."
      >
        {hasFilters ? "Clear filters" : "Browse all products"}
      </Link>
    </div>
  )
}
```
Copy the **exact structure** (`flex flex-col items-center justify-center py-16 text-center`, `w-12 h-12`, `text-2xl font-semibold mt-4`, `text-sm mt-2`, `Link mt-4 text-sm font-semibold`). Replace:
- Icon: `MagnifyingGlassIcon` → `ShoppingCartIcon` (inline SVG from Heroicons v2)
- Heading: "No products found" → "Your cart is empty"
- Body: "Try adjusting..." → "Browse our electronics, watches and phones..."
- CTA: `text-blue-600 hover:text-blue-700` → `bg-brand hover:bg-brand-strong text-white rounded-xl px-6 py-3` (UI-SPEC calls for a filled button, not a text link, for CartEmptyState)
- CTA text: "Browse all products" → "Start shopping"
- CTA href: hardcoded `/products`

No props needed — CartEmptyState takes no props (hardcoded to cart context).

Note: `EmptyState.tsx` CTA link also needs `text-blue-600` → `text-brand` rebrand (D-03).

---

### `src/components/layout/SiteHeader.tsx` — MODIFY

**Analog:** `src/components/layout/SiteHeader.tsx` (same file)

**Cart button stub to wire** (lines 53-65):
```typescript
<button
  type="button"
  aria-label="Shopping cart"
  className="relative min-h-11 min-w-11 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
>
  {/* count bubble stub */}
  <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
    0
  </span>
</button>
```
Changes needed:
- `SiteHeader` stays as a Server Component — it cannot use `useCart()` directly.
- Extract the cart icon button into a new `'use client'` child component `CartIconButton` that imports `useCart()` and wires `onClick={() => open()}`.
- The count value comes from `initialCount` prop passed down from layout (server-read count).
- Change `font-bold` to `font-semibold` on the badge (UI-SPEC typography rule).
- Hide badge when `count === 0`; show "99+" when `count > 99`.
- Dynamic `aria-label`: `count > 0 ? \`Shopping cart, ${count} items\` : "Shopping cart"`.

---

### `src/components/product/VariantSelector.tsx` — MODIFY (rebrand + wire addToCart)

**Analog:** `src/components/product/VariantSelector.tsx` (same file)

**CTA button to replace** (lines 182-193):
```typescript
<button
  type="button"
  disabled={isOOS}
  aria-disabled={isOOS}
  onClick={() => {
    // Phase 3 wires cart — this is a no-op stub (D-18)
  }}
  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 text-base font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
>
  {ctaLabel}
</button>
```
Wire this to: `useTransition` + `startTransition(() => addToCart(resolvedVariant.id, 1))`. Add `useCart()` to access `open()` and `setOptimisticCount()`. On success, call `setOptimisticCount(result.count)` and `open()`.

Rebrand: replace `bg-blue-600 hover:bg-blue-700` → `bg-brand hover:bg-brand-strong`; `ring-blue-500` → `ring-brand`.

**Swatch selected state** (line 137): `border-blue-600 ring-2 ring-blue-600 ring-offset-2` → `border-brand ring-2 ring-brand ring-offset-2`

**Pill selected state** (line 160): `border-blue-600 ring-2 ring-blue-600` → `border-brand ring-2 ring-brand`

**Focus-visible** (lines 134, 158): `focus-visible:ring-blue-500` → `focus-visible:ring-brand`

Add loading state inside CTA button for `isPending` (use `useTransition`):
```typescript
const [isPending, startTransition] = useTransition()
// ...
<button disabled={isOOS || isPending}>
  {isPending ? "Adding…" : ctaLabel}
</button>
```

---

### `src/app/layout.tsx` — MODIFY (mount CartProvider + CartDrawer)

**Analog:** `src/app/layout.tsx` (same file)

**Current layout structure** (lines 22-46):
```typescript
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="brand-gradient ...">...</div>
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
```
Must become `async` (to `await getCartCount()`). Wrap body contents in `<CartProvider initialCount={count}>`. Add `<CartDrawer />` after `<SiteHeader />`.

Pattern for making layout async (matches `src/app/products/page.tsx` line 32 pattern of async server component):
```typescript
export default async function RootLayout({ children }: ...) {
  const count = await getCartCount()   // server-reads cookie or DB
  return (
    <html ...>
      <body ...>
        <CartProvider initialCount={count}>
          <div className="brand-gradient ...">...</div>
          <SiteHeader />
          <CartDrawer />
          {children}
        </CartProvider>
      </body>
    </html>
  )
}
```

---

### `src/app/cart/page.tsx` — NEW /cart page

**Analog:** `src/app/products/page.tsx`

**Metadata export pattern** (lines 16-19):
```typescript
export const metadata: Metadata = {
  title: "All Products — Mandy Store",
  description: "Browse all electronics, watches, and phones at Mandy Store.",
}
```
Copy for: `title: "Your Cart — Mandy Store"`, `description: "Review your cart..."`.

**Async Server Component + Suspense pattern** (lines 32-107):
```typescript
async function ProductsContent({ searchParams }: ProductsPageProps) {
  const sp = await searchParams
  const [result, brands] = await Promise.all([getCatalog(parsed), getBrandsForCategory()])
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <h1 className="text-3xl sm:text-4xl font-extrabold ...">All Products</h1>
      ...
    </div>
  )
}

export default function ProductsPage(props: ProductsPageProps) {
  return (
    <Suspense fallback={<div>...</div>}>
      <ProductsContent {...props} />
    </Suspense>
  )
}
```
Apply the same inner-component + Suspense shell pattern:
```typescript
async function CartContent() {
  const cart = await getCart()
  // render CartLineItem list + order summary
}

export default function CartPage() {
  return (
    <Suspense fallback={<CartSkeleton />}>
      <CartContent />
    </Suspense>
  )
}
```

**max-w-7xl container pattern** (line 50): `className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1"` — use same container class.

**Empty-state conditional** (ProductGrid has one internally) — in CartContent, render `<CartEmptyState />` when `cart.items.length === 0` instead of the grid.

---

### `tests/cart/cart-logic.test.ts` — NEW pure unit tests

**Analog:** `tests/catalog/variant-resolver.test.ts`

**File header + imports pattern** (lines 1-12):
```typescript
// tests/catalog/variant-resolver.test.ts
// Covers: CATA-04 — variant resolution algorithm + stock tier indicator
// Pure unit tests — no DB, no vi.mock needed.

import { describe, it, expect } from "vitest"
import {
  resolveVariant, stockTier, stockLabel, isOptionValueAvailable,
  type VariantForSelector,
} from "@/lib/catalog/variant"
```
Cart logic test opens the same way — no `vi.mock`, imports directly from `@/lib/cart/logic`.

**Inline fixture pattern** (lines 22-78):
```typescript
function makeOptionValue(id: string, value: string, optionName: string) {
  return { optionValue: { id, value, productOption: { name: optionName } } }
}

const v1: VariantForSelector = {
  id: "v1",
  sku: "SKU-BLACK-128",
  priceKobo: 5_000_000,
  stock: 10,
  imageUrl: null,
  optionValues: [ makeOptionValue("ov-black", "Black", "Color"), ... ],
}
```
Define `GuestCartItem` fixtures and `VariantStockMap` fixtures inline. Use underscore separators for kobo values: `5_000_000`.

**describe + it.each → explicit it() pattern** (lines 84-148):
```typescript
describe("resolveVariant()", () => {
  it("returns the variant matching all selected option values (Black + 128GB → v1)", () => {
    const selected = { Color: "ov-black", Storage: "ov-128" }
    const result = resolveVariant(allVariants, selected)
    expect(result?.id).toBe("v1")
  })

  it("returns undefined when no variant matches", () => {
    const result = resolveVariant(allVariants, { Color: "ov-nonexistent" })
    expect(result).toBeUndefined()
  })
})
```
Use `describe("parseCartCookie()", ...)` + `describe("mergeCartItems()", ...)` + `describe("hydrateCart()", ...)` — one describe block per function.

---

### `tests/cart/cart-db.test.ts` — NEW DB integration tests

**Analog:** `tests/catalog/queries.test.ts`

**File header + DB guard pattern** (lines 1-11):
```typescript
// tests/catalog/queries.test.ts
// Integration tests: skip if DATABASE_URL is not set.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))

const skip = !hasDatabase
```
Cart DB test opens exactly the same way — `vi.mock("server-only", () => ({}))` is mandatory since `queries.ts` has `import "server-only"`.

**beforeEach truncation pattern** (lines 123-127):
```typescript
describe("getCatalog()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateCatalogTables()
    vi.clearAllMocks()
  })
```
Use `await truncateCartTables()` (the new helper) inside beforeEach.

**it.skipIf(skip) + dynamic import pattern** (lines 130-140):
```typescript
it.skipIf(skip)("returns only products in the specified category", async () => {
  await seedFixture()
  const { getCatalog } = await import("@/lib/catalog/queries")
  const result = await getCatalog({ categorySlug: "electronics", sort: "newest", page: 1 })
  expect(result.products).toHaveLength(1)
})
```
Copy the `it.skipIf(skip)` pattern with dynamic `await import(...)` for all cart DB tests — this avoids module caching issues with `vi.mock`.

**Seed fixture helper pattern** (lines 15-115):
```typescript
async function seedFixture() {
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")
  const catId = crypto.randomUUID()
  await db.insert(schema.categories).values([{ id: catId, ... }])
  // ...
  return { catId, varGalaxyId, ... }
}
```
Define `seedCartFixture()` that creates a user, cart row, and cart_item rows. Use `crypto.randomUUID()` for all IDs.

---

### `tests/cart/cart-cookie.test.ts` — NEW cookie integration tests

**Analog:** `tests/auth/login.test.ts`

**vi.mock for server modules pattern** (lines 17-29):
```typescript
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  handlers: {},
}))

vi.mock("server-only", () => ({}))

const skip = !hasDatabase
```
Cart cookie test mocks `next/headers` cookies and `server-only`:
```typescript
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))
const skip = !hasDatabase
```

**Dynamic import for action under test** (lines 43-53):
```typescript
const { register, verifyEmail } = await import("@/lib/actions/auth")
```
Import cart actions dynamically inside test bodies: `const { addToCart } = await import("@/lib/actions/cart")`.

**Mock return setup pattern** (lines 199-214):
```typescript
const { signIn } = await import("@/lib/auth")
const mockSignIn = vi.mocked(signIn)
mockSignIn.mockRejectedValueOnce(authErr)
```
Use `vi.mocked(cookies).mockResolvedValue(mockCookieStore)` to inject a fake cookie store, then verify `.set()` was called with correct arguments.

---

### `tests/helpers/db.ts` — MODIFY (add truncateCartTables)

**Analog:** `tests/helpers/db.ts` (same file)

**Existing truncation function pattern** (lines 50-67):
```typescript
export async function truncateCatalogTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }

  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Delete in FK-safe order: junction table first, then leaves, then roots
  await db.delete(schema.variantOptionValues)
  await db.delete(schema.variants)
  // ...
  await db.delete(schema.categories)
}
```
Add immediately after `truncateCatalogTables`:
```typescript
export async function truncateCartTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // FK-safe order: cartItems (child) before cart (parent)
  await db.delete(schema.cartItems)
  await db.delete(schema.cart)
}
```
Same pattern: DATABASE_URL guard, lazy imports, FK-safe delete order (`cartItems` before `cart`).

---

## Shared Patterns

### server-only guard
**Source:** `src/lib/catalog/queries.ts` line 1; `src/lib/dal.ts` line 1
**Apply to:** `src/lib/cart/queries.ts` (top of file, before any other import)
```typescript
import "server-only"
```

### `'use server'` file directive
**Source:** `src/lib/actions/auth.ts` line 1
**Apply to:** `src/lib/actions/cart.ts` (top of file — this makes ALL exports in the file Server Actions)
```typescript
"use server"
```

### Zod input validation
**Source:** `src/lib/actions/auth.ts` lines 18-23
**Apply to:** All cart Server Actions (`addToCart`, `updateCartItem`, `removeCartItem`)
```typescript
const Schema = z.object({
  variantId: z.string().uuid(),
  quantity:  z.number().int().min(1),
})
const parsed = Schema.safeParse(input)
if (!parsed.success) return { success: false, count: 0, error: "Invalid input" }
```

### verifySession / auth() session detection
**Source:** `src/lib/dal.ts` lines 30-42
**Apply to:** All cart Server Actions that need to branch guest vs authed
```typescript
// dal.ts pattern (redirects on no session — use for admin/user-required paths)
const user = await verifySession()

// Cart variant (optional auth — guest is valid): use auth() directly
const session = await auth()
const isAuthed = !!session?.user?.id
```

### Tailwind conditional class composition
**Source:** `src/components/product/VariantSelector.tsx` lines 132-142
**Apply to:** All cart component files with conditional states (OOS, isPending, isSelected)
```typescript
className={[
  "base classes",
  condition ? "active-classes" : "inactive-classes",
  !enabled ? "opacity-40 cursor-not-allowed" : "",
].filter(Boolean).join(" ")}
```

### Indigo brand token (rebrand from blue-600)
**Source:** `src/components/layout/SiteHeader.tsx` lines 43-44 (already uses indigo in nav); `src/app/globals.css` (--brand token)
**Apply to:** All cart components AND VariantSelector rebrand (D-03)
```
Before: bg-blue-600 hover:bg-blue-700 ring-blue-500 ring-blue-600 text-blue-600
After:  bg-brand hover:bg-brand-strong ring-brand text-brand
```

### focus-visible ring
**Source:** `src/components/product/VariantSelector.tsx` lines 134, 158
**Apply to:** All interactive elements in cart components
```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2
```
(Replace `ring-blue-500` → `ring-brand` wherever it appears.)

### formatNGN for price display
**Source:** `src/components/product/VariantSelector.tsx` line 8; `src/lib/catalog/format.ts`
**Apply to:** `CartLineItem` (unit price, line total), cart page and drawer subtotal
```typescript
import { formatNGN } from "@/lib/catalog/format"
// Usage:
formatNGN(priceKobo)  // e.g. "₦15,000.00"
```

### max-w-7xl page container
**Source:** `src/app/products/page.tsx` line 50
**Apply to:** `src/app/cart/page.tsx`
```typescript
className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1"
```

### Suspense + inner async component pattern
**Source:** `src/app/products/page.tsx` lines 32-107
**Apply to:** `src/app/cart/page.tsx`
```typescript
async function CartContent() { /* await getCart(); render */ }
export default function CartPage() {
  return <Suspense fallback={<CartSkeleton />}><CartContent /></Suspense>
}
```

### DB test: vi.mock server-only + it.skipIf
**Source:** `tests/catalog/queries.test.ts` lines 9-11
**Apply to:** `tests/cart/cart-db.test.ts` and `tests/cart/cart-cookie.test.ts`
```typescript
vi.mock("server-only", () => ({}))
const skip = !hasDatabase
// in test body:
it.skipIf(skip)("description", async () => { ... })
```

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/lib/`, `src/components/`, `src/app/`, `tests/`
**Files read:** 16 source files
**Pattern extraction date:** 2026-06-19
