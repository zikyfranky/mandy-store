// src/components/product/VariantError.tsx
// Error fallback for the Suspense stock/price block.
// Server Component — no "use client" directive.
// Displayed when the server fails to load fresh stock/price data (UI-SPEC §4 Error fallback).
// No CTA — user recovers via browser refresh.

export function VariantError() {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      Availability unavailable — refresh to retry
    </p>
  )
}
