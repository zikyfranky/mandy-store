---
phase: 03-cart
verified: 2026-06-25T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 03: Cart — Verification Report

**Phase Goal:** Customers can collect items into a cart that survives page navigation and browser refresh, for both guests and authenticated users, without ever trusting client-side prices.
**Verified:** 2026-06-25
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Add a selected product variant to the cart and see the cart count update | VERIFIED | `VariantSelector.tsx` calls `addToCart(resolvedVariant.id, 1)` via `useTransition`; on success calls `setOptimisticCount(result.count)` + `open()` (drawer opens). `CartIconButton.tsx` reads `optimisticCount` from `CartProvider` and renders badge. `revalidatePath('/', 'layout')` in all three cart actions triggers layout re-render for server-side count refresh. |
| 2 | Change the quantity of, or remove, any item in the cart | VERIFIED | `CartStepper.tsx` calls `updateCartItem(variantId, quantity - 1)` / `updateCartItem(variantId, quantity + 1)` via `useTransition`. `CartLineItem.tsx` calls `removeCartItem(item.variantId)` on trash click. `updateCartItem` with `quantity === 0` delegates to `removeCartItem` (D-07). Both `CartStepper` and `CartLineItem` are used in the drawer (`CartDrawer.tsx`) and on `/cart` page (`src/app/cart/page.tsx`). |
| 3 | A guest customer's cart persists across page visits and a browser refresh (server-side cookie, not localStorage alone) | VERIFIED | `src/lib/cart/cookie.ts` — `setGuestCartItems` writes with `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: MAX_AGE` (2592000 = 30 days), `secure: true` in production. Cookie name `ms_cart` (constant `CART_COOKIE`). `getCart()` in `queries.ts` reads cookie via `getGuestRaw()` → `getGuestCartItems()` on every request (no `'use cache'`). Layout reads `getCart()` per request inside `CartShell` (Suspense boundary). |
| 4 | The cart stores only variant IDs and quantities — prices and totals are recalculated from the database, never trusted from the client | VERIFIED | Schema: `cartItems` table (`src/lib/db/schema.ts` lines 204-214) has columns `id`, `cartId`, `variantId`, `quantity`, `createdAt`, `updatedAt` — NO `priceKobo` column. `hydrateCart` in `logic.ts` computes `lineTotalKobo = row.priceKobo * quantity` from server-fetched `CartVariantRow.priceKobo` (never from the cookie). `getCart()` calls `loadVariantRows()` which queries `variants.priceKobo` from the DB. `addToCart`/`updateCartItem` never accept or use a client-supplied price. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | `cart` + `cartItems` pgTables + relations | VERIFIED | Lines 192-268 — `cart` table, `cartItems` table, `cartRelations`, `cartItemsRelations`. Named unique constraints `cart_user_unique` and `cart_item_variant_unique` present. No `priceKobo` column on `cart_item`. |
| `src/lib/cart/logic.ts` | pure parse/serialize/clamp/merge/hydrate + CART_COOKIE/MAX_AGE | VERIFIED | 231 lines. Exports `CART_COOKIE`, `MAX_AGE`, `parseCartCookie`, `serializeCartCookie`, `clampToStock`, `mergeCartItems`, `hydrateCart`. No `import "server-only"` (pure module). |
| `src/lib/cart/cookie.ts` | server-only, httpOnly/lax/30d guest cookie read/write/clear | VERIFIED | `import "server-only"` at line 1. `setGuestCartItems` uses `httpOnly: true`, `sameSite: "lax"`, `maxAge: MAX_AGE`. `clearGuestCartCookie` uses `maxAge: 0`. |
| `src/lib/cart/queries.ts` | server-only, no `use cache`, getCart/getCartCount hydrated from variants | VERIFIED | `import "server-only"` at line 1. No `'use cache'`. `getCart()` and `getCartCount()` exported. `loadVariantRows` queries `variants.priceKobo` from DB. |
| `src/lib/actions/cart.ts` | `"use server"`, addToCart/updateCartItem/removeCartItem, clampToStock, IDOR-safe | VERIFIED | `"use server"` at line 1. All three actions exported. `clampToStock` called at lines 108, 145, 195. `userId` only from `auth()` session (line 115: `const userId = session.user.id`). `revalidatePath('/', 'layout')` in all three actions. `onConflictDoUpdate` for concurrent-add safety. |
| `src/lib/cart/merge.ts` | server-only, mergeGuestCartOnLogin, additive+clamped merge, clearGuestCartCookie | VERIFIED | `import "server-only"` at line 1. `mergeGuestCartOnLogin` exported. Calls `mergeCartItems` (additive+clamp) and `clearGuestCartCookie`. Builds `stockMap` from live DB stock (forged-cookie safety). |
| `src/lib/actions/auth.ts` | login() calls mergeGuestCartOnLogin before redirect, redirect: false | VERIFIED | Line 193: `await signIn("credentials", { identifier, password, redirect: false })`. Lines 206-209: `const session = await auth(); if (session?.user?.id) await mergeGuestCartOnLogin(session.user.id)`. Line 212: `redirect("/")`. Merge fires before redirect. |
| `src/components/cart/CartProvider.tsx` | holds `cart: CartResult` from `initialCart` prop (NOT useState) | VERIFIED | Line 55: `const cart = initialCart` — reads live prop directly, not frozen in `useState`. Commit 0533d36 is the fix. Context exposes `cart`, `isOpen`, `open`, `close`, `optimisticCount`, `setOptimisticCount`. |
| `src/components/cart/CartDrawer.tsx` | FocusTrap, role=dialog, aria-modal, translate-x animation, OOS gate | VERIFIED | `FocusTrap` imported and wraps panel (line 50). `role="dialog"` (line 62), `aria-modal="true"` (line 63). `translate-x-full` / `translate-x-0` (line 69). `cart.hasOOS` disables checkout button (line 136). Overlay with `aria-hidden` + onClick close. |
| `src/components/cart/CartLineItem.tsx` | thumbnail, name, variant label, stepper, line price, trash, OOS/clamp states | VERIFIED | 167 lines. Imports `removeCartItem`, `CartStepper`, `formatNGN`. OOS row: `opacity-60`, "Out of stock" label, `line-through`. Clamp notice: `role="status"` `aria-live="polite"`, "Only N left — quantity updated". Trash with `aria-label`. |
| `src/components/cart/CartStepper.tsx` | − n + with stock cap, remove-at-0, aria-live | VERIFIED | Imports `updateCartItem`. Minus onClick calls `updateCartItem(variantId, quantity - 1)` (0 → remove). Plus `disabled` when `quantity >= stock`. Stock cap message "Only N available". `aria-live="polite"` on count span. |
| `src/components/cart/CartEmptyState.tsx` | "Your cart is empty" + "Start shopping" CTA to /products | VERIFIED | "Your cart is empty" in `<h2>`. "Start shopping" link to `/products` with `bg-brand` classes. |
| `src/app/cart/page.tsx` | async Server Component, getCart, Order summary, grid-cols-3, CartEmptyState | VERIFIED | `CartContent` calls `await getCart()`. "Order summary" heading. `lg:grid lg:grid-cols-3`. `CartEmptyState` rendered when empty. No `'use cache'`. |
| `src/app/layout.tsx` | async, CartShell reads getCart+getCartCount, CartProvider + CartDrawer mounted | VERIFIED | `CartShell` async component calls `Promise.all([getCartCount(), getCart()])`. Renders `<CartProvider initialCount={count} initialCart={initialCart}>...<CartDrawer /></CartProvider>`. Wrapped in Suspense with empty-cart fallback. |
| `src/components/layout/CartIconButton.tsx` | "use client", useCart, open(), badge font-semibold, hides at 0, 99+ cap | VERIFIED | `"use client"`. Imports `useCart`, calls `open()` on click. Badge: `font-semibold`, hidden when `optimisticCount === 0`, `"99+"` cap. Dynamic `aria-label`. |
| `src/components/product/VariantSelector.tsx` | addToCart wired, useCart, no blue-600 classes | VERIFIED | Imports `addToCart` and `useCart`. `handleAddToCart` calls `addToCart(resolvedVariant.id, 1)`. No `className` strings with `blue-600` (only comments about removal). Brand tokens: `bg-brand`, `ring-brand`, `border-brand`. |
| `tests/cart/cart-logic.test.ts` | pure unit tests, ≥4 describe blocks | VERIFIED | 323 lines, 42 `describe`/`it` matches. No DB/mocks. |
| `tests/cart/cart-db.test.ts` | server-only mocked, DB round-trips | VERIFIED | 536 lines. `vi.mock("server-only", () => ({}))` at line 10. |
| `tests/cart/cart-cookie.test.ts` | server-only mocked, ms_cart cookie name asserted | VERIFIED | 221 lines. `vi.mock("server-only", () => ({}))` at line 11. `CART_COOKIE === "ms_cart"` asserted explicitly. |
| `tests/helpers/db.ts` | truncateCartTables FK-safe (cartItems before cart) | VERIFIED | Lines 50-61. Deletes `schema.cartItems` then `schema.cart`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `VariantSelector.tsx` → `addToCart` | `cart_item` / `ms_cart` cookie | `import { addToCart } from "@/lib/actions/cart"` + `startTransition` in `handleAddToCart` | WIRED | On success: `setOptimisticCount(result.count)` + `open()`. |
| `CartStepper.tsx` → `updateCartItem` | `cart_item` / cookie quantity update | `import { updateCartItem }` + `startTransition` in `handleDecrease`/`handleIncrease` | WIRED | qty 0 → server delegates to remove (D-07). |
| `CartLineItem.tsx` → `removeCartItem` | `cart_item` / cookie filter | `import { removeCartItem }` + `startTransition` in `handleRemove` | WIRED | Scoped to session user's cart (IDOR-safe). |
| `src/app/layout.tsx` → `CartDrawer` | CartProvider context | `CartShell` renders `<CartDrawer />` inside `<CartProvider>` | WIRED | Drawer reads `cart` from context; context seeded from server `initialCart`. |
| `src/app/cart/page.tsx` → `getCart()` | Server DB / cookie read | `CartContent` calls `await getCart()` | WIRED | `loadVariantRows` hydrates prices from `variants.priceKobo`. |
| `login()` → `mergeGuestCartOnLogin` | Guest cookie merged into DB cart | `redirect: false` → `auth()` → `mergeGuestCartOnLogin(session.user.id)` → `redirect("/")` | WIRED | Merge fires within Server Action scope before redirect (D-10). |
| `getCart()` → `hydrateCart` → `variants.priceKobo` | Prices computed server-side | `loadVariantRows` DB query → `hydrateCart(raw, rows)` | WIRED | No client price ever reaches `lineTotalKobo` computation (SC4). |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `CartDrawer.tsx` | `cart` (from `useCart()`) | `CartProvider.initialCart` ← `CartShell.getCart()` ← DB/cookie | Yes — `getCart()` queries DB for authed, cookie for guest; no static fallback for real data | FLOWING |
| `src/app/cart/page.tsx` | `cart` (from `await getCart()`) | Direct `getCart()` call in `CartContent` → `loadVariantRows` → DB | Yes — `variants.priceKobo` from Drizzle `findMany` | FLOWING |
| `CartIconButton.tsx` | `optimisticCount` (from `useCart()`) | Seeded from `CartProvider.initialCount` ← `getCartCount()` ← DB/cookie; updated after each action response | Yes — server action returns live `count` via `getCartCount()` | FLOWING |

