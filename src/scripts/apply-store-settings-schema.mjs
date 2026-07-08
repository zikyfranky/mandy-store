// apply-store-settings-schema.mjs — apply the new store_settings table to Neon (dev DB)
// Uses @neondatabase/serverless directly (the Phase 2/3 documented fallback pattern —
// drizzle-kit push hits a TTY prompt for new-table creation in this environment).
// Run: node --env-file=.env.local src/scripts/apply-store-settings-schema.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = neon(databaseUrl)

async function applyStoreSettingsSchema() {
  console.log("Applying store_settings schema to Neon (DATABASE_URL)...")

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "store_settings" (
        "method" text PRIMARY KEY NOT NULL,
        "enabled" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `
    console.log("✓ Created table: store_settings")

    // D-11: seed the three SC5 methods. NG gateways (paystack/flutterwave/etc.) are
    // intentionally NOT seeded — config.ts falls back to env-only behavior for them
    // (RESEARCH Open Question 3).
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
      console.log("SUCCESS: store_settings created and seeded in Neon (DATABASE_URL)")
    } else {
      console.error("ERROR: expected at least 3 rows, found:", result.length)
      process.exit(1)
    }
  } catch (err) {
    console.error("Error applying schema:", err)
    process.exit(1)
  }
}

applyStoreSettingsSchema()
