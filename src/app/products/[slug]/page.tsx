// src/app/products/[slug]/page.tsx
// Product Detail Page — Server Component shell (D-08 canonical route: /products/<slug>).
// Next.js 16 + cacheComponents: default export is NOT async — passes Promise<params>
// directly to inner components so all await happens inside Suspense boundaries.
//
// Caching split (SC5):
//   ProductContent     — static product data (name, brand, breadcrumb)
//                        'use cache' + cacheLife('hours') + cacheTag('product-<slug>')
//                        cacheTag hook: Phase 5 admin updateTag() invalidates on edit.
//   VariantStockPriceBlock — fresh stock/price + gallery + selector
//                        NO 'use cache' — always dynamic per request (RESEARCH Pitfall 2).
//
// SEO (Plan 04):
//   generateMetadata   — canonical URL + OpenGraph (D-08)
//   JSON-LD            — Product structured data, XSS-safe (T-02-12)

import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
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

// ─── generateMetadata ─────────────────────────────────────────────────────────
// Sets canonical URL (D-08, SC5) + OpenGraph image.
// metadataBase (set on root layout) resolves the relative canonical to a full URL.
// T-02-14: NEXT_PUBLIC_BASE_URL must be set at deploy time; dev uses the placeholder.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return {}

  return {
    title: `${product.name} | Mandy Store`,
    description: product.description ?? undefined,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      title: product.name,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : [],
    },
  }
}

// ─── ProductContent ───────────────────────────────────────────────────────────
// Renders static content: breadcrumb, name, brand.
// Cached via 'use cache' — static product info is stable across requests (SC5).
// cacheTag hook: Phase 5 admin updateTag(`product-${slug}`) invalidates on edit.
// NEVER cache stock/price here — see VariantStockPriceBlock (RESEARCH Pitfall 2).

async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  "use cache"
  const { slug } = await params
  cacheLife("hours")
  cacheTag(`product-${slug}`)
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

  // JSON-LD structured data — Product (SC5, T-02-12).
  // Built here (fresh block) so offers reflect current stock availability (T-02-13).
  // XSS mitigation: replace /</g with < prevents </script> injection.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((img) => img.url),
    brand: { "@type": "Brand", name: product.brand.name },
    offers: variants.map((v) => ({
      "@type": "Offer",
      priceCurrency: "NGN",
      price: (v.priceKobo / 100).toFixed(2),
      availability:
        v.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    })),
  }

  return (
    <>
      {/* Product JSON-LD — must be outside any cached component to stay fresh (T-02-13).
          XSS: replace /</g with < neutralises </script> breakout (T-02-12). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* ProductDetailClient: lifts variantImageUrl state for gallery + selector (D-19) */}
      <ProductDetailClient
        images={images}
        options={options}
        variants={variants}
      />

      {/* Product description — static text rendered in the fresh block (see 02-03-SUMMARY).
          Kept here (same DB fetch as variants) to avoid a second getProduct query. */}
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
//
// Caching split (SC5, Plan 04):
//   ProductContent: cached (breadcrumb/name/brand) — 'use cache' + cacheLife hours
//   VariantStockPriceBlock: dynamic (gallery/selector/description/JSON-LD) — always fresh

export default function ProductPage({ params }: ProductPageProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Static product info — served from cache via 'use cache' (SC5, Plan 04). */}
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
          JSON-LD also lives here to ensure stock availability is current (T-02-13).
          VariantSkeleton is the Suspense fallback during streaming. */}
      <Suspense fallback={<VariantSkeleton />}>
        <VariantStockPriceBlock params={params} />
      </Suspense>
    </main>
  )
}
