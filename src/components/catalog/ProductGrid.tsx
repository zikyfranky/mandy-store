// src/components/catalog/ProductGrid.tsx
// Product grid wrapper — Server Component.
// Renders ProductCard list in a responsive 1/2/3-column grid.
// If product list is empty, renders EmptyState.

import { ProductCard } from "@/components/catalog/ProductCard"
import { EmptyState } from "@/components/catalog/EmptyState"
import type { CatalogCard } from "@/lib/catalog/queries"

interface ProductGridProps {
  products: CatalogCard[]
  hasFilters?: boolean
  basePath?: string
}

export function ProductGrid({ products, hasFilters = false, basePath }: ProductGridProps) {
  if (products.length === 0) {
    return <EmptyState hasFilters={hasFilters} basePath={basePath} />
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
