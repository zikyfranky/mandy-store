// src/app/admin/products/new/page.tsx
// New product editor — Details-only form (Images/Variants unlock after createProduct
// returns an id). See ProductForm.tsx for the create→edit redirect rationale.

import { Suspense } from "react"
import { db } from "@/lib/db/client"
import { categories, brands } from "@/lib/db/schema"
import { ProductForm } from "@/components/admin/ProductForm"

async function NewProductContent() {
  const [categoryRows, brandRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: brands.id, name: brands.name }).from(brands),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Add product</h1>
      <ProductForm mode="create" categories={categoryRows} brands={brandRows} />
    </div>
  )
}

function NewProductSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl bg-surface border border-border" />
    </div>
  )
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<NewProductSkeleton />}>
      <NewProductContent />
    </Suspense>
  )
}
