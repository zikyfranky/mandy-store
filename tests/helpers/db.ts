// tests/helpers/db.ts
// Database test helper — provides db instance and truncation utility for test isolation.
// Used by: tests/db/schema.test.ts, tests/auth/*.test.ts (once implemented in Plans 02/03)

/**
 * Guard: if DATABASE_URL is not set, integration tests are skipped automatically.
 * Unit tests (static schema checks) run regardless of DB availability.
 */
export const hasDatabase = !!process.env.DATABASE_URL

/**
 * Get the Drizzle db instance.
 * Will throw if DATABASE_URL is unset — guard with `hasDatabase` for integration tests.
 */
export async function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot run integration tests")
  }
  // Lazy import to avoid DB connection at module load time
  const { db } = await import("@/lib/db/client")
  return db
}

/**
 * Truncate all auth tables in the correct order (FK-safe).
 * Call in `beforeEach` or `afterEach` for test isolation.
 */
export async function truncateAuthTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }

  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Delete in FK-safe order: child tables first
  await db.delete(schema.sessions)
  await db.delete(schema.accounts)
  await db.delete(schema.verificationTokens)
  await db.delete(schema.processedWebhookEvents)
  await db.delete(schema.users)
}

/**
 * Truncate all catalog tables in the correct FK-safe order.
 * RESEARCH.md §Validation Architecture: variantOptionValues → variants → optionValues
 *   → productOptions → productImages → products → brands → categories
 * Call in `beforeEach` or `afterEach` for test isolation.
 */
export async function truncateCatalogTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot truncate tables")
  }

  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Delete in FK-safe order: junction table first, then leaves, then roots
  await db.delete(schema.variantOptionValues)
  await db.delete(schema.variants)
  await db.delete(schema.optionValues)
  await db.delete(schema.productOptions)
  await db.delete(schema.productImages)
  await db.delete(schema.products)
  await db.delete(schema.brands)
  await db.delete(schema.categories)
}
