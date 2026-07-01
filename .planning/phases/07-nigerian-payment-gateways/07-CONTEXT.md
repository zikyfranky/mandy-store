# Phase 7: Nigerian Payment Gateways - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add **NGN-native payment gateways** as *additional*, independently server-toggleable payment
methods at checkout, reusing the Phase 4 order + webhook + idempotency + atomic-decrement
infrastructure. Stripe (cards) and bank transfer stay intact and unchanged; PayPal stays
deferred (no NGN — D-05a).

**This phase delivers Paystack + Flutterwave only** (PAY-05, PAY-06, PAY-12). The remaining
direct gateways — Opay (PAY-07), Palmpay (PAY-08), Interswitch (PAY-09), GTPay (PAY-10),
Remita (PAY-11) — are a **fast-follow sub-phase (7.1)**, built as new adapters against the
same interface established here. See D-01.

**Requirements addressed this phase:** PAY-05 (Paystack), PAY-06 (Flutterwave), PAY-12
(independent server-only toggle + action/route-level rejection, extends PAY-04).
**Requirements deferred to sub-phase 7.1:** PAY-07..PAY-11.

**Out of scope (other phases / deferred):**
- Opay/Palmpay/Interswitch/GTPay/Remita direct integrations → sub-phase 7.1 (fast-follow).
- Admin manual bank-transfer confirmation / fulfillment → Phase 5.
- Passing gateway transaction fees on to the customer → deferred (new pricing capability, v2).
- PayPal → remains deferred (no NGN support).

</domain>

<decisions>
## Implementation Decisions

### Execution scope & extensibility
- **D-01:** **Paystack + Flutterwave this phase only.** They are aggregators covering cards,
  bank transfer, USSD, and Opay/Palmpay as *channels* (~90% of NGN payments), so shipping them
  first reaches a working NGN checkout fastest. Opay, Palmpay, Interswitch, GTPay, Remita
  (PAY-07..PAY-11) become **fast-follow sub-phase 7.1** — do NOT write tasks for them this phase.
- **D-02:** **Build a gateway adapter interface** and implement Paystack + Flutterwave against it.
  Common contract (planner refines exact shape): `initPayment` (create/return gateway payment
  session for the inline popup), `verifyTransaction` (server-side authoritative verify), a
  `webhook-handle` seam (signature-verify + normalize to the shared confirmation path), and
  `refund` (feeds the D-09 oversold-refund recovery path). Adding a fast-follow gateway later
  should be mostly a new adapter + a new toggle case, not net-new plumbing.

### Payment flow UX (holds Phase 4 D-05 "never leaves the site")
- **D-03:** **Inline popup / on-site flow.** Use each gateway's inline JS (Paystack Inline,
  Flutterwave inline) so the customer stays on `/checkout`; a modal overlay handles payment,
  closes, and we reconcile. Consistent feel with the embedded Stripe Payment Element; upholds D-05.
- **D-04:** **Confirmation = server-side verify-on-callback + webhook, through ONE shared
  idempotent path.** On the popup success callback, a server action calls the gateway's
  verify-transaction API (authoritative, server-side) and runs the **same idempotent
  confirmation routine** as the webhook — insert into `processed_webhook_events`
  (ON CONFLICT DO NOTHING), then the atomic `payment_confirmed` flip + `UPDATE variant SET
  stock = stock - qty WHERE ... AND stock >= qty RETURNING id` decrement, then confirmation
  email. Whichever of {verify-on-callback, webhook} arrives first wins; the second is a no-op
  via the idempotency guard. The **webhook remains the sole *ultimate* authority / backstop**
  (D-06 intent preserved) — the callback verify is an optimization for instant confirmation, not
  a replacement, and it must NOT trust any client-supplied amount/status (re-fetch from the
  gateway server-side). Customer typically sees instant confirmation instead of the "Payment
  processing…" interstitial; the interstitial + `/api/order/status/[token]` polling (D-07) stays
  as the fallback when the callback is missed (popup closed early, network drop).

