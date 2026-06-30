// apply-order-schema-to-test-db.mjs — apply order + order_item tables to TEST DB
// Run: node --env-file=.env.local src/scripts/apply-order-schema-to-test-db.mjs

import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL not set")
  process.exit(1)
}

console.log("Applying to TEST_DATABASE_URL...")
const sql = neon(databaseUrl)

async function applyOrderSchema() {
  try {
    // Create the "order" table (the order_status enum already exists from Phase 1)
    await sql`
      CREATE TABLE IF NOT EXISTS "order" (
        "id" text PRIMARY KEY NOT NULL,
        "reference" text NOT NULL,
        "guest_token" text NOT NULL,
        "status" "order_status" DEFAULT 'pending_payment' NOT NULL,
        "user_id" text REFERENCES "user"("id") ON DELETE NO ACTION,
        "customer_email" text NOT NULL,
        "subtotal_kobo" integer NOT NULL,
        "shipping_kobo" integer NOT NULL,
        "total_kobo" integer NOT NULL,
        "shipping_name" text NOT NULL,
        "shipping_phone" text NOT NULL,
        "shipping_street" text NOT NULL,
        "shipping_city" text NOT NULL,
        "shipping_state" text NOT NULL,
        "shipping_landmark" text,
        "stripe_payment_intent_id" text,
        "paypal_order_id" text,
        "refund_reason" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "paid_at" timestamp,
        CONSTRAINT "order_reference_unique" UNIQUE("reference"),
        CONSTRAINT "order_guest_token_unique" UNIQUE("guest_token")
      )
    `
    console.log("✓ Created table: order")

    await sql`CREATE INDEX IF NOT EXISTS "order_user_idx" ON "order" USING btree ("user_id")`
    await sql`CREATE INDEX IF NOT EXISTS "order_guest_token_idx" ON "order" USING btree ("guest_token")`
    await sql`CREATE INDEX IF NOT EXISTS "order_stripe_pi_idx" ON "order" USING btree ("stripe_payment_intent_id")`
    console.log("✓ Created indexes for order table")

    await sql`
      CREATE TABLE IF NOT EXISTS "order_item" (
        "id" text PRIMARY KEY NOT NULL,
        "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
        "variant_id" text NOT NULL REFERENCES "variant"("id") ON DELETE NO ACTION,
        "quantity" integer NOT NULL,
        "price_kobo" integer NOT NULL,
        "product_name" text NOT NULL,
        "variant_label" text NOT NULL,
        "line_total_kobo" integer NOT NULL
      )
    `
    console.log("✓ Created table: order_item")

    await sql`CREATE INDEX IF NOT EXISTS "order_item_order_idx" ON "order_item" USING btree ("order_id")`
    console.log("✓ Created index for order_item table")

    const result = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('order', 'order_item')
      ORDER BY table_name
    `
    const tableNames = result.map((r) => r.table_name)
    console.log("Verification — tables found:", tableNames)

    if (tableNames.includes("order") && tableNames.includes("order_item")) {
      console.log("SUCCESS: Both tables created in TEST DB")
    } else {
      console.error("ERROR: Some tables are missing:", tableNames)
      process.exit(1)
    }
  } catch (err) {
    console.error("Error:", err)
    process.exit(1)
  }
}

applyOrderSchema()
