// tests/auth/session.test.ts
// Covers: AUTH-02 — Session DB row exists after credentials login (D-08 workaround)
// Status: FAILING STUB — implemented in Plan 01-02 (Auth.js config + DB session workaround)
// Will be turned green in Plan 01-02

import { describe, it, expect } from "vitest"

describe("database session persistence (D-08)", () => {
  it("creates a session DB row after successful credentials login", async () => {
    // Implemented in Plan 01-02 (requires D-08 jwt callback workaround)
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("session row has correct userId and expires timestamp", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("session persists across simulated page refresh (cookie + DB row)", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})