### Checkout presentation
- **D-05:** **Flat radio list, one button per enabled gateway**, driven by
  `enabledPaymentMethods()`. Extends the existing `PaymentMethodSelector` — options become
  Card (Stripe), Paystack, Flutterwave, Bank transfer. The customer picks a *provider*; that
  provider's own popup then offers its channels (card / USSD / transfer). Fast-follow gateways
  just append to the list. No grouping, no primary/secondary hierarchy this phase.

### Toggles & go-live enablement (PAY-12, extends PAY-04 / D-13)
- **D-06:** **Each gateway is independently server-toggleable** via the existing
  `isPaymentMethodEnabled` pattern (extend `PaymentMethod` type + the switch with `paystack`
  and `flutterwave` cases). A method is enabled only when `ENABLE_<GATEWAY> === "true"` **AND**
  its required secret(s) are present (mirrors the Stripe `&& !!process.env.STRIPE_SECRET_KEY`
  guard). Enforcement is the **first statement** in every new checkout action and webhook/verify
  route — a disabled gateway is rejected server-side, not merely hidden in the UI.
- **D-07:** **Go-live default: Paystack + Flutterwave + bank transfer ON.** Stripe stays on its
  current toggle; PayPal stays deferred (OFF). Both aggregators require approved live merchant
  accounts + verified webhooks before production go-live (flag for the go-live checklist).
- **D-08:** **Key strategy:** test keys in dev/preview, live keys in production, both gated by
  the same env-presence toggle (a gateway with only test keys in a prod env simply stays
  disabled). No `NEXT_PUBLIC_` prefix on any secret; publishable/public keys used by the inline
  popup are the only client-exposed values.

### Claude's Discretion
- Exact adapter interface shape/signatures, file layout (`src/lib/payments/gateways/*`?),
  whether webhook routes are per-gateway (`/api/webhooks/paystack`, `/api/webhooks/flutterwave`)
  or one dispatched route — planner territory, subject to D-02/D-04 intent.
- The exact shared-confirmation-path refactor: how much of the current Stripe-webhook body
  (`route.ts`) is extracted into a reusable `confirmOrderPaid(order, { provider, eventId })`
  helper that both the webhook and the verify-on-callback action call. Strongly recommended, but
  the extraction boundary is planner's call.
