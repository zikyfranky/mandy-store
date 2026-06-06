# Technology Stack

**Project:** Mandy Store (Next.js ecommerce — electronics, watches, phones)
**Researched:** 2026-06-05
**Basis:** Training knowledge (cutoff August 2025) — external tool access (WebSearch, WebFetch, Context7) was blocked during this research session. All version numbers should be verified against npm/official docs before pinning in package.json.

---

## Scaffolded Baseline (Already Decided)

| Technology | Version | Status |
|------------|---------|--------|
| Next.js | 16.2.7 | Locked — do not replace |
| React | 19.2.4 | Locked |
| TypeScript | 5.x | Locked |
| Tailwind CSS | v4 | Locked |
| App Router | — | Locked |
| Deployment target | Vercel | Implied by scaffold |

Node.js local version (v18.17.0) is below the required >=20.9.0 — upgrade needed before development begins.

---

## Recommended Stack

### Database

**Recommended: PostgreSQL (via Neon or Supabase managed hosting)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16.x | Primary database | Industry standard for relational ecommerce data; strong JSON support for variant metadata; ACID guarantees for order/inventory writes |
| Neon (managed Postgres) | — | Hosting | Serverless Postgres with zero cold-start branching; native Vercel integration via `@neondatabase/serverless`; free tier covers development |

**Why not MySQL:** MySQL is equally capable, but the Node.js/Next.js ecosystem has stronger tooling momentum around Postgres (Prisma, Drizzle, Supabase all default to Postgres). No specific advantage for this project.

**Why not SQLite:** Acceptable for local dev only. Vercel's serverless/edge runtime does not have persistent local filesystem — SQLite on Vercel requires Turso or similar, adding complexity not warranted here.

**Confidence: MEDIUM** — Postgres + Neon is a well-established 2024-2025 pattern for Next.js/Vercel stacks. Neon's specific pricing tiers should be verified at neon.tech.

---

### ORM

**Recommended: Drizzle ORM**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| drizzle-orm | ~0.36.x | Database access layer | TypeScript-first, schema-as-code, lightweight bundle, excellent Next.js 15/16 App Router compatibility; no codegen step |
| drizzle-kit | ~0.27.x | Migrations CLI | Paired with drizzle-orm for schema push and migration generation |

**Why Drizzle over Prisma:**
- Drizzle runs at edge and serverless without connection-pool overhead (Prisma requires a connection pooler like PgBouncer or Prisma Accelerate for edge/serverless, adding setup and cost)
- Schema is plain TypeScript — no `.prisma` DSL file to learn or maintain
- Drizzle bundles are significantly smaller, relevant for Vercel serverless functions
- Query builder is explicit and composable; easier to reason about complex variant/inventory queries

**Why not Prisma:**
- Prisma v5 added Prisma Accelerate for connection pooling, but it's an additional paid service for production serverless deployments
- Prisma Client generates a large runtime; can cause cold start issues in Vercel serverless functions
- Prisma is still excellent for teams that prefer its DX, but Drizzle is the better fit here given Vercel + Next.js 16 serverless context

**Confidence: MEDIUM** — Drizzle vs Prisma debate was actively shifting in 2024-2025. Version numbers (0.36.x / 0.27.x) are approximate; verify on npmjs.com before installing.

---

### Authentication

**Recommended: Auth.js v5 (formerly NextAuth)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| next-auth | ^5.0.0 | Auth for both customers and admin | Native App Router support; session via JWT or DB; supports credentials + OAuth; self-hosted (no SaaS dependency or per-MAU cost) |
| @auth/drizzle-adapter | ~1.x | Drizzle session/user tables | Official adapter; generates auth tables in the same Postgres database |

**Why Auth.js v5 over Clerk:**
- Clerk is excellent DX but adds a per-MAU pricing dimension — for an ecommerce store where every customer is an auth user, this becomes a non-trivial cost at scale
- Auth.js v5 is fully self-hosted; no data leaves your database
- App Router compatibility is first-class in v5 (v4 had rough edges with App Router that are resolved)
- Guest checkout (a hard requirement from PROJECT.md) is easier to implement with a custom credentials flow than with Clerk's opinionated flows

