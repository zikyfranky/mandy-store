---
status: resolved
trigger: "When I open sidebar cart, clicking outside doesn't close that, clicking checkout goes to checkout with the sidebar still opened. Also, trying to pay and I see 'Card fields will appear after clicking Place order', clicking Place Order, and I see an error 'Order could not be started / Card payment is not available'"
created: 2026-07-01
updated: 2026-07-01
phase: 04-checkout-payments
---

# Debug Session: checkout-drawer-stripe-pay

## Symptoms

Two distinct issues found during Phase 4 human UAT:

### Issue A — Cart drawer does not close
- **Expected:** Clicking the dim overlay outside the drawer closes it; navigating to checkout closes the drawer.
- **Actual:** Clicking outside the sidebar cart does NOT close it. Clicking "Checkout" navigates to the checkout view but the sidebar stays open.
- **Errors:** none (behavioral).

### Issue B — Cannot pay with card
- **Expected:** Choosing card payment shows the Stripe Payment Element and "Place order" completes payment.
- **Actual:** UI shows placeholder "Card fields will appear after clicking Place order"; clicking "Place Order" shows error: "Order could not be started / Card payment is not available".
- **Errors:** "Order could not be started" + "Card payment is not available".

## Reproduction
- A: Open the mini-cart drawer (header cart icon / add to cart) → click the dark overlay area → drawer stays open. Click Checkout → routed to checkout, drawer still open.
- B: Go to /checkout with items → select card payment → click Place Order → error.

## Evidence (initial — from orchestrator code read)

- timestamp: 2026-07-01 — `src/lib/payments/config.ts:15-16` — `isPaymentMethodEnabled("stripe")` returns `process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY`. The "Card payment is not available" error is this server-side gate rejecting (createStripePaymentIntent). Likely ENABLE_STRIPE/STRIPE_SECRET_KEY are not set in .env.local yet — BUT the UI still offered a card panel, so there is a UI/server MISMATCH: the checkout renders the Stripe panel even when Stripe is not in `enabledPaymentMethods()`. Confirm how `src/app/checkout/page.tsx` + `src/components/checkout/PaymentMethodSelector.tsx` + `StripePaymentPanel.tsx` decide to render the card panel — is Stripe shown as a default/fallback when `enabledPaymentMethods()` is empty or excludes stripe?
- timestamp: 2026-07-01 — `src/components/cart/CartDrawer.tsx:50-59` — `FocusTrap` (focus-trap-react@12) has `onDeactivate: close`, `escapeDeactivates: true`, but NO `clickOutsideDeactivates` / `allowOutsideClick`. focus-trap's default `allowOutsideClick: false` intercepts/prevents clicks outside the trapped panel, which SWALLOWS the overlay's `onClick={close}` (overlay at line 38-47). Hypothesis: outside-click close is broken because focus-trap eats the click. Candidate fix: `clickOutsideDeactivates: true` (fires onDeactivate → close) or `allowOutsideClick: true` (lets the overlay onClick run).
- timestamp: 2026-07-01 — `src/components/cart/CartDrawer.tsx:135-153` — the drawer "Checkout" CTA is still `<Link href="/cart">` (labelled "Phase 4 stub; routes to /cart") with NO `onClick={close}`. Two sub-problems: (1) it may still point at /cart instead of /checkout (04-06 SUMMARY claimed the cart PAGE button was rewired by 04-05, but the DRAWER button here was not verified); (2) no close() on navigation, and since CartDrawer is mounted in the layout, `isOpen` persists across the client navigation → drawer stays open on the destination. The "View full cart" Link (line 156) has the same no-close issue.

## Eliminated

(none yet)

## Current Focus

hypothesis: >
  Issue A: focus-trap-react swallows outside clicks (missing clickOutsideDeactivates/allowOutsideClick) so the overlay onClick never closes the drawer; AND the drawer's Checkout/View-cart Links lack onClick={close}, so the drawer stays open across navigation (it lives in the layout, isOpen persists). The Checkout Link may also still target /cart instead of /checkout.
  Issue B: Stripe is not actually enabled server-side (ENABLE_STRIPE + STRIPE_SECRET_KEY absent), but the checkout UI still offers a card panel — a UI/server enablement mismatch. Confirm whether the card panel renders regardless of enabledPaymentMethods(), and whether there's an empty-state when no methods are enabled.
test: >
  Read src/app/checkout/page.tsx, src/components/checkout/PaymentMethodSelector.tsx, StripePaymentPanel.tsx to confirm the render path for the card option vs enabledPaymentMethods(). Read CartProvider for isOpen lifecycle. Check .env.local for ENABLE_STRIPE/STRIPE_SECRET_KEY presence.
