# Feature Landscape

**Domain:** Single-vendor electronics/gadgets/watches/phones ecommerce
**Project:** Mandy Store
**Researched:** 2026-06-05
**Confidence:** HIGH (well-established domain with clear industry consensus)

---

## Table Stakes

Features users expect from any electronics retailer. Missing any of these causes immediate trust failure
or cart abandonment. Benchmarks: Apple Store, Samsung, B&H, Newegg, Best Buy online.

### Product Catalog

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Category browsing (Electronics / Watches / Phones) | Users arrive with a category in mind; no way to navigate without it | Low | Three categories already defined in PROJECT.md |
| Product listing page with thumbnail, name, price | Minimum scannable product card | Low | Missing price on card = user leaves immediately |
| Sorting (price asc/desc, newest, popularity) | Standard on every store; absence feels broken | Low | Popularity requires sales data — defer "sort by popularity" to post-launch |
| Filtering by category | Already segmented, but cross-category pages need it | Low | |
| Filtering by price range | Electronics spans $20–$2,000+; without this users can't find what fits budget | Medium | Slider UI; price bounds must be dynamic from DB |
| Filtering by brand | Electronics buyers are strongly brand-loyal (Apple vs Samsung etc.) | Low | Requires brand field on product |
| Product detail page | Core purchase decision page | Low | |
| Product images (multiple, zoomable) | Electronics buyers inspect hardware closely; single image erodes trust | Medium | Multiple upload slots in admin; client-side zoom |
| Product variant selection (color, storage) | Phones/tablets are always sold in variants; this is non-negotiable | Medium | Variants must have own price + stock (per PROJECT.md) |
| Stock availability indicator ("In Stock" / "Out of Stock" / quantity remaining) | Prevents phantom orders; sets urgency | Low | |
| Product description / specs table | Electronics purchases are spec-driven; buyers compare GHz, mAh, resolution | Medium | Structured specs (key-value) display better than prose |
| Price display including currency | Obvious but must be unambiguous | Low | |

### Cart

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Add to cart from PDP | Primary CTA | Low | |
| Cart drawer / cart page showing all items | Users expect to review before paying | Low | Drawer (slide-out) is modern standard; page is fallback |
| Remove item from cart | Fundamental CRUD | Low | |
| Update quantity in cart | Users add 2 phones, realize budget, change to 1 | Low | Clamp to stock level |
| Cart item shows selected variant | "iPhone 15 - 256GB, Black" not just "iPhone 15" | Low | Common oversight that causes returns |
| Cart persists across sessions | Users leave, return later — losing cart causes abandonment | Medium | localStorage or server-side session |
| Line item price × quantity subtotal | Basic math display | Low | |
| Cart subtotal | Sum before shipping/tax | Low | |

### Checkout

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Guest checkout | Forcing account creation loses ~35% of conversions | Low | PROJECT.md explicitly requires this |
| Shipping address form (name, address lines, city, country, postal code, phone) | Required to ship physical goods | Low | |
| Order summary panel during checkout | Users need to confirm what they're buying before paying | Low | |
| Shipping cost display before payment | Hidden fees are the #1 cause of checkout abandonment | Low | Even flat-rate must be shown |
| Payment method selection | Multiple methods required (Stripe, PayPal, bank transfer) | Medium | Each independently toggleable per PROJECT.md |
| Stripe card payment | Dominant payment processor globally | Medium | Stripe Elements or Stripe.js |
| PayPal payment | ~35% of online shoppers prefer PayPal; trust signal | Medium | PayPal JS SDK |
| Bank transfer payment | Critical for markets where cards are less common | Low | Shows bank details; manual confirmation flow |
| Order review step before payment submission | Legal and UX requirement; prevents accidental orders | Low | |
| Clear error messages on payment failure | Card declined — user must know why and what to do | Low | Stripe/PayPal error codes → human messages |

