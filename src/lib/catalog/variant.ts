// src/lib/catalog/variant.ts
// Pure variant-resolution and stock-tier utilities.
// No DB, no server-only — safe to import in Client Components AND unit tests.
// CATA-04: variant selection logic (D-15/D-16/D-17)

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Explicit variant shape consumed by the VariantSelector client component.
 * Matches the nested relation shape returned by getProduct() from queries.ts.
 * See RESEARCH.md Pitfall 6 — define an explicit type to prevent shape mismatch.
 */
export type VariantForSelector = {
  id: string
  sku: string | null
  priceKobo: number
  stock: number
  imageUrl: string | null
  optionValues: {
    optionValue: {
      id: string
      value: string
      productOption: { name: string }
    }
  }[]
}

// ─── resolveVariant ───────────────────────────────────────────────────────────

/**
 * Resolve the matching variant for a set of selected option value IDs.
 *
 * @param variants  All active variants for the product (from VariantSelector props)
 * @param selected  Map of { [optionName]: optionValueId } — the current UI selection
 * @returns The first variant whose optionValues contain ALL selected IDs, or undefined.
 *
 * Algorithm: RESEARCH.md Pattern 3 — set-intersection via find() + every()
 * O(variants × optionValues) — adequate for < 50 variants (RESEARCH Assumption A4)
 */
export function resolveVariant(
  variants: VariantForSelector[],
  selected: Record<string, string>
): VariantForSelector | undefined {
  const selectedIds = Object.values(selected)
  return variants.find((v) =>
    selectedIds.every((valId) =>
      v.optionValues.some((ov) => ov.optionValue.id === valId)
    )
  )
}

// ─── stockTier ────────────────────────────────────────────────────────────────

/**
 * Returns the stock tier for a given stock count.
 *
 * @param stock      Current stock count
 * @param threshold  Low-stock threshold (default 5, per RESEARCH.md A3 / UI-SPEC)
 * @returns "out" | "low" | "in"
 *
 * Thresholds (D-17):
 *   stock === 0       → "out"   (Out of stock)
 *   1 ≤ stock ≤ 5    → "low"   (Only N left)
 *   stock > 5        → "in"    (In stock)
 */
export function stockTier(
  stock: number,
  threshold = 5
): "in" | "low" | "out" {
  if (stock === 0) return "out"
  if (stock <= threshold) return "low"
  return "in"
}

// ─── stockLabel ───────────────────────────────────────────────────────────────

/**
 * Returns the human-readable stock label string (D-17 copy from UI-SPEC).
 *
 * @param stock      Current stock count
 * @param threshold  Low-stock threshold (default 5)
 * @returns "In stock" | "Only N left" | "Out of stock"
 */
export function stockLabel(stock: number, threshold = 5): string {
  const tier = stockTier(stock, threshold)
  if (tier === "out") return "Out of stock"
  if (tier === "low") return `Only ${stock} left`
  return "In stock"
}

// ─── isOptionValueAvailable ───────────────────────────────────────────────────

/**
 * Check whether a specific option value is available (has at least one in-stock variant)
 * given the current partial selection — used to drive OOS-disable (D-16).
 *
 * Logic: substitute the candidate value into the selection for its option, then check
 * if any variant with stock > 0 matches that selection.
 *
 * @param variants       All active variants for the product
 * @param selected       Current selection (may be partial — other options may be unset)
 * @param optionName     The option being checked (e.g. "Storage")
 * @param optionValueId  The option value ID being tested (e.g. "ov-256")
 * @returns true if at least one in-stock variant matches the substituted selection
 */
export function isOptionValueAvailable(
  variants: VariantForSelector[],
  selected: Record<string, string>,
  optionName: string,
  optionValueId: string
): boolean {
  // Build a candidate selection with this value substituted in
  const candidateSelected = { ...selected, [optionName]: optionValueId }
  const candidateIds = Object.values(candidateSelected)

  return variants.some(
    (v) =>
      v.stock > 0 &&
      candidateIds.every((valId) =>
        v.optionValues.some((ov) => ov.optionValue.id === valId)
      )
  )
}
