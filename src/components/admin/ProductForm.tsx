"use client"
// src/components/admin/ProductForm.tsx
// Product editor — Details card + embedded Images/Variants cards + sticky footer.
// UI-SPEC Surface 3. Analog: src/components/checkout/CheckoutForm.tsx (RHF+Zod scaffold,
// inputClass, useTransition submit, error banner).
//
// DEVIATION (documented in 05-05-SUMMARY.md): the UI-SPEC describes Slug as "editable"
// but neither createProduct nor updateProduct (Wave 2, 05-03) accept a client-supplied
// slug — createProduct derives it from name via uniqueSlug(), updateProduct never
// touches it. Rendering an editable slug input here would lie about a capability the
// server doesn't have, so the slug is shown read-only with explanatory helper text
// instead (Rule 1 — fixing a spec/implementation mismatch, not a new architecture).
//
// DEVIATION: on create-mode success, this form redirects to the new product's edit
// page (not the Products list per the general UI-SPEC redirect rule) because Images
// and Variants require a productId that only exists after Details are saved — without
// this, a brand-new product could never get variants or images from the UI.

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { inputClass } from "@/components/admin/formStyles"
import { createProduct, updateProduct, deactivateProduct } from "@/lib/actions/admin-products"
import { VariantEditor, type VariantEditorOption, type VariantEditorVariant } from "@/components/admin/VariantEditor"
import { ImageUploadField, type ImageUploadFieldImage } from "@/components/admin/ImageUploadField"

const ProductFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  brandId: z.string().min(1, "Brand is required"),
})

type ProductFormValues = z.infer<typeof ProductFormSchema>

interface SelectOption {
  id: string
  name: string
}

export interface ProductFormProduct {
  id: string
  name: string
  slug: string
  description: string | null
  categoryId: string
  brandId: string
  isActive: boolean
  images: ImageUploadFieldImage[]
  options: VariantEditorOption[]
  variants: VariantEditorVariant[]
}

interface ProductFormProps {
  mode: "create" | "edit"
  product?: ProductFormProduct
  categories: SelectOption[]
  brands: SelectOption[]
}

function ArrowPathIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 animate-spin" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function ProductForm({ mode, product, categories, brands }: ProductFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [isDeactivating, startDeactivateTransition] = useTransition()

  // One-shot post-create banner — derived directly from the URL, no effect needed.
  const successMessage =
    searchParams.get("created") === "1" ? "Product created — add variants and images below." : null

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues>({
    mode: "onBlur",
    resolver: zodResolver(ProductFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      categoryId: product?.categoryId ?? "",
      brandId: product?.brandId ?? "",
    },
  })

  function onSubmit(values: ProductFormValues) {
    setSaveError(null)
    startTransition(async () => {
      try {
        if (mode === "create") {
          const result = await createProduct(values)
          if (!result.success) {
            setSaveError(result.error)
          } else {
            router.push(`/admin/products/${result.id}/edit?created=1`)
          }
        } else if (product) {
          const result = await updateProduct(product.id, values)
          if (!result.success) {
            setSaveError(result.error)
          } else {
            router.push("/admin/products")
          }
        }
      } catch (err) {
        console.error("[ProductForm] save failed:", err)
        setSaveError("Something went wrong.")
      }
    })
  }

  function handleDeactivate() {
    if (!product) return
    startDeactivateTransition(async () => {
      const result = await deactivateProduct(product.id)
      if (!result.success) {
        setSaveError(result.error)
      } else {
        router.push("/admin/products")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-28">
      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4"
        >
          <p className="text-sm font-semibold text-stock-out">Couldn&apos;t save this product</p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            {saveError}. Nothing was lost — try saving again.
          </p>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 p-4"
        >
          <p className="text-sm font-semibold text-green-700 dark:text-green-300">{successMessage}</p>
        </div>
      )}

      {/* Details card */}
      <section aria-labelledby="details-heading" className="rounded-2xl bg-surface border border-border p-6 space-y-4">
        <h2 id="details-heading" className="text-2xl font-semibold text-foreground">
          Details
        </h2>

        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={inputClass(!!errors.name)}
            {...register("name")}
          />
          {errors.name && (
            <p id="name-error" role="alert" className="text-sm font-semibold text-stock-out mt-1">
              {errors.name.message}
            </p>
          )}
        </div>

        {product && (
          <div>
            <p className="block text-sm font-semibold text-foreground mb-1">Slug</p>
            <p className="text-sm text-foreground">{product.slug}</p>
            <p className="text-sm text-muted mt-1">
              Used in the product URL — automatically generated from the name and can&apos;t
              be changed here.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-1">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors resize-none"
            {...register("description")}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="categoryId" className="block text-sm font-semibold text-foreground mb-1">
              Category
            </label>
            <select
              id="categoryId"
              aria-invalid={!!errors.categoryId}
              aria-describedby={errors.categoryId ? "categoryId-error" : undefined}
              className={inputClass(!!errors.categoryId)}
              defaultValue={product?.categoryId ?? ""}
              {...register("categoryId")}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p id="categoryId-error" role="alert" className="text-sm font-semibold text-stock-out mt-1">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="brandId" className="block text-sm font-semibold text-foreground mb-1">
              Brand
            </label>
            <select
              id="brandId"
              aria-invalid={!!errors.brandId}
              aria-describedby={errors.brandId ? "brandId-error" : undefined}
              className={inputClass(!!errors.brandId)}
              defaultValue={product?.brandId ?? ""}
              {...register("brandId")}
            >
              <option value="" disabled>
                Select a brand
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {errors.brandId && (
              <p id="brandId-error" role="alert" className="text-sm font-semibold text-stock-out mt-1">
                {errors.brandId.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Images + Variants cards — only meaningful once the product has an id */}
      {product ? (
        <>
          <section aria-labelledby="images-heading" className="rounded-2xl bg-surface border border-border p-6 space-y-4">
            <h2 id="images-heading" className="text-2xl font-semibold text-foreground">
              Images
            </h2>
            <ImageUploadField productId={product.id} images={product.images} />
          </section>

          <section aria-labelledby="variants-heading" className="rounded-2xl bg-surface border border-border p-6 space-y-4">
            <h2 id="variants-heading" className="text-2xl font-semibold text-foreground">
              Variants
            </h2>
            <VariantEditor productId={product.id} options={product.options} variants={product.variants} />
          </section>
        </>
      ) : (
        <div className="rounded-2xl bg-surface border border-border p-6">
          <p className="text-sm text-muted">
            Save the product details first — you&apos;ll be able to add images and variants
            right after.
          </p>
        </div>
      )}

      {/* Sticky footer action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 border-t border-border bg-surface/95 backdrop-blur px-6 py-4 flex items-center justify-between gap-4 z-30">
        {product ? (
          <button
            type="button"
            onClick={() => setDeactivateOpen(true)}
            className="text-sm font-semibold text-stock-out hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
          >
            Deactivate product
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-4">
          <Link
            href="/admin/products"
            className="text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded px-2 py-2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            aria-disabled={isPending}
            className="rounded-lg bg-brand hover:bg-brand-strong text-white px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 flex items-center gap-2"
          >
            {isPending && <ArrowPathIcon />}
            {isPending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Deactivate confirm dialog */}
      {deactivateOpen && product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeactivateOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-product-title"
            className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl"
          >
            <h2 id="deactivate-product-title" className="text-2xl font-semibold text-foreground">
              Deactivate {product.name}?
            </h2>
            <p className="text-sm text-muted mt-2">
              This hides it from the storefront immediately. Existing orders keep their
              details. You can reactivate it anytime from the same menu.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeactivateOpen(false)}
                className="text-sm font-semibold text-muted hover:text-foreground rounded px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isDeactivating}
                className="rounded-lg bg-stock-out hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isDeactivating ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
