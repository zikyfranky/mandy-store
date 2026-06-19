# Phase 3: Cart — Research

**Researched:** 2026-06-19
**Domain:** Next.js 16 App Router — server-side cart (cookie + DB), Server Actions, Drizzle ORM schema, Auth.js v5 signIn event, React Context drawer
**Confidence:** HIGH (core APIs verified against official Next.js 16.2.9 docs; Drizzle 0.45.2 confirmed in package.json; assumptions logged)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Clicking Add to cart opens a slide-out cart drawer (mini-cart) from the right — shows added item + full cart, with "Checkout" and "View cart" actions. Shopper stays on the product page.
- **D-02** There is also a dedicated full `/cart` page.
- **D-03** Header cart icon opens the drawer; drawer's "View cart" links to `/cart`; drawer's "Checkout" targets Phase 4 placeholder. Rebrand Add-to-cart CTA from `bg-blue-600` to indigo brand styling.
- **D-04** Quantity adjusted with a stepper (− n +).
- **D-05** Quantity editable in BOTH the drawer and the `/cart` page.
- **D-06** Quantity capped at variant's available stock, with a message ("Only N available").
- **D-07** Remove via trash icon on each line; decreasing qty below 1 also removes the item.
- **D-08** Guest cart = server-side cookie, 30-day lifetime. Cookie stores only `{ variantId, quantity }` — never prices.
- **D-09** Logged-in users get a DB-backed cart (new `cart` / `cart_item` tables keyed to user); no prices persisted.
- **D-10** On login, merge guest cookie cart into user's DB cart (additive, clamp to stock, then clear cookie).
- **D-11** OOS cart line: marked "Out of stock", excluded from total, blocks checkout until removed.
- **D-12** Stock < cart qty: clamp line to available qty + show notice.
- **D-13** Header badge shows total item quantity (sum of all line quantities).
- **D-14** Empty cart shows friendly empty state + "Start shopping" CTA to catalog.

### Claude's Discretion

- Drawer open/close animation + focus-trap/escape behavior; toast vs no-toast.
- Exact cookie name/encoding and signing; Server Action vs Route Handler for mutations.
- `cart`/`cart_item` table column details and indexes; how merge resolves same variant.
- Optimistic UI vs await-on-server for stepper; debounce strategy for rapid clicks.

### Deferred Ideas (OUT OF SCOPE)

