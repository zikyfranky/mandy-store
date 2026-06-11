# Phase 2: Product Catalog - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 29 new/modified files
**Analogs found:** 29 / 29 (all files have at least a role-match or data-flow analog in the codebase)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` | model | CRUD | `src/lib/db/schema.ts` (self — extend) | exact |
| `src/lib/db/client.ts` | config | request-response | `src/lib/db/client.ts` (self — no change needed) | exact |
| `src/scripts/seed-catalog.ts` | utility | batch | `src/scripts/seed.ts` | exact |
| `src/scripts/load-env.ts` | utility | config | `src/scripts/load-env.ts` (self — no change needed) | exact |
| `src/lib/catalog/queries.ts` | service | CRUD | `src/lib/dal.ts` + `src/lib/actions/auth.ts` | role-match |
| `src/lib/catalog/format.ts` | utility | transform | `src/lib/actions/auth.ts` (helper function pattern) | partial-match |
| `src/lib/utils/slug.ts` | utility | transform | `src/scripts/seed.ts` (usernameFromEmail helper) | partial-match |
| `src/app/page.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | role-match |
| `src/app/[categorySlug]/page.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | exact |
| `src/app/products/[slug]/page.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | exact |
| `src/app/products/page.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | role-match |
| `src/app/search/page.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | role-match |
| `src/app/layout.tsx` | component | request-response | `src/app/layout.tsx` (self — update) | exact |
| `src/app/globals.css` | config | — | `src/app/globals.css` (self — extend) | exact |
| `next.config.ts` | config | — | `next.config.ts` (self — extend) | exact |
| `src/components/layout/SiteHeader.tsx` | component | request-response | `src/app/layout.tsx` | role-match |
| `src/components/catalog/SearchBar.tsx` | component | event-driven | `src/components/auth/LoginForm.tsx` | role-match |
| `src/components/catalog/ProductCard.tsx` | component | request-response | `src/components/auth/LoginForm.tsx` (Server variant) | partial-match |
| `src/components/catalog/ProductGrid.tsx` | component | request-response | `src/components/auth/LoginForm.tsx` (Server variant) | partial-match |
| `src/components/catalog/ProductFilters.tsx` | component | event-driven | `src/components/auth/LoginForm.tsx` | role-match |
| `src/components/catalog/SortSelect.tsx` | component | event-driven | `src/components/auth/LoginForm.tsx` | role-match |
| `src/components/catalog/Pagination.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | role-match |
| `src/components/catalog/EmptyState.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` (error branch) | role-match |
| `src/components/catalog/CategoryCard.tsx` | component | request-response | `src/components/auth/LoginForm.tsx` (Server variant) | partial-match |
| `src/components/product/VariantSelector.tsx` | component | event-driven | `src/components/auth/LoginForm.tsx` | role-match |
| `src/components/product/ProductGallery.tsx` | component | event-driven | `src/components/auth/LoginForm.tsx` | role-match |
| `src/components/product/StockIndicator.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` (conditional render) | role-match |
| `src/components/product/VariantSkeleton.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` | role-match |
| `src/components/product/VariantError.tsx` | component | request-response | `src/app/(auth)/verify-email/page.tsx` (error branch) | role-match |
| `tests/helpers/db.ts` | test | batch | `tests/helpers/db.ts` (self — extend) | exact |
| `tests/catalog/schema.test.ts` | test | CRUD | `tests/db/schema.test.ts` | exact |
| `tests/catalog/queries.test.ts` | test | CRUD | `tests/auth/register.test.ts` | exact |
| `tests/catalog/variant-resolver.test.ts` | test | transform | `tests/db/schema.test.ts` (static/unit section) | role-match |

---

## Pattern Assignments

### `src/lib/db/schema.ts` (model, CRUD) — EXTEND

**Analog:** `src/lib/db/schema.ts` lines 1–91 (the file itself — add to it)

**Imports pattern** (lines 1–8 of existing file — ADD to the import list):
```typescript
import {
  pgTable, pgEnum, text, timestamp, integer,
  primaryKey, unique
} from "drizzle-orm/pg-core"
// ADD for Phase 2:
import { boolean, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
```

**Existing pgTable pattern to copy** (lines 28–40, users table):
```typescript
// Pattern: text("id").primaryKey() — crypto.randomUUID() for all IDs
// Pattern: timestamp("created_at", { mode: "date" }).defaultNow().notNull()
// Pattern: .references(() => otherTable.id, { onDelete: "cascade" }) for FK
export const users = pgTable("user", {
  id:            text("id").primaryKey(),
  email:         text("email").unique().notNull(),
  // ...
})
```

**Existing unique constraint pattern to copy** (lines 84–91, processedWebhookEvents):
```typescript
// Named unique: unique("constraint_name").on(table.column)
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: text("id").primaryKey(),
  // ...
}, (table) => ({
  eventIdUnique: unique("processed_webhook_events_id_unique").on(table.id),
}))
```

**Existing compound primaryKey pattern to copy** (lines 42–60, accounts table):
```typescript
// Compound primary key in the extra config callback
export const accounts = pgTable(
  "account",
  { /* columns */ },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
)
```

**New tables to append (Phase 2 additions follow RESEARCH.md Pattern 1 exactly).** Key conventions from the existing schema to honor:
- Table name strings use singular snake_case: `"user"`, not `"users"` — use `"brand"`, `"category"`, `"product"`, etc.
- All IDs are `text("id").primaryKey()` (UUID via `crypto.randomUUID()`)
- All timestamps use `{ mode: "date" }`
- `relations()` definitions go directly after their table export (see no existing relations yet — Phase 2 establishes the pattern)

---

### `src/scripts/seed-catalog.ts` (utility, batch)

**Analog:** `src/scripts/seed.ts` lines 1–119

**Entry-point pattern** (lines 1–11):
```typescript
import "@/scripts/load-env" // MUST be first — populates .env.local before db client reads DATABASE_URL
import { db } from "@/lib/db/client"
import { users } from "@/lib/db/schema"
// ...other imports
```

**Idempotent upsert pattern** (lines 47–60 — check-then-insert):
```typescript
const existing = await db.query.users.findFirst({
  where: eq(users.email, email),
})