- SDK vs raw REST per gateway, signature-verification scheme, and idempotency-event-id sourcing
  (Paystack/Flutterwave event ids differ from Stripe's) — research/planner territory.
- Order-reference / metadata passed to each gateway so the webhook + verify can look the order
  back up (mirror the Stripe `metadata: { orderId, reference }` + `stripePaymentIntentId`
  pattern — likely a per-provider `gatewayReference` column or reuse of `stripePaymentIntentId`
  generalized; planner decides schema).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 7: Nigerian Payment Gateways" — goal, dependency on Phase 4,
  priority-wave sequencing (Paystack/Flutterwave first), and the 5 success criteria.
- `.planning/REQUIREMENTS.md` — PAY-05, PAY-06, PAY-12 (this phase); PAY-07..PAY-11 (deferred to
  sub-phase 7.1); PAY-04 (the toggle pattern PAY-12 extends).
- `.planning/PROJECT.md` — payment methods independently toggleable; NGN currency; guest checkout
  non-negotiable and off the critical path.

### Cross-phase constraints (MUST honor — non-negotiable)
- `CLAUDE.md` §"Critical Constraints" — **never trust client prices** (recompute totals
  server-side before initiating any gateway payment); **webhook idempotency mandatory**
  (`processed_webhook_events` unique constraint; the verify-on-callback path uses the SAME guard);
  **atomic stock decrement** (`UPDATE variant SET stock = stock - qty WHERE id = $1 AND stock >= qty
  RETURNING id`, never read-then-write); **payment methods server-side toggleable** (enforced in
  actions/route handlers, not just UI); Next.js 16 `proxy.ts` cannot protect Server Actions —
  re-verify server-side in every action/route.
- `.planning/STATE.md` §"Accumulated Context" + "Carried-Forward Constraints" — Phase 4 payment
  decisions D-06/D-07/D-09/D-13, server-only env feature flags, `next/cache` mocked in Server
  Action tests, vitest `fileParallelism=false` for shared Neon isolation.
- `CLAUDE.md` §"Testing" — DB integration tests require `TEST_DATABASE_URL` (a **separate** Neon
  branch); set it before Phase 7 verification so gateway idempotency/confirmation integration
  coverage actually runs. Never run integration tests against the dev `DATABASE_URL`.

### Phase 4 decisions this phase extends
- `.planning/phases/04-checkout-payments/04-CONTEXT.md` — D-05 (embedded/on-site payment, never
  leaves site), D-06 (webhook sole authority + idempotent), D-07 (confirmation reconciliation /
  "Payment processing…" + token-link polling), D-09 (decrement-on-confirmation + last-unit-race
  refund), D-12 (guest token order access), D-13 (server-only method toggles).

### Existing code to extend / mirror
- `src/lib/payments/config.ts` — `PaymentMethod` type + `isPaymentMethodEnabled` switch +
  `enabledPaymentMethods()`. **Extend** with `paystack` / `flutterwave` cases (D-06).
- `src/lib/payments/stripe.ts` — singleton client pattern to mirror for gateway SDK/HTTP clients.
- `src/lib/actions/checkout.ts` — `createStripePaymentIntent` / `createBankTransferOrder` +
  the shared `buildOrderContext()` helper (server-side total recompute, Zod address validation,
  guest identity, order+items insert via `db.batch`). New gateway init actions mirror these; the
  toggle check is the first statement.
- `src/app/api/webhooks/stripe/route.ts` — the reference webhook: raw-body HMAC verify,
  idempotency-first insert, atomic `db.batch` (order flip + per-line decrement), last-unit-race
  refund. **This is the body to extract into a shared `confirmOrderPaid()` routine** that the new
  gateway webhooks AND the verify-on-callback action both call (D-04).
- `src/app/api/order/status/[token]/route.ts` — status-polling endpoint reused by the
  "Payment processing…" fallback (D-04).
- `src/components/checkout/PaymentMethodSelector.tsx` (`METHOD_CONFIGS`, radio group) +
  `CheckoutForm.tsx` (`selectedMethod` branching at ~L460) + `StripePaymentPanel.tsx` /
  `BankTransferPanel.tsx` — add Paystack/Flutterwave panels + selector entries here (D-05).
- `src/lib/orders/queries.ts` (`getOrderByStripePaymentIntentId`, `getOrderStatusByToken`),
  `src/lib/orders/reference.ts`, `src/lib/db/schema.ts` (`orders`, `orderItems`,
  `processedWebhookEvents`, `orderStatusEnum`) — order lookup, reference/token generation, and
  the schema the confirmation path writes to. Any new `gatewayReference` column lands here.
- `src/lib/email/send-order-confirmation.ts` + `src/emails/OrderConfirmationEmail.tsx` — reused
  as-is on confirmation (ORD-01); no per-gateway email variants planned.
- `.env.local.example` — add (server-only, no `NEXT_PUBLIC_` on secrets): `ENABLE_PAYSTACK`,
  `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` (client-safe), `PAYSTACK_WEBHOOK_*`;
  `ENABLE_FLUTTERWAVE`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY` (client-safe),
  `FLUTTERWAVE_WEBHOOK_*` / hash.

### Research (stack & pitfalls)
- `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`,
  `.planning/research/ARCHITECTURE.md` — verify current Paystack/Flutterwave SDK/API versions
  and NGN handling before install.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Idempotent confirmation core** (Stripe webhook body): idempotency insert + atomic
  order-flip/stock-decrement `db.batch` + last-unit-race refund — extract into a shared
  `confirmOrderPaid()` so both webhook and verify-on-callback reuse it (D-02, D-04).
- **`buildOrderContext()`** in `checkout.ts`: server-side total recompute, Zod address
  validation, guest/session identity, order+items snapshot insert — reuse verbatim for gateway
  init actions.
- **Toggle system** (`isPaymentMethodEnabled` / `enabledPaymentMethods`): the exact PAY-12
  extension point; enabled ⇔ `ENABLE_<GATEWAY>` set AND required secret present.
- **Order status machine + `processed_webhook_events`** (unique constraint) + guest token page +
  status-polling endpoint — all reused unchanged.
- `formatNGN`, indigo brand system, `PaymentMethodSelector` radio pattern, Resend order-confirm
  email.

### Established Patterns
- Next.js 16 App Router; `proxy.ts` (not middleware); re-verify server-side in every action/route
  (proxy can't protect Server Actions). Server-only env flags, no `NEXT_PUBLIC_` on secrets.
- Webhook route: `runtime` NOT explicitly exported (nodejs default; explicit export breaks
  `cacheComponents:true`); raw `req.text()` first for signature verify; idempotency-first;
  neon-http has **no `db.transaction()`** — use `db.batch` (documented atomic).
- Build: `npx next build --webpack`; Node 20+ (`.nvmrc` = 22). `next/cache` mocked in Server
  Action integration tests; vitest `fileParallelism=false`; integration tests gated on
  `TEST_DATABASE_URL`.

### Integration Points
- New gateway init Server Actions (mirror `createStripePaymentIntent`) return the data the
  inline popup needs (access code / tx ref / public key).
- New webhook Route Handler(s) per gateway (or one dispatched route) + a verify-on-callback
  Server Action, both funneling into the shared `confirmOrderPaid()` (D-04).
- `PaymentMethod` union + `isPaymentMethodEnabled` switch + `PaymentMethodSelector`/`CheckoutForm`
  branching extended for the two new methods.
- Likely a new order column to correlate gateway transaction ⇄ order (generalize
  `stripePaymentIntentId` or add `gatewayReference` + `gatewayProvider`) — planner decides; a
  `db:push` is likely required.

</code_context>

<specifics>
## Specific Ideas

- Keep the checkout feel identical to Stripe today: customer stays on `/checkout`, the gateway
  popup opens inline, closes on success, and confirmation is (usually) instant via the
  verify-on-callback.
- Paystack and Flutterwave should feel like peer options in the same radio list — no marketing
  hierarchy, just "pick your provider."
- The "Payment processing…" interstitial stays as the honest fallback only when the fast
  verify-on-callback path is missed.

</specifics>

<deferred>
## Deferred Ideas

- **Opay, Palmpay, Interswitch, GTPay, Remita direct integrations (PAY-07..PAY-11)** →
  **fast-follow sub-phase 7.1**, built as new adapters against this phase's gateway interface.
  Note: Opay/Palmpay already ride the Paystack/Flutterwave popups as *channels*, so their
  standalone value should be re-evaluated before 7.1 (may not need top-level buttons).
- **Passing gateway transaction fees on to the customer** → deferred (new pricing capability, v2).
- **Per-gateway confirmation email variants** → not needed; the existing single order-confirmation
  email is reused for all gateways.
- **PayPal (PAY-02)** → remains deferred (no NGN support, D-05a).

### Research flags (planner/researcher — NOT decisions)
- **Flutterwave amounts are in naira major units, not kobo** (unlike Stripe/Paystack which use
  kobo). The adapter must convert `totalKobo` correctly per gateway — a classic 100× bug.
- Each gateway's **refund API** must back the adapter `refund` method so the D-09 oversold
  last-unit-race recovery works for gateway payments, not just Stripe.
- Idempotency **event-id sourcing** differs per gateway (Paystack/Flutterwave webhook payloads
  carry different id fields than Stripe) — must map to `processed_webhook_events.id` reliably;
  the verify-on-callback path needs a deterministic id too so it collides with the webhook's.

### Reviewed Todos (not folded)

None — no pending todos matched this phase.

</deferred>

---

*Phase: 7-nigerian-payment-gateways*
*Context gathered: 2026-07-01*