- Checkout, shipping, payment, order creation (Phase 4).
- Cross-device cart for guests (guests: per-browser cookie only).
- Save for later / wishlist (v2).
- Cart-level promo/discount codes (v2, PROMO-01/02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CART-01 | User can add a product variant to cart | Server Action `addToCart(variantId)` writes cookie (guest) or DB row (authed); drawer opens on success |
| CART-02 | User can update quantity or remove items from cart | Server Actions `updateCartItem(variantId, qty)` / `removeCartItem(variantId)`; stepper + trash icon in drawer and /cart page |
| CART-03 | Cart persists across page visits (guest session via cookie) | `next/headers` async `cookies()` — httpOnly, 30-day maxAge; verified per Next.js 16.2.9 docs |
</phase_requirements>

---

## Summary

Phase 3 adds cart functionality on top of the completed catalog. The core challenge is the dual persistence model: guests use a server-side cookie storing only `[{variantId, quantity}]`; logged-in users use new Drizzle `cart`/`cart_item` tables. Both paths are unified behind a server-side `getCart()` function that hydrates line items (joins to `variants` + `products` + `productImages`) and computes subtotals from `priceKobo` — never from client-submitted values.

The key Next.js 16 specifics are confirmed: `cookies()` from `next/headers` is async and must be awaited (`const store = await cookies()`). Server Components can read cookies (making those routes dynamically rendered), but CANNOT write, set, or delete cookies — those operations are limited to Server Actions and Route Handlers. This means the read/write split is clean: Server Components call `getCart()` which reads the cookie; all mutations (add, update, remove, merge) go through `'use server'` actions in `src/lib/actions/cart.ts`.

The Auth.js v5 login merge (D-10) cannot use the `signIn` Auth.js event because the event handler does not have access to the incoming request cookies (it lacks the `cookies()` context of a Server Action). The correct hook is the existing login Server Action in `src/lib/actions/auth.ts`: call `mergeGuestCartOnLogin(userId)` immediately after a successful `signIn("credentials", ...)`, then clear the guest cookie inside the same Server Action. This keeps merge logic co-located with the login flow and has access to both the session user ID and the cookie store.

Reactive UI (badge count, drawer contents) is achieved via a `CartProvider` React Context mounted above `SiteHeader` in `src/app/layout.tsx`. The provider holds `{ items, count, isOpen }` client state. On Server Action completion (add/update/remove), the action calls `revalidatePath` (or `refresh()` from `next/cache`), causing Next.js to re-render the layout's Server Components — the badge count is re-read from the server. The drawer's open/close is pure client state in the CartProvider, so the drawer opens immediately on button click without waiting for the server round-trip.

**Primary recommendation:** Server Actions for all cart mutations + CartProvider React Context for drawer open/close + `revalidatePath('/', 'layout')` after mutations to refresh the server-rendered badge count.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Guest cart persistence | API / Backend | — | httpOnly cookie written only in Server Actions; browser never sees raw cart data |
| DB cart persistence | Database / Storage | API / Backend | `cart`/`cart_item` Drizzle tables; written by Server Actions after `verifySession()` |
| Cart hydration (prices/stock) | API / Backend | — | Server-only `getCart()` joins variant.priceKobo + stock; never sent to client for computation |
| Cart drawer open/close | Browser / Client | — | Pure client state in CartProvider; no server round-trip needed |
| Badge count render | Frontend Server (SSR) | Browser / Client | Server Component reads cart count from cookie/DB; CartProvider can mirror for optimistic UI |
| Login merge (D-10) | API / Backend | — | Login Server Action has access to both auth session + cookie store |
| Stepper mutations | Browser / Client | API / Backend | Client calls Server Action; Server Action writes cookie/DB + returns updated cart |
| Stock-aware clamping | API / Backend | — | Always validated server-side against `variants.stock` at mutation time |

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | App Router, Server Actions, `cookies()` | Already installed |
| `drizzle-orm` | 0.45.2 | New cart/cart_item tables, queries | Already installed |
| `next-auth` | 5.0.0-beta.31 | `auth()` → `verifySession()` in cart Server Actions | Already installed |
| `zod` | 4.4.3 | Validate cart mutation inputs (variantId, quantity) | Already installed |
| `server-only` | 0.0.1 | Guard cart DAL from client import | Already installed |

[VERIFIED: package.json + npm registry]

### New dependency to add

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `focus-trap-react` | 12.0.2 | Keyboard focus trap inside cart drawer (accessibility) | Cart drawer open state |

[VERIFIED: npm registry — `npm view focus-trap-react version` returned 12.0.2]

**Installation:**
```bash
npm install focus-trap-react
```

**Version verification:** `focus-trap-react@12.0.2` is the current stable release as of research date. [VERIFIED: npm registry]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `focus-trap-react` | Hand-rolled `onKeyDown` trap | focus-trap-react handles tabbable-element discovery, first-focusable detection, escape key, and return-focus — hand-rolling misses edge cases (SVG, shadow DOM, dynamic content) |
| `revalidatePath` (layout) | `router.refresh()` from client | Both work; `revalidatePath('/', 'layout')` called from Server Action is cleaner (no client involvement); `router.refresh()` is the client equivalent if needed after an optimistic update |
| CartProvider React Context | Zustand / Jotai | Context is sufficient for this scope; no selector-based re-render optimization needed; avoids a new dependency |

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (click "Add to cart")
  │
  ▼
VariantSelector (client component)
  │  calls server action with variantId
  ▼
src/lib/actions/cart.ts  [Server Action — 'use server']
  │
  ├─► verifySession() (optional — detect guest vs authed)
  │
  ├─► [Guest path]  await cookies()  →  parse cookie JSON  →  mutate  →  re-set cookie
  │
  └─► [Authed path] db INSERT/UPDATE cart_item (Drizzle)   →  verifySession() required
  │
  │   (both paths)
  ├─► revalidatePath('/', 'layout')   [invalidates cached layout/badge count]
  │
  └─► returns { success: true, count: N }
  │
Client receives action result
  │
  ├─► CartProvider.setCount(N)       [updates badge immediately]
  └─► CartProvider.setOpen(true)     [opens drawer]

Layout re-render (triggered by revalidatePath)
  │
  ▼
SiteHeader (Server Component)
  │  reads cart count via getCartCount() — reads cookie or DB
  └─► renders badge with real server count
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── cart/
│   │   ├── cookie.ts          # parse/serialize guest cookie (pure functions, server-only)
│   │   ├── queries.ts         # getCart(), getCartCount() — server-only, joins variant data
│   │   └── schema.ts          # Drizzle cart/cart_item table definitions (add to db/schema.ts)
│   └── actions/
│       └── cart.ts            # addToCart, updateCartItem, removeCartItem, mergeGuestCart
├── components/
│   ├── cart/
│   │   ├── CartProvider.tsx    # 'use client' context: { items, count, isOpen, open, close }
│   │   ├── CartDrawer.tsx      # 'use client' slide-out drawer; uses CartProvider + FocusTrap
│   │   ├── CartLineItem.tsx    # line item row: image, name, variant label, stepper, trash
│   │   └── CartStepper.tsx    # − n + control; calls updateCartItem / removeCartItem
│   └── layout/
│       └── SiteHeader.tsx     # wire badge count (async read) + header icon opens drawer
└── app/
    ├── cart/
    │   └── page.tsx           # /cart page: full cart view, same CartLineItem components
    └── layout.tsx             # mount CartProvider + CartDrawer here (global scope)
```

### Pattern 1: Guest Cookie Cart — Read/Write Split

**What:** Server Components read the cookie (for initial render); Server Actions write it.
**When to use:** Any time cart state changes (add, update, remove, merge).

```typescript
// Source: nextjs.org/docs/app/api-reference/functions/cookies (Next.js 16.2.9)

// READ — in a Server Component (e.g. SiteHeader, /cart page)
import { cookies } from 'next/headers'
import 'server-only'

export async function getGuestCart(): Promise<CartItem[]> {
  const store = await cookies()                    // MUST await in Next.js 16
  const raw = store.get('cart')?.value ?? '[]'
  try {
    return JSON.parse(raw) as CartItem[]
  } catch {
    return []
  }
}

// WRITE — only valid inside a Server Action or Route Handler
// Source: nextjs.org/docs/app/api-reference/functions/cookies#understanding-cookie-behavior-in-server-functions
'use server'
import { cookies } from 'next/headers'

export async function setGuestCart(items: CartItem[]): Promise<void> {
  const store = await cookies()
  store.set('cart', JSON.stringify(items), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,   // 30 days in seconds (matches auth session D-08)
    secure: process.env.NODE_ENV === 'production',
  })
}
```

**Critical Next.js 16 fact:** `cookies().set()` and `cookies().delete()` CANNOT be called in a Server Component — they throw. They only work in Server Actions (files with `'use server'` at top) or Route Handlers. [VERIFIED: nextjs.org/docs/app/api-reference/functions/cookies]

### Pattern 2: Unified getCart() — hydrated line items

**What:** Single server-side function that reads guest cookie OR DB cart, joins variant + product data, computes subtotals.

```typescript
// src/lib/cart/queries.ts
import 'server-only'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { cart, cartItems, variants, products, productImages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { formatNGN } from '@/lib/catalog/format'

export type CartLineItem = {
  variantId: string
  quantity: number
  stock: number
  priceKobo: number
  productName: string
  variantLabel: string    // e.g. "Black / 256GB"
  imageUrl: string | null
  // Computed server-side — never from client
  lineTotalKobo: number
  lineTotalFormatted: string
  isOOS: boolean          // D-11: stock === 0
  isClamped: boolean      // D-12: quantity was clamped to stock
}

export type CartResult = {
  items: CartLineItem[]
  subtotalKobo: number
  subtotalFormatted: string
  totalQty: number
  hasOOS: boolean         // D-11: blocks checkout if true
}

export async function getCart(): Promise<CartResult> {
  const session = await auth()
  const items = session?.user?.id
    ? await getDbCart(session.user.id)
    : await getGuestCart()
  return hydrateCart(items)
}

// hydrateCart: joins variantId → variant + product + image,
// computes lineTotalKobo = priceKobo * quantity (server-side only),
// clamps quantity to stock (D-12), marks OOS (D-11)
```

[ASSUMED] — Exact Drizzle join shape for cart hydration is designed here; validated by working code in Phase 2 getProduct query pattern.

### Pattern 3: Drizzle Schema for cart / cart_item

```typescript
// Add to src/lib/db/schema.ts (array-return ExtraConfig style — matches Phase 2 tables)
// Source: drizzle-orm 0.45.2 installed; array-return style confirmed working (STATE.md)

export const cart = pgTable("cart", {
  id:        text("id").primaryKey(),            // crypto.randomUUID()
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("cart_user_idx").on(table.userId),
  unique("cart_user_unique").on(table.userId),   // one cart per user
])

export const cartItems = pgTable("cart_item", {
  id:        text("id").primaryKey(),
  cartId:    text("cart_id").notNull().references(() => cart.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
  quantity:  integer("quantity").notNull().default(1),
  // NO priceKobo column — prices always read from variants table at query time (D-09, CLAUDE.md)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("cart_item_variant_unique").on(table.cartId, table.variantId),  // one row per variant per cart
  index("cart_item_cart_idx").on(table.cartId),
])
```

Key design choices:
- `unique("cart_user_unique")` — exactly one `cart` row per user; upsert on first add
- `unique("cart_item_variant_unique")` — no duplicate variant rows; update quantity on re-add
- No `priceKobo` in `cart_item` — always join to `variants.priceKobo` at read time
- DB cart is for logged-in users only; guests use the cookie

[VERIFIED schema style: STATE.md — "Array-return extra-config style used for Phase 2 tables in schema.ts (both styles valid in drizzle-orm 0.45.2)"]

### Pattern 4: CartProvider React Context + Drawer

**What:** A `'use client'` context provider wrapping the layout body; holds drawer open/close state and a mirrored item count for instant badge updates.
**When to use:** Cart drawer and header badge need to react to Add-to-cart clicks without full-page reload.

```typescript
// src/components/cart/CartProvider.tsx
'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type CartContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  optimisticCount: number
  setOptimisticCount: (n: number) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({
  children,
  initialCount,
}: {
  children: ReactNode
  initialCount: number          // seeded from server on first render
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [optimisticCount, setOptimisticCount] = useState(initialCount)
  return (
    <CartContext.Provider value={{
      isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false),
      optimisticCount, setOptimisticCount,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}
```

**Layout wiring:** `src/app/layout.tsx` becomes:
```tsx
import { CartProvider } from '@/components/cart/CartProvider'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { getCartCount } from '@/lib/cart/queries'   // Server Component reads count

export default async function RootLayout({ children }) {
  const count = await getCartCount()    // reads cookie or DB; makes layout dynamic
  return (
    <html ...>
      <body ...>
        <CartProvider initialCount={count}>
          <SiteHeader />
          <CartDrawer />
          {children}
        </CartProvider>
      </body>
    </html>
  )
}
```

[VERIFIED: nextjs.org/docs/app/getting-started/server-and-client-components — Server Components can be nested inside Client Context Providers as children]

### Pattern 5: Add-to-cart Server Action + Reactive Update

**What:** Client component calls a Server Action, receives updated count, updates CartProvider state, then `revalidatePath` re-renders the server-side badge.

```typescript
// src/lib/actions/cart.ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const AddSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
})

export async function addToCart(
  variantId: string,
  quantity: number = 1
): Promise<{ success: boolean; count: number; error?: string }> {
  const parsed = AddSchema.safeParse({ variantId, quantity })
  if (!parsed.success) return { success: false, count: 0, error: 'Invalid input' }

  // Fetch current stock — server always validates (D-06, CLAUDE.md)
  const variant = await db.query.variants.findFirst({
    where: eq(variants.id, variantId),
    columns: { stock: true, isActive: true },
  })
  if (!variant || !variant.isActive || variant.stock === 0) {
    return { success: false, count: 0, error: 'Out of stock' }
  }

  const session = await auth()
  if (session?.user?.id) {
    await addToDbCart(session.user.id, variantId, Math.min(quantity, variant.stock))
  } else {
    await addToGuestCookieCart(variantId, Math.min(quantity, variant.stock))
  }

  revalidatePath('/', 'layout')   // re-renders SiteHeader badge from server
  const count = await getCartCount()
  return { success: true, count }
}
```

**Client side (VariantSelector.tsx after wiring):**
```typescript
// In the Add-to-cart button onClick:
const { open, setOptimisticCount } = useCart()
const handleAdd = async () => {
  if (!resolvedVariant || isOOS) return
  const result = await addToCart(resolvedVariant.id, 1)
  if (result.success) {
    setOptimisticCount(result.count)   // instant badge update
    open()                             // open drawer immediately
  }
}
```

[VERIFIED pattern: nextjs.org/docs/app/getting-started/mutating-data — Server Actions can call revalidatePath; can also return data to the client for optimistic updates]

### Pattern 6: Login Merge (D-10)

**What:** After successful Credentials sign-in, call `mergeGuestCartOnLogin(userId)` in the login Server Action before redirect.
**Why not Auth.js `signIn` event:** The Auth.js `events.signIn` handler runs in the Auth.js core context and does NOT have access to `cookies()` from `next/headers` (no request scope). The login Server Action in `src/lib/actions/auth.ts` already calls `signIn("credentials", ...)` and controls the redirect — it is the correct injection point. [ASSUMED — Auth.js event handler cookie access not confirmed in official docs; based on architecture knowledge]

```typescript
// Append to the login() server action in src/lib/actions/auth.ts after signIn() succeeds:
await mergeGuestCartOnLogin(user.id)   // reads cookie, merges to DB, clears cookie

// src/lib/cart/merge.ts
export async function mergeGuestCartOnLogin(userId: string): Promise<void> {
  const store = await cookies()
  const raw = store.get('cart')?.value
  if (!raw) return

  const guestItems: CartItem[] = JSON.parse(raw)
  if (guestItems.length === 0) return

  // Find or create DB cart for user
  // For each guest item: additive merge, clamp to stock (D-10)
  // Clear cookie after merge
  store.set('cart', '[]', { maxAge: 0 })   // clear cookie
}
```

[ASSUMED] — Exact login action signature (for the injection point); LOGIN action currently calls `signIn("credentials", ...)` via Auth.js — see `src/lib/actions/auth.ts`. Research confirms the server action already has `cookies()` scope available.

### Pattern 7: Stock-Aware Clamp on Hydration (D-11 / D-12)

Every call to `getCart()` re-fetches variant stock from the DB. If stock dropped below stored quantity since last cart mutation, `hydrateCart()` clamps quantity to current stock and sets `isClamped: true`. If stock is 0, `isOOS: true` — line is excluded from subtotal, checkout is blocked.

This means OOS/clamp detection is lazy (at read time), not eager — consistent with the Phase 4 atomic stock decrement design. No background job needed.

### Pattern 8: Cookie Size Budget

The guest cookie stores `[{variantId: string, quantity: number}]` as plain JSON.
- Each item: ~60 bytes raw (UUID 36 chars + JSON overhead + number)
- Cookie limit: 4096 bytes per cookie (browser standard)
- Max items at limit: ~60 items — far exceeds any realistic cart size

No signing required for this data (it stores only IDs and quantities, not prices). The server always validates IDs and quantities against the DB before acting. An attacker who forges a cookie can at most add valid variants to their own cart — all price computation is server-side. [VERIFIED threat model reasoning; no signing needed for security — prices never stored in cookie]

If a signing layer is desired for tamper-evidence, this is a Claude's Discretion item.

### Anti-Patterns to Avoid

- **Setting cookies in a Server Component:** `cookies().set()` throws in Server Components — only works in Server Actions / Route Handlers. [VERIFIED: Next.js 16 docs]
- **Calling `'use cache'` on any cart component:** `use cache` cannot access `cookies()` internally; cart reads are request-time and must NOT be cached. Routes that call `cookies()` are automatically dynamic in Next.js 16. [VERIFIED: nextjs.org/docs/app/api-reference/directives/use-cache — "Cached functions cannot directly access runtime APIs like cookies()"]
- **Storing priceKobo in cart_item or cookie:** Violates D-09 and CLAUDE.md "never trust client prices". Always join to `variants.priceKobo` at query time.
- **Reading then writing stock in the same transaction:** Phase 3 caps quantity at add/update time using a regular SELECT; the atomic decrement (`UPDATE ... WHERE stock > 0 RETURNING stock`) is Phase 4's job at order creation. Phase 3 reads stock for display and clamping only.
- **Passing cart data through URL or form hidden fields:** Client-submitted quantities must always be re-validated server-side against `variants.stock`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap in drawer | Custom Tab keydown handler | `focus-trap-react` 12.0.2 | Handles tabbable element discovery, Escape key, return-focus, SVG, shadow DOM |
| Cookie parsing | Custom decode/validate | `JSON.parse` + Zod schema validation | Simple enough; Zod guards type and shape |
| Cart merge deduplication | Custom set operations | Drizzle `unique("cart_item_variant_unique")` + upsert | DB unique constraint prevents duplicate variant rows; ON CONFLICT DO UPDATE handles re-add |
| Quantity clamping logic | Ad-hoc Math.min everywhere | Centralized `clampToStock(qty, stock)` in `src/lib/cart/cookie.ts` | Ensures D-06/D-12 are uniformly applied |

**Key insight:** Cookie carts look simple but accumulate edge cases — concurrent tabs, stale stock, OOS items, login merge races. All edge cases are handled server-side at hydration time; client only submits variantId + desired quantity.

---

## Common Pitfalls

### Pitfall 1: Writing cookies in a Server Component

**What goes wrong:** Calling `(await cookies()).set(...)` inside a Server Component body throws `Error: Cookies can only be modified in a Server Action or Route Handler`.
**Why it happens:** Server Component rendering runs before the response is finalized; cookie writes require adding `Set-Cookie` headers to the outgoing response.
**How to avoid:** All cart mutation functions live in `src/lib/actions/cart.ts` with `'use server'` at the top. Server Components only call read functions.
**Warning signs:** Runtime error `Cookies can only be modified in a Server Action or Route Handler` during render.
[VERIFIED: nextjs.org/docs/app/api-reference/functions/cookies#understanding-cookie-behavior-in-server-components]

### Pitfall 2: Forgetting `await` on `cookies()`

**What goes wrong:** `cookies()` without await returns a Promise in Next.js 15+ — destructuring `.get()` from it returns undefined; no TypeScript error because the old sync overload was retained until recently.
**Why it happens:** Next.js 15 made `cookies()` async; Next.js 16 enforces it. The sync path was deprecated.
**How to avoid:** Always `const store = await cookies()` before calling `.get()`, `.set()`, `.delete()`.
**Warning signs:** Cookie reads return `undefined` even though the cookie is present in browser DevTools.
[VERIFIED: Next.js 16.2.9 docs — "cookies is an asynchronous function that returns a promise. You must use async/await"]

### Pitfall 3: Caching a cart-reading component with `'use cache'`

**What goes wrong:** Adding `'use cache'` to `SiteHeader` or any component that calls `getCartCount()` causes a build error — `cookies()` inside a `use cache` scope is forbidden.
**Why it happens:** `use cache` creates an isolated environment disconnected from the request; request-time APIs (cookies, headers) cannot run inside it.
**How to avoid:** Cart-reading components must never have `'use cache'`. The existing `cacheComponents: true` in `next.config.ts` enables PPR but does NOT automatically cache all components — only those that explicitly use `'use cache'`. `SiteHeader` currently has no `'use cache'` and should keep it that way once `getCartCount()` is added.
**Warning signs:** Build error `Error: Route ... used "cookies" inside a "use cache" ...`
[VERIFIED: nextjs.org/docs/app/api-reference/directives/use-cache — "Cached functions cannot directly access runtime APIs like cookies(), headers(), or searchParams"]

### Pitfall 4: Auth.js signIn event cannot write cookies

**What goes wrong:** Attempting to call `(await cookies()).set(...)` inside the Auth.js `events.signIn` handler — the handler does not execute in a Next.js request context with a writable response, so `cookies()` from `next/headers` either throws or silently fails.
**Why it happens:** Auth.js event handlers run inside Auth.js's own middleware layer, not directly in a Next.js Server Action response scope.
**How to avoid:** Perform the guest cart merge (D-10) inside the `login()` Server Action in `src/lib/actions/auth.ts`, AFTER the `signIn("credentials", ...)` call succeeds, using the same `cookies()` store available to any Server Action.
**Warning signs:** Merge appears to succeed (no error) but guest cookie is never cleared; or `TypeError: cookies is not a function` inside the event handler.
[ASSUMED — based on Auth.js architecture; not confirmed by official docs]

### Pitfall 5: Duplicate cart rows on concurrent add

**What goes wrong:** Rapid double-clicks on "Add to cart" trigger two parallel Server Actions; both check the DB, find no cart_item row, and INSERT one — creating a duplicate row and a unique-constraint violation.
**Why it happens:** No UPSERT / ON CONFLICT handling.
**How to avoid:** Use Drizzle's `onConflictDoUpdate` (Postgres `INSERT ... ON CONFLICT DO UPDATE SET quantity = ...`) targeting the `cart_item_variant_unique` constraint. The cookie path is safe (reads cookie, mutates, re-sets cookie in sequence — but rapid clicks from client should be debounced or use `useTransition`/`isPending` to disable the button during flight).
**Warning signs:** `duplicate key value violates unique constraint "cart_item_variant_unique"` in Neon logs.

### Pitfall 6: Cart count badge causes full layout re-render on every request

**What goes wrong:** Reading `getCartCount()` inside `RootLayout` (an async Server Component) makes the entire layout dynamic, adding a DB/cookie read to every page request.
**Why it happens:** Cookie reads in a Server Component opt the route into dynamic rendering.
**How to avoid:** This is intentional and acceptable for a cart — cart is per-user/per-request by definition. Use `Suspense` around the badge with a skeleton fallback if the DB read is slow. The `CartProvider initialCount` prop mirrors the server count on client for instant updates.
**Warning signs:** Layout is marked `ƒ` (dynamic) in `next build` output — this is EXPECTED for pages with cart.

---

## Code Examples

### Guest cookie serialization (pure, no deps)

```typescript
// src/lib/cart/cookie.ts
import 'server-only'

export type GuestCartItem = { variantId: string; quantity: number }

const CART_COOKIE = 'ms_cart'   // ms = mandy store; short name saves cookie bytes
const MAX_AGE    = 30 * 24 * 60 * 60   // 30 days in seconds (D-08)

export function parseCartCookie(value: string | undefined): GuestCartItem[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is GuestCartItem =>
        typeof item.variantId === 'string' && typeof item.quantity === 'number'
    )
  } catch {
    return []
  }
}

export function serializeCartCookie(items: GuestCartItem[]): string {
  return JSON.stringify(items)
}

export { CART_COOKIE, MAX_AGE }
```

### Drizzle cart relations

```typescript
// Append to src/lib/db/schema.ts relations section
export const cartRelations = relations(cart, ({ one, many }) => ({
  user:  one(users,     { fields: [cart.userId],   references: [users.id] }),
  items: many(cartItems),
}))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart:    one(cart,    { fields: [cartItems.cartId],    references: [cart.id] }),
  variant: one(variants, { fields: [cartItems.variantId], references: [variants.id] }),
}))
```

### `db:push` workflow after schema change

```bash
# Run after adding cart/cart_items to schema.ts:
npm run db:push   # drizzle-kit push → applies new tables to Neon
```

This phase requires exactly one schema push at Wave 1 (immediately after schema changes). Subsequent waves do not need it.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cookies()` synchronous | `cookies()` async — must await | Next.js 15.0.0-RC | All cookie reads/writes need `await` |
| `revalidatePath` only | `refresh()` from `next/cache` also available | Next.js 16 | `refresh()` is a lighter client-router refresh; `revalidatePath` invalidates caches |
| Client-side localStorage cart | Server-side cookie / DB cart | Community best practice | Survives JS disabled, cross-tab, incognito; works with SSR |