if (existing) {
  // update instead of insert
  await db.update(users).set({ role: "admin" }).where(eq(users.email, email))
  console.log(`  ✓ Updated existing user ${email}`)
} else {
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    // ...
  })
  console.log(`  ✓ Created ...`)
}
```

**Script entry point pattern** (lines 112–119):
```typescript
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
```

**Key conventions for `seed-catalog.ts`:**
- `import "@/scripts/load-env"` must be line 1
- IDs via `crypto.randomUUID()` (consistent with existing `users` table)
- Console output pattern: `console.log(`  ✓ Created ...`)` with 2-space indent and checkmark
- For catalog seed, use `db.insert(...).onConflictDoNothing()` (simpler than check-then-insert for bulk data) OR the check pattern above — either is acceptable; `onConflictDoNothing()` preferred for catalog data that changes less often
- Add `"seed:catalog": "tsx src/scripts/seed-catalog.ts"` to `package.json` scripts

---

### `src/lib/catalog/queries.ts` (service, CRUD)

**Analog:** `src/lib/dal.ts` lines 1–60 and `src/lib/actions/auth.ts` lines 7–13 (imports pattern)

**Server-only guard pattern** (dal.ts line 1):
```typescript
import "server-only"
// This causes a build-time error if imported in a Client Component
```

**DB client import pattern** (actions/auth.ts lines 7–8):
```typescript
import { db } from "@/lib/db/client"
import { users, verificationTokens } from "@/lib/db/schema"
```

**Drizzle query pattern — relational API** (actions/auth.ts lines 47–49):
```typescript
const existing = await db.query.users.findFirst({
  where: eq(users.email, email),
})
```

**Drizzle query pattern — conditional where** (actions/auth.ts lines 119–129):
```typescript
import { eq, and } from "drizzle-orm"

