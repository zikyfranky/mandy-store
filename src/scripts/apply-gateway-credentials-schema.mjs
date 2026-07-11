// apply-gateway-credentials-schema.mjs — apply the new gateway_credentials table to Neon (dev DB)
// Uses @neondatabase/serverless directly (the documented fallback pattern —
// drizzle-kit push hits a TTY prompt for new-table creation in this environment).
// Run: node --env-file=.env.local src/scripts/apply-gateway-credentials-schema.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = neon(databaseUrl)

async function applyGatewayCredentialsSchema() {
  console.log("Applying gateway_credentials schema to Neon (DATABASE_URL)...")

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "gateway_credentials" (
        "provider" text NOT NULL,
        "field" text NOT NULL,
        "value" text NOT NULL,
        "is_secret" boolean NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "updated_by" text,
        PRIMARY KEY ("provider", "field")
      )
    `
    console.log("✓ Created table: gateway_credentials")

    // D-09: ships EMPTY — no seeded rows. The resolver falls back to process.env
    // until an admin saves a field (regression-safe).
    const result = await sql`SELECT provider, field FROM gateway_credentials`
    console.log("Verification — rows found:", result.length, "(expected 0)")

    console.log("SUCCESS: gateway_credentials created (empty) in Neon (DATABASE_URL)")
  } catch (err) {
    console.error("Error applying schema:", err)
    process.exit(1)
  }
}

applyGatewayCredentialsSchema()
