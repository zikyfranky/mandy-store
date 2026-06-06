# Architecture Patterns: Next.js 16 Ecommerce (App Router)

**Project:** Mandy Store
**Domain:** Single-vendor ecommerce — electronics, watches, phones
**Researched:** 2026-06-05
**Sources:** Next.js 16 official documentation (version 16.2.7, fetched 2026-06-05)
**Confidence:** HIGH — all findings verified against current official docs

---

## Critical Version Note: `middleware.ts` → `proxy.ts`

Next.js 16 deprecated and renamed `middleware.ts` to `proxy.ts`. The exported function also changes from `middleware()` to `proxy()`. A codemod exists (`npx @next/codemod@canary middleware-to-proxy .`). All route-protection patterns in this document use the new `proxy.ts` convention. This is a breaking change from any Next.js 13/14/15 tutorials.

---

## System Overview

```
Browser
  │
  ▼
proxy.ts  ←── runs before every route render
  │            (auth redirect for /admin/*, /account/*)
  ▼
Next.js App Router (src/app/)
  │
  ├── Root Layout (layout.tsx)
  │     └── Providers: CartProvider (client), ThemeProvider (client)
  │
  ├── Storefront Routes
  │     ├── / (homepage)
  │     ├── /shop (catalog listing)
  │     ├── /shop/[category] (filtered listing)
  │     ├── /product/[slug] (product detail + variant selector)
  │     ├── /cart (cart review)
  │     └── /checkout/* (checkout flow)
  │
  ├── Account Routes
  │     ├── /account/login
  │     ├── /account/register
  │     └── /account/orders
  │
  ├── Admin Routes
  │     └── /admin/* (protected, role=admin)
  │
  └── API Route Handlers
        ├── /api/webhooks/stripe/route.ts
        ├── /api/webhooks/paypal/route.ts
        └── /api/health/route.ts

src/lib/
  ├── actions/          Server Actions (cart, orders, auth)
  ├── db/               ORM client + schema (Drizzle or Prisma)
  ├── session.ts        JWT encrypt/decrypt (server-only)
  └── dal.ts            Data Access Layer — verifySession + data queries

src/components/
  ├── ui/               Headless primitives (Button, Input, etc.)
  ├── storefront/       Server Components: ProductCard, ProductGrid
  ├── cart/             Client Components: CartDrawer, CartLineItem
  ├── checkout/         Mixed: CheckoutForm (client), OrderSummary (server)
  └── admin/            Server Components + Client form islands
```

---

## Server Component vs Client Component Split

**Rule:** Server Components are the default. Add `"use client"` only when the component needs state, event handlers, browser APIs, or lifecycle hooks.

### Storefront — Server Components (default)

These pages/components have no interactivity — they fetch from the DB and render HTML:

| Component | Why Server | Pattern |
|-----------|------------|---------|
| `/shop/page.tsx` | Fetches product list from DB | `async function Page()` + direct DB query |
| `/shop/[category]/page.tsx` | Filtered catalog query | Same, `params.category` drives the query |
| `/product/[slug]/page.tsx` | Product data + variant list | async Server Component, passes data to client islands |
| `<ProductCard />` | Renders product title, price, image | Pure RSC, no state |
| `<ProductGrid />` | Maps over products array | Pure RSC |
| `<OrderSummary />` | Renders line items, totals | Pure RSC |

### Cart and Checkout — Client Component Islands

Cart and checkout state lives on the client because users interact with it before submitting:

| Component | Why Client | Pattern |
|-----------|------------|---------|
| `<CartProvider />` | Context for cart state across all pages | `"use client"`, `createContext`, `useState` |
| `<CartDrawer />` | Opens/closes via state | `"use client"`, `useState` for open/closed |
| `<CartLineItem />` | Quantity +/- buttons, remove | `"use client"`, calls Server Actions on click |
| `<AddToCartButton />` | onClick triggers cart update | `"use client"`, `useTransition` for pending state |
| `<VariantSelector />` | Colour/storage selection affects price display | `"use client"`, `useState` for selected variant |
| `<CheckoutForm />` | Multi-field form with validation | `"use client"`, `useActionState` |
| `<PaymentMethodSelector />` | Toggle Stripe/PayPal/bank | `"use client"`, controlled select |

