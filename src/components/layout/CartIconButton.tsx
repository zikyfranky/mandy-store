"use client"
// src/components/layout/CartIconButton.tsx
// Cart icon button with live count badge — client component that consumes CartProvider.
// Extracted from SiteHeader (Server Component) so it can call useCart() (D-03 / D-13).
// UI-SPEC §Surfaces 4: badge states — hidden at 0, "99+" cap, font-semibold, rose-600 bubble.

import { useCart } from "@/components/cart/CartProvider"

export function CartIconButton() {
  const { optimisticCount, open } = useCart()

  // UI-SPEC §Surfaces 4: dynamic aria-label
  const ariaLabel =
    optimisticCount > 0
      ? `Shopping cart, ${optimisticCount} items`
      : "Shopping cart"

  // UI-SPEC §Surfaces 4: display label — "99+" when > 99
  const displayCount =
    optimisticCount > 99 ? "99+" : String(optimisticCount)

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => open()}
      className="relative min-h-11 min-w-11 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      {/* Cart icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="w-6 h-6"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        />
      </svg>

      {/* Count bubble — UI-SPEC §Surfaces 4: hidden when 0, font-semibold weight */}
      {optimisticCount > 0 && (
        <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
          {displayCount}
        </span>
      )}
    </button>
  )
}
