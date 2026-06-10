// tests/lib/dal.test.ts
// Covers: ROADMAP SC4 — verifySession() redirects when unauthenticated; verifyAdminSession() rejects non-admin
// Status: FAILING STUB — implemented in Plan 01-02 (DAL + auth config)
// Will be turned green in Plan 01-02

import { describe, it, expect } from "vitest"

describe("verifySession()", () => {
  it("redirects to /account/login when there is no active session", async () => {
    // Implemented in Plan 01-02
    // Expect redirect to be thrown (Next.js redirect throws a NEXT_REDIRECT error)
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("returns { id, role, email } for an authenticated user", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})

describe("verifyAdminSession()", () => {
  it("redirects to / when authenticated user does not have admin role", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })

  it("returns session user for an authenticated admin", async () => {
    // Implemented in Plan 01-02
    expect.fail("stub: implemented in Plan 01-02")
  })
})
