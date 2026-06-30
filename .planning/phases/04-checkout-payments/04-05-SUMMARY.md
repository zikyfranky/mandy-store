---
phase: 04-checkout-payments
plan: "05"
subsystem: checkout-ui,payment-panels
tags: [checkout, stripe, bank-transfer, react-hook-form, zod, ux, accessibility]
dependency_graph:
  requires: [04-01, 04-02, 04-03, 04-04]
  provides: [checkout-page, checkout-form, payment-method-selector, stripe-payment-panel, bank-transfer-panel, order-summary, oos-banner]
  affects: [04-06]
tech_stack:
  added: []
  patterns:
    - react-hook-form-zod-resolver
    - stripe-elements-lazy-client-secret
    - server-component-suspense-skeleton
    - payment-method-radio-card-group
    - D-08-failed-payment-inline-error
key_files:
  created:
    - src/app/checkout/page.tsx
    - src/components/checkout/CheckoutForm.tsx
    - src/components/checkout/CheckoutOrderSummary.tsx
    - src/components/checkout/OOSWarningBanner.tsx
    - src/components/checkout/PaymentMethodSelector.tsx
    - src/components/checkout/StripePaymentPanel.tsx
    - src/components/checkout/BankTransferPanel.tsx
  modified:
    - src/app/cart/page.tsx (upgrade checkout CTA stub → Link href=/checkout)
    - src/lib/payments/stripe.ts (lazy singleton Proxy fix)
    - src/app/api/webhooks/stripe/route.ts (remove runtime export)
decisions:
  - Stripe singleton made lazy (Proxy pattern) to prevent build-time throw when STRIPE_SECRET_KEY absent — Rule 1 bug fix from Plan 04
  - StripePaymentPanel flow is create-intent-first then mount Elements (recommended sequence from plan) — prevents premature PaymentElement before address validation
  - UseFormGetValues/UseFormTrigger typed as any for cross-component bridge to avoid duplicating 36-state Zod enum — functionally typed at the hook definition in CheckoutForm
  - export const runtime=nodejs removed from webhook route — incompatible with cacheComponents:true; Node.js is the default for route handlers — Rule 3 fix
  - PayPal filter guard in PaymentMethodSelector for defence-in-depth even though server never passes it (D-05a/D-13)
metrics:
  duration: "~89 minutes"
  completed: "2026-06-30T10:20:00Z"
  tasks_completed: 3
  files_changed: 10
---

# Phase 4 Plan 05: Checkout UI Summary

**One-liner:** Single-page /checkout with NG address form (36 states + FCT dropdown), payment selector (Stripe + bank transfer only, PayPal never shown), embedded Stripe Payment Element with Appearance API branding, sticky order summary, failed-payment inline error (D-08), and both submit paths wired to Plan 03 actions.

## What Was Built

