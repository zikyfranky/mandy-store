// apply-gateway-credentials-schema-to-test-db.mjs — apply gateway_credentials table to TEST DB
// Run: node --env-file=.env.local src/scripts/apply-gateway-credentials-schema-to-test-db.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL not set")
  process.exit(1)
}

console.log("Applying gateway_credentials schema to TEST_DATABASE_URL...")
const sql = neon(databaseUrl)

async function applyGatewayCredentialsSchema() {
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

    // D-09: ships EMPTY — no seeded rows.
    const result = await sql`SELECT provider, field FROM gateway_credentials`
    console.log("Verification — rows found:", result.length, "(expected 0)")

    console.log("SUCCESS: gateway_credentials created (empty) in TEST DB")
  } catch (err) {
    console.error("Error:", err)
    process.exit(1)
  }
}

applyGatewayCredentialsSchema()
