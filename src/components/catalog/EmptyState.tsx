// src/components/catalog/EmptyState.tsx
// No-results empty state — Server Component.
// D-13: "No products found" with "Clear filters" / "Browse all products" CTA.

import Link from "next/link"

interface EmptyStateProps {
  hasFilters?: boolean
  basePath?: string
}

export function EmptyState({ hasFilters = false, basePath = "/products" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Heroicons MagnifyingGlassIcon (48px, inline SVG) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-12 h-12 text-zinc-300 dark:text-zinc-600"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
          clipRule="evenodd"
        />
      </svg>

      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-4">
        No products found
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        Try adjusting your filters or search term.
      </p>

      <Link
        href={basePath}
        className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {hasFilters ? "Clear filters" : "Browse all products"}
      </Link>
    </div>
  )
}