Note on Suspense fallback: `layout.tsx` Suspense fallback passes `initialCart: { items: [], subtotalKobo: 0, totalQty: 0, hasOOS: false }` — this is an intentional loading state, not a stub; it is immediately replaced when `CartShell` resolves.

---

### Behavioral Spot-Checks

Step 7b: Skipped for cart actions (require server-side cookie context / Neon DB connection — not testable without running server). Test coverage via Vitest integration tests (`tests/cart/`) serves as the automated behavioral proxy. Human verification already approved (Plan 03-03 human-verify checkpoint passed).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CART-01 | 03-01, 03-02, 03-03 | User can add a product variant to cart | SATISFIED | `addToCart` Server Action (guest cookie + authed DB path); VariantSelector wired; badge updates. REQUIREMENTS.md marks Complete (03-02). |
| CART-02 | 03-02, 03-03 | User can update quantity or remove items from cart | SATISFIED | `updateCartItem` / `removeCartItem` actions; `CartStepper` / `CartLineItem` components in both drawer and /cart page. REQUIREMENTS.md marks Complete (03-02). |
| CART-03 | 03-01, 03-02 | Cart persists across page visits (guest session via cookie) | SATISFIED | `ms_cart` cookie `httpOnly`/`sameSite: "lax"`/30d; `getCart()` reads cookie per request; no localStorage-only path. REQUIREMENTS.md marks Complete (03-02). |