### Order Confirmation & Post-Purchase

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Order confirmation page (summary + order number) | Users need proof the order went through | Low | PROJECT.md requires this |
| Order confirmation email | Primary receipt; users refer back to it | Medium | Transactional email provider (Resend, Postmark, or SendGrid) |
| Email includes: item list, quantities, total, shipping address, order ID | Minimum receipt content | Low | Template work |
| Order status page (pending / processing / shipped / delivered) | Users will contact support if they can't check status | Medium | Simple status enum; tracking number field |

### Customer Accounts (Optional but Expected)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Account creation at or after checkout | Reduces friction for repeat buyers | Medium | "Save your details" post-order CTA |
| Login / logout | Basic auth | Medium | |
| Order history | Repeat buyers need receipts and reorder reference | Medium | |
| Saved shipping addresses | Speed up repeat checkout | Medium | |

### Admin Panel

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Product list view (paginated) | Owner needs to see all products | Low | |
| Add product (name, description, images, category, brand, variants, price, stock) | Core admin task | High | Multiple image upload; variant matrix UI |
| Edit product | Prices change; specs get corrected | Medium | |
| Delete / archive product | Remove discontinued items | Low | Soft-delete preferred (keep in historical orders) |
| Variant management (add/edit/delete variants per product) | Phones have many SKUs | High | Each variant: color + storage + price + stock |
| Inventory stock level editing | Restock events | Low | Per-variant stock number |
| Order list view (all orders, filterable by status) | Owner must see incoming orders | Medium | |
| Order detail view | See what was ordered, by whom, shipping address | Low | |
| Order status update (mark as processing / shipped / delivered) | Fulfillment workflow | Low | Sends status email is ideal (v2 acceptable) |
| Admin authentication (login-gated) | Security baseline | Medium | Separate admin route, not customer auth |

---

## Differentiators

Features that set Mandy Store apart. Customers do not expect these, but they create delight and competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured specs comparison table on PDP | Electronics buyers compare specs obsessively; a clean spec table reads better than prose | Medium | Key-value spec fields on product; tabular display on PDP |
| "Compare products" side-by-side tool | Power buyers (selecting between Galaxy S24 vs S25) want direct comparison | High | Complex state management; defer to v2 unless simple implementation found |
| Smart variant price update (price field updates live when variant is selected) | "Does the 256GB cost more?" — yes, show the delta instantly | Low | React state; high impact, low effort |
| Sticky "Add to Cart" button on mobile PDP scroll | Mobile users scroll specs then buy; CTA disappearing is friction | Low | CSS position:sticky; outsized conversion impact |
| Recently viewed products | Browsing behaviour — users go back to products they considered | Medium | localStorage; no server required for v1 |
| Stock urgency signal ("Only 3 left") | Creates legitimate urgency when stock is genuinely low | Low | Threshold: show when qty ≤ 5 |
| WhatsApp / contact link for bank transfer queries | Bank transfer buyers need confirmation — a direct channel reduces abandonment | Low | Single link/button; high value for bank-transfer-heavy markets |
| Payment method logos at checkout and footer | Trust signals; PayPal/Stripe logos reduce hesitation | Low | Static asset work only |
| Order tracking number field visible to customer | If courier provides tracking number, expose it in account + email | Low | Field on order; display in status page |

---

## Anti-Features

