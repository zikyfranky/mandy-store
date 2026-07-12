// src/app/admin/categories/page.tsx
// Admin Categories list (ADMN-12). cacheComponents: the dynamic read (listCategoriesForAdmin)
// lives inside the Suspense-wrapped inner content, mirroring src/app/admin/customers/page.tsx.
//
// Auth: /admin is proxy-guarded + admin/layout.tsx re-verifies (D-02/D-10 layer 2). NO page-level
// verifyAdminSession here; every mutation the row island / create form invokes re-verifies (Plan 10-02).

import { Suspense } from "react"
import { listCategoriesForAdmin } from "@/lib/catalog/admin-queries"
import { ProductActivePill } from "@/components/admin/OrderStatusBadge"
import { CategoryRowActions } from "@/components/admin/CategoryRowActions"
import { CreateCategoryForm } from "./CreateCategoryForm"

function TagIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
      <path fillRule="evenodd" d="M5.25 2.25a3 3 0 0 0-3 3v4.318a3 3 0 0 0 .879 2.121l9.58 9.581c.92.92 2.39.92 3.31 0l4.319-4.319c.92-.92.92-2.39 0-3.31l-9.58-9.581a3 3 0 0 0-2.122-.879H5.25ZM6.375 7.5a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25Z" clipRule="evenodd" />
    </svg>
  )
}

async function CategoriesContent() {
  const rows = await listCategoriesForAdmin()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
      </div>

      <CreateCategoryForm />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-surface border border-border">
          <TagIcon />
          <h2 className="text-2xl font-semibold text-foreground mt-4">No categories yet</h2>
          <p className="text-sm text-muted mt-2 max-w-sm">Add a category above to start organizing the catalog.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Name</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Slug</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Products</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Status</th>
                <th scope="col" className="text-right font-semibold text-foreground px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-foreground">{c.name}</td>
                  <td className="px-5 py-3 text-muted">{c.slug}</td>
                  <td className="px-5 py-3 text-foreground">{c.productCount}</td>
                  <td className="px-5 py-3"><ProductActivePill isActive={c.isActive} /></td>
                  <td className="px-5 py-3">
                    <CategoryRowActions category={{ id: c.id, name: c.name, isActive: c.isActive }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-10 w-full max-w-sm rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-border last:border-0 bg-zinc-100 dark:bg-zinc-800/50" />
        ))}
      </div>
    </div>
  )
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<CategoriesSkeleton />}>
      <CategoriesContent />
    </Suspense>
  )
}