### src/app/checkout/page.tsx (CHKT-01, CHKT-02, CHKT-04)
Server Component wrapping `<Suspense fallback={<CheckoutSkeleton/>}>`. `CheckoutContent` (async): calls `getCart()` → redirects to `/cart` if empty (server-side, no flash). Calls `auth()` for session, `enabledPaymentMethods()` for server-computed methods, reads `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Renders `<OOSWarningBanner/>` when `cart.hasOOS`. `lg:grid-cols-5` two-column layout: col-span-3 left (form) / col-span-2 right (sticky summary).

### src/components/checkout/CheckoutOrderSummary.tsx (CHKT-04, D-15)
"use client" for mobile toggle. Desktop: `sticky top-24` card with line items (thumbnail via next/image + PhotoIcon fallback, product name, variant, qty, line total), Subtotal / Shipping / Total rows, LockClosedIcon security note — all amounts via `formatNGN`. Mobile: sticky `top-16 z-30` collapsible bar with `aria-expanded`, ChevronDownIcon rotation, same rows. Shows desktop card at `lg:block`, hides mobile bar at `lg:hidden`.

### src/components/checkout/OOSWarningBanner.tsx (§1 / §8)
Server Component. `role="status" aria-live="polite"`. Amber banner with ExclamationTriangleIcon, copy "Some items in your cart are out of stock. Remove them to continue.", "Go back and remove them" Link → /cart with brand styling.

### src/components/checkout/CheckoutForm.tsx (CHKT-01, CHKT-02, D-02, D-04, D-08)
"use client". react-hook-form with `zodResolver(CheckoutFormSchema)`, `mode: "onBlur"`. Three sections (Contact, Shipping address, Payment) each as `rounded-2xl bg-surface border border-border p-6` cards.

**Contact:** email input; logged-in → `readOnly disabled opacity-60` + "You're signed in as {email}. Not you? Sign out." helper; guest → editable + "Order updates and receipt will be sent here." helper.

**Shipping address:** fullName, phone (with "Required — couriers call..." helper), street, city, state `<select>` (36 states + FCT alphabetical, placeholder "Select a state"), landmark textarea (optional, resize-none). All inputs use shared `inputClass(hasError?)` helper. `aria-invalid` + `aria-describedby` field errors with `role="alert"`.

**Payment:** renders `<PaymentMethodSelector>` + conditionally `<StripePaymentPanel>` or `<BankTransferPanel>` + bank-transfer Place order button. Bank transfer submit: `trigger()` → `createBankTransferOrder()` → `router.push('/order/' + guestToken)` on success or `setBankError(result.error)` on failure (D-08 — stays on page, preserved form). `useTransition` for pending state.

### src/components/checkout/PaymentMethodSelector.tsx (PAY-04, D-13, D-05a)
"use client". `role="radiogroup" aria-label="Payment method"`. Renders only `stripe` and `bank_transfer` from enabled methods — `paypal` is filtered out by `m !== "paypal"` guard (D-05a defence in depth). Each card: `role="radio" aria-checked={isSelected}`, `.sr-only` hidden input, icon (CreditCardIcon / BuildingLibraryIcon) in brand-soft container, name + description. Selected: `border-brand ring-2 ring-brand bg-brand-soft`.

### src/components/checkout/StripePaymentPanel.tsx (PAY-01, D-05, D-08, T-04-23, T-04-26)
"use client". `loadStripe(publishableKey)` called once via `useState(() => loadStripe(...))` (module-level singleton pattern). 

**Flow:** "Place order" button → `trigger()` validates form → `createStripePaymentIntent(formValues)` server action → on `{error}` shows inline error banner, re-enables button (D-08); on `{clientSecret, guestToken}` → mounts `<Elements stripe={stripePromise} options={{clientSecret, appearance}}>` with Stripe Appearance API (`colorPrimary: "#4f46e5"`, dark mode aware via `matchMedia`).

**Inner `<ConfirmButton>`** (must be inside Elements): `useStripe()` + `useElements()` → `stripe.confirmPayment({ elements, confirmParams: { return_url: /order/{guestToken} }, redirect: "if_required" })` → on error: maps Stripe decline codes (`card_declined`, `insufficient_funds`, `incorrect_cvc`, `expired_card`, `generic_decline`) to §6 messages, shows `role="alert" aria-live="assertive"` banner, re-enables button (T-04-26); on success: Stripe redirects. Loading skeleton `h-[120px] animate-pulse` while intent loads.

**Security:** NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY only; clientSecret is browser-safe; Stripe secret key never in this file; PaymentElement in cross-origin Stripe iframe (SAQ-A, T-04-23).

### src/components/checkout/BankTransferPanel.tsx (PAY-03, D-10, T-04-25)
"use client" (informational). `bg-brand-soft` panel: "How bank transfer works" heading + 3 numbered steps + "Account details and your reference will appear on the next screen and in your email." note. Zero account numbers (`BANK_ACCOUNT_NUMBER` doesn't appear — D-10 / T-04-25).

### src/app/cart/page.tsx (Phase 4 unwire stub)
Checkout CTA upgraded from `<button type="button">` (non-functional stub) to `<Link href="/checkout">` so customers can actually proceed to checkout.

## Commits

| Hash | Message |
|------|---------|
| `31edf95` | feat(04-05): /checkout page + order summary + OOS banner + form scaffold (Task 1) |
| `cef9be5` | feat(04-05): PaymentMethodSelector + StripePaymentPanel + BankTransferPanel (Task 2) |

## Test Results

- `npx next build --webpack` exits 0
- `npm test` — 207/210 passing; 3 failures are pre-existing `schema.test.ts` FK violations from parallel run state (order_item FK prevents catalog truncation when checkout tests left order rows — documented pre-existing issue in Plan 02/03 summaries, not caused by this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing build failure: `export const runtime = "nodejs"` incompatible with `cacheComponents: true`**
- **Found during:** Task 1 first build attempt (verified pre-existing by reverting changes and confirming same failure)
- **Issue:** `src/app/api/webhooks/stripe/route.ts` had `export const runtime = "nodejs"` which Next.js 16 rejects when `cacheComponents: true` is set in `next.config.ts`. Build error: "Route segment config 'runtime' is not compatible with nextConfig.cacheComponents"
- **Fix:** Removed the export; Node.js is the default runtime for Route Handlers (edge is the opt-in) so no functionality is lost. Comment added explaining the decision.
- **Files modified:** `src/app/api/webhooks/stripe/route.ts`
- **Commit:** `31edf95`

**2. [Rule 1 - Bug] Pre-existing build failure: Stripe singleton throws at module load when `STRIPE_SECRET_KEY` not set**
- **Found during:** Task 1 second build attempt (after fixing runtime export)
- **Issue:** `new Stripe(process.env.STRIPE_SECRET_KEY!, ...)` throws "Neither apiKey nor config.authenticator provided" at build time when the key is absent from the build environment. Next.js collects page data at build time by evaluating route modules, which triggered the singleton constructor.
- **Fix:** Made the Stripe singleton lazy using a Proxy: `getStripe()` function validates and instantiates on first call; `stripe` export uses a Proxy that delegates to `getStripe()`. No changes to call sites in checkout actions or webhook route.
- **Files modified:** `src/lib/payments/stripe.ts`
- **Commit:** `31edf95`

**3. [Rule 1 - Bug] TypeScript type mismatch: `UseFormGetValues` generic incompatible across components**
- **Found during:** Task 1 tsc check
- **Issue:** `CheckoutForm` passes `getValues` and `trigger` (typed with 36-state enum via Zod) to `StripePaymentPanel` which declared its own `FormValues` type with `state: string`. TypeScript rejected the assignment because `string` is not assignable to the enum type.
- **Fix:** Typed `StripePaymentPanel` props as `UseFormGetValues<any>` / `UseFormTrigger<any>` with eslint-disable comments; added corresponding `as any` cast in CheckoutForm. The Zod validation in `trigger()` provides runtime safety regardless.
- **Files modified:** `src/components/checkout/StripePaymentPanel.tsx`, `src/components/checkout/CheckoutForm.tsx`
- **Commit:** `31edf95` (pre-commit tsc fix)

### Auto-approved Checkpoint

**Task 3: human-verify** — AUTO_MODE active. Build passes, both submit paths implemented per spec. Live Stripe Element rendering / 3DS is a manual verification the user will do with `stripe listen`. Logged as auto-approved per instructions.

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-23 (card data disclosure) | Mitigated | PaymentElement in Stripe cross-origin iframe; no card data in app DOM; only clientSecret (browser-safe) + publishable key used |
| T-04-24 (disabled-method bypass) | Mitigated | PayPal filtered in PaymentMethodSelector AND server never returns it from `enabledPaymentMethods()`; both actions re-check `isPaymentMethodEnabled` as first statement |
| T-04-25 (bank details in client) | Mitigated | BankTransferPanel has no account numbers; grep `BANK_ACCOUNT_NUMBER` returns 0 in client components |
| T-04-26 (double-submit) | Mitigated | "Place order" disabled on first click; re-enabled only on error in both StripePaymentPanel (intent creation + confirm paths) and CheckoutForm (bank transfer path) |
| T-04-27 (trusting client paid) | Mitigated | UI never marks order paid; redirects to /order/:token which reflects webhook-written status |

## Known Stubs

None — both payment paths are fully wired to Plan 03 actions. The `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a placeholder in the dev env; live testing requires real Stripe test keys (documented in the human-verify checkpoint).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced in this plan. All endpoints were created in Plans 03 and 04.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/app/checkout/page.tsx` exists | FOUND |
| `src/components/checkout/CheckoutForm.tsx` exists | FOUND |
| `src/components/checkout/CheckoutOrderSummary.tsx` exists | FOUND |
| `src/components/checkout/OOSWarningBanner.tsx` exists | FOUND |
| `src/components/checkout/PaymentMethodSelector.tsx` exists | FOUND |
| `src/components/checkout/StripePaymentPanel.tsx` exists | FOUND |
| `src/components/checkout/BankTransferPanel.tsx` exists | FOUND |
| `grep getCart checkout/page.tsx` | FOUND |
| `grep redirect("/cart") checkout/page.tsx` | FOUND |
| `grep enabledPaymentMethods checkout/page.tsx` | FOUND |
| `grep formatNGN CheckoutOrderSummary.tsx` | FOUND |
| `grep "FCT (Abuja)" CheckoutForm.tsx` | FOUND |
| `grep createBankTransferOrder CheckoutForm.tsx` | FOUND |
| `grep useForm CheckoutForm.tsx` | FOUND |
| `grep role="radiogroup" PaymentMethodSelector.tsx` | FOUND |
| `grep PaymentElement StripePaymentPanel.tsx` | FOUND |
| `grep createStripePaymentIntent StripePaymentPanel.tsx` | FOUND |
| `grep confirmPayment StripePaymentPanel.tsx` | FOUND |
| `grep loadStripe StripePaymentPanel.tsx` | FOUND |
| `grep "How bank transfer works" BankTransferPanel.tsx` | FOUND |
| `grep BANK_ACCOUNT_NUMBER BankTransferPanel.tsx` returns 0 | CONFIRMED |
| `grep @paypal Stripe+Selector panels` returns 0 | CONFIRMED |
| Commit `31edf95` exists | FOUND |
| Commit `cef9be5` exists | FOUND |
| `npx next build --webpack` exits 0 | PASSED |
