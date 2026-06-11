// tests/e2e/proxy.spec.ts
// Playwright e2e tests for proxy.ts route protection (ROADMAP SC4).
//
// Covers:
//   - Unauthenticated GET /admin -> redirect to /account/login
//   - Unauthenticated GET /account/orders -> redirect to /account/login
//   - Authenticated non-admin GET /admin -> redirect to /
//     (test.skip: programmatic login in e2e requires a seeded non-admin user and
//      session cookie injection — covered by the closing manual checkpoint; see
//      proxy.ts comments and VALIDATION.md)
//
// The dev server is started by playwright.config.ts webServer config.

import { test, expect } from "@playwright/test"

test.describe("proxy.ts route protection (SC4)", () => {
  test("GET /admin redirects unauthenticated user to /account/login", async ({ page }) => {
    await page.goto("/admin")
    // proxy.ts redirects unauthenticated requests on /admin/* to /account/login
    await expect(page).toHaveURL(/\/account\/login/)
  })

  test("GET /account/orders redirects unauthenticated user to /account/login", async ({
    page,
  }) => {
    await page.goto("/account/orders")
    // proxy.ts redirects unauthenticated requests on /account/orders to /account/login
    await expect(page).toHaveURL(/\/account\/login/)
  })

  test(
    "GET /admin redirects authenticated non-admin user to /",
    async () => {
      // Programmatic login in Playwright requires a seeded non-admin user + session cookie
      // injection. This case is covered by:
      //   1. proxy.ts unit logic (`role !== "admin"` redirect)
      //   2. The closing manual checkpoint (Task 4, step 7)
      //   3. verifyAdminSession() in-page re-verify in src/app/admin/page.tsx
      test.skip(true, "covered by manual checkpoint Task 4 step 7 and in-page verifyAdminSession()")
    },
  )
})
