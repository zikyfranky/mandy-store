"use client"
// src/components/product/ProductGallery.tsx
// Client Component for the product image gallery with variant image swap (D-19).
// variantImageUrl is passed as a controlled prop from the ProductDetailClient wrapper.

import { useState } from "react"
import Image from "next/image"

export interface ProductGalleryImage {
  url: string
  altText: string | null
}

export interface ProductGalleryProps {
  images: ProductGalleryImage[]
  variantImageUrl: string | null
}

export function ProductGallery({ images, variantImageUrl }: ProductGalleryProps) {
  // Track manually-selected thumbnail (null = not manually selected yet)
  const [selectedThumbnailUrl, setSelectedThumbnailUrl] = useState<string | null>(null)

  // D-19 image precedence: variant override > manually selected thumbnail > images[0]
  // variantImageUrl is a prop-controlled value (no local state for it)
  const displayUrl =
    variantImageUrl ?? selectedThumbnailUrl ?? images[0]?.url ?? null

  const altText =
    images.find((img) => img.url === displayUrl)?.altText ?? "Product image"

  return (
    <div className="flex flex-col gap-4">
      {/* Main image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={altText}
            fill
            className="object-cover transition-opacity duration-200"
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Thumbnail strip — only rendered when there are multiple images */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => {
            const isActive = displayUrl === img.url
            return (
              <button
                key={img.url}
                type="button"
                aria-label={`View image ${idx + 1}`}
                onClick={() => setSelectedThumbnailUrl(img.url)}
                className={[
                  "relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                  isActive ? "ring-2 ring-indigo-600" : "hover:ring-2 hover:ring-zinc-400",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Image
                  src={img.url}
                  alt={img.altText ?? `Product image ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="72px"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
