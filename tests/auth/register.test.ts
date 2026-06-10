// tests/auth/register.test.ts
// Covers: AUTH-01 — User can register with email and password
// Status: FAILING STUB — implemented in Plan 01-02 (Auth Actions)
// Will be turned green in Plan 01-02

import { describe, it, expect } from "vitest"

describe("register()", () => {
  it("creates a new user with email, password, name, and username", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("rejects registration with a duplicate email", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("rejects registration with a duplicate username", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("sends a verification email after successful registration", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("auto-promotes matching ADMIN_EMAILS to admin role (D-10)", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})