Things to deliberately NOT build in v1. Each has a reason grounded in scope, complexity, or premature optimisation.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Discount codes / coupon system | Requires promo engine, code validation, stacking rules; out of scope per PROJECT.md | Add to v2 backlog |
| Product reviews and ratings | Requires moderation, spam prevention, trust system; out of scope per PROJECT.md | Add to v2 backlog |
| Wishlists / saved items | Session-based "recently viewed" covers 80% of the use case with 10% of the effort | Recently viewed in localStorage for v1 |
| Multi-vendor / marketplace | Single-vendor only per PROJECT.md; marketplace is a fundamentally different product | Never for this product |
| Subscription / recurring billing | Not applicable for electronics | Never for this product |
| Advanced analytics dashboard | Vanity metric trap for v1; owner needs to ship first | Export orders to CSV; full analytics in v2 |
| Real-time inventory sync with supplier | Requires supplier API integration; massive scope creep | Manual stock updates via admin panel |
| Address validation API (postal code lookups) | Adds third-party dependency and cost for marginal benefit at low order volume | Free-text address fields with basic required-field validation |
| Taxes calculated by jurisdiction | Complex rules, liability questions; high legal risk to get wrong | Flat "price includes all taxes" or "taxes calculated at shipping" note |
| Live chat widget | Low order volume in v1 doesn't justify the cost or distraction | WhatsApp link is sufficient |
| "Customers also bought" recommendations | Requires ML or collaborative filtering; not viable with a small catalog | Manual "related products" field on product (v2) |
| Social login (Google, Apple, Facebook) | OAuth integration complexity not justified for v1 account feature | Email/password with magic link is simpler and sufficient |
| Return / refund portal | Manual email-based returns are fine at v1 order volumes | Note on policy page; admin handles manually |

---

## Feature Dependencies

```
Brand field on product
  → Filter by brand (on catalog page)

Product variants (color/storage/etc.)
  → Variant-specific price display (live price update on PDP)
  → Variant-specific stock level
  → Stock availability indicator
  → Cart item shows selected variant
  → Variant management in admin

Cart
  → Cart persistence (localStorage or session)
  → Update quantity (clamped to stock)

Checkout
  → Cart (must exist before checkout)
  → Shipping address form
  → Payment method selection
    → Stripe integration
    → PayPal integration
    → Bank transfer flow
  → Order review step

Order creation
  → Checkout (order is created on payment success)
  → Order confirmation page
  → Order confirmation email (requires transactional email provider)
  → Order status page

Customer account (optional at checkout)
  → Account creation
  → Login / logout
  → Order history (requires order → account association)
  → Saved addresses

Admin authentication
  → All admin panel features (auth gates the entire admin)

Admin product management
  → Variant management (variants are children of products)
  → Stock level editing (per-variant)

Admin order management
  → Order list view
  → Order detail view
  → Order status update
```

---

## MVP Recommendation

Build in this order based on the dependency chain and the core value proposition ("find, configure, buy"):

**Must ship in v1 (table stakes only):**
1. Product catalog with category browsing, price/brand filtering, sorting
2. Product detail page with variant selection, multi-image, specs, stock indicator
3. Cart (add, remove, update qty, persist in localStorage)
4. Guest checkout: address form, order summary, payment method selection
5. Stripe integration (highest trust, widest reach)
6. PayPal integration
7. Bank transfer flow (show details, await manual confirmation)
8. Order confirmation page + confirmation email
9. Order status page (read-only, customer-facing)
10. Admin: product CRUD with variant matrix
11. Admin: order list + detail + status update
12. Admin authentication

**Include in v1 (low-effort differentiators):**
- Live variant price update on PDP (trivial React state)
- Sticky "Add to Cart" on mobile (CSS only)
- Stock urgency signal ("Only N left") (one conditional render)
- Payment method logos as trust signals (static assets)
- Smart cart: show selected variant in line item

**Defer to v2 (out of scope per PROJECT.md or complexity too high):**
- Discount codes
- Product reviews
- Wishlists
- Compare products tool
- Advanced analytics
- Social login
- Return portal

---

## Sources

- Feature set inferred from industry consensus across Apple Store, Samsung, B&H Photo, Newegg, and Best Buy online — well-established patterns as of research date (HIGH confidence)
- Checkout abandonment statistics (hidden fees, forced registration) are widely corroborated across Baymard Institute studies
- PROJECT.md defines scope boundaries and constraints incorporated throughout
