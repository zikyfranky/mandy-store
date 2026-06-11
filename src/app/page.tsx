// src/app/page.tsx
// Storefront landing — replaces Next.js scaffold (D-07).
// Server Component; no searchParams (no query-param filtering on landing page).
// Zones: A (hero) | B (category entry points) | C (featured products grid)
// cacheComponents: getCatalog call wrapped in Suspense-based inner component.

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { getCatalog } from "@/lib/catalog/queries"
import { ProductCard } from "@/components/catalog/ProductCard"
import { CategoryCard } from "@/components/catalog/CategoryCard"

export const metadata: Metadata = {
  title: "Mandy Store — Electronics, Watches & Phones",
  description: "Shop the best electronics, watches, and phones in Nigeria. Free delivery on orders over ₦50,000.",
}

const CATEGORIES = [
  { name: "Electronics", slug: "electronics" },
  { name: "Watches", slug: "watches" },
  { name: "Phones", slug: "phones" },
]

async function FeaturedProducts() {
  const featured = await getCatalog({ sort: "newest", page: 1 })
  const featuredProducts = featured.products.slice(0, 8)

  if (featuredProducts.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
        <p className="text-base">No products available yet. Check back soon!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {featuredProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Zone A: Hero banner */}
      <section
        className="relative w-full h-56 sm:h-80 bg-zinc-900 flex items-center overflow-hidden"
        aria-label="Hero banner"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-900/40" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <h1 className="text-3xl font-semibold text-white leading-tight max-w-xl">
            Find the best in electronics, watches &amp; phones
          </h1>
          <p className="mt-3 text-base text-zinc-300 font-normal">
            Free delivery on orders over ₦50,000
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Zone B: Category entry points */}
        <section className="py-12" aria-label="Shop by category">
          <h2 className="sr-only">Shop by category</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {CATEGORIES.map((cat) => (
              <CategoryCard key={cat.slug} name={cat.name} slug={cat.slug} />
            ))}
          </div>
        </section>

        {/* Zone C: Featured products */}
        <section className="pb-16" aria-label="Featured products">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Featured Products
            </h2>
            <Link
              href="/products"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              View all products
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden" aria-hidden="true">
                    <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <FeaturedProducts />
          </Suspense>
        </section>
      </div>
    </main>
  )
}