**Guest checkout pattern:** Store cart/order in session without requiring account creation. Use Auth.js's `session` with JWT strategy — unauthenticated users get a session cookie; at order completion, optionally promote to a full account.

**Why not custom auth:** Rolling JWT issuance, password hashing, and session management correctly is high-risk and time-consuming. Auth.js handles this with a well-audited implementation.

**Admin auth:** Use the same Auth.js instance with a role field on the user table (`role: "admin" | "customer"`). Protect `/admin/*` routes via middleware checking the session role.

**Confidence: MEDIUM** — Auth.js v5 was in release candidate / recently stable as of mid-2025. Confirm the stable release version on npmjs.com. The Drizzle adapter version should be matched carefully to Auth.js v5.

---

### Payment Integration

**Recommended: Stripe (primary) + PayPal SDK (secondary) + manual bank transfer flow**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| stripe | ~17.x | Stripe Checkout / Payment Intents | Official Node SDK; server-side only in Route Handlers or Server Actions; webhook handling for async confirmation |
| @stripe/stripe-js | ~4.x | Stripe.js client for Elements | Required for PCI-compliant card collection in the browser |
| @paypal/react-paypal-js | ~8.x | PayPal Buttons component | Official React SDK; renders PayPal/Venmo buttons; handles PayPal order capture |

**Stripe integration pattern for Next.js App Router:**

Use **Payment Intents + Stripe Elements** (not Stripe Checkout redirect) for best UX on an embedded storefront:

1. Server Action or Route Handler: create `PaymentIntent` server-side with order amount
2. Return `client_secret` to the browser
3. Browser: use `@stripe/react-stripe-js` `<Elements>` + `<PaymentElement>` to collect card details — PCI-compliant because card data never touches your server
4. On confirm: call `stripe.confirmPayment()` client-side
5. Stripe webhook (`/api/webhooks/stripe`): listen for `payment_intent.succeeded` — only trust this event for order fulfillment, not the client-side return

**Why not Stripe Checkout (hosted page):** Redirect-to-stripe breaks the in-page checkout UX, and Checkout's customization is limited compared to Elements. Payment Intents + Elements keeps the user on your domain.

**PayPal integration pattern:**

Use `@paypal/react-paypal-js` `<PayPalButtons>` component. Create PayPal order server-side in a Route Handler (`/api/paypal/create-order`), capture server-side in a second Route Handler (`/api/paypal/capture-order`). Never trust client-side capture confirmation alone — always verify on the server.

**Bank transfer flow:**

No third-party SDK. This is a manual fulfillment flow:
1. Customer selects "Bank Transfer" at checkout
2. Order is created in DB with status `pending_payment`
3. Order confirmation email contains bank account details and order reference number
4. Admin marks order as `payment_received` manually in the admin panel
5. Fulfillment proceeds from there

**Feature flag pattern (from PROJECT.md requirement):**

```typescript
// lib/payment-config.ts
export const PAYMENT_METHODS = {
  stripe: process.env.ENABLE_STRIPE === 'true' && !!process.env.STRIPE_SECRET_KEY,
  paypal: process.env.ENABLE_PAYPAL === 'true' && !!process.env.PAYPAL_CLIENT_ID,
  bankTransfer: process.env.ENABLE_BANK_TRANSFER === 'true',
} as const;
```

Each method renders in checkout only when its flag is true. Admin can enable/disable without a code deploy.

**Confidence: MEDIUM** — Stripe SDK v17.x and PayPal React SDK v8.x are approximate. The integration patterns (Payment Intents, server-side capture) are stable and well-documented patterns unlikely to have changed significantly. Verify exact SDK versions on npm.

---

### Cart and State Management

