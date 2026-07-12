"use client"
// src/components/admin/AdminSidebar.tsx
// Admin shell navigation — desktop 240px sidebar / mobile top-bar + slide-over drawer.
// UI-SPEC Surface 1. Active-route styling via usePathname. Sign-out reuses the
// existing src/app/admin/page.tsx stub button classes/copy.

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { logout } from "@/lib/actions/auth"

const NAV_ITEMS = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
]

function BrandMark() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 group shrink-0">
      <span className="brand-gradient inline-flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-md shadow-indigo-500/30 transition-transform group-hover:scale-105">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" />
        </svg>
      </span>
      <span className="text-base font-semibold tracking-tight text-foreground">
        Mandy<span className="text-brand">Store</span> Admin
      </span>
    </Link>
  )
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              "rounded-lg px-3 py-2.5 text-sm transition-colors border-l-2",
              isActive
                ? "bg-brand-soft text-brand-strong font-semibold border-brand"
                : "text-muted hover:text-foreground hover:bg-brand-soft/50 border-transparent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            ].join(" ")}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function SignOutBlock({ email }: { email: string }) {
  return (
    <div className="border-t border-border pt-4 mt-auto">
      <p className="text-sm text-muted mb-2 truncate" title={email}>
        Signed in as {email}
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar — 240px, hidden below lg: */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 bg-surface border-r border-border p-4">
        <div className="mb-6">
          <BrandMark />
        </div>
        <NavList pathname={pathname} />
        <SignOutBlock email={email} />
      </aside>

      {/* Mobile/tablet top bar */}
      <header className="lg:hidden sticky top-0 z-40 h-16 bg-surface border-b border-border flex items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {/* Heroicons Bars3Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <BrandMark />
      </header>

      {/* Mobile slide-over drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-surface p-4 flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <BrandMark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <SignOutBlock email={email} />
          </div>
        </div>
      )}
    </>
  )
}
