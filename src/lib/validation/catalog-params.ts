// src/lib/validation/catalog-params.ts
// Zod parse + clamp of URL searchParams before they reach DB queries.
// Security: T-02-04 (SQLi prevention), T-02-06 (DoS resource-exhaustion clamp).
// Pure module — no server-only guard; safe in both environments.

import { z } from "zod"

const sortValues = ["price_asc", "price_desc", "newest", "name_asc"] as const
export type SortKey = (typeof sortValues)[number]

const catalogParamsSchema = z.object({
  // T-02-05: cap search term to 100 chars; trim whitespace
  q: z
    .string()
    .trim()
    .max(100)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),

  // Brand name: optional exact match; passed to parameterized eq() downstream
  brand: z.string().trim().max(100).optional().transform((v) => (v === "" ? undefined : v)),

  // T-02-06: clamp price range; coerce string → int kobo; guard against negatives + extreme values
  minPrice: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined
      const n = parseInt(v, 10)
      if (isNaN(n)) return undefined
      return Math.max(0, Math.min(n, 1_000_000_000))
    }),

  maxPrice: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined
      const n = parseInt(v, 10)
      if (isNaN(n)) return undefined
      return Math.max(0, Math.min(n, 1_000_000_000))
    }),

  // T-02-06: allowlist sort keys; unknown → "newest" default (D-12)
  sort: z
    .string()
    .optional()
    .transform((v): SortKey => {
      if (v && (sortValues as readonly string[]).includes(v)) return v as SortKey
      return "newest"
    }),

  // T-02-06: clamp page 1..1000
  page: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return 1
      const n = parseInt(v, 10)
      if (isNaN(n)) return 1
      return Math.max(1, Math.min(n, 1000))
    }),
})

export type CatalogParams = {
  q?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  sort: SortKey
  page: number
}

export function parseCatalogParams(
  sp: Record<string, string | string[] | undefined>
): CatalogParams {
  // Flatten arrays to first value (URL params can be multi-value)
  const flat: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(sp)) {
    flat[k] = Array.isArray(v) ? v[0] : v
  }

  const parsed = catalogParamsSchema.parse(flat)

  return {
    q: parsed.q,
    brand: parsed.brand,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    sort: parsed.sort,
    page: parsed.page,
  }
}
