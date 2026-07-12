// apply-taxonomy-isactive-schema.mjs — add is_active to "brand" + "category" (dev DB).
// Uses @neondatabase/serverless directly (the documented fallback pattern —
// drizzle-kit push can hit a TTY prompt in this environment). D-01/D-11 (Phase 10).
// Run: node --env-file=.env.local src/scripts/apply-taxonomy-isactive-schema.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = neon(databaseUrl)

async function apply() {
  console.log('Adding "is_active" to "brand" + "category" (DATABASE_URL)...')

  try {
    await sql`ALTER TABLE "brand" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL`
    await sql`ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL`
    console.log('✓ Applied: ALTER TABLE brand/category ADD COLUMN IF NOT EXISTS "is_active"')

    const result = await sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('brand', 'category') AND column_name = 'is_active'
    `
    console.log("Verification — columns found:", JSON.stringify(result))

    if (result.length === 2) {
      console.log("SUCCESS: is_active present on brand + category (DATABASE_URL)")
    } else {
      console.error("ERROR: is_active missing on one/both tables")
      process.exit(1)
    }
  } catch (err) {
    console.error("Error applying schema:", err)
    process.exit(1)
  }
}

apply()
