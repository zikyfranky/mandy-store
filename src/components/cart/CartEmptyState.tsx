// src/components/cart/CartEmptyState.tsx
// Cart empty state — Server Component.
// D-14: "Your cart is empty" + "Start shopping" CTA to /products.
// Structure mirrors EmptyState.tsx (catalog analog).

import Link from "next/link"

export function CartEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Heroicons ShoppingCartIcon (48px, inline SVG) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-12 h-12 text-zinc-300 dark:text-zinc-600"
        aria-hidden="true"
      >
        <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 0 0-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 0 0 0-1.5H5.378A2.25 2.25 0 0 1 7.5 15h11.218a.75.75 0 0 0 .674-.421 60.358 60.358 0 0 0 2.96-7.228.75.75 0 0 0-.525-.965A60.864 60.864 0 0 0 5.68 4.509l-.232-.867A1.875 1.875 0 0 0 3.636 2.25H2.25ZM3.75 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM16.5 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
      </svg>

      <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-4">
        Your cart is empty
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        Browse our electronics, watches and phones to find something you love.
      </p>

      {/* CTA: filled button linking to /products (D-14, UI-SPEC §Surfaces 6) */}
      <Link
        href="/products"
        className="mt-6 inline-flex items-center rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Start shopping
      </Link>
    </div>
  )
}