const tokenRow = await db.query.verificationTokens.findFirst({
  where: and(
    eq(verificationTokens.identifier, email),
    eq(verificationTokens.token, token),
  ),
})
```

**For `queries.ts`, apply `import "server-only"` at line 1** (same as `dal.ts`) because catalog queries run only on the server — this is the structural guard preventing accidental client bundle inclusion.

---

### `src/lib/catalog/format.ts` (utility, transform)

**Analog:** helper functions in `src/scripts/seed.ts` lines 19–37 (pure function pattern)

**Pure-function helper pattern** (seed.ts lines 19–25):
```typescript
function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "admin"
  return local
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 30)
}
```

**No analog for `Intl.NumberFormat` in codebase** — use RESEARCH.md Pattern 6 directly:
```typescript
// src/lib/catalog/format.ts
export function formatNGN(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100)
  // 1500000 → "₦15,000.00"
}
```

This file has no `"use server"` or `"server-only"` — it is a pure utility safe in both environments.

---

### `src/lib/utils/slug.ts` (utility, transform)

**Analog:** `src/scripts/seed.ts` lines 29–36 (`usernameFromEmail` collision-handling pattern):
```typescript
// Collision detection in seed.ts (lines 72–75):
const existingUsername = await db.query.users.findFirst({
  where: eq(users.username, username),
})
const finalUsername = existingUsername ? `${username}_admin` : username
```

**Apply the same collision-increment pattern** for slugs (RESEARCH.md Pattern 7). No codebase analog for `slugify` — use RESEARCH.md directly. This file is seed-script-only, no server-only guard needed.

---

### `src/app/page.tsx` (component, request-response) — REPLACE

**Analog:** `src/app/(auth)/verify-email/page.tsx` lines 1–71

**Server Component default-export page pattern** (verify-email/page.tsx lines 12–71):
```typescript
// No "use client" — Server Component by default
import Link from "next/link"

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  // Server-side data fetching inline
  // Conditional rendering for states
  return (
    <div className="...">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        ...
      </h1>
    </div>
  )
}
```

**`generateMetadata` pattern** — no existing codebase analog; use RESEARCH.md Pattern 5:
```typescript
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mandy Store — Electronics, Watches & Phones",
}
```

The home page replaces the current Next.js scaffold `src/app/page.tsx`. It is a Server Component with no `searchParams` (no query-param filtering on the landing page). It renders three zones: hero banner, category cards, and featured product grid.

---

### `src/app/[categorySlug]/page.tsx` (component, request-response)

**Analog:** `src/app/(auth)/verify-email/page.tsx` lines 1–71 (async searchParams pattern)

**Async searchParams pattern — the critical Next.js 16 pattern** (verify-email/page.tsx lines 9–16):
```typescript
interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, email } = await searchParams  // MUST await — Next.js 16 enforced
```

**Async params pattern** — same shape, applied to dynamic segments:
```typescript
// For [categorySlug]/page.tsx:
interface CategoryPageProps {
  params: Promise<{ categorySlug: string }>        // async params — Next.js 16
  searchParams: Promise<{                           // async searchParams — Next.js 16
    q?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    sort?: string
    page?: string
  }>
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { categorySlug } = await params            // MUST await
  const sp = await searchParams                    // MUST await
```

**`notFound()` pattern** — no existing codebase analog for import, but `notFound()` from `next/navigation` is used:
```typescript
import { notFound } from "next/navigation"
// if (!category) notFound()
```

**Link pattern** (verify-email/page.tsx line 6 + LoginForm line 9):
```typescript
import Link from "next/link"
// <Link href="/account/login">Back to sign in</Link>
```

---

### `src/app/products/[slug]/page.tsx` (component, request-response)

**Analog:** `src/app/(auth)/verify-email/page.tsx` (async params + conditional render) + RESEARCH.md Pattern 2 (split caching)

**Async params pattern** (same as above — `const { slug } = await params`).

**`generateMetadata` with async params** — use RESEARCH.md Pattern 5. The key insight: `generateMetadata` receives the same `params` Promise as the page, must also `await params`.

**`<Suspense>` boundary pattern** — no existing codebase analog. This is a new pattern for Phase 2. Use RESEARCH.md Pattern 2 exactly:
```typescript
import { Suspense } from "react"
// Wrap the stock/price component (no 'use cache') in Suspense
// The product content component gets 'use cache' + cacheLife('hours')
```

**`use cache` directive** — no existing codebase analog. Requires `cacheComponents: true` in `next.config.ts` first. Follow RESEARCH.md Pattern 2.

---

### `src/app/products/page.tsx` and `src/app/search/page.tsx` (component, request-response)

**Analog:** `src/app/(auth)/verify-email/page.tsx` (async searchParams pattern)

Both are Server Components that `await searchParams` and pass results to the shared query functions in `src/lib/catalog/queries.ts`. Same async searchParams shape as `[categorySlug]/page.tsx` minus the `params` (no dynamic segment). Search page uses `?q=` param; all-products page uses brand/price/sort/page params without category filtering.

---

### `src/app/layout.tsx` (component, request-response) — UPDATE

**Analog:** `src/app/layout.tsx` lines 1–33 (the file itself)

**Current layout pattern to preserve** (lines 1–33):
```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
```

**Add `metadataBase`** to the metadata export (required for canonical URLs — RESEARCH.md Pattern 5):
```typescript
export const metadata: Metadata = {
  title: "Mandy Store",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://mandy-store.vercel.app"),
}
```

**Add `<SiteHeader>` inside `<body>`** before `{children}`. `SiteHeader` is a Server Component that contains the `SearchBar` Client island — no `"use client"` needed on the layout itself.

---

### `src/app/globals.css` (config) — EXTEND

**Analog:** `src/app/globals.css` lines 1–26 (the file itself)

**Existing token pattern to extend** (lines 3–13):
```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

**Add Phase 2 tokens after the existing `:root` block** per UI-SPEC.md §CSS Custom Property Additions. Follow the exact same pattern: declare in `:root`, add to `@theme inline`, add dark overrides in `@media (prefers-color-scheme: dark)`.

---

### `next.config.ts` (config) — UPDATE

**Analog:** `next.config.ts` lines 1–6 (the file itself — minimal, needs extending)

**Current config** (self):
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /* config options here */
};
export default nextConfig;
```

**Add two keys** (RESEARCH.md Patterns 2 and 8):
```typescript
const nextConfig: NextConfig = {
  cacheComponents: true,          // REQUIRED for 'use cache' directive — RESEARCH.md Pattern 2
  images: {
    remotePatterns: [             // REQUIRED for next/image with external URLs — RESEARCH.md Pattern 8
      { protocol: "https", hostname: "picsum.photos" },
      // Add other seeded image hosts as needed
    ],
  },
}
```

`images.domains` is deprecated in Next.js 16 — use `remotePatterns` only.

---

### `src/components/layout/SiteHeader.tsx` (component, request-response)

**Analog:** `src/app/layout.tsx` (Server Component shell) + `src/components/auth/LoginForm.tsx` lines 1–9 (client island import pattern)

This is a Server Component that imports the `SearchBar` Client island. Pattern: Server Components can import and render Client Components directly — the `"use client"` boundary is on `SearchBar.tsx`, not on `SiteHeader.tsx`.

**No-directive Server Component pattern** (layout.tsx):
```typescript
// No "use client" at top — Server Component by default
import Link from "next/link"
import { SearchBar } from "@/components/catalog/SearchBar"  // Client island

