// src/app/products/[slug]/page.tsx
// Product Detail Page — Server Component shell (D-08 canonical route: /products/<slug>).
// Next.js 16 + cacheComponents: default export is NOT async — passes Promise<params>
// directly to inner components so all await happens inside Suspense boundaries.
//
// Caching split (Plan 03 structure, Plan 04 adds directives):
//   ProductContent     — static product data (name, brand, breadcrumb)
//                        Plan 04 will add 'use cache' + cacheLife('hours') + cacheTag here.
//   VariantStockPriceBlock — fresh stock/price + gallery + selector
//                        NO caching — must be fresh per request (RESEARCH Pitfall 2).
//
// generateMetadata + canonical + JSON-LD are added in Plan 04 (SEO layer) — NOT here.

import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getProduct } from "@/lib/catalog/queries"
import { ProductDetailClient } from "@/components/product/ProductDetailClient"
import { VariantSkeleton } from "@/components/product/VariantSkeleton"
import type { VariantForSelector } from "@/lib/catalog/variant"
import type { OptionForSelector } from "@/components/product/VariantSelector"
import type { ProductGalleryImage } from "@/components/product/ProductGallery"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

// ─── ProductContent ───────────────────────────────────────────────────────────
// Renders static content: breadcrumb, name, brand.
// async — awaits params and fetches product.
// Plan 04 will decorate with 'use cache' + cacheLife + cacheTag.

async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()

  return (
    <div className="space-y-2">
      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1 flex-wrap">
        <Link
          href="/"
          className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          Home
        </Link>
        <span>/</span>
        <Link
          href={`/${product.category.slug}`}
          className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          {product.category.name}
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-100">{product.name}</span>
      </nav>

      {/* Product name */}
      <h1 className="text-2xl font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
        {product.name}
      </h1>

      {/* Brand */}
      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        {product.brand.name}
      </p>
    </div>
  )
}

// ─── VariantStockPriceBlock ───────────────────────────────────────────────────
// Fetches FRESH variant stock/price data and renders the interactive client block.
// NO 'use cache' directive — stock/price must always be fresh (RESEARCH Pitfall 2).
// Contains the ProductDetailClient wrapper (gallery + selector + variantImageUrl state).

async function VariantStockPriceBlock({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return null

  // Map DB query results to selector-safe prop shapes
  const images: ProductGalleryImage[] = product.images.map((img) => ({
    url: img.url,
    altText: img.altText,
  }))

  const options: OptionForSelector[] = product.options.map((opt) => ({
    id: opt.id,
    name: opt.name,
    values: opt.values.map((val) => ({ id: val.id, value: val.value })),
  }))

  const variants: VariantForSelector[] = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    priceKobo: v.priceKobo,
    stock: v.stock,
    imageUrl: v.imageUrl,
    optionValues: v.optionValues.map((ov) => ({
      optionValue: {
        id: ov.optionValue.id,
        value: ov.optionValue.value,
        productOption: {
          // ov.optionValue.option is the productOptions row via the Drizzle 'option' relation
          name: ov.optionValue.option?.name ?? "",
        },
      },
    })),
  }))

  return (
    <>
      {/* ProductDetailClient: lifts variantImageUrl state for gallery + selector (D-19) */}
      <ProductDetailClient
        images={images}
        options={options}
        variants={variants}
      />

      {/* Product description — static text rendered in the fresh block.
          Plan 04 caching boundary: ProductContent gets 'use cache', this block stays dynamic. */}
      {product.description && (
        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {product.description}
          </p>
        </div>
      )}
    </>
  )
}

// ─── ProductPage (default export) ────────────────────────────────────────────
// NOT async — cacheComponents requires all await to happen inside Suspense boundaries.
// The params Promise is passed directly to the inner async server functions.

export default function ProductPage({ params }: ProductPageProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Static product info — Suspense-wrapped so cacheComponents mode is satisfied.
          Plan 04 will add 'use cache' + cacheLife('hours') to ProductContent, converting
          this boundary to serve cached data. */}
      <div className="mb-6">
        <Suspense
          fallback={
            <div className="space-y-2" aria-hidden="true">
              <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-7 w-64 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>
          }
        >
          <ProductContent params={params} />
        </Suspense>
      </div>

      {/* Fresh stock/price block — NO 'use cache', always dynamic (RESEARCH Pitfall 2).
          VariantSkeleton is the Suspense fallback during streaming. */}
      <Suspense fallback={<VariantSkeleton />}>
        <VariantStockPriceBlock params={params} />
      </Suspense>
    </main>
  )
}
