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
      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-md transition-shadow block"
    >
      {/* Product image — 4:3 aspect ratio */}
      <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          /* PhotoIcon placeholder */
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
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Brand name */}
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
          {product.brandName}
        </p>
        {/* Product name */}
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 mb-1">
          {product.name}
        </p>
        {/* Price — "From ₦X,XXX" */}
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
          From {formatNGN(product.minPriceKobo)}
        </p>
      </div>
    </Link>
  )
}
