// src/app/products/page.tsx
// All-products listing page — Server Component (D-06).
// No category filter — shows all active products.
// Next.js 16: searchParams is a Promise — MUST await.
// cacheComponents: data-fetching inside Suspense-wrapped inner component.

import type { Metadata } from "next"
import { Suspense } from "react"
import { getCatalog, getBrandsForCategory } from "@/lib/catalog/queries"
import { parseCatalogParams } from "@/lib/validation/catalog-params"
import { ProductGrid } from "@/components/catalog/ProductGrid"
import { ProductFilters } from "@/components/catalog/ProductFilters"
import { SortSelect } from "@/components/catalog/SortSelect"
import { Pagination } from "@/components/catalog/Pagination"

export const metadata: Metadata = {
  title: "All Products — Yesbuy Store",
  description: "Browse all electronics, watches, and phones at Yesbuy Store.",
}

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    sort?: string
    page?: string
  }>
}

async function ProductsContent({ searchParams }: ProductsPageProps) {
  const sp = await searchParams
  const parsed = parseCatalogParams(sp)

  const [result, brands] = await Promise.all([
    getCatalog(parsed),
    getBrandsForCategory(),
  ])

  const hasActiveFilters = !!(parsed.q || parsed.brand || parsed.minPrice !== undefined || parsed.maxPrice !== undefined)

  const spString = new URLSearchParams(
    Object.fromEntries(
      Object.entries(sp).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-8">
        All Products
      </h1>

      <div className="flex gap-8">
        <ProductFilters
          brands={brands}
          currentBrand={parsed.brand}
          currentMinPrice={parsed.minPrice}
          currentMaxPrice={parsed.maxPrice}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {result.total} product{result.total !== 1 ? "s" : ""}
            </p>
            <SortSelect currentSort={parsed.sort} />
          </div>

          <ProductGrid
            products={result.products}
            hasFilters={hasActiveFilters}
            basePath="/products"
          />

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            searchParamsString={spString}
          />
        </div>
      </div>
    </div>
  )
}

export default function ProductsPage(props: ProductsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-8" aria-hidden="true" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden" aria-hidden="true">
                <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      }
    >
      <ProductsContent {...props} />
    </Suspense>
  )
}