export function SiteHeader() {
  return (
    <header className="h-16 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      {/* ... */}
    </header>
  )
}
```

**Tailwind v4 class pattern** (layout.tsx line 28 + LoginForm.tsx lines 46–48):
```typescript
className="h-full antialiased"                     // layout.tsx
className="w-full rounded-lg border border-gray-300 dark:border-gray-700 ..."  // LoginForm.tsx
```

---

### `src/components/catalog/SearchBar.tsx` (component, event-driven) — CLIENT

**Analog:** `src/components/auth/LoginForm.tsx` lines 1–95

**Client Component directive pattern** (LoginForm.tsx line 1):
```typescript
"use client"
```

**`useActionState` / state hook pattern** (LoginForm.tsx lines 7–23):
```typescript
import { useActionState } from "react"

const [state, formAction, isPending] = useActionState<LoginState, FormData>(
  async (_prev, formData) => { /* ... */ },
  null,
)
```

`SearchBar` uses `useRouter` from `next/navigation` instead of `useActionState` — but the `"use client"` directive and import-at-top pattern are identical.

**Input field with focus ring pattern** (LoginForm.tsx lines 46–48):
```typescript
className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
           px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

For `SearchBar`, adapt to `rounded-full` per UI-SPEC.md and use `role="search"` on the wrapping `<form>`.