**Recommended: Server-side cart stored in database, client-side optimistic updates via React state**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React `useState` / `useContext` | (React 19 built-in) | Client-side optimistic cart UI | Instant feedback on add/remove; no extra library |
| Zustand | ~5.x | Client cart state (optional, for complex UI) | Lightweight; no provider boilerplate; persists to localStorage for guest cart hydration |
| Server-side cart table in Postgres | — | Source of truth for cart | Survives browser refresh; required for guest-to-account cart merge at login |

**Recommended pattern:**

- Cart rows in DB: `carts` table with `session_id` (for guests) or `user_id` (for authenticated users)
- On page load, Server Component fetches cart from DB
- Client-side interactions (add/remove/update qty) hit Server Actions which write to DB and return updated cart
- Optimistic UI: use React 19's `useOptimistic` hook to show immediate feedback before the server action resolves
- At login, merge guest cart (by session_id) into user cart

**Why not cookie-only cart:** Cookie max size is 4KB; with multiple variants, this is easily exceeded. Cookies also make inventory reservation impossible.

**Why not Redux / Zustand as primary cart store:** Client-only state is lost on refresh for guest users and creates sync complexity. DB is the source of truth; client state is purely optimistic UI.

**React 19's `useOptimistic`** is the correct primitive here — it's built into React 19 (already in the scaffold) and designed exactly for Server Action + optimistic UI patterns.

**Confidence: HIGH** (pattern is well-established) / **MEDIUM** (Zustand version — verify on npm if needed)

---

### Image Handling

**Recommended: Next.js `next/image` + Vercel Blob (or Cloudinary)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `next/image` | (built-in Next.js 16) | Optimized image delivery | Automatic WebP/AVIF conversion, lazy loading, blur placeholders; already in scaffold |
| Vercel Blob | ~0.x | Product image storage | Native Vercel integration; S3-compatible API; direct upload from admin panel; CDN-served automatically |

**Why Vercel Blob over Cloudinary:**
- Zero additional account/credentials for a Vercel-deployed project
- Vercel Blob has a generous free tier (5GB storage, 100GB bandwidth/month as of 2024)
- Cloudinary adds transformation features (crop, resize on-the-fly) that `next/image` already covers for basic ecommerce use
- Cloudinary is the right answer if the store needs AI-based background removal or advanced transformation pipelines — not needed for v1

**Upload flow:**
1. Admin uploads product image via admin panel
2. Client requests a signed upload URL from a Route Handler
3. Client uploads directly to Vercel Blob (client-side direct upload, not proxied through Next.js server — avoids large payload through serverless function)
4. Route Handler saves the returned blob URL to the product record in Postgres

**`next/image` config for Vercel Blob:**

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
};
```

**Confidence: MEDIUM** — Vercel Blob product was generally available in 2024. Free tier limits should be re-verified at vercel.com/docs/storage/vercel-blob.

---

### Email (Order Confirmations)

**Recommended: Resend + React Email**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| resend | ~4.x | Email delivery API | Clean REST API; excellent Next.js integration; generous free tier (3,000 emails/month); designed for transactional email |
| @react-email/components | ~0.0.x | Email template components | Build email templates in React/JSX; renders to HTML + plain text; preview in browser during development |

**Why Resend over SendGrid/Mailgun:**
- Resend's Node SDK is simpler and has first-class Next.js/React examples
- React Email integration means templates are co-located in the codebase as `.tsx` files, not string templates or external editor tools
- Resend has better deliverability defaults for new senders vs needing to configure DKIM/SPF manually

**Why not Nodemailer:** Requires SMTP server configuration and does not have a developer-friendly templating story. Adds DevOps complexity (SMTP credentials, provider management) for no benefit over Resend.

**Usage pattern:**

```typescript
// app/api/orders/confirm/route.ts (or a Server Action post-purchase)
import { Resend } from 'resend';
import { OrderConfirmationEmail } from '@/emails/OrderConfirmation';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'orders@mandystore.com',
  to: customer.email,
  subject: `Order Confirmed — #${order.id}`,
  react: <OrderConfirmationEmail order={order} />,
});
```

**Confidence: MEDIUM** — Resend + React Email was the emerging standard for Next.js transactional email in 2024-2025. Verify `resend` package version on npm.

---

### Search and Filtering

**Recommended: Postgres full-text search (built-in) for v1; Algolia or Typesense for v2**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Postgres `tsvector` + `tsquery` | (Postgres 16 built-in) | Product name/description search | Zero additional service; sufficient for catalogs under ~10,000 SKUs; available immediately |
| Drizzle SQL operator for WHERE clauses | (Drizzle built-in) | Category/price/variant filtering | Filter queries are simple parameterized SQL; no search service needed |

**v1 search pattern:**

```sql
-- Postgres full-text search on product name + description
SELECT * FROM products
WHERE to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', $1)
  AND category = $2
  AND price BETWEEN $3 AND $4
