"use server"
import "server-only"
// src/lib/actions/admin-products.ts
// Admin product/variant Server Actions (ADMN-01, ADMN-02).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement in every action, before Zod
//     parsing or any DB access (D-02, T-05-08).
//   - Every catalog-visible mutation calls updateTag('product-<slug>') so the cached PDP
//     expires immediately (D-06). Cache invalidation is idempotent — it is safe to fire it
//     even when the write matched zero rows, so we never skip it on a not-found id.
//   - deactivateProduct cascades isActive=false to all of a product's variants in one batch
//     (D-04) — the cart/catalog layers already treat !isActive as OOS/hidden, so no new
//     downstream logic is needed (05-RESEARCH.md Don't Hand-Roll).
//   - reactivateProduct does NOT auto-reactivate variants (RESEARCH Open Q2) — the admin
//     re-enables them individually in the editor.
//   - All actions return minimal DTOs ({success,id}/{success,error}) — never a raw Drizzle
//     record (Pitfall 10, T-05-11).

import { z } from "zod"
import { eq } from "drizzle-orm"
import { updateTag } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { products, variants, variantOptionValues } from "@/lib/db/schema"
import { uniqueSlug } from "@/lib/utils/slug"

// ─── Shared result types ───────────────────────────────────────────────────────

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

function firstZodError(err: z.ZodError, fallback = "Invalid input"): string {
  return err.issues[0]?.message ?? fallback
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────────
// categoryId/brandId are intentionally plain (non-UUID-strict) strings — the FK
// constraint is enforced by the DB itself on write.

const ProductInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  brandId: z.string().min(1, "Brand is required"),
})

const UpdateVariantSchema = z.object({
  priceKobo: z.number().int().positive("Price must be a positive integer").optional(),
  stock: z.number().int().min(0, "Stock cannot be negative").optional(),
  sku: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
})

const UpsertVariantSchema = z.object({
  id: z.string().optional(), // present => update; absent => insert
  priceKobo: z.number().int().positive("Price must be a positive integer"),
  stock: z.number().int().min(0, "Stock cannot be negative"),
  sku: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
  optionValueIds: z.array(z.string()).optional(),
  remove: z.boolean().optional(), // true => deactivate (or delete if never saved)
})

// ─── createProduct ──────────────────────────────────────────────────────────────

export async function createProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-02 — FIRST statement

  const parsed = ProductInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    const id = crypto.randomUUID()
    const slug = await uniqueSlug(parsed.data.name, async (s) => {
      const existing = await db.query.products.findFirst({
        where: eq(products.slug, s),
        columns: { id: true },
      })
      return !!existing
    })

    await db.insert(products).values({
      id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      categoryId: parsed.data.categoryId,
      brandId: parsed.data.brandId,
    })

    updateTag(`product-${slug}`) // D-06
    return { success: true, id }
  } catch (err) {
    console.error("[admin-products] createProduct failed:", err)
    return { success: false, error: "Something went wrong creating the product." }
  }
}

// ─── updateProduct ────────────────────────────────────────────────────────────

