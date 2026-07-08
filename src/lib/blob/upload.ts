import "server-only"
// src/lib/blob/upload.ts
// Vercel Blob product-image upload/delete (ADMN-01, D-03).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement in every exported function (D-02,
//     T-05-08) — put()/del() are never reachable by an anonymous or non-admin caller (T-05-09).
//   - Alt text is required server-side via Zod `z.string().trim().min(1)`, independent of any
//     client `required` attribute (T-05-10, Pitfall 6, SC1).
//   - Oversized uploads are rejected server-side as defense-in-depth against the Vercel
//     Function 4.5MB request-body limit (T-05-13, Pitfall 5).
//   - Every catalog-visible mutation calls updateTag('product-<slug>') (D-06).
//
// NOTE: tests/admin/products.test.ts (Wave 0 RED scaffold) imports `uploadProductImage`
// directly from this module (not from src/lib/actions/admin-products.ts) — this file is the
// single source of truth for image upload/delete, matching the frontmatter `exports` contract.

import { put, del } from "@vercel/blob"
import { z } from "zod"
import { updateTag } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { products, productImages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Vercel Functions cap request bodies at 4.5MB (Pitfall 5) — reject larger files server-side,
// independent of any client-side size check.
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024

const UploadProductImageSchema = z.object({
  productId: z.string().min(1, "Product id is required"),
  file: z.instanceof(Blob, { message: "A file is required" }),
  altText: z.string().trim().min(1, "Alt text is required for every image"),
  position: z.number().int().min(0).optional(),
})

export type UploadProductImageInput = {
  productId: string
  file: Blob
  altText: string
  position?: number
}

export type UploadProductImageResult =
  | { success: true; id: string; url: string }
  | { success: false; error: string }

export type DeleteProductImageResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Server-mediated product image upload (D-03, ADMN-01).
 *
 * verifyAdminSession() is the FIRST statement — put() is only reached after the admin
 * check passes (T-05-09). Alt text is enforced server-side (T-05-10).
 */
export async function uploadProductImage(input: unknown): Promise<UploadProductImageResult> {
  await verifyAdminSession() // D-02 — FIRST statement, before any parsing or I/O

  const parsed = UploadProductImageSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { productId, file, altText, position } = parsed.data

  if (file.size > MAX_IMAGE_BYTES) {
    return { success: false, error: "Image is too large (max 4.5MB)" }
  }

  try {
    const filename =
      typeof (file as File).name === "string" && (file as File).name.length > 0
        ? (file as File).name
        : "upload.jpg"

    // Server-side put() — reads BLOB_READ_WRITE_TOKEN from env automatically.
    const { url } = await put(`products/${crypto.randomUUID()}-${filename}`, file, {
      access: "public",
    })

    const id = crypto.randomUUID()
    await db.insert(productImages).values({
      id,
      productId,
      url,
      altText,
      position: position ?? 0,
    })

    // D-06: invalidate the cached PDP immediately. Fall back to productId when the row
    // does not resolve to a known slug — invalidation is idempotent and safe to over-fire.
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { slug: true },
    })
    updateTag(`product-${product?.slug ?? productId}`)

    return { success: true, id, url }
  } catch (err) {
    console.error("[blob/upload] uploadProductImage failed:", err)
    return { success: false, error: "Something went wrong uploading the image." }
  }
}

/**
 * Deletes a product image: removes the Blob object (best-effort) and its DB row.
 * verifyAdminSession() first (D-02).
 */
export async function deleteProductImage(imageId: string): Promise<DeleteProductImageResult> {
  await verifyAdminSession() // D-02 — FIRST statement

  const parsedId = z.string().min(1).safeParse(imageId)
  if (!parsedId.success) {
    return { success: false, error: "Invalid image id" }
  }

  try {
    const [image] = await db
      .delete(productImages)
      .where(eq(productImages.id, parsedId.data))
      .returning({ url: productImages.url, productId: productImages.productId })

    if (!image) {
      return { success: false, error: "Image not found" }
    }

    // Best-effort blob deletion — a Blob-side failure must not resurrect the DB row.
    await del(image.url).catch((err) => {
      console.error("[blob/upload] failed to delete blob object:", err)
    })

    const product = await db.query.products.findFirst({
      where: eq(products.id, image.productId),
      columns: { slug: true },
    })
    updateTag(`product-${product?.slug ?? image.productId}`)

    return { success: true }
  } catch (err) {
    console.error("[blob/upload] deleteProductImage failed:", err)
    return { success: false, error: "Something went wrong deleting the image." }
  }
}
