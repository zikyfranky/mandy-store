"use server"
import "server-only"
// src/lib/actions/admin-taxonomy.ts
// Admin category + brand Server Actions (ADMN-12, ADMN-13).
//
// Security / behavior contracts (mirror src/lib/actions/admin-products.ts):
//   - verifyAdminSession() is the literal FIRST statement in every action, before Zod
//     parsing or any DB access (D-10, T-10-03). The proxy cannot protect Server Actions.
//   - D-05 friendly uniqueness: a check-before-insert read returns a human-readable error
//     instead of a 500; the DB UNIQUE constraint on name/slug is the real integrity backstop,
//     and a `code === "23505"` catch handles the two-tab race (Pitfall 5).
//   - D-04 immutable category slug: the slug is generated once at creation via uniqueSlug and
//     never changes on rename (keeps existing URLs/bookmarks stable). Brands have no slug.
//   - D-02 no-cascade: deactivating a category/brand sets isActive=false but NEVER touches
//     product.categoryId/brandId — the deliberate divergence from deactivateProduct (which
//     cascades to variants). Products keep their FK; the admin list surfaces a product count.
//   - D-09 cache invalidation: category mutations fire revalidatePath + updateTag("categories-nav")
//     (the tag Plan 03's cached listActiveCategoriesForNav reads). Brand mutations fire
//     revalidatePath("/", "layout") since brands aren't cached via a tag.
//   - All actions return minimal ActionResult DTOs — never a raw Drizzle record.

import { z } from "zod"
import { and, eq, ne } from "drizzle-orm"
import { revalidatePath, updateTag } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { categories, brands } from "@/lib/db/schema"
import { uniqueSlug } from "@/lib/utils/slug"

// ─── Shared result types ───────────────────────────────────────────────────────

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

function firstZodError(err: z.ZodError, fallback = "Invalid input"): string {
  return err.issues[0]?.message ?? fallback
}

// Postgres unique-violation code — belt-and-suspenders for the two-tab race (Pitfall 5).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
}

const NameInputSchema = z.object({ name: z.string().min(1, "Name is required") })

// ─── Category actions (ADMN-12) ─────────────────────────────────────────────────

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-10 — FIRST statement

  const parsed = NameInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    // D-05 friendly pre-check
    const existing = await db.query.categories.findFirst({
      where: eq(categories.name, parsed.data.name),
      columns: { id: true },
    })
    if (existing) {
      return { success: false, error: "A category with that name already exists" }
    }

    const id = crypto.randomUUID()
    const slug = await uniqueSlug(parsed.data.name, async (s) =>
      !!(await db.query.categories.findFirst({ where: eq(categories.slug, s), columns: { id: true } })),
    )

    await db.insert(categories).values({ id, name: parsed.data.name, slug })

    revalidatePath("/")
    revalidatePath(`/${slug}`)
    updateTag("categories-nav") // D-09
    return { success: true, id }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "A category with that name already exists" }
    }
    console.error("[admin-taxonomy] createCategory failed:", err)
    return { success: false, error: "Something went wrong creating the category." }
  }
}

export async function renameCategory(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-10 — FIRST statement

  const parsed = NameInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    // D-05 duplicate pre-check EXCLUDING self
    const clash = await db.query.categories.findFirst({
      where: and(eq(categories.name, parsed.data.name), ne(categories.id, id)),
      columns: { id: true },
    })
    if (clash) {
      return { success: false, error: "A category with that name already exists" }
    }

    // D-04: name only — slug is immutable
    const [updated] = await db
      .update(categories)
      .set({ name: parsed.data.name })
      .where(eq(categories.id, id))
      .returning({ slug: categories.slug })

    revalidatePath("/")
    revalidatePath(`/${updated?.slug ?? ""}`)
    updateTag("categories-nav") // D-09

    if (!updated) {
      return { success: false, error: "Category not found" }
    }
    return { success: true, id }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "A category with that name already exists" }
    }
    console.error("[admin-taxonomy] renameCategory failed:", err)
    return { success: false, error: "Something went wrong renaming the category." }
  }
}

