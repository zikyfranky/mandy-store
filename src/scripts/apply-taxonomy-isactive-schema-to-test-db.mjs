// apply-taxonomy-isactive-schema-to-test-db.mjs — add is_active to "brand" + "category" (TEST DB). D-01/D-11 (Phase 10).
// Run: node --env-file=.env.local src/scripts/apply-taxonomy-isactive-schema-to-test-db.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL not set — per CLAUDE.md it must point at a SEPARATE Neon branch before phase verification")
  process.exit(1)
}

console.log('Adding "is_active" to "brand" + "category" (TEST_DATABASE_URL)...')
const sql = neon(databaseUrl)

async function apply() {
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
      console.log("SUCCESS: is_active present on brand + category (TEST DB)")
    } else {
      console.error("ERROR: is_active missing on one/both tables")
      process.exit(1)
    }
  } catch (err) {
    console.error("Error:", err)
    process.exit(1)
  }
}

apply()
