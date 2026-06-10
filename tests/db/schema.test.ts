// tests/db/schema.test.ts
// Covers: ROADMAP SC5 — order_status enum (8 values) + processed_webhook_events unique constraint
// Static enum test: passes without DATABASE_URL (no DB needed)
// Unique-constraint test: skipped if DATABASE_URL is not set

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { orderStatusEnum, processedWebhookEvents } from "@/lib/db/schema"
import { hasDatabase, truncateAuthTables } from "../helpers/db"

// ─── Static schema tests (always run, no DB needed) ──────────────────────────

describe("orderStatusEnum", () => {
  it("has exactly 8 canonical values in the correct order (ROADMAP SC5)", () => {
    expect(orderStatusEnum.enumValues).toEqual([
      "pending_payment",
      "awaiting_bank_transfer",
      "payment_confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "payment_failed",
    ])
  })
})

describe("processedWebhookEvents schema", () => {
  it("exports the processedWebhookEvents table", () => {
    expect(processedWebhookEvents).toBeDefined()
  })

  it("has a named unique constraint processed_webhook_events_id_unique", () => {
    // Check that the unique constraint with the canonical name is defined in schema config.
    // Drizzle stores table extra config in a symbol-keyed builder function.
    const table = processedWebhookEvents as unknown as Record<symbol, unknown>
    const extraConfigBuilderSym = Object.getOwnPropertySymbols(table).find(
      (s) => s.toString().includes("ExtraConfigBuilder")
    )
    expect(extraConfigBuilderSym).toBeDefined()

    const builder = table[extraConfigBuilderSym!] as (cols: Record<string, unknown>) => Record<string, { name?: string }>
    const extraConfig = builder({})

    const uniqueNames = Object.values(extraConfig).map((v) => v?.name)
    expect(uniqueNames).toContain("processed_webhook_events_id_unique")
  })
})

// ─── Integration tests (require DATABASE_URL — skipped in CI without DB) ─────

describe.skipIf(!hasDatabase)("processedWebhookEvents unique constraint (integration)", () => {
  beforeEach(async () => {
    await truncateAuthTables()
  })

  afterEach(async () => {
    await truncateAuthTables()
  })

  it("rejects inserting the same event ID twice with a unique violation", async () => {
    const { getDb } = await import("../helpers/db")
    const db = await getDb()

    const testEvent = {
      id: "evt_test_unique_" + Date.now(),
      provider: "stripe",
    }

    // First insert should succeed
    await db.insert(processedWebhookEvents).values(testEvent)

    // Second insert with same ID should throw
    await expect(
      db.insert(processedWebhookEvents).values(testEvent)
    ).rejects.toThrow()
  })
})