---

### `src/components/catalog/ProductFilters.tsx` (component, event-driven) — SERVER + CLIENT ISLAND

**Analog:** `src/components/auth/RegisterForm.tsx` lines 1–157 (form with multiple inputs)

**Client island for URL mutation** — the drawer trigger button and checkbox change handlers need `"use client"`. The sidebar container can be Server (static structure) with the interactive parts as Client islands.

**`router.push` for URL-param updates** — no existing analog in the codebase. Established pattern from Next.js docs; use `useRouter` from `next/navigation`:
```typescript
"use client"
import { useRouter, useSearchParams } from "next/navigation"

// On checkbox change:
const router = useRouter()
const params = new URLSearchParams(searchParams.toString())
params.set("brand", value)
router.push(`?${params.toString()}`)
```

**Checkbox input pattern** (RegisterForm.tsx lines 59–70 — input styling to adapt):
```typescript
className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
           px-3 py-2 text-sm ..."
```

**Disabled/loading state pattern** (LoginForm.tsx lines 75–82 — `disabled` + `opacity`):
```typescript
disabled={isPending}
className="... disabled:opacity-60 ..."
```

---

### `src/components/catalog/SortSelect.tsx` (component, event-driven) — CLIENT

**Analog:** `src/components/auth/LoginForm.tsx` lines 1–95 (`"use client"` + event handler)

```typescript
"use client"
import { useRouter, useSearchParams } from "next/navigation"

export function SortSelect({ currentSort }: { currentSort: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort", e.target.value)
    router.push(`?${params.toString()}`)
  }

  return (
    <select
      onChange={handleChange}
      defaultValue={currentSort}
      className="text-sm rounded-lg border border-zinc-300 px-3 py-2"
    >
      {/* options */}
    </select>
  )
}
```

---

### `src/components/catalog/Pagination.tsx` (component, request-response) — SERVER

**Analog:** `src/app/(auth)/verify-email/page.tsx` lines 23–33 (`<Link>` usage)

```typescript
// verify-email/page.tsx lines 23-33:
<Link
  href="/account/login"
  className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
>
  Back to sign in
</Link>
```

**Server Component with Link-based pagination** — each page button is a `<Link href="?page=N">`. No `"use client"` needed; `<Link>` is available in Server Components. Wrap in `<nav aria-label="Pagination">`.

---

### `src/components/catalog/EmptyState.tsx` (component, request-response) — SERVER

**Analog:** `src/app/(auth)/verify-email/page.tsx` lines 15–33 (error state with Link recovery)

```typescript
// verify-email/page.tsx lines 15-33 — error branch pattern:
return (
  <div className="text-center">
    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
      Invalid verification link
    </h1>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">...</p>
    <Link href="/account/login" className="text-sm font-medium text-blue-600 hover:text-blue-700 ...">
      Back to sign in
    </Link>
  </div>
)
```

EmptyState follows the same centered-div + heading + body + recovery Link pattern. The "Clear filters" link navigates to the current route without query params.

---

### `src/components/catalog/ProductCard.tsx` (component, request-response) — SERVER

**Analog:** `src/app/(auth)/verify-email/page.tsx` (Server Component shell) + `src/components/auth/LoginForm.tsx` (Tailwind class patterns)

**Server Component card** — no `"use client"`. Entire card wrapped in `<Link href={/products/${product.slug}}>`.

**Tailwind class style** (LoginForm.tsx lines 46–48 — border, rounded, dark variants):
```typescript
className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 ..."
```

Adapt for ProductCard: `rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-md transition-shadow`.

**`next/image` usage** — no existing codebase analog. Use `<Image>` from `next/image` with `fill` or explicit `width`/`height`. Requires `remotePatterns` in `next.config.ts` (already documented above).

---

### `src/components/product/VariantSelector.tsx` (component, event-driven) — CLIENT

**Analog:** `src/components/auth/LoginForm.tsx` lines 1–95

**Client Component pattern** (LoginForm.tsx lines 1–23):
```typescript
"use client"
import { useActionState } from "react"
// ... state initialization
const [state, formAction, isPending] = useActionState<LoginState, FormData>(...)
```