### Product Page Composition Pattern (Key Boundary)

The product page illustrates the canonical RSC + client island pattern:

```
ProductPage (Server Component)
  │ fetches product + variants from DB
  ├── <ProductImages />       (Server — static image data)
  ├── <ProductInfo />         (Server — title, description, base price)
  ├── <VariantSelector />     (Client — selection state)
  └── <AddToCartButton />     (Client — cart mutation)
```

The Server Component fetches all data once and passes it as props down to the client islands. Client islands receive serializable props (plain objects/primitives) — no ORM objects or class instances.

### Admin — Server Components with Client Form Islands

Admin pages follow the same pattern. The data table is a Server Component; create/edit forms are Client Components using `useActionState`:

```
AdminProductsPage (Server Component)
  │ queries all products
  ├── <ProductTable />        (Server — renders rows)
  └── <ProductFormModal />    (Client — create/edit form state)
```

---

## Route Structure

```
src/app/
│
├── layout.tsx                    Root layout: HTML shell, providers
├── page.tsx                      Homepage: featured products, categories
│
├── shop/
│   ├── page.tsx                  All products (paginated)
│   └── [category]/
│       └── page.tsx              Category-filtered listing
│
├── product/
│   └── [slug]/
│       └── page.tsx              Product detail, variant selector, add to cart
│
├── cart/
│   └── page.tsx                  Cart review page (mirrors CartProvider state)
│
├── checkout/
│   ├── layout.tsx                Checkout shell (progress indicator)
│   ├── page.tsx                  Shipping address + payment method
│   └── confirmation/
│       └── page.tsx              Order confirmation (orderId in searchParams)
│
├── account/
│   ├── login/
│   │   └── page.tsx              Login form
│   ├── register/
│   │   └── page.tsx              Registration form
│   └── orders/
│       └── page.tsx              Order history (protected)
│
├── admin/
│   ├── layout.tsx                Admin shell: sidebar nav, admin-only
│   ├── page.tsx                  Dashboard: order counts, low stock
│   ├── products/
│   │   ├── page.tsx              Product list + bulk actions
│   │   ├── new/
│   │   │   └── page.tsx          Create product form
│   │   └── [id]/
│   │       └── page.tsx          Edit product + variant management
│   └── orders/
│       ├── page.tsx              All orders list + filter
│       └── [id]/
│           └── page.tsx          Order detail + fulfillment status update
│
└── api/
    ├── webhooks/
    │   ├── stripe/
    │   │   └── route.ts          POST — Stripe payment events
    │   └── paypal/
    │       └── route.ts          POST — PayPal IPN/webhook events
    └── health/
        └── route.ts              GET — uptime check
```

### Route Groups (Recommended)

Use Next.js route groups (parentheses folders) to share layouts without polluting the URL:

```
src/app/
├── (storefront)/             Group: public-facing store, shared storefront layout
│   ├── layout.tsx            Header (nav, cart icon), footer
│   ├── page.tsx
│   ├── shop/...
│   └── product/...
│
├── (checkout)/               Group: checkout flow, minimal chrome layout
│   ├── layout.tsx            No header/footer, just progress bar
│   └── checkout/...
│
├── (auth)/                   Group: login/register, centered card layout
│   ├── layout.tsx            Centered layout, no nav
│   └── account/login|register
│
└── (admin)/                  Group: admin panel, sidebar layout
    ├── layout.tsx            Sidebar navigation
    └── admin/...
```

Route groups keep URL segments (`/shop`, `/checkout`) while allowing distinct layouts per section.

---

## Auth Protection: `proxy.ts`

In Next.js 16, `middleware.ts` is replaced by `proxy.ts` at the project root (or `src/proxy.ts`):

