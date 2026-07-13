// src/components/layout/SiteHeader.tsx
// Global site header — Server Component.
// Contains SearchBar (Client island), nav links, CartIconButton (Client island), account icon.
// D-03 / D-13: cart icon badge wired to live count via CartIconButton + CartProvider.

import Link from "next/link"
import Image from "next/image"
import { SearchBar } from "@/components/catalog/SearchBar"
import { CartIconButton } from "@/components/layout/CartIconButton"
import { listActiveCategoriesForNav } from "@/lib/catalog/queries"

interface SiteHeaderProps {
  /** Server-read cart count — passed through to CartIconButton via CartProvider (D-13) */
  initialCount?: number
}

// Async Server Component: the nav categories come from the cached (`'use cache'` +
// cacheTag("categories-nav")) query, so this stays in the static PPR shell (Pitfall 3, D-03).
export async function SiteHeader({ initialCount = 0 }: SiteHeaderProps) {
  void initialCount // CartIconButton reads optimisticCount from CartProvider (seeded by layout)
  const categories = await listActiveCategoriesForNav()
  const nav = [
    ...categories.map((c) => ({ href: `/${c.slug}`, label: c.name })),
    { href: "/products", label: "All Products" },
  ]
  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0c0c16]/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-4">
        {/* Logo + brand mark */}
        <Link href="/" aria-label="Yesbuy Store — home" className="flex items-center gap-2.5 whitespace-nowrap group shrink-0">
          {/* Brand badge — the YesBuy Store logo */}
          <Image
            src="/yesbuy-badge.png"
            alt="Yesbuy Store"
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15 shadow-sm transition-transform group-hover:scale-105"
          />
          <span className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Yesbuy <span className="text-indigo-600 dark:text-indigo-400">Store</span>
          </span>
        </Link>

        {/* Search bar — takes available space */}
        <div className="flex-1 hidden sm:flex justify-center max-w-xl mx-auto">
          <SearchBar />
        </div>

        {/* Nav links — desktop only */}
        <nav className="hidden lg:flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative px-3 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 whitespace-nowrap transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:scale-x-0 after:bg-indigo-600 dark:after:bg-indigo-400 after:transition-transform hover:after:scale-x-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right icon group */}
        <div className="flex items-center gap-1 ml-auto lg:ml-2">
          {/* Cart icon — wired to live count via CartIconButton + CartProvider (D-03/D-13) */}
          <CartIconButton />

          {/* Account icon — links to /account/login */}
          <Link
            href="/account/login"
            aria-label="Account"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Mobile search bar — below header bar */}
      <div className="sm:hidden px-4 pb-3 pt-1">
        <SearchBar />
      </div>
    </header>
  )
}
