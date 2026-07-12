// src/app/search/page.tsx
// Search results page — Server Component (CATA-02, D-10).
// Awaits searchParams (Next.js 16); passes q to getCatalog as DB filter.
// T-02-05: q rendered ONLY as a React text node (auto-escaped) — never into attributes, URLs, or
// dangerouslySetInnerHTML. T-02-07: q is never used in a redirect target.
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
  title: "Search — YesBuy",
}

interface SearchPageProps {
  searchParams: Promise<{
    q?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    sort?: string
    page?: string
  }>
}

async function SearchContent({ searchParams }: SearchPageProps) {
  const sp = await searchParams
  const parsed = parseCatalogParams(sp)

  // Fetch data in parallel — q is passed as a parameterized DB filter (T-02-04)
  const [result, brands] = await Promise.all([
    getCatalog({ q: parsed.q, brand: parsed.brand, minPrice: parsed.minPrice, maxPrice: parsed.maxPrice, sort: parsed.sort, page: parsed.page }),
    getBrandsForCategory(),
  ])

  const hasActiveFilters = !!(parsed.brand || parsed.minPrice !== undefined || parsed.maxPrice !== undefined)

  const spString = new URLSearchParams(
    Object.fromEntries(
      Object.entries(sp).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString()

  // T-02-05: {parsed.q} is auto-escaped as React text node only
  const heading = parsed.q
    ? result.total > 0
      ? `${result.total} result${result.total !== 1 ? "s" : ""} for "${parsed.q}"`
      : `No results for "${parsed.q}"`
    : "Search results"

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
        {heading}
      </h1>

      <div className="flex gap-8 mt-8">
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
            hasFilters={hasActiveFilters || !!parsed.q}
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

export default function SearchPage(props: SearchPageProps) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-8" aria-hidden="true" />
        </div>
      }
    >
      <SearchContent {...props} />
    </Suspense>
  )
}