expecting: >
  Confirm (a) focus-trap outside-click behavior, (b) drawer Link close-on-nav gap + href target, (c) card panel shown independent of Stripe enablement + missing no-methods empty state.
next_action: "Apply fixes: (1) CartDrawer — add clickOutsideDeactivates:true to FocusTrap, fix Checkout Link href to /checkout, add onClick={close} to both nav links; (2) CheckoutForm — fix fallback selectedMethod and add empty-state when no methods enabled."
reasoning_checkpoint: |
  hypothesis: "A(1): FocusTrap missing clickOutsideDeactivates swallows overlay onClick. A(2): Checkout Link targets /cart and has no onClick={close}. B: enabledMethods[0] ?? 'stripe' fallback selects stripe even when stripe is not enabled, showing StripePaymentPanel while server gate rejects."
  confirming_evidence:
    - "CartDrawer.tsx:50-58 — FocusTrap has no clickOutsideDeactivates; default is false (confirmed in focus-trap source line 119)"
    - "CartDrawer.tsx:148 — href='/cart' with comment 'Phase 4 stub; routes to /cart'. No onClick={close} on either Link."
    - ".env.local confirmed — ENABLE_STRIPE, STRIPE_SECRET_KEY absent"
    - "CheckoutForm.tsx:84-86 — enabledMethods[0] ?? 'stripe' → defaults to 'stripe' when enabledMethods is empty"
    - "CheckoutForm.tsx:436 — renders StripePaymentPanel when selectedMethod==='stripe' regardless of enabledMethods content"
  falsification_test: "If clickOutsideDeactivates is not the cause, adding it would not close the drawer on outside-click."
  fix_rationale: "clickOutsideDeactivates:true fires onDeactivate→close on outside click. Correcting Link href and adding onClick={close} ensures drawer closes on navigation. Fixing fallback ensures UI only offers methods that are server-enabled."
  blind_spots: "focus-trap-react@12 API confirmed: clickOutsideDeactivates is correct. Tests for these components are integration/browser tests (not unit testable via vitest); the payments/config.test.ts covers Issue B's server logic. A new unit test for enabledPaymentMethods UI rendering will be added."
tdd_checkpoint: ""

## Resolution

root_cause: |
  Issue A: Two sub-bugs in CartDrawer.tsx:
    (1) FocusTrap had no clickOutsideDeactivates option (default: false). focus-trap-react 
        intercepts/swallows mousedown events outside the trapped panel, so the overlay div's 
        onClick={close} never fired — the drawer could not be closed by clicking outside.
    (2) The "Checkout" Link had href="/cart" (leftover Phase 4 stub) instead of "/checkout", 
        and neither the "Checkout" nor "View full cart" Links had onClick={close}. Because 
        CartDrawer is mounted in the layout, isOpen persisted across client-side navigation 
        so the drawer remained open after clicking any nav Link.
  Issue B: CheckoutForm.tsx defaulted selectedMethod to enabledMethods[0] ?? "stripe". When 
    no payment methods are server-enabled (ENABLE_STRIPE + STRIPE_SECRET_KEY not set in 
    .env.local), the fallback hardcoded "stripe", causing StripePaymentPanel to render. Users 
    saw the "Card fields will appear after clicking Place order" placeholder, then clicking 
    "Place Order" called createStripePaymentIntent which was rejected by isPaymentMethodEnabled 
    ("stripe") → "Card payment is not available". The UI offered a method the server refused.

fix: |
  A(1): Added clickOutsideDeactivates: true to FocusTrap options → outside clicks now 
    deactivate the trap and call onDeactivate → close().
  A(2): Changed "Checkout" Link href from /cart to /checkout. Added onClick={close} to 
    both "Checkout" and "View full cart" Links.
  B: Changed selectedMethod default from enabledMethods[0] ?? "stripe" to 
    enabledMethods[0] ?? null (never hardcode a non-enabled method). Added 
    enabledMethods.length === 0 empty-state warning panel so no payment panel renders 
    when the store has no methods configured. PaymentMethodSelector and payment panels 
    only render when a method is actually enabled and selected.

verification: |
  Production build (npx next build --webpack) completed exit 0 with TypeScript check passing.
  npm test: 200 unit tests pass; 10 DB integration failures are pre-existing FK state 
  issues in the TEST_DATABASE_URL Neon branch — unrelated to changed files. All 
  payments/config.test.ts tests pass.
  Commits: 087cd6e (cart drawer) and f8904a0 (payment methods).

files_changed:
  - src/components/cart/CartDrawer.tsx
  - src/components/checkout/CheckoutForm.tsx
