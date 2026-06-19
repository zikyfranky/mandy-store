// src/app/page.tsx
// Storefront landing — replaces Next.js scaffold (D-07).
// Server Component; no searchParams (no query-param filtering on landing page).
// Zones: A (hero) | B (value props) | C (per-category product rails)
// cacheComponents: getCatalog calls wrapped in a Suspense-based inner component.

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { getCatalog } from "@/lib/catalog/queries"
import { ProductCard } from "@/components/catalog/ProductCard"
import type { CatalogCard } from "@/lib/catalog/queries"

export const metadata: Metadata = {
  title: "Mandy Store — Electronics, Watches & Phones",
  description: "Shop the best electronics, watches, and phones in Nigeria. Free delivery on orders over ₦50,000.",
}

// Rails shown on the landing page, in order.
const RAILS = [
  { title: "Latest Phones", slug: "phones" },
  { title: "Top Watches", slug: "watches" },
  { title: "New in Electronics", slug: "electronics" },
] as const

const VALUE_PROPS = [
  {
    title: "Free delivery",
    sub: "On orders over ₦50,000",
    path: "M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  },
  {
    title: "Secure checkout",
    sub: "Stripe, PayPal & bank transfer",
    path: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  },
  {
    title: "100% authentic",
    sub: "Genuine, warranty-backed",
    path: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.746 3.746 0 0 1 21 12Z",
  },
  {
    title: "Fast support",
    sub: "We're here to help",
    path: "M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
  },
]

function ProductRail({ title, slug, products }: { title: string; slug: string; products: CatalogCard[] }) {
  if (products.length === 0) return null
  return (
    <section aria-label={title} className="py-7 sm:py-9">
      <div className="flex items-end justify-between mb-5">
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <Link
          href={`/${slug}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors whitespace-nowrap"
        >
          View all
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>

      {/* Horizontal, swipeable rail */}
      <div className="no-scrollbar flex gap-4 sm:gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {products.map((product) => (
          <div key={product.id} className="snap-start shrink-0 w-40 sm:w-52">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  )
}

async function CategoryRails() {
  const results = await Promise.all(
    RAILS.map((rail) => getCatalog({ categorySlug: rail.slug, sort: "newest", page: 1 }))
  )

  const rails = RAILS.map((rail, i) => ({
    ...rail,
    products: results[i].products.slice(0, 8),
  }))

  if (rails.every((r) => r.products.length === 0)) {
    return (
      <div className="py-16 text-center text-zinc-500 dark:text-zinc-400">
        <p className="text-base">No products available yet. Check back soon!</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {rails.map((rail) => (
        <ProductRail key={rail.slug} title={rail.title} slug={rail.slug} products={rail.products} />
      ))}
    </div>
  )
}

function RailSkeleton() {
  return (
    <div className="py-7 sm:py-9">
      <div className="mb-5 h-7 w-44 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      <div className="flex gap-4 sm:gap-5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-40 sm:w-52 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131320] overflow-hidden" aria-hidden="true">
            <div className="aspect-square bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-5 w-20 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Zone A: Hero banner */}
      <section className="relative overflow-hidden" aria-label="Hero banner">
        <div className="hero-glow absolute inset-0" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur">
            ⚡ New arrivals just landed
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
            Tech that keeps up
            <span className="block bg-gradient-to-r from-amber-300 via-pink-200 to-white bg-clip-text text-transparent">
              with your life.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-base sm:text-lg text-indigo-100">
            Electronics, watches &amp; phones at the best prices in Nigeria —
            with free delivery on orders over ₦50,000.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm sm:text-base font-bold text-indigo-700 shadow-lg shadow-indigo-900/30 transition-transform hover:scale-[1.03] active:scale-95"
            >
              Shop all products
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <Link
              href="/phones"
              className="inline-flex items-center rounded-full bg-white/10 px-6 py-3.5 text-sm sm:text-base font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur transition-colors hover:bg-white/20"
            >
              Browse phones
            </Link>
          </div>
        </div>
      </section>

      {/* Value-prop strip */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c16]" aria-label="Why shop with us">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 divide-x divide-zinc-200 dark:divide-zinc-800">
          {VALUE_PROPS.map((vp) => (
            <div key={vp.title} className="flex items-center gap-3 px-2 py-5 sm:px-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d={vp.path} />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{vp.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{vp.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Zone C: Per-category product rails */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Suspense
          fallback={
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <RailSkeleton />
              <RailSkeleton />
            </div>
          }
        >
          <CategoryRails />
        </Suspense>

        <div className="mt-10 flex justify-center">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-indigo-600/25 transition-transform hover:scale-[1.03] active:scale-95"
          >
            Browse all products
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  )
}