export async function deactivateCategory(id: string): Promise<ActionResult> {
  await verifyAdminSession() // D-10 — FIRST statement

  try {
    // D-02: soft-delete ONLY — deliberately NO cascade to products (diverges from deactivateProduct).
    const [updated] = await db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, id))
      .returning({ slug: categories.slug })

    revalidatePath("/")
    if (updated?.slug) revalidatePath(`/${updated.slug}`)
    updateTag("categories-nav") // D-09

    if (!updated) {
      return { success: false, error: "Category not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-taxonomy] deactivateCategory failed:", err)
    return { success: false, error: "Something went wrong deactivating the category." }
  }
}

export async function reactivateCategory(id: string): Promise<ActionResult> {
  await verifyAdminSession() // D-10 — FIRST statement

  try {
    const [updated] = await db
      .update(categories)
      .set({ isActive: true })
      .where(eq(categories.id, id))
      .returning({ slug: categories.slug })

    revalidatePath("/")
    if (updated?.slug) revalidatePath(`/${updated.slug}`)
    updateTag("categories-nav") // D-09

    if (!updated) {
      return { success: false, error: "Category not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-taxonomy] reactivateCategory failed:", err)
    return { success: false, error: "Something went wrong reactivating the category." }
  }
}

// ─── Brand actions (ADMN-13) ──────────────────────────────────────────────────
// Same shape as categories minus slug (brands have no slug, D-04). Brands are not in the
// nav, so mutations use revalidatePath("/", "layout") — refreshes home rails + every
// category page's brand-filter facet (getBrandsForCategory is uncached). D-09.

export async function createBrand(input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-10 — FIRST statement

  const parsed = NameInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    const existing = await db.query.brands.findFirst({
      where: eq(brands.name, parsed.data.name),
      columns: { id: true },
    })
    if (existing) {
      return { success: false, error: "A brand with that name already exists" }
    }

    const id = crypto.randomUUID()
    await db.insert(brands).values({ id, name: parsed.data.name })

    revalidatePath("/", "layout")
    return { success: true, id }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "A brand with that name already exists" }
    }
    console.error("[admin-taxonomy] createBrand failed:", err)
    return { success: false, error: "Something went wrong creating the brand." }
  }
}

export async function renameBrand(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-10 — FIRST statement

  const parsed = NameInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    const clash = await db.query.brands.findFirst({
      where: and(eq(brands.name, parsed.data.name), ne(brands.id, id)),
      columns: { id: true },
    })
    if (clash) {
      return { success: false, error: "A brand with that name already exists" }
    }

    const [updated] = await db
      .update(brands)
      .set({ name: parsed.data.name })
      .where(eq(brands.id, id))
      .returning({ id: brands.id })

    revalidatePath("/", "layout")

    if (!updated) {
      return { success: false, error: "Brand not found" }
    }
    return { success: true, id }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "A brand with that name already exists" }
    }
    console.error("[admin-taxonomy] renameBrand failed:", err)
    return { success: false, error: "Something went wrong renaming the brand." }
  }
}

export async function deactivateBrand(id: string): Promise<ActionResult> {
  await verifyAdminSession() // D-10 — FIRST statement

  try {
    // D-02: soft-delete ONLY — no cascade to products.
    const [updated] = await db
      .update(brands)
      .set({ isActive: false })
      .where(eq(brands.id, id))
      .returning({ id: brands.id })

    revalidatePath("/", "layout")

    if (!updated) {
      return { success: false, error: "Brand not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-taxonomy] deactivateBrand failed:", err)
    return { success: false, error: "Something went wrong deactivating the brand." }
  }
}

export async function reactivateBrand(id: string): Promise<ActionResult> {
  await verifyAdminSession() // D-10 — FIRST statement

  try {
    const [updated] = await db
      .update(brands)
      .set({ isActive: true })
      .where(eq(brands.id, id))
      .returning({ id: brands.id })

    revalidatePath("/", "layout")

    if (!updated) {
      return { success: false, error: "Brand not found" }
    }
    return { success: true }
  } catch (err) {
    console.error("[admin-taxonomy] reactivateBrand failed:", err)
    return { success: false, error: "Something went wrong reactivating the brand." }
  }
}
