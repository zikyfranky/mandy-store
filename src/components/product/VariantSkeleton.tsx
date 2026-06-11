// src/components/product/VariantSkeleton.tsx
// Suspense fallback for the fresh stock/price block (VariantStockPriceBlock).
// Server Component — no "use client" directive.
// aria-hidden hides skeleton from screen readers (UI-SPEC §4 Loading skeleton).

export function VariantSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {/* Price skeleton */}
      <div className="h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />

      {/* Stock indicator skeleton */}
      <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />

      {/* Variant pills skeleton */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-8 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-8 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>

      {/* CTA skeleton */}
      <div className="h-14 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
    </div>
  )
}
