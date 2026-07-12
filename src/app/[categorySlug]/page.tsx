// src/app/[categorySlug]/page.tsx
// Category listing page — Server Component (CATA-01, D-06).
// Routes: /electronics, /watches, /phones
// Next.js 16: params and searchParams are Promises — MUST await.
// cacheComponents: data-fetching is inside Suspense-wrapped inner component.

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getCatalog, getBrandsForCategory, getActiveCategoryBySlug, listActiveCategoriesForNav } from "@/lib/catalog/queries"
import { parseCatalogParams } from "@/lib/validation/catalog-params"
import { ProductGrid } from "@/components/catalog/ProductGrid"
import { ProductFilters } from "@/components/catalog/ProductFilters"
import { SortSelect } from "@/components/catalog/SortSelect"
import { Pagination } from "@/components/catalog/Pagination"

interface CategoryPageProps {
  params: Promise<{ categorySlug: string }>
  searchParams: Promise<{
    q?: string
    brand?: string
    minPrice?: string
    maxPrice?: string
    sort?: string
    page?: string
  }>
}

export async function generateStaticParams() {
  const cats = await listActiveCategoriesForNav()
  return cats.map((c) => ({ categorySlug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }): Promise<Metadata> {
  const { categorySlug } = await params
  const category = await getActiveCategoryBySlug(categorySlug)
  const name = category?.name ?? categorySlug
  return {
    title: `${name} — YesBuy`,
    description: `Browse ${name.toLowerCase()} at YesBuy. Best prices in Nigeria.`,
  }
}

// Inner async component — wraps all dynamic data access inside Suspense
async function CategoryContent({
  params,
  searchParams,
}: CategoryPageProps) {
  const { categorySlug } = await params
  const sp = await searchParams

  // Resolve the category from the DB, active-only (D-03). Unknown OR soft-deleted → 404.
  const category = await getActiveCategoryBySlug(categorySlug)
  if (!category) notFound()
  const categoryName = category.name

  // Parse + clamp searchParams (T-02-04, T-02-06)
  const parsed = parseCatalogParams(sp)

  // Fetch data in parallel
  const [result, brands] = await Promise.all([
    getCatalog({ categorySlug, ...parsed }),
    getBrandsForCategory(categorySlug),
  ])

  const hasActiveFilters = !!(parsed.q || parsed.brand || parsed.minPrice !== undefined || parsed.maxPrice !== undefined)

  const spString = new URLSearchParams(
    Object.fromEntries(
      Object.entries(sp).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <nav className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">Home</Link>
        <span className="px-1.5" aria-hidden="true">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{categoryName}</span>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-8">
        {categoryName}
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
            basePath={`/${categorySlug}`}
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

export default function CategoryPage(props: CategoryPageProps) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <CategoryContent {...props} />
    </Suspense>
  )
}
