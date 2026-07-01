# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## checkout-drawer-stripe-pay — Cart drawer does not close on outside-click/nav; card payment unavailable despite UI showing card option
- **Date:** 2026-07-01
- **Error patterns:** drawer, focus-trap, clickOutsideDeactivates, overlay, close, cart, checkout, card payment is not available, Order could not be started, enabledPaymentMethods, stripe, ENABLE_STRIPE
- **Root cause:** (A) FocusTrap missing clickOutsideDeactivates:true swallowed overlay onClick; Checkout Link targeted /cart instead of /checkout with no onClick={close} so drawer persisted across navigation. (B) CheckoutForm defaulted selectedMethod to enabledMethods[0] ?? "stripe" — when no methods enabled, rendered StripePaymentPanel which was rejected by server-side isPaymentMethodEnabled gate.
- **Fix:** Add clickOutsideDeactivates:true to FocusTrap; change Checkout Link href to /checkout and add onClick={close} to nav Links. Change selectedMethod default to null when enabledMethods empty; add no-methods warning panel to prevent rendering a panel the server rejects.
- **Files changed:** src/components/cart/CartDrawer.tsx, src/components/checkout/CheckoutForm.tsx
---