For `VariantSelector`, use `useState` instead of `useActionState`:
```typescript
"use client"
import { useState } from "react"

export function VariantSelector({ options, variants, lowStockThreshold = 5 }: Props) {
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(options.map(o => [o.name, o.values[0]?.id ?? ""]))
  )
  // resolvedVariant = variants.find(...) derived from selected
```

**Button disabled pattern** (LoginForm.tsx lines 75–82):
```typescript
<button
  type="submit"
  disabled={isPending}
  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 ..."
>
```

Apply `disabled` to OOS variant pills and to the Add-to-cart CTA when `resolvedVariant.stock === 0`.

**`aria-live` pattern** — no existing codebase analog. Add to price and stock indicator elements per UI-SPEC.md accessibility contracts:
```typescript
<span aria-live="polite">{formatNGN(resolvedVariant.priceKobo)}</span>
```

---

### `src/components/product/ProductGallery.tsx` (component, event-driven) — CLIENT

**Analog:** `src/components/auth/LoginForm.tsx` lines 1–23 (`"use client"` + `useState`)

```typescript
"use client"
import { useState } from "react"
import Image from "next/image"

export function ProductGallery({ images, variantImageUrl }: Props) {
  const [mainImage, setMainImage] = useState(images[0]?.url ?? "")

  // Derive: if variantImageUrl is set, override mainImage
  const displayImage = variantImageUrl ?? mainImage
```

Use `useEffect` to sync `variantImageUrl` prop changes to internal state — or pass `variantImageUrl` as a controlled prop and derive display image inline (no local state needed for the swap behavior):
```typescript
// Simpler: controlled approach — no local mainImage state needed for variant swap
// variantImageUrl is passed down from VariantSelector (lift state to parent or use prop drilling)
```

---

### `src/components/product/StockIndicator.tsx` (component, request-response)

**Analog:** `src/app/(auth)/verify-email/page.tsx` lines 37–68 (conditional branch rendering)

```typescript
// verify-email/page.tsx lines 37-44 — conditional rendering pattern:
if ("error" in result) {
  return (
    <p className="text-sm text-red-600 dark:text-red-400 mb-6">{result.error}</p>
  )
}
```

`StockIndicator` has three conditional branches (in-stock / low-stock / out-of-stock), exactly like verify-email's three render branches. It can be a simple pure function component (no hooks, no state) — if rendered inside `VariantSelector` (which is `"use client"`), it inherits that context automatically.

---

### `src/components/product/VariantSkeleton.tsx` and `VariantError.tsx` (component, request-response)

**Analog:** `src/app/(auth)/verify-email/page.tsx` error branch (lines 36–50)

Both are simple Server Components (no directive needed). `VariantSkeleton` renders pulse-animated placeholder divs (per UI-SPEC.md §4). `VariantError` renders the "Availability unavailable — refresh to retry" text per UI-SPEC.md. Same pattern as the verify-email error branch but simpler (no Link, no interactive elements).

---

### `tests/helpers/db.ts` (test, batch) — EXTEND

**Analog:** `tests/helpers/db.ts` lines 1–42 (the file itself)

**Existing truncation pattern** (lines 28–42):
```typescript
export async function truncateAuthTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }

  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Delete in FK-safe order: child tables first
  await db.delete(schema.sessions)
  await db.delete(schema.accounts)
  await db.delete(schema.verificationTokens)
  await db.delete(schema.processedWebhookEvents)
  await db.delete(schema.users)
}
```

**Add `truncateCatalogTables()`** following the exact same pattern. FK-safe deletion order from RESEARCH.md validation architecture:
```typescript
// FK-safe order for catalog tables (add after the existing truncateAuthTables):
export async function truncateCatalogTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.variantOptionValues)
  await db.delete(schema.variants)
  await db.delete(schema.optionValues)
  await db.delete(schema.productOptions)
  await db.delete(schema.productImages)
  await db.delete(schema.products)
  await db.delete(schema.brands)
  await db.delete(schema.categories)
}
```

---

### `tests/catalog/schema.test.ts` (test, CRUD)

**Analog:** `tests/db/schema.test.ts` lines 1–77

**Static schema test pattern** (schema.test.ts lines 6–25):
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { orderStatusEnum, processedWebhookEvents } from "@/lib/db/schema"
import { hasDatabase, truncateAuthTables } from "../helpers/db"