```typescript
// src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/session'

const adminRoutes = ['/admin']
const accountRoutes = ['/account/orders']
const authRoutes = ['/account/login', '/account/register']

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const sessionCookie = request.cookies.get('session')?.value
  const session = await decrypt(sessionCookie)

  const isAdminRoute = adminRoutes.some(r => path.startsWith(r))
  const isAccountRoute = accountRoutes.some(r => path.startsWith(r))
  const isAuthRoute = authRoutes.some(r => path.startsWith(r))

  // Redirect unauthenticated users away from protected routes
  if ((isAdminRoute || isAccountRoute) && !session?.userId) {
    return NextResponse.redirect(new URL('/account/login', request.url))
  }

  // Redirect non-admins away from /admin
  if (isAdminRoute && session?.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Redirect authenticated users away from login/register
  if (isAuthRoute && session?.userId) {
    return NextResponse.redirect(new URL('/account/orders', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)', '/api/(?!webhooks).*'],
}
```

**Important:** Proxy provides optimistic redirects only — it reads the cookie without a DB lookup for speed. Every Server Action and Route Handler must still call `verifySession()` from the DAL for secure authorization. Do not rely on proxy alone.

---

## API Route Patterns

### Webhook Handlers (Stripe, PayPal)

Webhooks must be Route Handlers, not Server Actions — payment providers POST to them directly:

```typescript
// src/app/api/webhooks/stripe/route.ts
import { headers } from 'next/headers'
import Stripe from 'stripe'

export async function POST(request: Request) {
  const body = await request.text()   // raw body required for signature verification
  const headersList = await headers()
  const signature = headersList.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      // update order status to 'paid', trigger confirmation email
      break
    case 'payment_intent.payment_failed':
      // update order status to 'payment_failed'
      break
  }

  return new Response('OK', { status: 200 })
}
```

Webhook routes must be excluded from the proxy matcher (they receive unauthenticated POST requests from payment providers).

### Server Actions vs Route Handlers

Use **Server Actions** for all user-initiated mutations (cart updates, order creation, product CRUD). Use **Route Handlers** only for: webhooks from third-party services, non-browser clients, and health/status endpoints.

| Operation | Mechanism | Location |
|-----------|-----------|----------|
| Add item to cart | Server Action | `src/lib/actions/cart.ts` |
| Update cart quantity | Server Action | `src/lib/actions/cart.ts` |
| Create order | Server Action | `src/lib/actions/orders.ts` |
| Login / logout | Server Action | `src/lib/actions/auth.ts` |
| Create product (admin) | Server Action | `src/lib/actions/admin.ts` |
| Update fulfillment status | Server Action | `src/lib/actions/admin.ts` |
| Stripe webhook | Route Handler | `src/app/api/webhooks/stripe/route.ts` |
| PayPal webhook | Route Handler | `src/app/api/webhooks/paypal/route.ts` |

---

## Cart Architecture

The cart state spans multiple pages and must survive navigation. Two valid approaches:

### Option A: Server-side cart (cookie or DB-backed) — Recommended
- Cart stored as a session-scoped cookie (serialized cart items) or a `carts` DB table
- Server Actions read and write cart state using `cookies()` from `next/headers`
- Cart count in the header is a Server Component that reads the cookie
- No client-side state management library needed
- Guest checkout naturally supported (cart exists before login)

### Option B: Client-side CartProvider context
- Cart stored in React context (localStorage-backed for persistence)
- `<CartProvider>` wraps the root layout as a Client Component
- Server Actions called on mutation to sync with DB

**Recommendation: Option A** — keeps the cart on the server, simpler serialization, no hydration mismatch risk, works without JavaScript.

```typescript
// src/lib/actions/cart.ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function addToCart(variantId: string, quantity: number) {
  const cookieStore = await cookies()
  const cartCookie = cookieStore.get('cart')?.value
  const cart = cartCookie ? JSON.parse(cartCookie) : { items: [] }

  // Upsert logic
  const existingIdx = cart.items.findIndex(i => i.variantId === variantId)
  if (existingIdx >= 0) {
    cart.items[existingIdx].quantity += quantity
  } else {
    cart.items.push({ variantId, quantity })
  }

  cookieStore.set('cart', JSON.stringify(cart), { httpOnly: true, path: '/' })
  revalidatePath('/cart')
}
```

