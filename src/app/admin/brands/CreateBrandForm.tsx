"use client"
// Inline "Add brand" create form (ADMN-13). Calls createBrand, surfaces the friendly
// duplicate-name error via role="alert", and router.refresh() on success.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createBrand } from "@/lib/actions/admin-taxonomy"

export function CreateBrandForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBrand({ name })
      if (!result.success) {
        setError(result.error)
      } else {
        setName("")
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New brand name…"
        aria-label="New brand name"
        className="w-full max-w-sm rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
      />
      <button
        type="submit"
        disabled={isPending || name.trim().length === 0}
        className="rounded-full bg-brand hover:bg-brand-strong text-white px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {isPending ? "Adding…" : "Add brand"}
      </button>
      {error && <p role="alert" className="text-sm font-semibold text-stock-out">{error}</p>}
    </form>
  )
}
