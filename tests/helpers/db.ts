// tests/helpers/db.ts
// Database test helper — provides db instance and truncation utilities for test isolation.
//
// SAFETY: DB-backed integration tests TRUNCATE tables. They run ONLY against a
// separate test database supplied via TEST_DATABASE_URL (see vitest.config.ts,
// which repoints the db client at it). If TEST_DATABASE_URL is not set:
//   - `hasDatabase` is false, so integration tests skip (`it.skipIf(!hasDatabase)`)
//   - the truncate helpers throw, so the dev database can never be wiped
// Pure unit tests (cart logic, variant resolver) don't use this helper and always run.

/**
 * True only when a dedicated TEST_DATABASE_URL is configured. Integration tests
 * gate on this so they never run destructive truncation against the dev database.
 */
export const hasDatabase = !!process.env.TEST_DATABASE_URL

/** Hard guard: refuse any destructive DB operation unless a separate test DB is configured. */
function assertTestDatabase(): void {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "Refusing to run DB integration tests: TEST_DATABASE_URL is not set. " +
        "Truncation would wipe your dev catalog/users. Point TEST_DATABASE_URL at a " +
        "separate Neon branch (see CLAUDE.md › Testing). Pure unit tests run without it.",
    )
  }
}

/**
 * Get the Drizzle db instance (connected to TEST_DATABASE_URL when running tests).
 * Guard call sites with `hasDatabase` for integration tests.
 */
export async function getDb() {
  assertTestDatabase()
  // Lazy import to avoid DB connection at module load time
  const { db } = await import("@/lib/db/client")
  return db
}

/**
 * Truncate all auth tables in FK-safe order (child tables first).
 * Call in `beforeEach` / `afterEach` for test isolation.
 */
export async function truncateAuthTables() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.sessions)
  await db.delete(schema.accounts)
  await db.delete(schema.verificationTokens)
  await db.delete(schema.processedWebhookEvents)
  await db.delete(schema.users)
}

/**
 * Truncate cart tables in FK-safe order: cart_item (child) before cart (parent).
 * (03-VALIDATION.md: cartItems → cart)
 */
export async function truncateCartTables() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.cartItems)
  await db.delete(schema.cart)
}

/**
 * Truncate order tables in FK-safe order: order_item (child) → order (parent),
 * then processed_webhook_events (no FK to orders; safe either side).
 */
export async function truncateOrderTables() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.orderItems)
  await db.delete(schema.orders)
  await db.delete(schema.processedWebhookEvents)
}

/**
 * Truncate all catalog tables in FK-safe order.
 * (variantOptionValues → variants → optionValues → productOptions → productImages
 *   → products → brands → categories)
 */
export async function truncateCatalogTables() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.variantOptionValues)
  await db.delete(schema.variants)
  await db.delete(schema.optionValues)
  await db.delete(schema.productOptions)
  await db.delete(schema.productImages)
  await db.delete(schema.products)
  await db.delete(schema.brands)
  await db.delete(schema.categories)
}

/**
 * Truncate the store_settings table (D-11 / ADMN-04).
 * No FK dependents — safe to delete standalone.
 */
export async function truncateStoreSettingsTable() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  await db.delete(schema.storeSettings)
}
