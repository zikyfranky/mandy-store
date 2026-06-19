# Phase 3: Cart - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Customers can collect items into a cart and manage it: **add a selected variant**,
**change quantity**, and **remove items** — and the cart **survives page navigation and a
browser refresh** for both guests and logged-in users (CART-01, CART-02, CART-03).

This phase wires the two stubs left by Phase 2: the **Add-to-cart CTA** in
`VariantSelector` and the **cart count badge** in `SiteHeader`.

**Out of scope:** checkout, shipping, and payment (Phase 4). The cart's "Checkout" button is
rendered but routes into Phase 4 work (a stub/placeholder this phase, like Add-to-cart was in
Phase 2). Never trust client prices — totals are always recomputed server-side from the DB.

</domain>

<decisions>
## Implementation Decisions

### Cart surface & add feedback
- **D-01:** Clicking **Add to cart opens a slide-out cart drawer** (mini-cart) from the right —
  shows the added item + full cart contents, with "Checkout" and "View cart" actions. The shopper
  stays on the product page (no redirect).
- **D-02:** There is **also a dedicated full `/cart` page** (drawer + page). `/cart` is the route
  Phase 4 checkout will start from.
- **D-03 (Claude's discretion, locked):** The **header cart icon opens the drawer**; the drawer's
  "View cart" links to `/cart`; the drawer's "Checkout" button targets Phase 4 (placeholder this
  phase). Rebrand the Add-to-cart CTA from the leftover `bg-blue-600` to the new **indigo brand**
  styling while wiring it.

### Quantity & remove controls
- **D-04:** Quantity is adjusted with a **stepper (− n +)**.
- **D-05:** Quantity is **editable in BOTH the drawer and the `/cart` page**.
- **D-06:** Quantity is **capped at the variant's available stock**, with a message (e.g. "Only 3
  available"); the shopper cannot add/increase beyond stock. (Aligns with Phase 4 atomic stock.)
- **D-07:** **Remove** via a **trash icon** on each line item; decreasing quantity **below 1 also
  removes** the item.

### Persistence & login behavior
- **D-08:** **Guest cart = server-side cookie**, **30-day lifetime** (matches the Phase 1 session
  lifetime). The cookie stores **only `{ variantId, quantity }`** — never prices.
- **D-09:** **Logged-in users get a DB-backed cart** (new `cart` / `cart_item` tables keyed to the
  user) so the cart follows them across devices; guests stay on the cookie. The DB cart likewise
  stores only variant references + quantities — **no prices persisted**.
- **D-10:** On login, **merge the guest cookie cart into the user's DB cart** (additive — combine
  quantities for the same variant, clamped to available stock), then clear the guest cookie cart.

### Stock & availability edges
- **D-11:** If a cart variant goes **fully out of stock**, mark the line **"Out of stock"**, exclude
  it from the total, and **block checkout until it's removed** (nothing silently disappears).
- **D-12:** If **stock drops below the cart quantity**, **clamp the line to the available quantity**
  and show a notice (e.g. "Only 2 left — quantity updated").
- **D-13:** The **header count badge shows total item quantity** (sum of all line quantities).
- **D-14:** **Empty cart** shows a **friendly empty state + "Start shopping" CTA** back to the
  catalog (consistent with the Phase 2 catalog empty states).

### Claude's Discretion
- Drawer open/close animation + focus-trap/escape behavior; toast vs no-toast in addition to the
  drawer (drawer opening is the primary confirmation).
- Exact cookie name/encoding and signing; server action vs route handler for cart mutations.
- `cart`/`cart_item` table column details and indexes; how the merge resolves the same variant.
- Optimistic UI vs await-on-server for stepper changes (must reconcile with server truth).
- Debounce strategy for rapid stepper clicks.

</decisions>

<specifics>
## Specific Ideas

- Mini-cart drawer should feel like the modern Shopify pattern — slide in from the right, dim the
  page behind, show line items with thumbnail + variant label + qty stepper + line price, and a
  running subtotal with a clear "Checkout" CTA.
- "Add to cart" should finally feel alive (the user explicitly flagged the dead stub) — opening the
  drawer with the just-added item highlighted is the confirmation.
