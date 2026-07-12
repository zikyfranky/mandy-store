// apply-users-createdat-schema-to-test-db.mjs — add users.created_at to the TEST DB. D-01 (Phase 9).
// Run: node --env-file=.env.local src/scripts/apply-users-createdat-schema-to-test-db.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL not set — per CLAUDE.md it must point at a SEPARATE Neon branch before Phase 9 verification")
  process.exit(1)
}

console.log('Adding "created_at" to table "user" (TEST_DATABASE_URL)...')
const sql = neon(databaseUrl)

async function applyUsersCreatedAt() {
  try {
    await sql`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL
    `
    console.log('✓ Applied: ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_at"')

    const result = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user' AND column_name = 'created_at'
    `
    console.log("Verification — columns found:", JSON.stringify(result))

    if (result.length >= 1) {
      console.log('SUCCESS: created_at present on table "user" (TEST DB)')
    } else {
      console.error("ERROR: created_at column not found after ALTER")
      process.exit(1)
    }
  } catch (err) {
    console.error("Error:", err)
    process.exit(1)
  }
}

applyUsersCreatedAt()
