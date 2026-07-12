// src/app/admin/customers/page.tsx
// Admin Customers list (ADMN-08, D-05). Next.js 16: searchParams is a Promise — MUST await.
// cacheComponents: dynamic reads (verifyAdminSession + listCustomersForAdmin) live inside the
// Suspense-wrapped inner content, mirroring src/app/admin/products/page.tsx.
//
// Auth: /admin is proxy-guarded + admin/layout.tsx re-verifies (D-02 layer 2). This page calls
// verifyAdminSession() to obtain the acting admin's id (to disable the self-row role toggle);
// every mutation the row island invokes independently re-verifies (Plan 09-02).

import { Suspense } from "react"
import Link from "next/link"
import { verifyAdminSession } from "@/lib/dal"
import { listCustomersForAdmin } from "@/lib/catalog/admin-queries"
import { RoleBadge } from "@/components/admin/RoleBadge"
import { CustomerRowActions } from "@/components/admin/CustomerRowActions"
import { Pagination } from "@/components/catalog/Pagination"

interface CustomersPageProps {
  searchParams: Promise<{ q?: string; page?: string }>
}

function MagnifyingGlassIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-muted" aria-hidden="true">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
      <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
    </svg>
  )
}

async function CustomersContent({ searchParams }: CustomersPageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  const admin = await verifyAdminSession()
  const result = await listCustomersForAdmin({ q, page })
  const hasFilters = !!q

  const spString = new URLSearchParams({ ...(q ? { q } : {}) }).toString()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Search — plain GET form, no client JS required */}
        <form method="GET" action="/admin/customers" className="flex items-center gap-2 w-full max-w-sm">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or email…"
            aria-label="Search customers"
            className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
          />
          <button
            type="submit"
            aria-label="Search"
            className="flex-shrink-0 rounded-full bg-brand-soft border border-border p-2 hover:bg-brand-soft/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <MagnifyingGlassIcon />
          </button>
        </form>
      </div>

      {result.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-surface border border-border">
          <UsersIcon />
          {hasFilters ? (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No customers match your search</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">Try a different name or email.</p>
              <Link
                href="/admin/customers"
                className="mt-4 text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
              >
                Clear search
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No customers yet</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">
                Registered customers will appear here once people create accounts.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Name</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Email</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Role</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Verified</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Joined</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Orders</th>
                <th scope="col" className="text-right font-semibold text-foreground px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-foreground">{r.name ?? "—"}</td>
                  <td className="px-5 py-3 text-foreground">{r.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={r.role} /></td>
                  <td className="px-5 py-3">
                    {r.emailVerified ? (
                      <span className="font-semibold text-green-600 dark:text-green-400" title="Email verified">✓</span>
                    ) : (
                      <span className="text-muted" title="Not verified">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted">{r.createdAt.toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-foreground">{r.orderCount}</td>
                  <td className="px-5 py-3">
                    <CustomerRowActions
                      customerId={r.id}
                      email={r.email}
                      role={r.role}
                      isSelf={r.id === admin.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={result.page} pageCount={result.pageCount} searchParamsString={spString} />
    </div>
  )
}

function CustomersSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-10 w-full max-w-sm rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-border last:border-0 bg-zinc-100 dark:bg-zinc-800/50" />
        ))}
      </div>
    </div>
  )
}

export default function AdminCustomersPage(props: CustomersPageProps) {
  return (
    <Suspense fallback={<CustomersSkeleton />}>
      <CustomersContent {...props} />
    </Suspense>
  )
}
