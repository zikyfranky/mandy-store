// src/app/admin/products/[id]/edit/page.tsx
// Edit product editor — getProductForAdmin(id) -> notFound() if null (T-05-06:
// ignores isActive so deactivated products remain editable/reactivatable).
// Next.js 16: params is a Promise — MUST await.

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { db } from "@/lib/db/client"
import { categories, brands } from "@/lib/db/schema"
import { getProductForAdmin } from "@/lib/catalog/admin-queries"
import { ProductForm, type ProductFormProduct } from "@/components/admin/ProductForm"

interface EditProductPageProps {
  params: Promise<{ id: string }>
}

async function EditProductContent({ params }: EditProductPageProps) {
  const { id } = await params

  const [product, categoryRows, brandRows] = await Promise.all([
    getProductForAdmin(id),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: brands.id, name: brands.name }).from(brands),
  ])

  if (!product) {
    notFound()
  }

  const formProduct: ProductFormProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categoryId,
    brandId: product.brandId,
    isActive: product.isActive,
    images: product.images.map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      isPrimary: img.isPrimary,
    })),
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((v) => ({ id: v.id, value: v.value })),
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      priceKobo: variant.priceKobo,
      stock: variant.stock,
      isActive: variant.isActive,
      optionValueIds: variant.optionValues.map((ov) => ov.optionValueId),
      optionLabel: variant.optionValues.map((ov) => ov.optionValue.value).join(" · "),
    })),
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{product.name}</h1>
      <ProductForm mode="edit" product={formProduct} categories={categoryRows} brands={brandRows} />
    </div>
  )
}

function EditProductSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl bg-surface border border-border" />
      <div className="h-40 rounded-2xl bg-surface border border-border" />
      <div className="h-40 rounded-2xl bg-surface border border-border" />
    </div>
  )
}

export default function EditProductPage(props: EditProductPageProps) {
  return (
    <Suspense fallback={<EditProductSkeleton />}>
      <EditProductContent {...props} />
    </Suspense>
  )
}