// Static test (no DB needed):
describe("orderStatusEnum", () => {
  it("has exactly 8 canonical values in the correct order", () => {
    expect(orderStatusEnum.enumValues).toEqual([...])
  })
})
```

**Integration test with beforeEach/afterEach truncation** (schema.test.ts lines 51–77):
```typescript
describe.skipIf(!hasDatabase)("processedWebhookEvents unique constraint (integration)", () => {
  beforeEach(async () => {
    await truncateAuthTables()
  })

  afterEach(async () => {
    await truncateAuthTables()
  })

  it("rejects inserting the same event ID twice with a unique violation", async () => {
    const { getDb } = await import("../helpers/db")
    const db = await getDb()
    // ...
  })
})
```

Apply same structure for `tests/catalog/schema.test.ts`: static tests for table exports (no DB), integration tests for seed round-trip. Use `truncateCatalogTables()` from extended `tests/helpers/db.ts`.

---

### `tests/catalog/queries.test.ts` (test, CRUD)

**Analog:** `tests/auth/register.test.ts` lines 1–207

**Integration test structure** (register.test.ts lines 1–32):
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables } from "../helpers/db"

vi.mock("server-only", () => ({}))   // IMPORTANT: mock server-only in test env

const skip = !hasDatabase

describe("register()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("creates a new user with ...", async () => {
    const { register } = await import("@/lib/actions/auth")
    const { getDb } = await import("../helpers/db")
    // ... assertions
  })
})
```

**For `queries.test.ts`:** replace `truncateAuthTables()` with `truncateCatalogTables()`. Mock `server-only` the same way. The `vi.mock("server-only", () => ({}))` is critical — without it, Vitest will throw because `server-only` is a Next.js runtime guard that doesn't exist in Node.

**Lazy import pattern** (register.test.ts line 37):
```typescript
const { register } = await import("@/lib/actions/auth")  // lazy — avoids circular eval
```

Use the same lazy dynamic import for `queries.ts` functions inside each `it` block.

---

### `tests/catalog/variant-resolver.test.ts` (test, transform)

**Analog:** `tests/db/schema.test.ts` lines 1–25 (static/unit section — no DB needed)

```typescript
// Pure unit tests — no hasDatabase guard needed, no DB import
import { describe, it, expect } from "vitest"

describe("resolveVariant()", () => {
  it("returns the variant matching all selected option values", () => {
    const variants = [/* fixture data */]
    const selected = { Color: "optionValueId-black", Storage: "optionValueId-128gb" }
    const result = resolveVariant(variants, selected)
    expect(result?.sku).toBe("SKU-001")
  })
})
```

These are pure logic tests with no DB or Next.js runtime dependencies. No `vi.mock` needed. The variant resolution algorithm from RESEARCH.md Pattern 3 (`variants.find(v => Object.values(selected).every(valId => v.optionValues.some(...)))`) should be extracted into a standalone function in `src/lib/catalog/queries.ts` (or a separate `src/lib/catalog/variant.ts`) so it can be unit-tested without DB setup.

---

## Shared Patterns

### Client Component Directive
**Source:** `src/components/auth/LoginForm.tsx` line 1
**Apply to:** All `"use client"` files: `SearchBar.tsx`, `SortSelect.tsx`, `VariantSelector.tsx`, `ProductGallery.tsx`, `ProductFilters.tsx` (drawer trigger portion)
```typescript
"use client"
```

### Server-Only Guard
**Source:** `src/lib/dal.ts` line 1
**Apply to:** `src/lib/catalog/queries.ts` (catalog data access layer)
```typescript
import "server-only"
```

### DB Client Import
**Source:** `src/lib/actions/auth.ts` lines 7–8
**Apply to:** `src/lib/catalog/queries.ts`, `src/scripts/seed-catalog.ts`
```typescript
import { db } from "@/lib/db/client"
import { /* table names */ } from "@/lib/db/schema"
```

### Load-Env First Import
**Source:** `src/scripts/seed.ts` line 6
**Apply to:** `src/scripts/seed-catalog.ts` line 1 (MUST be first import)
```typescript
import "@/scripts/load-env"
```