---

## Data Flow

### Product Page Request Flow

```
1. Browser GET /product/[slug]
2. proxy.ts: no auth required — pass through
3. Next.js renders ProductPage (Server Component)
4. ProductPage queries DB: getProductBySlug(slug)
5. Product data + variants passed as props to:
   - <ProductImages /> (Server, renders immediately)
   - <ProductInfo />   (Server, renders immediately)
   - <VariantSelector /> (Client island, receives variants as serialized prop)
   - <AddToCartButton /> (Client island, receives variantId as prop)
6. Static shell (images, info, variant list) sent to browser immediately
7. Client islands hydrate with event listeners
```

### Add to Cart Flow

```
1. User clicks AddToCartButton
2. Client Component calls Server Action: addToCart(variantId, qty)
3. Server Action: writes to cart cookie, revalidatePath('/cart')
4. Next.js re-renders affected RSC tree (cart count in header)
5. Client receives updated RSC payload, updates header cart count
6. useTransition isPending → button shows loading state during step 3
```

### Checkout + Payment Flow

```
1. User submits checkout form (Server Action: createOrder)
2. Server Action:
   a. Validates address fields (Zod)
   b. Reads cart from cookie
   c. Checks variant stock levels
   d. Creates Order record in DB (status: 'pending_payment')
   e. Creates payment intent via Stripe/PayPal SDK
   f. Returns client secret or redirect URL
3. Client Component:
   - Stripe: uses Stripe.js to confirm payment with client secret
   - PayPal: redirects to PayPal approval URL
   - Bank transfer: redirects to /checkout/confirmation with bank details
4. On payment success:
   - Stripe: webhook POST /api/webhooks/stripe → update order to 'paid'
   - PayPal: webhook POST /api/webhooks/paypal → update order to 'paid'
   - Bank transfer: order remains 'pending' until admin marks paid
5. Stripe/PayPal redirect customer back to /checkout/confirmation?orderId=xxx
6. Confirmation page reads order from DB, shows summary, sends email
```

---

## Database Schema Patterns

These are structural patterns, not implementation code. Schema implementation belongs in a dedicated phase.

### Core Tables

```
products
  id, slug, name, description, category, images[], is_active, created_at

product_variants
  id, product_id (FK), sku, price, stock_quantity,
  options (jsonb: { color: "Black", storage: "128GB" }),
  is_active

orders
  id, order_number, customer_email, customer_name,
  status (pending_payment | paid | processing | shipped | delivered | cancelled),
  payment_method (stripe | paypal | bank_transfer),
  payment_intent_id, subtotal, shipping_total, total,
  shipping_address (jsonb), created_at, updated_at

order_items
  id, order_id (FK), variant_id (FK), quantity, unit_price_at_purchase

customers (optional for guest checkout support)
  id, email, name, password_hash, role (customer | admin), created_at

addresses
  id, customer_id (FK), label, line1, line2, city, state, postal_code, country
```

### Key Schema Decisions

- `price` lives on `product_variants`, not `products` — each variant has its own price (iPhone 256GB costs more than 128GB)
- `unit_price_at_purchase` on `order_items` — prices can change, orders must preserve the price at time of purchase
- `options` as JSONB on variants — flexible attribute bag (color, storage, size) without a separate attributes table
- `shipping_address` as JSONB on orders — denormalized for order history permanence; changes to customer address don't corrupt historical orders
- `status` as an enum with defined transitions — prevents invalid state combinations
- Guest checkout: orders can have `customer_email` without a `customers` row; optional account creation post-purchase links email to account

---

## Caching Strategy

Next.js 16 introduces `use cache` directive + Partial Prerendering (PPR) as the new model. Enable it in `next.config.ts`:

```typescript
const nextConfig = { cacheComponents: true }
```

### Per-route caching recommendations

