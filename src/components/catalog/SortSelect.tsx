"use client"
// src/components/catalog/SortSelect.tsx
// Sort control — Client Component.
// D-12: onChange pushes ?sort=<value> to URL, preserving other params.

import { useRouter, useSearchParams } from "next/navigation"
import type { SortKey } from "@/lib/catalog/queries"

interface SortSelectProps {
  currentSort: SortKey
}

export function SortSelect({ currentSort }: SortSelectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort", e.target.value)
    // Reset to page 1 when sort changes
    params.delete("page")
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
        Sort by
      </label>
      <select
        id="sort-select"
        onChange={handleChange}
        defaultValue={currentSort}
        className="text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus-visible:ring-offset-2"
      >
        <option value="newest">Newest</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="name_asc">Name: A–Z</option>
      </select>
    </div>
  )
}
