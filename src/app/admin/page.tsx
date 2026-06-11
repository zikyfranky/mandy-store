// src/app/admin/page.tsx
// Admin dashboard stub — Protected Server Component.
// SECURITY: verifyAdminSession() is called FIRST — in-page re-verify (SC4, CLAUDE.md dual-layer).
// proxy.ts alone is NOT sufficient; Server Actions/Server Components must re-verify independently.
// T-01-16, T-01-17: double-auth enforces admin role at the render layer, not just the proxy redirect.

import { verifyAdminSession } from "@/lib/dal"
import { logout } from "@/lib/actions/auth"

export default async function AdminPage() {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, RESEARCH Pitfall 3)
  const user = await verifyAdminSession()

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Admin dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Signed in as {user.email}
          </p>
        </div>

        {/* AUTH-03: logout control accessible from any admin page */}
        <form
          action={async () => {
            "use server"
            await logout()
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>

      <p className="text-gray-600 dark:text-gray-400">
        Admin panel is coming in Phase 5 (Admin Panel).
      </p>
    </main>
  )
}
