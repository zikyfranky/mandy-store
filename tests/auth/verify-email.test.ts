// tests/auth/verify-email.test.ts
// Covers: AUTH-01 — Email verification blocks login until confirmed; expired token rejected
// Status: FAILING STUB — implemented in Plan 01-02 (Auth Actions)
// Will be turned green in Plan 01-02

import { describe, it, expect } from "vitest"

describe("email verification", () => {
  it("blocks login for an unverified user (emailVerified is null)", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("allows login after email is successfully verified", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("rejects an expired verification token", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("deletes the verification token after successful verification", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})