ORDER BY ts_rank(...) DESC;
```

Add a generated column + GIN index on the tsvector column for performance:

```sql
ALTER TABLE products
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || coalesce(description, ''))) STORED;

CREATE INDEX products_search_idx ON products USING GIN (search_vector);
```

**Why not Algolia for v1:**
- Algolia is the right answer at scale (10K+ products, typo-tolerance, faceted search), but adds $50+/month and sync complexity (keeping Algolia index in sync with Postgres writes) before you have validated product-market fit
- Postgres FTS covers the realistic catalog size for a single-vendor electronics store in v1

**Why not a separate search microservice:** Overkill for v1. The store has one vendor — catalog size will be countable in hundreds to low thousands of SKUs.

**Filtering:** Use Drizzle's query builder to compose WHERE clauses dynamically from URL search params (category, price range, brand, variant attributes). Keep filter state in URL (searchParams), not client state, for shareability and SSR correctness.

**Confidence: HIGH** (Postgres FTS pattern is very well established) / **LOW** (Algolia/Typesense version numbers for v2 — research when needed)

---

### UI Component Library

**Recommended: shadcn/ui (not a dependency — it's a code generator)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| shadcn/ui | latest CLI | Accessible, unstyled UI primitives | Generates Radix UI + Tailwind components directly into your codebase; you own the code; pairs perfectly with Tailwind v4; no runtime dependency |
| Radix UI | (installed via shadcn) | Accessibility primitives | Headless, fully accessible; shadcn wraps these |

**Why shadcn over Chakra UI / MUI / Ant Design:**
- Those libraries impose their own styling system, which conflicts with Tailwind v4's utility-first approach
- shadcn components are Tailwind-native — no CSS specificity battles
- You own the generated code — no version-pinning to a UI library's breaking changes

**Note on Tailwind v4 compatibility:** shadcn/ui added Tailwind v4 support in late 2024. Verify you are using a recent shadcn CLI version (`npx shadcn@latest init`) that supports Tailwind v4.

**Confidence: MEDIUM** — shadcn + Tailwind v4 compatibility should be verified at ui.shadcn.com before initializing.

---

### Form Handling and Validation

**Recommended: React Hook Form + Zod**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| react-hook-form | ~7.x | Form state management | Minimal re-renders; uncontrolled inputs; built for complex checkout/address forms |
| zod | ~3.x | Schema validation | TypeScript-first; validate both client-side (pre-submission) and server-side (in Server Actions); share schemas between client and server |
| @hookform/resolvers | ~3.x | Connects Zod to RHF | Bridge package |

**Confidence: HIGH** — RHF + Zod is the dominant pattern in the Next.js ecosystem as of 2024-2025. Versions are approximate — verify on npm.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Database | PostgreSQL | MySQL | Equivalent, but ecosystem momentum favors Postgres with Next.js tooling |
| ORM | Drizzle ORM | Prisma v5 | Prisma needs connection pooler for Vercel serverless; larger bundle; codegen step |
| Auth | Auth.js v5 | Clerk | Clerk adds per-MAU cost; less control over guest checkout flow |
| Auth | Auth.js v5 | Lucia | Lucia deprecated its maintained library in 2024; community fork unclear |
| Email | Resend | SendGrid | SendGrid has complex setup; no React Email integration |
| Email | Resend | Nodemailer | Requires SMTP management; no hosted delivery |
| Images | Vercel Blob | Cloudinary | Cloudinary overkill for v1; extra credential surface |
| Images | Vercel Blob | AWS S3 | More infra to manage; no native Vercel integration |
| Search | Postgres FTS | Algolia | Algolia cost/complexity not warranted until catalog exceeds ~5K SKUs |
| Cart state | DB + `useOptimistic` | Redux | Redux is excessive for a simple cart; React 19 has built-in primitives |
| UI | shadcn/ui | MUI / Chakra | Conflicts with Tailwind v4; adds heavy runtime |

---

## Installation Reference

```bash
# Database / ORM
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Auth
npm install next-auth@beta @auth/drizzle-adapter

