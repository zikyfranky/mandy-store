// src/app/admin/layout.tsx
// Admin shell — wraps every /admin/* route.
// SECURITY: verifyAdminSession() is layer 2 of dual-layer admin auth (D-02, T-05-19).
// proxy.ts redirect is UI-only and cannot protect Server Actions/Server Components —
// this layout re-verifies independently on every request.
// cacheComponents: the dynamic session check is inside Suspense; the shell frame itself
// stays static (mirrors src/app/admin/page.tsx's existing pattern).

import { Suspense } from "react"
import { verifyAdminSession } from "@/lib/dal"
import { AdminSidebar } from "@/components/admin/AdminSidebar"

async function AdminShellContent({ children }: { children: React.ReactNode }) {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, T-05-19)
  const user = await verifyAdminSession()

  return (
    <div className="lg:flex lg:min-h-screen">
      <AdminSidebar email={user.email} />
      <main className="flex-1 min-w-0 max-w-7xl mx-auto px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="lg:flex lg:min-h-screen animate-pulse" aria-hidden="true">
      <div className="hidden lg:block lg:w-60 lg:shrink-0 bg-surface border-r border-border" />
      <div className="flex-1 max-w-7xl mx-auto px-6 lg:px-8 py-8 w-full">
        <div className="h-8 w-48 rounded bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShellContent>{children}</AdminShellContent>
    </Suspense>
  )
}
