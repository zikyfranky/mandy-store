// tests/auth/login.test.ts
// Covers: AUTH-02 — User can log in; login accepts email OR username; wrong password fails
// Status: FAILING STUB — implemented in Plan 01-02 (Auth Actions + Auth.js config)
// Will be turned green in Plan 01-02

import { describe, it, expect } from "vitest"

describe("login / authorize()", () => {
  it("accepts valid email + password and returns user", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("accepts valid username + password and returns user (D-04)", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("rejects login with wrong password", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("rejects login for non-existent user", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})
