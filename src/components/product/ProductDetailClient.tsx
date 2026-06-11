"use client"
// src/components/product/ProductDetailClient.tsx
// Client wrapper that lifts variantImageUrl state so VariantSelector and
// ProductGallery can share it (D-19). Rendered inside VariantStockPriceBlock
// (the fresh/uncached Suspense block) so image swap is always in sync with
// live stock/price data.
//
// Decision: lift-to-parent approach (both Gallery + Selector are siblings under
// this wrapper) — keeps both components clean / no prop-drilling through Server Component.
// Plan 04 will NOT cache this wrapper — only the static ProductContent is cached.

import { useState } from "react"
import {
  ProductGallery,
  type ProductGalleryImage,
} from "@/components/product/ProductGallery"
import {
  VariantSelector,
  type OptionForSelector,
} from "@/components/product/VariantSelector"
import type { VariantForSelector } from "@/lib/catalog/variant"

interface ProductDetailClientProps {
  images: ProductGalleryImage[]
  options: OptionForSelector[]
  variants: VariantForSelector[]
  lowStockThreshold?: number
}

export function ProductDetailClient({
  images,
  options,
  variants,
  lowStockThreshold = 5,
}: ProductDetailClientProps) {
  // Lifted state: variant image URL — set by VariantSelector, consumed by ProductGallery
  const [variantImageUrl, setVariantImageUrl] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Gallery (left column on desktop) */}
      <ProductGallery images={images} variantImageUrl={variantImageUrl} />

      {/* Variant selector + price + stock + CTA (right column on desktop) */}
      <VariantSelector
        options={options}
        variants={variants}
        lowStockThreshold={lowStockThreshold}
        onVariantImageChange={setVariantImageUrl}
      />
    </div>
  )
}
