# Phase 4: Checkout & Payments - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 04-checkout-payments
**Areas discussed:** Checkout flow shape, Card/PayPal pay UX, Stock reservation timing, Bank transfer & order access

---

## Checkout flow shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single-page checkout | Address + shipping + payment + summary on one `/checkout` screen, sticky summary | ✓ |
| Multi-step wizard | Stepped Address → Review → Payment with progress indicator | |
| You decide | Claude picks layout | |

**User's choice:** Single-page checkout
**Notes:** Modern DTC pattern; fewer clicks for a small catalog.

### Identity / account creation (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Email field + post-purchase offer | Guest enters email only; offer account creation after purchase on confirmation page | ✓ |
| Email + optional password inline | Optional password checkbox on the checkout form | |
| Logged-in users skip it | Prefill from session (applied regardless) | (assumed) |

**User's choice:** Email field + post-purchase offer
**Notes:** Keeps first sale frictionless; logged-in users prefilled from session.

### Address fields (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Standard NG address + phone | Name, required phone, street, city, State dropdown (36 + FCT), optional landmark; no postal code | ✓ |
| Minimal address | Name, phone, free-text block, city, state | |
| You decide | Claude picks | |

**User's choice:** Standard NG address + phone

---

## Card/PayPal pay UX

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded on-site | Stripe Payment Element + PayPal JS buttons inline; customer stays on site; SAQ-A PCI | ✓ |
| Hosted redirect | Stripe Checkout / PayPal redirect off-site | |
| Mixed | Embedded Stripe + PayPal redirect | |

**User's choice:** Embedded on-site

### Order confirmation source of truth (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Webhook authoritative | Webhook is the only thing flipping order to payment_confirmed (idempotent); confirmation page shows "Payment processing…" until it lands | ✓ |
| Optimistic + webhook reconcile | Show success on client redirect, webhook corrects later | |
| You decide | Claude picks safe default | |

**User's choice:** Webhook authoritative

### Payment failure handling (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on page, retry | Inline error; cart + address preserved; order stays pending_payment | ✓ |
| Mark failed, restart | Flip to payment_failed, back to cart | |
| You decide | Claude picks | |

**User's choice:** Stay on page, retry

---

## Stock reservation timing

| Option | Description | Selected |
|--------|-------------|----------|
| Reserve at order creation | Decrement when order created; requires hold release on abandon/fail | |
| Decrement on confirmed payment | Decrement inside idempotent webhook txn; no holds | |
| You decide | Claude picks safe approach satisfying "no oversell" | ✓ |

**User's choice:** You decide
**Notes / Claude's resolution:** Locked **decrement-on-confirmed-payment** (D-09). Atomic
conditional decrement guarantees no oversell regardless of timing; avoids stuck holds /
timeout machinery. Bank-transfer orders decrement at admin-confirm (Phase 5). Edge case (atomic
decrement returns no row for a paid order = last-unit race) flagged for research → must design a
refund/manual-review recovery path.

---

## Bank transfer & order access

| Option | Description | Selected |
|--------|-------------|----------|
| Env config + order reference | Account details in server-only env; short reference (MS-7F3K2A) on page + email; admin confirms (Phase 5) | ✓ |
| Env config, order ID as reference | Same, but reuse order ID as the reference | |
| You decide | Claude picks | |

**User's choice:** Env config + order reference

### Guest order access (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Unguessable token link | Order page at URL with long random token; shown + emailed; no login | ✓ |
| Email + order ref lookup | Re-enter email + reference on a lookup page | |
| You decide | Claude picks | |

**User's choice:** Unguessable token link

---

## Claude's Discretion

- Stock reservation timing (D-09) — user deferred; Claude locked decrement-on-confirmation + flagged
  last-unit-race recovery for research.
- Order schema column design + price-at-purchase snapshot; order-reference generation/collision; token
  length/encoding; Stripe/PayPal SDK specifics + webhook route structure; "Payment processing…"
  reconciliation mechanism; order-create vs PaymentIntent-create sequencing (totals recomputed
  server-side regardless).

## Deferred Ideas

- Admin order management + manual bank-transfer confirmation + fulfillment updates → Phase 5.
- Logged-in customer order history → Phase 6.
- Status-change (shipped/delivered) emails → Phase 5 (ORD-03).
- Discount codes / promotions → v2.
- Address validation API / saved addresses → out of scope.
- Inventory hold + timeout-release → not built (D-09 decrements on confirmation instead).