**Deprecated/outdated:**
- `cookies()` without await: was synchronous in Next.js 14, deprecated synchronous access in 15, enforced async in 16.
- `middleware.ts`: renamed to `proxy.ts` in this project (Next.js 16). Cart mutations must not rely on proxy for auth — Server Actions must call `auth()` directly.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Auth.js `events.signIn` handler does not have access to `next/headers` `cookies()` | Pattern 6, Pitfall 4 | If it does have access, the merge could be placed there instead — login action injection is still safe regardless |
| A2 | Plain JSON (unsigned) cookie is sufficient security for `[{variantId, quantity}]` | Pattern 8 | If signing is required (e.g., fraud concern), add HMAC signing; does not affect correctness of current design |
| A3 | `revalidatePath('/', 'layout')` re-renders SiteHeader (in root layout) after cart mutation | Pattern 5 | If it doesn't re-render the badge in tests, use `revalidatePath('/', 'layout')` or `refresh()` from client as fallback |

---

## Open Questions (RESOLVED)

1. **Cart merge conflict resolution (D-10) for same variant**
   - RESOLVED: `Math.min(guestQty + dbQty, stock)` (additive, clamped to stock). Implemented in Plan 03-02 (mergeGuestCartOnLogin).
   - What we know: Additive merge, clamped to stock
   - What's unclear: If guest has 2 of variant A, logged-in DB cart already has 3 of variant A, stock is 4 — result is min(2+3, 4) = 4. This is the correct behavior but should be confirmed with user.
   - Recommendation: Implement as `Math.min(guestQty + dbQty, stock)`, document in code comments.

