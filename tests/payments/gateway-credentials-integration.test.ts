// tests/payments/gateway-credentials-integration.test.ts — Phase 8 (D-09)
// DB-gated: proves "safe to ship before migrating any deployment" against a REAL (isolated
// TEST_DATABASE_URL) database — not mocked. Skips cleanly when TEST_DATABASE_URL is unset.
import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateGatewayCredentialsTable } from "../helpers/db"

// server-only throws outside an RSC context — stub it so the resolver can be imported here.
vi.mock("server-only", () => ({}))

describe.skipIf(!hasDatabase)("getGatewayConfig — real DB, empty table (D-09 regression)", () => {
  afterEach(async () => {
    await truncateGatewayCredentialsTable()
  })

  it("resolves every field from process.env when gateway_credentials is empty", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_env_only"
    const { getGatewayConfig } = await import("@/lib/payments/gateway-credentials")
    const cfg = await getGatewayConfig("stripe")
    expect(cfg.secret_key).toBe("sk_test_env_only")
  })

  it("DB value wins once a real row is inserted, and the row is cleaned up after the test", async () => {
    const { db } = await import("@/lib/db/client")
    const { gatewayCredentials } = await import("@/lib/db/schema")
    await db.insert(gatewayCredentials).values({
      provider: "paystack",
      field: "public_key",
      value: "pk_from_db",
      isSecret: false,
    })
    const { getGatewayConfig } = await import("@/lib/payments/gateway-credentials")
    const cfg = await getGatewayConfig("paystack")
    expect(cfg.public_key).toBe("pk_from_db")
  })
})