No orphaned CART requirements — all three mapped and delivered.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/cart/page.tsx` | 103-108 | Checkout button (non-OOS path) is a `<button>` with no `href`/`onClick`/action — Phase 4 placeholder | INFO | Intentional — Phase 4 placeholder per plan. Not a stub affecting cart goal. |
| `src/components/cart/CartDrawer.tsx` | 147-153 | Checkout `<Link href="/cart">` routes back to `/cart` rather than a real checkout — Phase 4 stub | INFO | Intentional — Plan 03-03 documents this as "Phase 4 stub per UI-SPEC Decision Log". Cart Phase 3 goal does not include checkout. |

No BLOCKER or WARNING anti-patterns. All `return null` / `return []` grep matches are either: (a) empty initial state that gets overwritten by a data fetch (Suspense fallback), (b) early-return guards (e.g. `if (variantIds.length === 0) return []`), or (c) test scaffolds. None route to rendering of user-visible data without a real data source.

---

### Human Verification Required

All human verification items for Phase 03 were satisfied by the approved human-verify checkpoint (Plan 03-03 Task 3). The user confirmed all 8 interaction checks (add-to-cart, quantity editing, stepper cap, full cart page, empty state, guest persistence, login merge, and indigo branding) and approved the phase.

No further human verification items remain.

---

### Gaps Summary

No gaps. All four roadmap success criteria are verified against the codebase:

1. **Add variant → count updates:** `VariantSelector` → `addToCart` → `revalidatePath` + optimistic count in `CartProvider` → badge in `CartIconButton`. VERIFIED.
2. **Quantity edit / remove:** `CartStepper` (updateCartItem) + `CartLineItem` trash (removeCartItem), both in drawer and /cart page. VERIFIED.
3. **Guest persistence via server-side cookie:** `ms_cart` httpOnly/lax/30d cookie written by `setGuestCartItems`; read by `getCart()` per request with no caching. VERIFIED.
4. **Prices never trusted from client:** `cart_item` schema has no price column; `hydrateCart` computes `lineTotalKobo` only from `variants.priceKobo`; all Server Actions reject client-supplied prices. VERIFIED.

The drawer-shows-empty bug (commit 0533d36) is confirmed fixed: `CartProvider` assigns `const cart = initialCart` (live prop, not frozen in `useState`), so every `revalidatePath` re-render delivers fresh cart data to the drawer.

---

_Verified: 2026-06-25_
_Verifier: Claude (gsd-verifier)_
