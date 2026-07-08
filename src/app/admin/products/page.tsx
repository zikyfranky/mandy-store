// src/app/admin/products/page.tsx
// Admin Products list (ADMN-01/02) — UI-SPEC Surface 2.
// Next.js 16: searchParams is a Promise — MUST await. cacheComponents: dynamic reads
// (listProductsForAdmin) live inside the Suspense-wrapped inner content, mirroring
// src/app/products/page.tsx's existing pattern.
//
// Row-level auth: this page itself does NOT re-call verifyAdminSession — the shared
// /admin/layout.tsx shell already does (D-02 layer 2); every mutation this page's
// client islands invoke (deactivateProduct/reactivateProduct) independently re-verifies
// as its own first statement (T-05-19), so auth is never weakened even if this page is
// somehow reached directly.

import { Suspense } from "react"
import Link from "next/link"
import { listProductsForAdmin } from "@/lib/catalog/admin-queries"
import { formatNGN } from "@/lib/catalog/format"
import { ProductActivePill } from "@/components/admin/OrderStatusBadge"
import { ProductRowActions } from "@/components/admin/ProductRowActions"
import { Pagination } from "@/components/catalog/Pagination"

interface ProductsPageProps {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>
}

function MagnifyingGlassIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-muted" aria-hidden="true">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
    </svg>
  )
}

function PhotoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-zinc-400 dark:text-zinc-600" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CubeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
      <path d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l9.75-5.25Z" />
      <path d="M3.265 10.602 12 15.339l8.735-4.737v6.501a.75.75 0 0 1-.396.66l-8.25 4.5a.75.75 0 0 1-.718 0l-8.25-4.5a.75.75 0 0 1-.396-.66v-6.501Z" />
    </svg>
  )
}

function priceRangeLabel(minKobo: number | null, maxKobo: number | null): string {
  if (minKobo === null || maxKobo === null) return "—"
  if (minKobo === maxKobo) return formatNGN(minKobo)
  return `${formatNGN(minKobo)} – ${formatNGN(maxKobo)}`
}

function stockLabel(stockTotal: number): { text: string; className: string } {
  if (stockTotal <= 0) return { text: "Out of stock", className: "text-stock-out" }
  if (stockTotal <= 5) return { text: "Low stock", className: "text-amber-600 dark:text-amber-400" }
  return { text: "In stock", className: "text-stock-in" }
}

const STATUS_CHIPS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
] as const

function chipHref(status: string, q: string | undefined): string {
  const params = new URLSearchParams()
  if (status !== "all") params.set("status", status)
  if (q) params.set("q", q)
  const qs = params.toString()
  return qs ? `/admin/products?${qs}` : "/admin/products"
}

async function ProductsContent({ searchParams }: ProductsPageProps) {
  const sp = await searchParams
  const status: "all" | "active" | "deactivated" =
    sp.status === "active" || sp.status === "deactivated" ? sp.status : "all"
  const q = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  const result = await listProductsForAdmin({ status, q, page })
  const hasFilters = !!(q || status !== "all")

  const spString = new URLSearchParams({
    ...(status !== "all" ? { status } : {}),
    ...(q ? { q } : {}),
  }).toString()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Add product
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Search — plain GET form, no client JS required */}
        <form method="GET" action="/admin/products" className="flex items-center gap-2 w-full max-w-sm">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search products…"
            aria-label="Search products"
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

        {/* Status filter chips — All / Active / Deactivated, URL-driven */}
        <div className="flex items-center gap-2">
          {STATUS_CHIPS.map((chip) => {
            const isCurrent = status === chip.value
            return (
              <Link
                key={chip.value}
                href={chipHref(chip.value, q)}
                aria-current={isCurrent ? "true" : undefined}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                  isCurrent
                    ? "bg-brand-soft text-brand-strong border-brand/30"
                    : "bg-surface text-muted border-border hover:text-foreground hover:bg-brand-soft/50",
                ].join(" ")}
              >
                {chip.label}
              </Link>
            )
          })}
        </div>
      </div>

      {result.products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-surface border border-border">
          <CubeIcon />
          {hasFilters ? (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No products match your filters</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">
                Try a different search term or clear your filters.
              </p>
              <Link
                href="/admin/products"
                className="mt-4 text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No products yet</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">
                Add your first product to start selling. Products need at least one
                variant with a price and stock level before they appear on the storefront.
              </p>
              <Link
                href="/admin/products/new"
                className="mt-4 rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Add product
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Name</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Variants</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Price range</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Stock</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Status</th>
                <th scope="col" className="text-right font-semibold text-foreground px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.products.map((product) => {
                const stock = stockLabel(product.stockTotal)
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                          <PhotoIcon />
                        </div>
                        <span className="font-semibold text-foreground line-clamp-2">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{product.variantCount}</td>
                    <td className="px-5 py-3 text-foreground">
                      {priceRangeLabel(product.minPriceKobo, product.maxPriceKobo)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${stock.className}`}>{stock.text}</span>
                    </td>
                    <td className="px-5 py-3">
                      <ProductActivePill isActive={product.isActive} />
                    </td>
                    <td className="px-5 py-3">
                      <ProductRowActions
                        productId={product.id}
                        productName={product.name}
                        isActive={product.isActive}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={result.page} pageCount={result.pageCount} searchParamsString={spString} />
    </div>
  )
}

function ProductsSkeleton() {
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

export default function AdminProductsPage(props: ProductsPageProps) {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <ProductsContent {...props} />
    </Suspense>
  )
}