| Route | Strategy | Rationale |
|-------|----------|-----------|
| `/shop` | `use cache` + `cacheTag('products')` on data fetch | Catalog is shared across users, changes when admin updates products |
| `/product/[slug]` | `use cache` on product data + `<Suspense>` around cart | Product info is shared; cart section is per-user |
| `/cart` | No cache — `<Suspense>` streaming | Cart is per-user, always fresh |
| `/checkout/*` | No cache — dynamic request time | Per-user, live stock checks |
| `/account/orders` | No cache — dynamic | Per-user order history |
| `/admin/*` | No cache — dynamic | Real-time inventory/order data |
| `/(homepage)` | `use cache` on featured products | Cacheable shared content |

On admin product save, call `updateTag('products')` to immediately expire product cache:

```typescript
// src/lib/actions/admin.ts
'use server'
import { updateTag } from 'next/cache'

export async function updateProduct(id: string, data: ProductUpdateInput) {
  // ... DB update
  updateTag('products')   // expires product catalog cache
  updateTag(`product:${data.slug}`)   // expires specific product cache
}
```

---

## Component Boundaries (What Talks to What)

```
proxy.ts
  └── reads: session cookie (decrypt only, no DB)
  └── redirects to: /account/login, /

Root Layout (Server)
  └── renders: <CartProvider> (Client), page content

CartProvider (Client)
  └── provides: cart context to all client components
  └── calls: Server Actions for mutations

ProductPage (Server)
  └── queries: DB directly (ORM in server component)
  └── passes to clients: serialized plain objects only
  └── renders: client islands as children/props

Server Actions
  └── called by: Client Components (buttons, forms)
  └── reads: cookies(), DB (via DAL)
  └── writes: DB, cookies
  └── calls: revalidatePath / updateTag after mutation
  └── calls: Stripe/PayPal SDK for payment intents

Route Handlers (webhooks)
  └── called by: Stripe/PayPal servers (external POST)
  └── verifies: webhook signature before processing
  └── writes: DB order status updates
  └── NOT called by: application UI components

DAL (src/lib/dal.ts)
  └── called by: Server Components, Server Actions, Route Handlers
  └── calls: verifySession() before any data access
  └── queries: DB
  └── returns: DTOs (plain objects, no ORM class instances)

Admin Layout (Server)
  └── calls: verifySession() → redirects if not admin
  └── renders: admin shell + sidebar
```

---

## Admin Section Architecture

The admin section is a protected sub-application sharing the same Next.js app. Separation is achieved via:

1. Route prefix: `/admin/*`
2. `proxy.ts`: redirects non-admins before rendering
3. `(admin)` route group with its own `layout.tsx` (sidebar navigation)
4. Double-check in admin Server Components: `verifySession()` + role check

```
/admin/layout.tsx (Server Component)
  │ calls verifySession() — redirects if not admin (second line of defense)
  │ renders: sidebar nav with links to products, orders
  └── /admin/page.tsx         Dashboard metrics
  └── /admin/products/        CRUD product management
  └── /admin/orders/          Order view + fulfillment status

Admin product forms use the Server Action pattern:
  Client Component (form with useActionState)
    → Server Action (validates, checks admin role, writes DB)
    → updateTag('products') to expire product cache
    → redirect('/admin/products')
```

Payment method feature flags (Stripe/PayPal/bank transfer) are read from environment variables and applied in the checkout Server Component to conditionally render payment options — no code changes needed to toggle providers.

---

## Suggested Build Order (Phase Dependencies)

Components have hard dependencies that dictate build order:

```
1. Database schema + ORM setup
   └── Required by everything else

2. Auth (session, DAL, proxy.ts, login/register pages)
   └── Required by: account pages, admin, cart persistence

3. Product catalog (DB seed, /shop, /product/[slug])
   └── Required by: cart (needs variant IDs), admin product management

4. Cart (Server Actions, cookie storage, cart page)
   └── Required by: checkout

5. Checkout (address form, payment intent creation)
   └── Required by: order confirmation, webhooks

6. Payment webhooks (Stripe, PayPal route handlers)
   └── Required by: order status completion

7. Order confirmation + email
   └── Depends on: order record (from checkout)

8. Admin panel (product CRUD, order management)
   └── Depends on: auth (admin role), product schema, order schema

9. Account section (order history)
   └── Depends on: auth (customer session), order schema
```