- Stock-aware everywhere: can't exceed stock, OOS is honest, low-stock clamps with a message.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 3: Cart" — goal, dependency (Phase 2), and the 4 success criteria
  (add+count, qty/remove, guest persistence via server cookie, store only variantId+quantity).
- `.planning/REQUIREMENTS.md` — CART-01 (add variant), CART-02 (update qty / remove), CART-03
  (persist across visits via guest session cookie).
- `.planning/PROJECT.md` — scope; guest checkout non-negotiable; cart context.

### Cross-phase constraints (carry forward)
- `CLAUDE.md` §"Critical Constraints" — **never trust client prices** (recompute totals
  server-side); atomic stock decrement is enforced in Phase 4 but cart stock-capping (D-06/D-11/D-12)
  reads `variants.stock` here.
- `.planning/STATE.md` §"Accumulated Context" — "Cart cookie stores only `{ variantId, quantity }`;
  totals always recalculated server-side"; 30-day session lifetime (D-07 Phase 1); DB sessions +
  `verifySession()` (used to key the logged-in DB cart and gate the login-merge).

### Existing code to extend / wire
- `src/components/product/VariantSelector.tsx` — client component; the Add-to-cart `onClick` is the
  no-op stub to wire (has `resolvedVariant.id`, stock, price already in props).
- `src/components/layout/SiteHeader.tsx` — cart icon + count badge (currently hard-coded `0`) to wire
  to the live cart count and to open the drawer.
- `src/lib/db/schema.ts` — add `cart` / `cart_item` tables (Drizzle); a schema push (`npm run
  db:push`) is required this phase.
- `src/lib/dal.ts` — `verifySession()` / server-only pattern for the logged-in DB cart + merge.
- `src/lib/catalog/queries.ts` + `src/lib/catalog/format.ts` — variant/price lookup for rendering
  cart lines and computing server-side subtotals (formatNGN).
- `.planning/phases/02-product-catalog/02-CONTEXT.md` + `02-*-SUMMARY.md` — variant data shape,
  component/styling conventions, the indigo brand system (globals.css tokens, `.brand-gradient`).
- `.planning/phases/01-foundation/01-CONTEXT.md` — auth/session decisions (D-06 DB sessions, D-12
  route protection) relevant to the DB cart + merge-on-login.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VariantSelector` (client): exposes the resolved variant id/stock/price at click — feed a cart
  server action; rebrand button to indigo.
- `SiteHeader` cart button + count bubble: wire count to live cart, click opens drawer.
- `formatNGN` (`src/lib/catalog/format.ts`): pure NGN formatter for line prices/subtotal.
- Drizzle schema + seed/`db:push` workflow, `dal.ts` server-only + `verifySession()`, catalog
  empty-state pattern (reuse for empty cart, D-14).
- Tailwind v4 brand system from Phase 2 (`globals.css`: `--brand`, `.brand-gradient`, `.no-scrollbar`).

### Established Patterns
- Next.js 16 App Router, `src/` layout, Server Components + client islands; async `searchParams`.
- Server-only data access via `dal.ts`; never expose prices to client for computation.
- Build is `npx next build --webpack`; Node 20+ (`.nvmrc` = 22; shell default 18 is too old).

### Integration Points
- New cart server actions/route + cookie read/write; new `/cart` page; cart drawer mounted in the
  layout/header so it's globally available.
- New `cart`/`cart_item` tables reference `variants` (and `users` for logged-in carts).
- Variant stock field (defined Phase 2) gates D-06/D-11/D-12; atomic decrement stays Phase 4.

</code_context>

<deferred>
## Deferred Ideas

- **Checkout, shipping address, payment, order creation** — Phase 4 (the cart's Checkout button is a
  placeholder this phase).
- **Cross-device cart for guests** — only logged-in carts sync across devices (D-09); guest cart is
  per-browser cookie.
- **Save for later / wishlist** — v2 (out of scope).
- **Cart-level promo/discount codes** — v2 (PROMO-01/02, out of scope).

</deferred>

---

*Phase: 03-cart*
*Context gathered: 2026-06-19*