# Payments
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
npm install @paypal/react-paypal-js

# Email
npm install resend @react-email/components react-email

# Forms / Validation
npm install react-hook-form zod @hookform/resolvers

# UI (shadcn — run separately, not npm install)
npx shadcn@latest init
```

**IMPORTANT:** All versions above are approximations based on knowledge cutoff August 2025. Before running `npm install`, verify current stable versions on npmjs.com for: `drizzle-orm`, `drizzle-kit`, `next-auth` (v5 stable vs beta status), `stripe`, `@paypal/react-paypal-js`, `resend`, `react-hook-form`, `zod`.

---

## Node.js Upgrade Required

The scaffolded project requires Node.js >=20.9.0. Local environment has v18.17.0. This must be resolved before any `npm install` or development work. Recommended: use `nvm install 22 && nvm use 22` (Node 22 LTS).

---

## Confidence Summary

| Area | Confidence | Caveat |
|------|------------|--------|
| PostgreSQL choice | HIGH | Stable, well-established |
| Neon as managed host | MEDIUM | Pricing tiers should be verified |
| Drizzle ORM | MEDIUM | Rapid development; verify version on npm |
| Auth.js v5 | MEDIUM | v5 stable release status should be confirmed |
| Stripe Payment Intents pattern | MEDIUM | Pattern is stable; SDK version approximate |
| PayPal React SDK | LOW | SDK version unverified; confirm on npm and PayPal docs |
| Bank transfer flow (manual) | HIGH | No external SDK; pure application logic |
| Vercel Blob for images | MEDIUM | Confirm free tier limits at vercel.com/docs |
| Resend + React Email | MEDIUM | Verify package versions on npm |
| Postgres FTS for search | HIGH | Well-documented, battle-tested |
| shadcn/ui + Tailwind v4 | MEDIUM | Verify Tailwind v4 compat with current shadcn CLI |
| React Hook Form + Zod | HIGH | Dominant ecosystem pattern |

---

## Sources

All research for this document used training knowledge (cutoff August 2025). External documentation lookup tools (WebSearch, WebFetch, Context7 MCP, Bash/CLI) were unavailable in this environment. The following official sources should be consulted to verify versions and current recommendations before development begins:

- Drizzle ORM: https://orm.drizzle.team/docs/overview
- Auth.js v5: https://authjs.dev/getting-started
- Neon Postgres: https://neon.tech/docs
- Stripe Payment Intents: https://stripe.com/docs/payments/payment-intents
- Stripe Node SDK: https://github.com/stripe/stripe-node/releases
- PayPal React SDK: https://github.com/paypal/react-paypal-js
- Resend: https://resend.com/docs
- React Email: https://react.email/docs
- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- shadcn/ui: https://ui.shadcn.com/docs/installation/next
- React Hook Form: https://react-hook-form.com/get-started
- Zod: https://zod.dev
