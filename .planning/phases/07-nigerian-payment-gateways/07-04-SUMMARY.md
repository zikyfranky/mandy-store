---
phase: 07-nigerian-payment-gateways
plan: "04"
subsystem: checkout-ui
tags: [paystack, flutterwave, checkout, inline-popup, wave-3]
dependency_graph:
  requires: [07-02, 07-03]
  provides: [paystack-checkout-ui, flutterwave-checkout-ui]
  affects: [checkout, payment-method-selector]
tech_stack:
  added:
    - "@paystack/inline-js (dynamic import, SSR-safe)"
    - "flutterwave-react-v3 (useFlutterwave hook)"
  patterns:
    - "Dynamic import inside click handler (Pitfall 6 SSR avoidance)"
    - "useFlutterwave at top level with state-driven config"
    - "Server Action verify-before-redirect (T-07-18 anti-pattern avoidance)"
    - "Inline error banner with role=alert (D-08 stay-on-page)"
key_files:
  created:
    - src/components/checkout/PaystackPaymentPanel.tsx
    - src/components/checkout/FlutterwavePaymentPanel.tsx
    - src/types/vendor.d.ts
  modified:
    - src/components/checkout/PaymentMethodSelector.tsx
    - src/components/checkout/CheckoutForm.tsx
decisions:
  - "Dynamic import of @paystack/inline-js inside click handler — never module-level (Pitfall 6)"
  - "useFlutterwave called at top level with null-coalesced placeholder state, config populated from init action result"
  - "src/types/vendor.d.ts: declare module @paystack/inline-js to resolve TS7016 (no @types package exists)"
  - "FlutterwavePaymentPanel captures initResult in closure (not state timing) when opening modal"
metrics:
  duration: "~45 minutes"
  completed: "2026-07-04"
  tasks_completed: 2
  tasks_pending: 1
  files_created: 3
  files_modified: 2
requirements: [PAY-05, PAY-06]
---

# Phase 07 Plan 04: Checkout UI — Paystack + Flutterwave Panels Summary

## One-liner

Paystack and Flutterwave inline popup panels wired into the checkout radio list — SSR-safe dynamic imports, server-side verify-before-redirect, inline error banners, disabled-gateway-never-shown.

## What Was Built

### Task 1 (8b2e07f): Extend PaymentMethodSelector — COMPLETE

Extended `src/components/checkout/PaymentMethodSelector.tsx`:

- Widened `METHOD_CONFIGS` record type to include `"paystack"` and `"flutterwave"` keys
- Added `paystack` entry: label "Paystack", BoltIcon (Heroicon inline SVG), description "Cards, bank & USSD — secured by Paystack"
- Added `flutterwave` entry: label "Flutterwave", GlobeAltIcon (Heroicon inline SVG), description "Cards, bank & USSD — secured by Flutterwave"
- Updated `renderableMethods` filter type guard: `m !== "paypal"` still drops PayPal (D-05a); now passes paystack + flutterwave through
- Follows existing indigo brand tokens (text-brand, bg-brand-soft, border-brand) — no restyling of existing entries

### Task 2 (e0d0da1): PaystackPaymentPanel + FlutterwavePaymentPanel + CheckoutForm branching — COMPLETE

**`src/components/checkout/PaystackPaymentPanel.tsx`**
- `"use client"` component, props `{ getValues, trigger, hasOOS }` mirror StripePaymentPanel
- On click: `trigger()` validates form → `initPaystackPayment(...)` → if error: show inline error banner + re-enable
- On success: `await import("@paystack/inline-js")` inside handler (Pitfall 6 SSR-safe) → `new PaystackPop()` → `popup.resumeTransaction(accessCode, { onSuccess, onCancel })`
- `onSuccess`: calls `verifyPaystackPayment({ reference })` server-side; only on success response → `router.push("/order/" + guestToken)` (T-07-18: no redirect before verify)
- `onCancel`: sets panelError "Payment cancelled — you can try again", re-enables button (Pitfall 2)
- Inline error banner: `role="alert"` red banner, matching StripePaymentPanel markup
- No secret key — only `publicKey` returned from the init action (D-08, T-07-17)

**`src/components/checkout/FlutterwavePaymentPanel.tsx`**
- `"use client"` component, same props
- `useFlutterwave` hook called at top level with state-driven config (null-coalesced placeholders before init)
- On click: `trigger()` → `initFlutterwavePayment(...)` → stores result in state, opens modal via `handleFlutterwavePayment({ callback, onClose })`
- `callback`: closes modal → `verifyFlutterwavePayment({ transactionId, txRef })` server-side → redirect on success (T-07-18)
- `onClose`: re-enables button (Pitfall 2)
- Same inline error banner + disabled-on-submit + hasOOS guard

**`src/components/checkout/CheckoutForm.tsx`**
- Imports `PaystackPaymentPanel` and `FlutterwavePaymentPanel`
- Added `selectedMethod === "paystack"` and `selectedMethod === "flutterwave"` branches in the payment panel conditional, before `bank_transfer` and `null` fallback

**`src/types/vendor.d.ts`**
- `declare module "@paystack/inline-js"` — resolves TS7016 (package ships no type declarations)

### Task 3: Human-Verify Live Popup Flows — PENDING (checkpoint)

Live popup verification requires Paystack + Flutterwave test keys (`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `ENABLE_PAYSTACK=true`, `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_SECRET_KEY`, `ENABLE_FLUTTERWAVE=true`, `FLUTTERWAVE_WEBHOOK_HASH`) which are not set in `.env.local`.

## Verification

- `npx tsc --noEmit`: clean (after adding `src/types/vendor.d.ts` for `@paystack/inline-js`)
- `npx next build --webpack`: succeeded, all 22 routes compiled, no SSR crash (Pitfall 6 resolved by dynamic import inside handler)
- Unit tests: 265 passed, 13 pre-existing DB integration failures (foreign key constraint; unrelated to these changes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added src/types/vendor.d.ts for @paystack/inline-js**
- **Found during:** Task 2 tsc run
- **Issue:** `@paystack/inline-js` ships no TypeScript declarations; `npx tsc --noEmit` fails with TS7016
- **Fix:** Created `src/types/vendor.d.ts` with `declare module "@paystack/inline-js"` — standard TypeScript pattern for untyped packages
- **Files modified:** `src/types/vendor.d.ts` (new)
- **Commit:** e0d0da1

None beyond the above.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced by these client UI components. The panels call existing server actions (`initPaystackPayment`, `verifyPaystackPayment`, `initFlutterwavePayment`, `verifyFlutterwavePayment`) that are already in the threat model. No `SECRET_KEY` values appear in any client component — only the `NEXT_PUBLIC_` public keys returned by the init actions (T-07-17: mitigated).

## Self-Check

### Created files exist:
- src/components/checkout/PaystackPaymentPanel.tsx: FOUND
- src/components/checkout/FlutterwavePaymentPanel.tsx: FOUND
- src/types/vendor.d.ts: FOUND

### Commits exist:
- 8b2e07f (Task 1): FOUND
- e0d0da1 (Task 2): FOUND

## Self-Check: PASSED
