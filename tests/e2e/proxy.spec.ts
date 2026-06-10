// tests/e2e/proxy.spec.ts
// Covers: ROADMAP SC4 — proxy.ts redirects /admin to login for unauthenticated; authed non-admin to /
// Status: FAILING STUB — implemented in Plan 01-02 (proxy.ts + auth config)
// Will be turned green in Plan 01-02 once the dev server runs with auth configured

import { test, expect } from "@playwright/test"

test.describe("proxy.ts route protection (SC4)", () => {
  test("GET /admin redirects unauthenticated user to /account/login", async ({ page }) => {
    // Implemented in Plan 01-02 (requires running dev server with proxy.ts configured)
    // This test will be green once Plan 01-02 wires up Auth.js and proxy.ts
    await page.goto("/admin")
    // After proxy.ts is configured, this should redirect to /account/login
    // For now this is a stub — server may return 404 or the page may not exist
    test.skip(true, "stub: implemented in Plan 01-02")
  })

  test("GET /admin redirects authenticated non-admin user to /", async ({ page }) => {
    // Implemented in Plan 01-02
    test.skip(true, "stub: implemented in Plan 01-02")
  })

  test("GET /account/orders redirects unauthenticated user to /account/login", async ({ page }) => {
    // Implemented in Plan 01-02
    test.skip(true, "stub: implemented in Plan 01-02")
  })
})
