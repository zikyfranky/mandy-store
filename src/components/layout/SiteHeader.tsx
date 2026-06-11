// src/components/layout/SiteHeader.tsx
// Global site header — Server Component.
// Contains SearchBar (Client island), nav links, cart stub icon, account icon.

import Link from "next/link"
import { SearchBar } from "@/components/catalog/SearchBar"

export function SiteHeader() {
  return (
    <header className="h-16 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          Mandy Store
        </Link>

        {/* Search bar — takes available space */}
        <div className="flex-1 hidden sm:flex justify-center">
          <SearchBar />
        </div>

        {/* Nav links — desktop only */}
        <nav className="hidden lg:flex items-center gap-4">
          <Link
            href="/electronics"
            className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap transition-colors"
          >
            Electronics
          </Link>
          <Link
            href="/watches"
            className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap transition-colors"
          >
            Watches
          </Link>
          <Link
            href="/phones"
            className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap transition-colors"
          >
            Phones
          </Link>
          <Link
            href="/products"
            className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap transition-colors"
          >
            All Products
          </Link>
        </nav>

        {/* Right icon group */}
        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          {/* Cart icon — stub (Phase 3 wires count) */}
          <button
            type="button"
            aria-label="Shopping cart"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {/* Heroicons ShoppingCartIcon (24px, inline SVG) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 text-zinc-600 dark:text-zinc-400"
              aria-hidden="true"
            >
              <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 0 0-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 0 0 0-1.5H5.378A2.25 2.25 0 0 1 7.5 15h11.218a.75.75 0 0 0 .674-.421 60.358 60.358 0 0 0 2.96-7.228.75.75 0 0 0-.525-.965A60.864 60.864 0 0 0 5.68 4.509l-.232-.867A1.875 1.875 0 0 0 3.636 2.25H2.25ZM3.75 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM16.5 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
            </svg>
          </button>

          {/* Account icon — links to /account/login */}
          <Link
            href="/account/login"
            aria-label="Account"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {/* Heroicons UserIcon (24px, inline SVG) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 text-zinc-600 dark:text-zinc-400"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Mobile search bar — below header bar */}
      <div className="sm:hidden px-4 pb-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <SearchBar />
      </div>
    </header>
  )
}
