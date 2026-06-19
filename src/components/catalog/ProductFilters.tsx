// src/components/catalog/ProductFilters.tsx
// Sidebar facets (desktop) + mobile filter drawer — Server shell + Client islands.
// D-11: desktop 256px sidebar; mobile drawer triggered by "Filters" button.

"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

interface ProductFiltersProps {
  brands: string[]
  currentBrand?: string
  currentMinPrice?: number
  currentMaxPrice?: number
}

function FilterForm({
  brands,
  currentBrand,
  currentMinPrice,
  currentMaxPrice,
  onClose,
}: ProductFiltersProps & { onClose?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [minPrice, setMinPrice] = useState(
    currentMinPrice !== undefined ? String(currentMinPrice / 100) : ""
  )
  const [maxPrice, setMaxPrice] = useState(
    currentMaxPrice !== undefined ? String(currentMaxPrice / 100) : ""
  )

  function updateParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset to page 1 on filter change
    params.delete("page")
    router.push(`?${params.toString()}`)
  }

  function handleBrandChange(brand: string, checked: boolean) {
    updateParam("brand", checked ? brand : undefined)
  }

  function handleApplyPrices() {
    const params = new URLSearchParams(searchParams.toString())
    const minKobo = minPrice ? String(Math.round(parseFloat(minPrice) * 100)) : undefined
    const maxKobo = maxPrice ? String(Math.round(parseFloat(maxPrice) * 100)) : undefined
    if (minKobo) {
      params.set("minPrice", minKobo)
    } else {
      params.delete("minPrice")
    }
    if (maxKobo) {
      params.set("maxPrice", maxKobo)
    } else {
      params.delete("maxPrice")
    }
    params.delete("page")
    router.push(`?${params.toString()}`)
    onClose?.()
  }

  function handleClearAll() {
    router.push("?")
    onClose?.()
  }

  const hasActiveFilters = !!(currentBrand || currentMinPrice || currentMaxPrice)

  return (
    <div className="flex flex-col gap-6">
      {/* Brand filter */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
          Brand
        </h3>
        <div className="flex flex-col gap-2">
          {brands.map((brand) => {
            const isChecked = currentBrand === brand
            return (
              <label key={brand} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleBrandChange(brand, e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{brand}</span>
              </label>
            )
          })}
          {brands.length === 0 && (
            <p className="text-sm text-zinc-400 dark:text-zinc-600">No brands available</p>
          )}
        </div>
      </div>

      {/* Price range filter */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
          Price range
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="min-price" className="sr-only">Min (₦)</label>
            <input
              id="min-price"
              type="number"
              placeholder="Min (₦)"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              min="0"
              className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <span className="text-zinc-400 text-sm">–</span>
          <div className="flex-1">
            <label htmlFor="max-price" className="sr-only">Max (₦)</label>
            <input
              id="max-price"
              type="number"
              placeholder="Max (₦)"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              min="0"
              className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleApplyPrices}
          className="mt-3 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Apply filters
        </button>
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearAll}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 self-start focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

export function ProductFilters(props: ProductFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar — 256px, hidden on mobile */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-6">
          Filters
        </h2>
        <FilterForm {...props} />
      </aside>

      {/* Mobile: "Filters" trigger button */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {/* Heroicons AdjustmentsHorizontalIcon (20px, inline SVG) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path d="M17 2.75a.75.75 0 0 0-1.5 0v5.5a.75.75 0 0 0 1.5 0v-5.5ZM17 15.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM3.75 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM4.5 2.75a.75.75 0 0 0-1.5 0v9.5a.75.75 0 0 0 1.5 0v-9.5ZM10 11a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5A.75.75 0 0 1 10 11ZM10.75 2.75a.75.75 0 0 0-1.5 0v5.5a.75.75 0 0 0 1.5 0v-5.5ZM4.5 8.25a2.25 2.25 0 1 1 0 0ZM15.75 10.5a2.25 2.25 0 1 1 0 0ZM8.25 12.75a2.25 2.25 0 1 1 0 0Z" />
          </svg>
          Filters
        </button>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
            className="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-white dark:bg-zinc-900 rounded-t-2xl p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-zinc-500" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            <FilterForm {...props} onClose={() => setDrawerOpen(false)} />

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-6 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 px-6 py-4 text-base font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Show results
            </button>
          </div>
        </div>
      )}
    </>
  )
}
