// apply-users-createdat-schema.mjs — add users.created_at column to Neon (dev DB)
// Uses @neondatabase/serverless directly (the documented fallback pattern —
// drizzle-kit push can hit a TTY prompt in this environment). D-01 (Phase 9).
// Run: node --env-file=.env.local src/scripts/apply-users-createdat-schema.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = neon(databaseUrl)

async function applyUsersCreatedAt() {
  console.log('Adding "created_at" to table "user" (DATABASE_URL)...')

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
      console.log('SUCCESS: created_at present on table "user" (DATABASE_URL)')
    } else {
      console.error("ERROR: created_at column not found after ALTER")
      process.exit(1)
    }
  } catch (err) {
    console.error("Error applying schema:", err)
    process.exit(1)
  }
}

applyUsersCreatedAt()
