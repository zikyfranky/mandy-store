// src/components/catalog/ProductCard.tsx
// Product listing card — Server Component.
// The entire card is a Link to the PDP. Price shown as "From ₦X,XXX" (D-04).

import Link from "next/link"
import Image from "next/image"
import { formatNGN } from "@/lib/catalog/format"
import type { CatalogCard } from "@/lib/catalog/queries"

interface ProductCardProps {
  product: CatalogCard
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#131320] ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-indigo-300 dark:hover:ring-indigo-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      {/* Product image — square, zooms on hover */}
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-12 h-12 text-zinc-400"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}

        {/* Brand chip */}
        <span className="absolute left-3 top-3 rounded-full bg-white/90 dark:bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200 backdrop-blur ring-1 ring-black/5 dark:ring-white/10">
          {product.brandName}
        </span>

        {/* Quick-view affordance — slides up on hover */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-lg">
            View details
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
          {product.name}
        </p>
        <div className="mt-auto pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">From</p>
          <p className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {formatNGN(product.minPriceKobo)}
          </p>
        </div>
      </div>
    </Link>
  )
}
