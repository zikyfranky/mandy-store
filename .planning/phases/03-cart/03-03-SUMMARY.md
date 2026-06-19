---
phase: 03-cart
plan: "03"
subsystem: cart-ui
tags: [cart, drawer, focus-trap, react-context, server-component, next-image, ppr, suspense]
dependency_graph:
  requires:
    - phase: 03-02
      provides: [CartProvider, getCart, getCartCount, updateCartItem, removeCartItem, CartResult, CartLineItem-type]
  provides:
    - CartStepper: −/n/+ stepper with stock cap, useTransition, remove-at-0, aria-live
    - CartLineItem: thumbnail+name+variant+price+stepper+trash; OOS+clamp states
    - CartEmptyState: ShoppingCartIcon + "Your cart is empty" + "Start shopping" CTA
    - CartDrawer: focus-trapped slide-out dialog; overlay; mounted in layout; reads cart from CartProvider
    - CartProvider: extended with cart:CartResult + initialCart prop
    - /cart page: full-page 2-col cart with order summary
  affects: [phase-4-checkout]
tech_stack:
  added:
    - focus-trap-react@12.0.2
  patterns:
    - focus-trap-react-panel-dialog
    - translate-x-pure-css-drawer-animation
    - cartprovider-holds-server-cart
    - suspense-wrapped-cart-content
    - server-component-cart-page
key_files:
  created:
    - src/components/cart/CartStepper.tsx
    - src/components/cart/CartLineItem.tsx
    - src/components/cart/CartEmptyState.tsx
    - src/components/cart/CartDrawer.tsx
    - src/app/cart/page.tsx
  modified:
    - src/components/cart/CartProvider.tsx
    - src/app/layout.tsx
key_decisions:
  - "CartProvider extended to hold cart:CartResult seeded from initialCart — drawer reads cart from context rather than re-fetching; revalidatePath in mutations refreshes the server shell which re-seeds initialCart on next render"
  - "CartShell reads getCart()+getCartCount() in parallel via Promise.all — single dynamic boundary for both cart reads; Suspense fallback provides empty CartResult to avoid layout shift"
  - "Checkout CTA in drawer routes to /cart as Phase 4 stub (per UI-SPEC Decision Log); disabled when cart.hasOOS with aria-label for screen readers"
  - "focus-trap fallbackFocus set to [data-cart-close] to prevent errors when drawer has no other tabbable elements (e.g., CartEmptyState has no focusable elements besides the Start shopping link)"
requirements_completed: [CART-01, CART-02]
duration: "~45 minutes"
completed: "2026-06-19"
---

# Phase 03 Plan 03: Cart UI Surfaces Summary

**Cart UI surfaces: focus-trapped CartDrawer (slide-out mini-cart), CartStepper (−/n/+ with stock cap), CartLineItem (OOS/clamp states), CartEmptyState, /cart page (2-col order summary) — CHECKPOINT PENDING human verification**

## Performance

- **Duration:** ~45 minutes
- **Started:** 2026-06-19T19:00Z
- **Completed:** 2026-06-19T19:34Z (Tasks 1-2; Task 3 is human-verify checkpoint)
- **Tasks:** 2 of 3 autonomous tasks complete; 1 checkpoint task pending
- **Files modified/created:** 7

## Accomplishments

- `focus-trap-react@12.0.2` installed; CartDrawer wraps panel in `<FocusTrap active={isOpen} ...>` — Escape closes, focus returns to trigger, first focus on Close button
- CartStepper: `role="group"` `aria-label="Quantity for {name}"`, `aria-live="polite"` count, stock cap (Plus disabled at stock, "Only N available" below), remove-at-0 delegates to `updateCartItem(variantId, 0)` which server-side calls `removeCartItem`
- CartLineItem: 72×72 next/image thumbnail (PhotoIcon fallback), OOS row (opacity-60, "Out of stock" label in text-stock-out, struck-through line price, stepper wrapper opacity-40 pointer-events-none), clamp notice (role=status aria-live=polite "Only N left — quantity updated"), trash → `removeCartItem` in useTransition
- CartEmptyState: ShoppingCartIcon 48px, "Your cart is empty", "Browse our electronics...", filled bg-brand "Start shopping" → /products
- CartDrawer: overlay (bg-black/40 backdrop-blur) + FocusTrap panel; `translate-x-full` → `translate-x-0` 300ms ease-out; `role="dialog"` `aria-modal="true"`; header (title "Cart" text-2xl, X close button); body (CartLineItem list or CartEmptyState); footer (subtotal text-2xl, shipping note, Checkout CTA disabled if hasOOS, "View full cart" → /cart)
- CartProvider extended: `cart: CartResult` field in context, `initialCart: CartResult` prop, seeded from `getCart()` in CartShell
- layout.tsx: CartShell runs `getCart()` + `getCartCount()` in parallel; `<CartDrawer />` mounted inside CartProvider; Suspense fallback passes empty CartResult
- /cart page: async Server Component; Suspense + CartSkeleton fallback; CartContent reads `getCart()`; empty → CartEmptyState; filled → `<main>` with `<h1>` "Your cart (N items)", `lg:grid-cols-3` line items (col-span-2) + order summary card (col-span-1, sticky top-24); `<h2>` "Order summary"; subtotal, shipping note, OOS-gated checkout, "← Continue shopping" → /products
- `npx tsc --noEmit` clean; `npx next build --webpack` succeeds with /cart route (◐ PPR)

