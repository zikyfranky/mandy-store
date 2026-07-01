# Phase 7: Nigerian Payment Gateways - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 7-nigerian-payment-gateways
**Areas discussed:** Execution scope, Payment flow UX, Checkout presentation, Launch enablement

---

## Execution scope

| Option | Description | Selected |
|--------|-------------|----------|
| Paystack + Flutterwave only | Ship the two aggregators now (~90% NGN coverage); Opay/Palmpay/Interswitch/GTPay/Remita fast-follow (7.1) | ✓ |
| Paystack + Flutterwave + Opay | Two aggregators plus Opay as the one direct wallet | |
| All 7 this phase | Every gateway in one phase; largest plan | |

**User's choice:** Paystack + Flutterwave only.
**Notes:** PAY-07..PAY-11 explicitly deferred to fast-follow sub-phase 7.1 (D-01).

### Follow-up: shared abstraction

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway adapter interface | Common init→verify→webhook-handle→refund interface; Paystack/Flutterwave as first implementations | ✓ |
| Just wire the two directly | No shared abstraction; fast-follow gateways built from scratch | |

**User's choice:** Gateway adapter interface (D-02).

---

## Payment flow UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline popup (stay on site) | Paystack/Flutterwave inline JS; customer stays on /checkout; holds D-05 | ✓ |
| Redirect to hosted checkout | Redirect to gateway page then back; simplest but leaves site | |
| Native-best per gateway | Each gateway uses its best flow; inconsistent UX | |

**User's choice:** Inline popup (D-03).

### Follow-up: confirmation path

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side verify-on-callback + webhook | Verify API call on popup callback + webhook, both via one idempotent path; usually instant confirmation | ✓ |
| Webhook only (like Stripe today) | Wait for webhook; "Payment processing…" until it lands | |

**User's choice:** Verify-on-callback + webhook through one shared idempotent confirmation routine; webhook stays the ultimate backstop (D-04).

---

## Checkout presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list, one button per enabled gateway | Card / Paystack / Flutterwave / Bank transfer radio list, driven by enabledPaymentMethods() | ✓ |
| Grouped by type | Group card / transfer / wallets | |
| Single primary aggregator + others secondary | Lead with one aggregator CTA, tuck the rest | |

**User's choice:** Flat radio list, one button per enabled gateway (D-05).

---

## Launch enablement

| Option | Description | Selected |
|--------|-------------|----------|
| Paystack + bank transfer ON; others OFF | Go live on one proven NGN gateway | |
| Paystack + Flutterwave + bank transfer ON | Both aggregators live at launch | ✓ |
| All built, all default OFF | Ship behind toggles, flip on per-env | |

**User's choice:** Paystack + Flutterwave + bank transfer ON at go-live; Stripe stays as-is; PayPal deferred (D-07).
**Notes:** Both aggregators need approved live merchant accounts + verified webhooks before production go-live (go-live checklist flag).

---

## Claude's Discretion

- Key strategy locked by Claude at user's implicit acceptance: test keys in dev/preview, live keys in production, both gated by the same env-presence toggle; no `NEXT_PUBLIC_` on secrets (D-08).
- Adapter interface exact shape/signatures, file layout, per-gateway vs dispatched webhook routes.
- The `confirmOrderPaid()` extraction boundary from the current Stripe webhook body.
- SDK vs raw REST, signature-verification scheme, idempotency-event-id sourcing per gateway.
- Order↔gateway-transaction correlation column/schema.

## Deferred Ideas

- Opay/Palmpay/Interswitch/GTPay/Remita (PAY-07..PAY-11) → fast-follow sub-phase 7.1.
- Passing gateway transaction fees to the customer → v2.
- Per-gateway confirmation email variants → not needed (reuse existing email).
- PayPal (PAY-02) → remains deferred (no NGN).
- Research flags carried into CONTEXT: Flutterwave uses naira major units (not kobo); adapter refund method backs the D-09 oversold path; per-gateway idempotency event-id mapping.