The admin panel (step 8) can be built in parallel with checkout (step 5) once auth and the product schema exist. They do not depend on each other.

---

## Anti-Patterns to Avoid

### Fetching data in layout.tsx for page-specific needs
**What goes wrong:** `src/app/(storefront)/layout.tsx` fetches product categories to render a nav dropdown — this runs on every storefront route including non-product pages.
**Do this instead:** Fetch categories in a `<CategoryNav />` Server Component imported by the layout. The component handles its own data and is memoized per request via `React.cache`.

### Putting a Server Component inside a `"use client"` file
**What goes wrong:** `// client-component.tsx` imports `<ProductCard />` (Server Component) — ProductCard gets pulled into the client bundle and loses its server privileges.
**Do this instead:** Pass Server Components as `children` or props to client components. The page (Server) renders `<Modal><Cart /></Modal>` where `Modal` is client but `Cart` is server passed as a child.

### Using proxy.ts as the only auth check
**What goes wrong:** Proxy reads the cookie optimistically. A user with an expired session cookie can slip through proxy but the cookie decrypt will succeed if the JWT hasn't expired yet.
**Do this instead:** Every Server Action and protected Route Handler calls `verifySession()` from the DAL. Proxy is a first-pass redirect optimization, not a security boundary.

### Exposing ORM model instances to Client Components
**What goes wrong:** Passing `prisma.product` objects (class instances) as props to `<VariantSelector />` — these are not serializable, causing React to throw.
**Do this instead:** Map DB results to plain objects/types before passing to any client component. The DAL layer should return typed DTOs.

### Storing sensitive data in the cart cookie
**What goes wrong:** Cart cookie contains full product names and prices — easy to tamper.
**Do this instead:** Cart cookie stores only `{ variantId, quantity }[]`. Prices and stock are always re-fetched from DB at checkout time, preventing price manipulation.

### Bank transfer order immediately marked as paid
**What goes wrong:** Order is marked `paid` when created, before bank transfer is confirmed.
**Do this instead:** Bank transfer orders are created with status `pending`. Admin manually marks them `paid` in the admin panel after confirming receipt. This is the correct flow — unlike Stripe/PayPal which have webhooks.

---

## Confidence Assessment

| Area | Level | Basis |
|------|-------|-------|
| Server/Client component split | HIGH | Official Next.js 16 docs, direct quotes |
| proxy.ts route protection | HIGH | Official docs — confirmed rename from middleware |
| Server Actions pattern | HIGH | Official Next.js 16 docs |
| Route handler webhook pattern | HIGH | Official Next.js 16 docs |
| Caching with `use cache` directive | HIGH | Official Next.js 16 docs (PPR/Cache Components) |
| Session management (Jose/iron-session) | HIGH | Official auth guide |
| DB schema patterns | MEDIUM | Standard ecommerce patterns, not project-specific |
| Cart cookie vs DB storage | MEDIUM | Pattern is sound; implementation tradeoffs apply |

---

## Sources

- Next.js 16 Routing / Layouts and Pages: https://nextjs.org/docs/app/getting-started/layouts-and-pages (v16.2.7, 2026-05-13)
- Next.js 16 Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components (v16.2.7, 2026-05-13)
- Next.js 16 Proxy (formerly Middleware): https://nextjs.org/docs/app/api-reference/file-conventions/proxy (v16.2.7, 2026-05-13)
- Next.js 16 Mutating Data / Server Functions: https://nextjs.org/docs/app/getting-started/mutating-data (v16.2.7, 2026-03-10)
- Next.js 16 Fetching Data: https://nextjs.org/docs/app/getting-started/fetching-data (v16.2.7, 2026-03-13)
- Next.js 16 Authentication Guide: https://nextjs.org/docs/app/guides/authentication (v16.2.7, 2026-03-03)
- Next.js 16 Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route (v16.2.7, 2026-03-03)
- Next.js 16 Caching (Cache Components / PPR): https://nextjs.org/docs/app/getting-started/caching (v16.2.7, 2026-05-13)
