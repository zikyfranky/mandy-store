// src/components/catalog/Pagination.tsx
// URL-based pagination — Server Component.
// D-09: each page link is a <Link href="?page=N"> preserving existing query params.

import Link from "next/link"

interface PaginationProps {
  page: number
  pageCount: number
  searchParamsString?: string
}

function buildHref(page: number, searchParamsString: string): string {
  const params = new URLSearchParams(searchParamsString)
  params.set("page", String(page))
  return `?${params.toString()}`
}

export function Pagination({ page, pageCount, searchParamsString = "" }: PaginationProps) {
  if (pageCount <= 1) return null

  // Build visible page numbers (up to 5, centered around current page)
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  const end = Math.min(pageCount, start + maxVisible - 1)
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1)
  }
  const pageNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const prevDisabled = page <= 1
  const nextDisabled = page >= pageCount

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-3 mt-8">
      <div className="flex items-center gap-1">
        {/* Previous */}
        {prevDisabled ? (
          <span
            aria-disabled="true"
            className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 opacity-40 cursor-not-allowed select-none"
          >
            {/* Left arrow */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Previous
          </span>
        ) : (
          <Link
            href={buildHref(page - 1, searchParamsString)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Previous
          </Link>
        )}

        {/* Page numbers */}
        {pageNumbers.map((n) => {
          const isCurrent = n === page
          return isCurrent ? (
            <span
              key={n}
              aria-current="page"
              className="px-3 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white"
            >
              {n}
            </span>
          ) : (
            <Link
              key={n}
              href={buildHref(n, searchParamsString)}
              className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {n}
            </Link>
          )
        })}

        {/* Next */}
        {nextDisabled ? (
          <span
            aria-disabled="true"
            className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 opacity-40 cursor-not-allowed select-none"
          >
            Next
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </span>
        ) : (
          <Link
            href={buildHref(page + 1, searchParamsString)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Next
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
        )}
      </div>

      {/* Page info caption */}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Page {page} of {pageCount}
      </p>
    </nav>
  )
}