2. **Drawer animation library**
   - RESOLVED: Pure CSS `transition-transform duration-300 translate-x` (no new animation dep). Plan 03-03 Task 2.
   - What we know: Tailwind CSS v4 `transition` utilities are available; no Framer Motion installed.
   - What's unclear: Whether a pure CSS `translate-x` transition on the drawer panel is sufficient or Framer Motion is wanted.
   - Recommendation: Pure CSS `transition-transform duration-300` — avoids a new dep; Claude's Discretion.

3. **`useOptimistic` vs `useTransition` for stepper**
   - RESOLVED: `useTransition` + `isPending` disable during flight (simpler, no rollback complexity). Plan 03-02 Task 4 / 03-03.
   - What we know: React 19 is installed (19.2.4), which includes stable `useOptimistic`.
   - What's unclear: Whether the user wants optimistic UI (instant visual update before server confirms) or await-on-server (spinner, then update).
   - Recommendation: `useTransition` + `isPending` disable stepper during flight (simpler, avoids rollback complexity); `useOptimistic` for snappier feel. Claude's Discretion.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20+ | Next.js 16 | Shell: v18.17.0; nvm 22 available | `.nvmrc=22` | `nvm use 22` before any build/test command |
| PostgreSQL (Neon) | Drizzle, cart_item table | ✓ | Serverless | — |
| `focus-trap-react` | CartDrawer accessibility | ✗ (not yet installed) | — | Install: `npm install focus-trap-react` |
| `npm run db:push` | Push cart/cart_item schema | ✓ | drizzle-kit 0.31.10 | — |