### Async Params / searchParams (Next.js 16)
**Source:** `src/app/(auth)/verify-email/page.tsx` lines 9–15
**Apply to:** ALL page components: `[categorySlug]/page.tsx`, `products/[slug]/page.tsx`, `products/page.tsx`, `search/page.tsx`
```typescript
interface PageProps {
  searchParams: Promise<{ /* ... */ }>
  params: Promise<{ /* ... */ }>        // only if dynamic segment
}

export default async function Page({ searchParams, params }: PageProps) {
  const sp = await searchParams         // MUST await — Next.js 16 enforced
  const { slug } = await params         // MUST await
```

### Tailwind v4 Input Styling
**Source:** `src/components/auth/LoginForm.tsx` lines 46–48
**Apply to:** `SearchBar.tsx` input, `ProductFilters.tsx` price inputs
```typescript
className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
           px-3 py-2 text-sm text-gray-900 dark:text-gray-100
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

### Tailwind v4 Primary Button
**Source:** `src/components/auth/LoginForm.tsx` lines 75–82
**Apply to:** `VariantSelector.tsx` Add-to-cart CTA, `ProductFilters.tsx` "Apply filters" button
```typescript
className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors"
```

### Link Component for Internal Navigation
**Source:** `src/app/(auth)/verify-email/page.tsx` lines 23–31 + `src/components/auth/LoginForm.tsx` lines 85–91
**Apply to:** All catalog navigation — `ProductCard.tsx` (card link), `Pagination.tsx` (page links), `EmptyState.tsx` (recovery link), `SiteHeader.tsx` (nav links)
```typescript
import Link from "next/link"
// <Link href="/products/some-slug">...</Link>
// Never use <a> for internal links — use Link for prefetching + client-side nav
```

### UUID for IDs in Seed
**Source:** `src/scripts/seed.ts` line 77
**Apply to:** `src/scripts/seed-catalog.ts` — all entity IDs
```typescript
id: crypto.randomUUID(),
```

### Vitest server-only Mock
**Source:** `tests/auth/register.test.ts` lines 13–14
**Apply to:** `tests/catalog/queries.test.ts`
```typescript
vi.mock("server-only", () => ({}))
```

### Vitest hasDatabase + it.skipIf
**Source:** `tests/auth/register.test.ts` lines 24–31
**Apply to:** `tests/catalog/schema.test.ts` (integration section), `tests/catalog/queries.test.ts`
```typescript
const skip = !hasDatabase

describe("...", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateCatalogTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("...", async () => { /* ... */ })
})
```

### Drizzle Relational Query API
**Source:** `src/lib/actions/auth.ts` lines 47–49 + `src/scripts/seed.ts` lines 47–49
**Apply to:** `src/lib/catalog/queries.ts`
```typescript
const row = await db.query.tableName.findFirst({
  where: (t, { eq }) => eq(t.column, value),
  with: { relatedTable: true },
})
```

---

## No Analog Found

All files have at least a partial analog. The following patterns have no existing codebase implementation and must use RESEARCH.md patterns directly:

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `'use cache'` directive + `cacheLife()` | component | request-response | No caching directives exist yet; follow RESEARCH.md Pattern 2 |
| `generateMetadata` + `alternates.canonical` | component | request-response | No `generateMetadata` in codebase yet; follow RESEARCH.md Pattern 5 |
| JSON-LD `<script>` injection | component | request-response | No structured data anywhere; follow RESEARCH.md Pattern 5 + XSS mitigation |
| `next/image` `<Image>` component | component | request-response | Not used anywhere yet; must add `remotePatterns` to `next.config.ts` first |
| `useRouter().push` for URL-param updates | component | event-driven | No `useRouter` usage in codebase yet; follow Next.js docs pattern |
| `generateStaticParams` | component | batch | No static params generation yet; follow RESEARCH.md Code Examples |
| Drizzle `ilike`, `and`, `or`, `gte`, `lte` | service | CRUD | Only `eq` and `and` used so far; add `ilike`/filter operators per RESEARCH.md Pattern 4 |

---

## Metadata

**Analog search scope:** `src/`, `tests/`, `drizzle.config.ts`, `next.config.ts`, `package.json`
**Files scanned:** 14 source files read in full
**Pattern extraction date:** 2026-06-11
