# Phase 3: Cart - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md — this log preserves alternatives.

**Date:** 2026-06-19
**Phase:** 03-cart
**Areas discussed:** Cart surface & add feedback, Quantity & remove controls, Persistence & login behavior, Stock & availability edges

---

## Cart surface & add feedback

| Question | Options | Selected |
|----------|---------|----------|
| On "Add to cart" | Slide-out drawer ✓ / Toast stay on page / Redirect to /cart | **Slide-out cart drawer** |
| Dedicated /cart page? | Drawer + /cart page ✓ / Drawer only | **Drawer + /cart page** |
| Header cart icon | Open drawer / Go to /cart / **decide** | User deferred → Claude: **icon opens drawer; drawer "View cart" → /cart** |

**Notes:** /cart is where Phase 4 checkout begins. Rebrand Add-to-cart from leftover blue-600 to indigo.

---

## Quantity & remove controls

| Question | Options | Selected |
|----------|---------|----------|
| Quantity control | **Stepper (− n +) ✓** / Number dropdown / Editable input |
| Editable where | **Both drawer & /cart ✓** / Only /cart |
| Cap at stock? | **Cap at stock + message ✓** / No cap in cart |
| Remove | **Trash icon + stepper-to-zero ✓** / "Remove" text link |

---

## Persistence & login behavior

| Question | Options | Selected |
|----------|---------|----------|
| Guest cart lifetime | **30 days ✓** / 7 days / Session only |
| Logged-in cart storage | **DB-backed for logged-in users ✓** / Cookie for everyone |
| Login with guest cart | **Merge guest cart in ✓** / Keep as-is / You decide |

**Notes:** Guests on cookie ({variantId, quantity} only); logged-in users get DB cart (no prices persisted); merge is additive, clamped to stock, then guest cookie cleared.

---

## Stock & availability edges

| Question | Options | Selected |
|----------|---------|----------|
| Item goes fully OOS | **Mark unavailable, block checkout ✓** / Auto-remove with notice / Enforce at checkout |
| Stock < cart qty | **Clamp to available + notice ✓** / Flag, don't change |
| Header count badge | **Total item quantity ✓** / Distinct line count |
| Empty cart | **Friendly empty state + CTA ✓** / Minimal text |

---

## Claude's Discretion
Drawer animation/focus-trap; toast-in-addition-to-drawer; cookie name/encoding/signing; server action vs route handler; cart table columns/indexes; optimistic UI + debounce for stepper.

## Deferred Ideas
Checkout/shipping/payment/order creation (Phase 4); guest cross-device cart; save-for-later/wishlist (v2); promo codes (v2).
