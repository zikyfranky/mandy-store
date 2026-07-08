// apply-store-settings-schema-to-test-db.mjs — apply store_settings table to TEST DB
// Run: node --env-file=.env.local src/scripts/apply-store-settings-schema-to-test-db.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL not set")
  process.exit(1)
}

console.log("Applying store_settings schema to TEST_DATABASE_URL...")
const sql = neon(databaseUrl)

async function applyStoreSettingsSchema() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "store_settings" (
        "method" text PRIMARY KEY NOT NULL,
        "enabled" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `
    console.log("✓ Created table: store_settings")

    await sql`
      INSERT INTO "store_settings" (method, enabled) VALUES
        ('stripe', true), ('paypal', false), ('bank_transfer', true)
      ON CONFLICT (method) DO NOTHING
    `
    console.log("✓ Seeded store_settings rows: stripe, paypal, bank_transfer")

    const result = await sql`
      SELECT method, enabled FROM store_settings ORDER BY method
    `
    console.log("Verification — rows found:", JSON.stringify(result))

    if (result.length >= 3) {
      console.log("SUCCESS: store_settings created and seeded in TEST DB")
    } else {
      console.error("ERROR: expected at least 3 rows, found:", result.length)
      process.exit(1)
    }
  } catch (err) {
    console.error("Error:", err)
    process.exit(1)
  }
}

applyStoreSettingsSchema()