## Task Commits

1. **Task 1: CartStepper + CartLineItem + CartEmptyState + focus-trap-react** - `c6751fc` (feat)
2. **Task 2: CartDrawer + layout mount + /cart page** - `dae71fa` (feat)
3. **Task 3: Human-verify checkpoint** — pending (not a commit task)

## Files Created/Modified

- `src/components/cart/CartStepper.tsx` — "use client"; −/n/+ stepper; stock cap; aria-live; updateCartItem
- `src/components/cart/CartLineItem.tsx` — "use client"; thumbnail; OOS+clamp states; formatNGN; trash→removeCartItem
- `src/components/cart/CartEmptyState.tsx` — Server Component; ShoppingCartIcon; "Your cart is empty"; bg-brand CTA
- `src/components/cart/CartDrawer.tsx` — "use client"; FocusTrap; translate-x panel; overlay; subtotal; OOS gate; body overflow
- `src/app/cart/page.tsx` — async Server Component; Suspense; 2-col order summary; CartEmptyState; getCart; no caching
- `src/components/cart/CartProvider.tsx` — extended with cart:CartResult + initialCart prop
- `src/app/layout.tsx` — CartShell reads getCart()+getCartCount(); CartDrawer mounted; Suspense fallback passes empty CartResult

## Decisions Made

- **CartProvider holds server-seeded cart:** Drawer reads `cart` from CartProvider context (seeded server-side via `initialCart`); after each mutation, `revalidatePath('/', 'layout')` triggers layout re-render which re-runs `CartShell` and re-seeds fresh cart data on next page navigation or server refresh.
- **FocusTrap fallbackFocus:** Set to `[data-cart-close]` (the X button) to handle cases where CartEmptyState + no other tabbable elements would cause focus-trap-react to throw "No tabbable elements found in the given node."
- **Checkout CTA routes to /cart:** Per UI-SPEC Decision Log — better UX than disabled; Phase 4 upgrades href to /checkout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment "No 'use cache'" tripped the grep criterion**
- **Found during:** Task 2 verification
- **Issue:** The comment `// No 'use cache' — cart reads cookies...` in cart/page.tsx contains "use cache" which caused `! grep -qE "use cache"` to fail.
- **Fix:** Rewrote comment to "Dynamic — cart reads cookies/DB per request; no caching directive" — same pattern as Plan 01 deviation #3 and Plan 02 deviation #1.
- **Files modified:** `src/app/cart/page.tsx`
- **Committed in:** `dae71fa`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** None — purely cosmetic comment change.

## Known Stubs

- **Checkout CTA in CartDrawer and /cart page:** Routes to `/cart` (drawer) or is a `<button>` with no action (/cart page) as Phase 4 placeholder. Phase 4 will wire real checkout flow. This is intentional and documented in UI-SPEC Decision Log.
- **Task 3 (human-verify) pending:** Interactive verification of drawer open/close, stepper mutation, OOS messaging, persistence, and merge flows awaits user sign-off.

## Threat Model Coverage

| Threat | Mitigation | Verified |
|--------|------------|---------|
| T-03-11: Tampering via CartStepper/CartLineItem | UI submits only {variantId, newQty}; server actions clamp/validate (Plan 02); plus disabled at stock server-enforces regardless | YES — grep confirms updateCartItem/removeCartItem wired; no client-side total computation |
| T-03-12: Client subtotal tampering | subtotalKobo comes from getCart() (server, variants.priceKobo); CartProvider.cart is read-only from server | YES — no client price calculation |
| T-03-13: Rapid stepper DoS | useTransition disables +/- during pending; server onConflictDoUpdate + clamp as final guard | YES — isPending gates both buttons |
| T-03-14: Cart state info disclosure | context holds only display-safe data (variantId/qty/label/price already public) | ACCEPTED — no PII/secrets |

## Threat Flags

None — all new surfaces were within the plan's threat model scope.

## Self-Check

**Created files exist:**
- `src/components/cart/CartStepper.tsx`: YES
- `src/components/cart/CartLineItem.tsx`: YES
- `src/components/cart/CartEmptyState.tsx`: YES
- `src/components/cart/CartDrawer.tsx`: YES
- `src/app/cart/page.tsx`: YES

**Modified files exist:**
- `src/components/cart/CartProvider.tsx`: YES (initialCart + CartResult + cart in context)
- `src/app/layout.tsx`: YES (CartShell + CartDrawer + getCart)

**Commits exist:**
- `c6751fc`: feat(03-03): CartStepper, CartLineItem, CartEmptyState + focus-trap-react
- `dae71fa`: feat(03-03): CartDrawer + /cart page + CartProvider extended with cart state

**Test results:**
- `npx tsc --noEmit`: clean
- `npx next build --webpack`: succeeds; /cart route present (◐ PPR)

**Checkpoint status:** Task 3 (human-verify) awaiting user sign-off.

## Self-Check: PASSED (Tasks 1-2; Task 3 checkpoint pending)