**Missing dependencies with no fallback:**
- `focus-trap-react` — required for accessible drawer; install before CartDrawer implementation (Wave 2+)

**Missing dependencies with fallback:**
- Node 18 in shell — use `nvm use 22` before dev/build/test commands (documented in CLAUDE.md)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/cart/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CART-01 | addToCart() clamps qty to stock, writes guest cookie | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| CART-01 | addToCart() writes DB cart_item for authed user | integration | `npx vitest run tests/cart/cart-db.test.ts` | ❌ Wave 0 |
| CART-01 | addToCart() returns OOS error when stock=0 | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| CART-02 | updateCartItem() clamps to stock, removes if qty=0 | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| CART-02 | removeCartItem() removes line from cookie/DB | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| CART-03 | Guest cookie survives across requests (httpOnly, 30d) | integration | `npx vitest run tests/cart/cart-cookie.test.ts` | ❌ Wave 0 |
| CART-03 | parseCartCookie handles malformed JSON gracefully | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| D-10 | mergeGuestCartOnLogin combines quantities, clamps to stock | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| D-11 | hydrateCart marks OOS lines, excludes from subtotal | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| D-12 | hydrateCart clamps qty when stock < stored qty | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |
| subtotal | Server-side subtotal = sum(priceKobo * qty) for non-OOS lines | unit | `npx vitest run tests/cart/cart-logic.test.ts` | ❌ Wave 0 |

