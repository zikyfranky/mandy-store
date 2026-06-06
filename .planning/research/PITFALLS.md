# Domain Pitfalls

**Domain:** Single-vendor ecommerce — electronics/watches/phones with multi-payment, variant inventory, admin panel
**Project:** Mandy Store
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4
**Researched:** 2026-06-05
**Sources:** Next.js 16.2.7 official docs (nextjs.org), Stripe/PayPal public documentation knowledge, ecommerce domain knowledge

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security incidents.

---

### Pitfall 1: Admin Routes Protected Only at the Proxy Layer

**What goes wrong:**
The `proxy.ts` file (Next.js 16's replacement for `middleware.ts`) redirects unauthenticated users away from `/admin/*`. The team treats this as the sole auth gate and does not re-verify identity inside Server Actions or Route Handlers under `/admin`.

**Why it happens:**
It feels like "the gate is already guarded." The proxy check runs first, so developers assume anything that reaches an admin Server Action must be authenticated.

**Consequences:**
Server Actions are reachable via direct POST requests — they are separate entry points independent of the proxy chain. An attacker can call `POST /admin/actions/deleteProduct` directly, bypassing the proxy entirely. Next.js 16 docs are explicit: "Always re-verify inside the action." This is an Insecure Direct Object Reference (IDOR) vector and a privilege escalation vector combined.

**Prevention:**
- Every Server Action and Route Handler under `/admin` must call `auth()` (or equivalent) as its first statement and throw `Unauthorized` before touching any data.
- The proxy check controls UI visibility only — never treat it as an authorization boundary.
- Use a Data Access Layer (DAL) with `import 'server-only'` that performs auth checks, so business logic functions are structurally incapable of being called without authentication.
- Never trust `searchParams`, URL params, or form data to determine admin status — always verify from the session cookie/token.

**Warning signs:**
- Server Actions that contain database writes but no `auth()` call at the top.
- Any code that reads `searchParams.get('isAdmin')` to branch behavior.
- Admin-only delete/update functions living in files without `import 'server-only'`.

**Phase:** Address in the admin panel phase, before any admin CRUD is wired up.

---

### Pitfall 2: Webhook Idempotency Not Enforced — Duplicate Order Processing

**What goes wrong:**
Stripe and PayPal both deliver webhooks with at-least-once semantics. Network retries, deployment restarts, and payment provider retry policies mean the same `payment_intent.succeeded` or `PAYMENT.CAPTURE.COMPLETED` event will arrive multiple times. Without idempotency guards, each delivery creates a new order, deducts stock, and sends a confirmation email.

**Why it happens:**
Developers test with a single webhook delivery and assume one event means one execution. The retry behavior is only visible in production or under load.

**Consequences:**
- Duplicate orders in the database for a single payment.
- Stock decremented twice for a single sale — leads to phantom negative inventory.
- Customer receives multiple confirmation emails.
- Financial reconciliation is broken — revenue appears doubled.

**Prevention:**
- Store the payment provider's event ID (e.g., Stripe's `evt_xxx` or PayPal's `event_id`) in a `processed_webhook_events` table with a unique constraint.
- At the start of webhook processing: attempt to insert the event ID. If the insert fails (duplicate), return `200 OK` immediately without processing.
- Wrap the entire webhook handler in a database transaction: insert the idempotency record, update order status, decrement stock — all atomically. If any step fails, the whole transaction rolls back.
- Return `200 OK` even for duplicates — returning `4xx` or `5xx` causes the payment provider to keep retrying.

**Warning signs:**
- Webhook Route Handler has no `processed_events` lookup before acting.
- Order creation and stock decrement are not in a single transaction.
- Webhook errors return `500`, which triggers provider retries.

**Phase:** Address when wiring up payment webhooks (payment integration phase).

---

### Pitfall 3: Inventory Overselling Due to Non-Atomic Stock Checks

**What goes wrong:**
The checkout flow reads stock (`SELECT stock FROM variants WHERE id = $1`), confirms it is greater than 0, then creates the order and decrements stock in separate operations. Under concurrent checkouts for the same variant (e.g., last unit of "iPhone 15 128GB Black"), two sessions read `stock = 1`, both pass the check, both create orders, and stock goes to `-1`.

**Why it happens:**
The read-then-write pattern feels correct when imagined sequentially. Concurrency is only apparent in production.

**Consequences:**
- Orders for items that do not physically exist.
- Manual intervention to cancel or fulfill from backorder.
- Customer trust damage when orders cannot be fulfilled.

**Prevention:**
- Use an atomic conditional update: `UPDATE variants SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock`. If the update returns 0 rows, the item is out of stock — abort the checkout.
- Never do a separate SELECT to check stock and then a separate UPDATE to decrement. These must be a single atomic statement.
- For higher-traffic scenarios, consider a database-level constraint `CHECK (stock >= 0)` as a backstop — the constraint will cause the transaction to fail rather than allow negative stock.
- If using Prisma, use `$transaction` with `update` + `where: { stock: { gt: 0 } }` and check `count` from `updateMany` — reject checkout if `count === 0`.

**Warning signs:**
- Any code path where `getVariantStock()` and `decrementStock()` are called as separate async operations without a wrapping transaction.
- Checkout Server Action that does not check the return value of the stock decrement operation.

**Phase:** Address in the cart/checkout phase before any real payment processing.

---

### Pitfall 4: Cart State Managed Entirely in Client-Side localStorage

**What goes wrong:**
The cart is stored in `localStorage` (or a React context backed by `localStorage`). On checkout, the server trusts the client-submitted cart totals to determine the payment amount. A user edits their `localStorage` cart to set `price: 1` for a $999 iPhone and completes checkout.

**Why it happens:**
Client-side cart state is the easiest first implementation. The trust mistake is subtle — it feels like "the payment provider charges what we tell it to charge."

**Consequences:**
- Customers pay an amount they chose, not the real price.
- Stripe PaymentIntent is created for the tampered amount.
- Complete financial loss on those orders.

**Prevention:**
- The server must always recalculate the cart total from the database before creating a payment intent/order. Never trust client-submitted prices.
- The correct flow: client sends `[{ variantId, quantity }]` to the server. Server looks up current prices from the database. Server creates the PaymentIntent for the authoritative total.
- Client-side cart state (in localStorage or Zustand/context) is only for display — it is a UI cache, not the source of financial truth.
- Validate that each `variantId` in the cart exists, is purchasable, and has sufficient stock server-side at checkout initiation.

**Warning signs:**
- PaymentIntent creation that accepts a `total` parameter from the client request body.
- Cart data that flows from client to server without a server-side price lookup.

**Phase:** Address in the cart architecture phase, before checkout is built.

---

### Pitfall 5: Payment Provider Feature Flags Hardcoded or Checked Only at UI Level

**What goes wrong:**
`STRIPE_ENABLED=false` hides the Stripe button in the UI but the `/api/checkout/stripe` Route Handler is still reachable and functional. A disabled payment method can still be used by calling the API directly.

**Why it happens:**
Feature flags are applied in the component layer as a UI concern and not carried through to the API layer.

**Consequences:**
- Owners disable a payment provider because their merchant account is suspended, but charges can still go through via the API.
- Support and compliance liability from charges processed on a disabled provider.

**Prevention:**
- Feature flag checks must be enforced in the Route Handler and Server Action, not only in the UI.
- Create a single `isPaymentMethodEnabled(provider: 'stripe' | 'paypal' | 'bank_transfer')` server-side utility (marked `server-only`) and call it at the start of every payment endpoint.
- Environment variables like `PAYMENT_STRIPE_ENABLED` must not be prefixed with `NEXT_PUBLIC_` — they should be server-only config so clients cannot read or predict which methods will pass server validation.

**Warning signs:**
- Payment Route Handlers with no feature-flag check at the top.
- Feature flags stored as `NEXT_PUBLIC_STRIPE_ENABLED` (client-visible).
- UI-only conditional rendering without corresponding server guard.

**Phase:** Address in payment integration phase, when each provider is wired up.

---

### Pitfall 6: Product Pages Over-Cached — Stale Stock and Price Data Served

**What goes wrong:**
Product detail pages use `'use cache'` with a long `cacheLife` (e.g., `'days'`) or are fully statically generated. The cache does not revalidate when stock changes. A customer sees "In Stock" on a cached page, adds to cart, and hits a stock conflict at checkout.

**Why it happens:**
Ecommerce developers want fast product pages and reach for aggressive caching. The difference between "product description" (safe to cache long) and "stock/price" (must be fresh) is not modeled separately.

**Consequences:**
- Checkout failures from stock conflicts frustrate customers.
- Stale prices cause either lost revenue (if lower than actual) or customer complaints (if higher than displayed).
- Silent correctness failures that are hard to debug.

**Prevention:**
- Split product page rendering: static/long-cached content (name, description, images, specs) vs. dynamic content (price, stock, variant availability).
- Use `'use cache'` with `cacheTag('product-{id}')` on product data and call `revalidateTag('product-{id}')` in the admin Server Action whenever a product is updated.
- Stock level display (`"In Stock" / "Only 3 left" / "Out of Stock"`) should either stream at request time (wrapped in `<Suspense>`) or have a very short `cacheLife('minutes')` — not hours or days.
- Price must never be cached beyond the session — it is the financial source of truth.

**Warning signs:**
- Product pages with `cacheLife('days')` that include stock/price data in the same cached component.
- No `revalidateTag` or `updateTag` call in the admin product update Server Action.
- Stock displayed from a cached Server Component without a Suspense boundary.

**Phase:** Address in product catalog phase when establishing caching strategy; revisit in admin panel phase when product edit is built.

---

### Pitfall 7: PayPal + Stripe + Bank Transfer Order Status Divergence

**What goes wrong:**
Each payment provider has a different event model. Stripe uses `payment_intent.succeeded`. PayPal uses `PAYMENT.CAPTURE.COMPLETED`. Bank transfer is confirmed manually by the store owner. If order status is updated directly from each webhook handler with provider-specific logic, the order status machine diverges — some orders get stuck in `pending`, some skip states, and the admin view is inconsistent.

**Why it happens:**
Each payment integration is built independently when added, without a shared status abstraction.

**Consequences:**
- Orders confirmed in Stripe webhook but left `pending` because the handler set `stripe_paid` instead of `status: 'paid'`.
- Admin cannot reliably filter "orders awaiting fulfillment" because status values are inconsistent.
- Abandoned cart detection breaks — `pending` means both "waiting for payment" and "payment failed."

**Prevention:**
- Define a canonical order status machine up front: `pending_payment → payment_confirmed → processing → shipped → delivered` plus terminal states `cancelled` and `payment_failed`.
- Each payment webhook normalizes to this canonical machine. The Stripe webhook calls `confirmOrder(orderId)`. The PayPal webhook calls `confirmOrder(orderId)`. The admin bank transfer action calls `confirmOrder(orderId)`. None of them set status directly — they call the shared function.
- Bank transfer orders must start in a distinct `awaiting_bank_transfer` state (not `pending_payment` which implies a pending online payment) so the admin can filter them easily.

**Warning signs:**
- Webhook handlers that set `order.stripeStatus`, `order.paypalStatus` as separate fields instead of a unified `order.status`.
- No documented order status enum or type at the start of development.
- Admin "pending orders" query that returns results from multiple payment states.

**Phase:** Design the order status machine before writing any payment integration code.

---

### Pitfall 8: SEO — Product Pages Missing Canonical URLs and Structured Data

**What goes wrong:**
Product variant selection (color, storage) is handled by URL query parameters (`/products/iphone-15?color=black&storage=128gb`). Each variant combination is a separate URL that Google can crawl. Without a canonical tag, Google indexes dozens of near-duplicate pages and splits link equity across them. Additionally, product structured data (`Product` schema) is absent, so rich results (price, availability, review stars) do not appear in SERPs.

**Why it happens:**
Variant URLs are a natural React state solution. Structured data is considered a "later" concern that never gets prioritized.

**Consequences:**
- Duplicate content penalty or diluted rankings across variant URLs.
- No rich results in Google Search — lower click-through rate vs. competitors.
- Product images not indexed in Google Images (no `ImageObject` schema).

**Prevention:**
- In `generateMetadata` for the product page, set a canonical URL pointing to the base product URL without variant query params: `alternates: { canonical: /products/${slug} }`.
- Add `application/ld+json` Product structured data in the product page Server Component, including `name`, `image`, `description`, `offers` (with `price`, `priceCurrency`, `availability`, `url`). Update `availability` based on actual stock.
- Use `generateStaticParams` for product slugs to ensure static generation for crawlers.
- Product image `alt` text must be descriptive ("Apple iPhone 15 128GB Black front view"), not filename-derived.

**Warning signs:**
- Product detail pages with no `<link rel="canonical">` in the `<head>`.
- No `application/ld+json` script in the product page HTML output.
- `alt=""` on product images.

**Phase:** Address in the product catalog/detail page phase — structured data and canonical tags are part of initial page implementation, not retrofitted.

---

### Pitfall 9: Product Images Served Without remotePatterns — Security and Performance Failure

**What goes wrong:**
The admin panel allows product images to be uploaded or linked. Product image `src` values are passed to `next/image` without configuring `remotePatterns` in `next.config.ts`. Either the images fail to load (Next.js blocks unconfigured external URLs), or the developer sets `unoptimized={true}` on all images as a workaround — bypassing Next.js image optimization entirely.

**Why it happens:**
`remotePatterns` is a `next.config.ts` step that is easy to skip during initial development when using local placeholder images. The error only surfaces when real product photos from an external host (CDN, S3, Cloudinary) are used.

**Consequences:**
- All product images are full-size original files — no WebP conversion, no responsive srcset, no lazy loading optimization.
- Product pages with 5-10 high-resolution product photos load slowly, directly impacting Core Web Vitals (LCP).
- Without `sizes` prop, Next.js generates only 1x/2x srcset instead of the full responsive breakpoint set, serving desktop-sized images to mobile users.

**Prevention:**
- Configure `remotePatterns` in `next.config.ts` for the image storage host (S3 bucket, Cloudinary, or similar) from the start, before any product image is wired up.
- Always provide the `sizes` prop on product images to generate a full responsive `srcset`. For product cards: `sizes="(max-width: 640px) 50vw, 25vw"`. For product detail hero: `sizes="(max-width: 768px) 100vw, 50vw"`.
- For the hero/primary product image, add `preload={true}` to improve LCP.
- Use `placeholder="blur"` with a generated `blurDataURL` (via Plaiceholder or similar at upload time) for a better loading experience.
- Never set `unoptimized={true}` as a blanket workaround — it defeats the entire optimization pipeline.

**Warning signs:**
- `<Image>` without `sizes` prop in any responsive layout context.
- `unoptimized={true}` on product images.
- No `remotePatterns` configuration for the image storage host.
- Product images loaded with raw `<img>` tags instead of `next/image`.

**Phase:** Address in product catalog phase when the image storage strategy is decided.

---

## Moderate Pitfalls

---

### Pitfall 10: Server Actions Leaking Raw Database Records to Client

**What goes wrong:**
A Server Action that updates an order returns the full Prisma record, which may include internal fields (`adminNotes`, `stripeCustomerId`, `paypalPayerId`). The return value is serialized and sent to the client in the RSC payload.

**Prevention:**
- Server Actions should return only what the UI needs: `{ success: true, orderId }` or a minimal DTO.
- Audit all `'use server'` files: the return type must never be the raw database model.
- Use `import 'server-only'` in your DAL to create a structural barrier against importing database-access code into Client Components.

**Phase:** Enforce from the start of any Server Action authoring.

---

### Pitfall 11: Guest Checkout Without Session Continuity

**What goes wrong:**
A guest user adds items to the cart, begins checkout, but abandons the page. When they return, their cart is empty (localStorage was cleared or expired). There is no way to associate the pending PaymentIntent with the returning session, leaving Stripe with uncaptured intents that must be cancelled.

**Prevention:**
- Assign a guest session ID (stored in a cookie) when the cart is first created. Back the cart server-side (in the database or a fast store like Redis) keyed by this session ID.
- When a PaymentIntent is created, store the guest session ID on the intent metadata. When the user returns, the same session cookie restores their cart and any in-progress checkout.
- Set a TTL on guest carts (e.g., 30 days) and a separate TTL for uncaptured PaymentIntents (Stripe auto-cancels after 24 hours — make sure uncaptured intents are handled or cancelled proactively).

**Phase:** Address in cart architecture phase.

---

### Pitfall 12: Checkout Form Allows Double-Submission

**What goes wrong:**
The "Place Order" button is not disabled after the first click. On slow connections, customers click multiple times. Each click submits the Server Action or API call, potentially creating duplicate orders or multiple PaymentIntent confirmations.

**Prevention:**
- Disable the submit button immediately on first click (use `useFormStatus` or local state in the Client Component that wraps the checkout form).
- Server-side: implement idempotency using a client-generated `idempotency_key` sent with the request, or rely on Stripe's idempotency key header (`Idempotency-Key`).
- A Server Action that creates an order should check for an existing `pending` order with the same `cartId`/`sessionId` before inserting a new one.

**Phase:** Address in checkout flow phase.

---

### Pitfall 13: Missing Fulfilled/Shipped Status Emails

**What goes wrong:**
Order confirmation email is sent on purchase, but no email is sent when the admin updates fulfillment status to "shipped." Customers email support asking for tracking information because they received no proactive communication.

**Prevention:**
- Treat order status transitions as events: when `status` changes to `shipped`, trigger a transactional email (via Resend, Postmark, or similar) with the order summary and any tracking information.
- Use a server-side event or Server Action post-commit hook — not a client-side fire-and-forget — to ensure emails are sent reliably.
- Test all status transitions for email side effects before shipping the admin panel.

**Phase:** Address in the order management / admin panel phase.

---

## Minor Pitfalls

---

### Pitfall 14: `middleware.ts` File Will Break the Build (Next.js 16)

**What goes wrong:**
Tutorials, starter templates, and auth library documentation (NextAuth, Lucia) reference `middleware.ts`. In Next.js 16, `middleware` has been renamed to `proxy`. A `middleware.ts` file will either be ignored or cause build errors.

**Prevention:**
- Create `src/proxy.ts` (matching the `src/` layout of this project).
- Export a function named `proxy`, not `middleware`.
- Run the Next.js codemod if migrating an example: `npx @next/codemod@canary middleware-to-proxy .`
- When copying auth examples from documentation, check if the example was written for Next.js < 16 and rename accordingly.

**Phase:** Catch at project setup / auth implementation phase.

---

### Pitfall 15: Variant SKU Not Stored on Order Line Items

**What goes wrong:**
The order line item stores `productId` and a human-readable `variantLabel: "128GB Black"` but not the `variantId`. When the variant is later renamed, edited, or soft-deleted, historical orders lose the ability to link back to the exact variant that was ordered.

**Prevention:**
- Order line items must store `variantId` (foreign key, or a denormalized snapshot) at the time of purchase.
- Store a price snapshot on the line item at time of purchase — never join to the current variant price to display historical order totals.
- Consider `variantSnapshot: { sku, color, storage, price }` as a JSON column on the order line for immutable historical records.

**Phase:** Address in the order data model design, before any checkout is built.

---

### Pitfall 16: Product Image Alt Text Left as Filename or Empty

**What goes wrong:**
When images are uploaded via the admin panel, the `alt` text defaults to the filename (`IMG_4892.jpg`) or is left empty. Product images served with empty or filename-derived `alt` hurt accessibility (screen readers) and SEO (Google Images indexing).

**Prevention:**
- Make `alt` text a required field in the product image upload form in the admin panel.
- Validate it server-side: reject empty or filename-pattern strings.

**Phase:** Address in the admin product management phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Project setup | `middleware.ts` vs `proxy.ts` naming (Next.js 16) | Use `src/proxy.ts` from the start |
| Data model design | Variant SKU not stored on order line items | Include `variantId` + price snapshot in order line item schema |
| Product catalog | Over-caching stock/price with long `cacheLife` | Cache product content separately from stock/price; use `cacheTag` + `revalidateTag` |
| Product catalog | Missing canonical URLs and structured data | Add canonical and `Product` JSON-LD in the initial page implementation |
| Product catalog | Image optimization broken by missing `remotePatterns` | Configure `remotePatterns` before wiring any external image |
| Cart architecture | Client-submitted prices trusted for payment amounts | Server recalculates total from DB before creating PaymentIntent |
| Cart architecture | Cart in localStorage only — no session continuity for guests | Server-backed cart keyed by session cookie |
| Checkout flow | Non-atomic stock check causes overselling | Atomic `UPDATE ... WHERE stock > 0 RETURNING stock` |
| Checkout flow | Double-submission creates duplicate orders | Disable submit on click + server-side idempotency key |
| Payment integration | Webhooks not idempotent — duplicate order processing | `processed_events` table with unique constraint on event ID |
| Payment integration | Feature flags only enforced in UI, not in API handlers | Feature flag check at top of every payment Route Handler |
| Payment integration | Order status diverges across payment providers | Define canonical status machine before writing any webhook handler |
| Admin panel | Proxy-only auth — Server Actions unguarded | Re-verify auth inside every admin Server Action |
| Admin panel | Raw DB records returned from Server Actions | Return minimal DTOs only |
| Admin panel | No email on status transitions | Trigger transactional email on every status change event |
| SEO | Product image `alt` text empty or filename-derived | Require meaningful `alt` in admin upload form |

---

## Sources

- Next.js 16.2.7 official documentation — Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components (accessed 2026-06-05, HIGH confidence)
- Next.js 16.2.7 official documentation — Caching (Cache Components / `use cache`): https://nextjs.org/docs/app/getting-started/caching (accessed 2026-06-05, HIGH confidence)
- Next.js 16.2.7 official documentation — Data Security guide: https://nextjs.org/docs/app/guides/data-security (accessed 2026-06-05, HIGH confidence)
- Next.js 16.2.7 official documentation — Proxy (formerly Middleware): https://nextjs.org/docs/app/api-reference/file-conventions/proxy (accessed 2026-06-05, HIGH confidence — includes confirmation that `middleware.ts` is deprecated and renamed to `proxy.ts` in v16.0.0)
- Next.js 16.2.7 official documentation — Image Component: https://nextjs.org/docs/app/api-reference/components/image (accessed 2026-06-05, HIGH confidence)
- Stripe webhook best practices — idempotency, at-least-once delivery, event deduplication (MEDIUM confidence — based on Stripe's documented webhook model; WebFetch blocked)
- PayPal webhook delivery model — at-least-once semantics, retry behavior (MEDIUM confidence — based on PayPal's documented webhook model; WebFetch blocked)
- Ecommerce domain knowledge — overselling, race conditions, cart trust model (MEDIUM confidence — established patterns in the domain)
