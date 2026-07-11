// tests/payments/gateway-credentials.test.ts — Phase 8 (D-03 / ADMN-07)
// Unit tests for the DB-first / env-fallback / fail-closed resolver. DB client is mocked;
// the crypto module is spied (calls through by default) so the real decrypt path runs for
// the DB-first test but can be forced to throw for the propagation test. React.cache is
// mocked to a passthrough so getGatewayCredentialsMap re-reads mockRows on every call.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import crypto from "crypto"

vi.mock("server-only", () => ({}))

// React.cache → identity passthrough (no cross-call/cross-test memoization in the test env).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return { ...actual, cache: (fn: unknown) => fn }
})

// Controlled row set for the mocked db.select().from(gatewayCredentials).
const { mockRows } = vi.hoisted(() => ({ mockRows: { current: [] as Array<Record<string, unknown>> } }))
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => Promise.resolve(mockRows.current) }) },
}))

// Spy on crypto: calls through to the real implementation by default.
vi.mock("@/lib/payments/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/crypto")>()
  return { ...actual, decryptSecret: vi.fn(actual.decryptSecret) }
})

import { getGatewayConfig, getGatewayCredential, getGatewayCredentialsMap } from "@/lib/payments/gateway-credentials"
import { encryptSecret, decryptSecret } from "@/lib/payments/crypto"

beforeEach(() => {
  mockRows.current = []
  vi.clearAllMocks()
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"))
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getGatewayConfig — precedence", () => {
  it("DB-first: a non-empty DB secret row wins over the env var (decrypted)", async () => {
    mockRows.current = [
      { provider: "stripe", field: "secret_key", value: encryptSecret("sk_from_db"), isSecret: true },
    ]
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_env_value")
    const cfg = await getGatewayConfig("stripe")
    expect(cfg.secret_key).toBe("sk_from_db")
  })

  it("env fallback: no DB row → resolves from process.env", async () => {
    mockRows.current = []
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_env_value")
    const cfg = await getGatewayConfig("stripe")
    expect(cfg.secret_key).toBe("sk_env_value")
  })

  it("fail-closed: DB empty + env unset → field is omitted (undefined, not empty string)", async () => {
    mockRows.current = []
    vi.stubEnv("STRIPE_SECRET_KEY", "")
    const cfg = await getGatewayConfig("stripe")
    expect(cfg.secret_key).toBeUndefined()
    expect("secret_key" in cfg).toBe(false)
  })

  it("empty string: an empty-string DB row is treated as absent → env fallback wins", async () => {
    mockRows.current = [
      { provider: "stripe", field: "secret_key", value: "", isSecret: true },
    ]
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_env_value")
    const cfg = await getGatewayConfig("stripe")
    expect(cfg.secret_key).toBe("sk_env_value")
  })

  it("non-secret DB field is returned as-is without calling decryptSecret", async () => {
    mockRows.current = [
      { provider: "paystack", field: "public_key", value: "pk_plain", isSecret: false },
    ]
    const cfg = await getGatewayConfig("paystack")
    expect(cfg.public_key).toBe("pk_plain")
    expect(vi.mocked(decryptSecret)).not.toHaveBeenCalled()
  })

  it("getGatewayCredential returns a single field, delegating to getGatewayConfig", async () => {
    mockRows.current = []
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_paystack_env")
    expect(await getGatewayCredential("paystack", "secret_key")).toBe("sk_paystack_env")
  })

  it("getGatewayCredentialsMap is a function (React.cache-wrapped)", () => {
    expect(typeof getGatewayCredentialsMap).toBe("function")
  })

  it("decryptSecret's throw propagates OUT of getGatewayConfig (never coerced to empty)", async () => {
    mockRows.current = [
      { provider: "stripe", field: "secret_key", value: "v1:bad:bad:bad", isSecret: true },
    ]
    vi.mocked(decryptSecret).mockImplementationOnce(() => {
      throw new Error("decrypt failed — rotated key")
    })
    await expect(getGatewayConfig("stripe")).rejects.toThrow(/rotated key/)
  })
})
