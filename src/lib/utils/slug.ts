// src/lib/utils/slug.ts
// Slug generation utility for seed scripts (no server-only guard — seed-only util).
// Source: RESEARCH.md Pattern 7 + PATTERNS.md §src/lib/utils/slug.ts

import slugify from "slugify"

/**
 * Convert a name string to a URL-safe slug.
 * e.g. "Samsung Galaxy S25 Ultra" → "samsung-galaxy-s25-ultra"
 */
export function toSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true })
}

/**
 * Generate a slug that does not collide with existing slugs.
 * Appends "-2", "-3", etc. until a unique slug is found.
 *
 * @param name - The display name to slugify
 * @param exists - Async predicate that returns true if the slug is taken
 */
export async function uniqueSlug(name: string, exists: (s: string) => Promise<boolean>): Promise<string> {
  const base = toSlug(name)
  let slug = base
  let i = 2
  while (await exists(slug)) { slug = `${base}-${i++}` }
  return slug
}
