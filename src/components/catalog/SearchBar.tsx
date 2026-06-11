"use client"
// src/components/catalog/SearchBar.tsx
// Global header search bar — Client Component island.
// D-10: submits to /search?q=<value>; empty submit → /products.
// T-02-07: q is only used as a DB filter string downstream; never used in redirect target here.

import { useState } from "react"
import { useRouter } from "next/navigation"

export function SearchBar() {
  const router = useRouter()
  const [value, setValue] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) {
      router.push("/search?q=" + encodeURIComponent(trimmed))
    } else {
      router.push("/products")
    }
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex items-center gap-2 w-full max-w-sm"
    >
      <input
        type="search"
        aria-label="Search products"
        placeholder="Search products…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <button
        type="submit"
        aria-label="Search products"
        className="flex-shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {/* Heroicons MagnifyingGlassIcon (20px, inline SVG) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-zinc-500"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </form>
  )
}