**Unit-testable pure functions (no DB, no cookies):**
- `parseCartCookie(string)` → `GuestCartItem[]`
- `mergeCartItems(guest: GuestCartItem[], db: GuestCartItem[], stockMap: Record<string, number>)` → merged items
- `hydrateCart(rawItems, variantRows)` → `CartResult` with subtotal, OOS flags, clamp flags
- `clampToStock(qty: number, stock: number)` → number

These functions should live in `src/lib/cart/logic.ts` (no `'server-only'` guard needed — they are pure) and tested in `tests/cart/cart-logic.test.ts` without a DB connection.

**Integration tests (DB-backed, guard with `hasDatabase`):**
- `addToCart()` full round-trip (guest cookie and authed DB paths)
- `mergeGuestCartOnLogin()` end-to-end

### Sampling Rate

- **Per task commit:** `npx vitest run tests/cart/cart-logic.test.ts` (pure unit tests, no DB)
- **Per wave merge:** `npx vitest run` (full suite — 48 existing + new cart tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/cart/cart-logic.test.ts` — covers pure functions: parse, merge, hydrate, clamp, subtotal (CART-01/02/03, D-10/11/12)
- [ ] `tests/cart/cart-cookie.test.ts` — covers cookie round-trip integration tests (CART-03)
- [ ] `tests/cart/cart-db.test.ts` — covers DB cart integration tests (CART-01, D-09, D-10)
- [ ] `src/lib/cart/logic.ts` — pure helper functions (prerequisite for unit tests)
- [ ] Update `tests/helpers/db.ts` — add `truncateCartTables()` helper (FK-safe: cartItems → cart)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `verifySession()` in all authed cart Server Actions (dal.ts pattern) |
| V3 Session Management | yes | Cart tied to Auth.js session token; cookie httpOnly + sameSite=lax |
| V4 Access Control | yes | Guest cart: cookie-scoped (no user auth needed); DB cart: verifySession() gate |
| V5 Input Validation | yes | Zod schema on variantId (uuid) + quantity (int, min 1, max reasonable) in every Server Action |
| V6 Cryptography | no | No encryption needed; cookie stores only IDs + quantities (not prices, not PII) |

### Known Threat Patterns for Cart Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-submitted price tampering | Tampering | Never read price from cookie/client; always join variants.priceKobo at query time |
| Negative / zero quantity via direct POST | Tampering | Zod min(1) on quantity input; Server Action rejects invalid inputs |
| Cookie forgery (fake variantId) | Tampering | Server validates variantId exists in DB before acting; invalid IDs silently ignored |
| Quantity inflation beyond stock | Tampering | `Math.min(requestedQty, variant.stock)` server-side at every add/update |
| CSRF on cart mutations | Spoofing | Next.js Server Actions use `POST` with `x-nextjs-action` header; same-origin enforced by CORS |
| Stolen session → access another user's DB cart | Elevation | verifySession() + cart rows scoped by userId FK; no cross-user access possible |

---

## Sources

### Primary (HIGH confidence)
- [nextjs.org/docs/app/api-reference/functions/cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) — async cookies(), read/write rules, Server Component vs Server Action split (version 16.2.9 confirmed)
- [nextjs.org/docs/app/getting-started/mutating-data](https://nextjs.org/docs/app/getting-started/mutating-data) — Server Actions, revalidatePath, refresh(), return values to client, useTransition pattern
- [nextjs.org/docs/app/api-reference/directives/use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) — `use cache` cannot access cookies(), request-time APIs forbidden inside cached scope (version 16.2.9)

### Secondary (MEDIUM confidence)
- `package.json` — all installed versions verified directly [VERIFIED: grep of file]
- `src/lib/db/schema.ts` — existing schema style (array-return ExtraConfig) confirmed [VERIFIED: codebase read]
- `src/lib/auth.ts` — Auth.js v5 login flow (Credentials + jwt strategy + DB session rows) [VERIFIED: codebase read]
- `STATE.md` — cross-phase constraints (cookie stores only variantId+quantity; verifySession pattern; 30-day sessions) [VERIFIED: planning file]
- npm registry — `focus-trap-react@12.0.2` current [VERIFIED: `npm view focus-trap-react version`]

### Tertiary (LOW confidence / ASSUMED)
- Auth.js `events.signIn` cookie access limitation — [ASSUMED: based on Auth.js architecture, not confirmed in official events docs]
- `revalidatePath('/', 'layout')` behavior for SiteHeader badge refresh — [MEDIUM — documented in Next.js mutating-data guide but specific layout scope behavior warrants integration test confirmation]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed; one new dep (focus-trap-react) version verified
- Architecture (cookie read/write split): HIGH — verified against Next.js 16.2.9 official docs
- Architecture (login merge hook): MEDIUM — Auth.js event handler cookie access is assumed (A1); login action injection is safe regardless
- Architecture (use cache compatibility): HIGH — verified against Next.js 16 use cache docs
- Drizzle schema design: HIGH — pattern follows established Phase 2 schema style
- Pitfalls: HIGH — all verified against official docs or codebase evidence

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (30 days — stable libraries; recheck if next-auth@5 beta advances significantly)