export async function updateProduct(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-02 — FIRST statement

  const parsed = ProductInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    const [updated] = await db
      .update(products)
      .set({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        categoryId: parsed.data.categoryId,
        brandId: parsed.data.brandId,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning({ id: products.id, slug: products.slug })

    // D-06: fire cache invalidation regardless — over-invalidating is harmless, and this
    // keeps the contract "every mutation call invalidates" true even for a stale/unknown id.
    updateTag(`product-${updated?.slug ?? productId}`)

    if (!updated) {
      return { success: false, error: "Product not found" }
    }
    return { success: true, id: updated.id }
  } catch (err) {
    console.error("[admin-products] updateProduct failed:", err)
    return { success: false, error: "Something went wrong updating the product." }
  }
}

// ─── deactivateProduct ────────────────────────────────────────────────────────

export async function deactivateProduct(productId: string): Promise<ActionResult> {
  await verifyAdminSession() // D-02 — FIRST statement

  try {
    const [updated] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning({ slug: products.slug })

    // D-04: cascade isActive=false to all of this product's variants in the same batch —
    // the cart/catalog layers already treat !isActive as OOS/hidden (no new logic needed).
    await db.update(variants).set({ isActive: false }).where(eq(variants.productId, productId))

    updateTag(`product-${updated?.slug ?? productId}`) // D-06

    if (!updated) {
      return { success: false, error: "Product not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-products] deactivateProduct failed:", err)
    return { success: false, error: "Something went wrong deactivating the product." }
  }
}

// ─── reactivateProduct ────────────────────────────────────────────────────────
// Required by the products-list overflow menu (UI-SPEC "reactivate anytime from the same
// menu") — does NOT auto-reactivate variants (RESEARCH Open Q2); the admin re-enables them
// individually in the editor.

export async function reactivateProduct(productId: string): Promise<ActionResult> {
  await verifyAdminSession() // D-02 — FIRST statement

  try {
    const [updated] = await db
      .update(products)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning({ slug: products.slug })

    updateTag(`product-${updated?.slug ?? productId}`) // D-06

    if (!updated) {
      return { success: false, error: "Product not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-products] reactivateProduct failed:", err)
    return { success: false, error: "Something went wrong reactivating the product." }
  }
}

// ─── updateVariant ────────────────────────────────────────────────────────────
// Quick inline price/stock (and related field) edit for an existing variant row.

export async function updateVariant(
  variantId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-02 — FIRST statement

  const parsed = UpdateVariantSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    const [updated] = await db
      .update(variants)
      .set(parsed.data)
      .where(eq(variants.id, variantId))
      .returning({ id: variants.id, productId: variants.productId })

    let slug: string | undefined
    if (updated) {
      const product = await db.query.products.findFirst({
        where: eq(products.id, updated.productId),
        columns: { slug: true },
      })
      slug = product?.slug
    }

    updateTag(`product-${slug ?? variantId}`) // D-06

    if (!updated) {
      return { success: false, error: "Variant not found" }
    }
    return { success: true, id: updated.id }
  } catch (err) {
    console.error("[admin-products] updateVariant failed:", err)
    return { success: false, error: "Something went wrong updating the variant." }
  }
}

// ─── upsertVariant ────────────────────────────────────────────────────────────
// Full variant management for the product editor: insert a new variant, update an
// existing one (including its option-value combination), or remove one.

export async function upsertVariant(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-02 — FIRST statement

  const parsed = UpsertVariantSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { slug: true },
  })
  if (!product) {
    return { success: false, error: "Product not found" }
  }

  try {
    // Remove: deactivate an existing variant (D-04-style soft delete — never a hard row
    // delete for a variant that may already be referenced by a historical order item).
    if (parsed.data.remove && parsed.data.id) {
      await db.update(variants).set({ isActive: false }).where(eq(variants.id, parsed.data.id))
      updateTag(`product-${product.slug}`) // D-06
      return { success: true, id: parsed.data.id }
    }

    let variantId = parsed.data.id

    if (variantId) {
      await db
        .update(variants)
        .set({
          priceKobo: parsed.data.priceKobo,
          stock: parsed.data.stock,
          sku: parsed.data.sku,
          imageUrl: parsed.data.imageUrl,
          isActive: parsed.data.isActive ?? true,
        })
        .where(eq(variants.id, variantId))
    } else {
      variantId = crypto.randomUUID()
      await db.insert(variants).values({
        id: variantId,
        productId,
        priceKobo: parsed.data.priceKobo,
        stock: parsed.data.stock,
        sku: parsed.data.sku ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        isActive: parsed.data.isActive ?? true,
      })
    }

    if (parsed.data.optionValueIds) {
      const finalVariantId = variantId
      await db.delete(variantOptionValues).where(eq(variantOptionValues.variantId, finalVariantId))
      if (parsed.data.optionValueIds.length > 0) {
        await db.insert(variantOptionValues).values(
          parsed.data.optionValueIds.map((optionValueId) => ({
            variantId: finalVariantId,
            optionValueId,
          }))
        )
      }
    }

    updateTag(`product-${product.slug}`) // D-06
    return { success: true, id: variantId }
  } catch (err) {
    console.error("[admin-products] upsertVariant failed:", err)
    return { success: false, error: "Something went wrong saving the variant." }
  }
}
