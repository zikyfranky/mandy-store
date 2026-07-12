// src/components/admin/RoleBadge.tsx
// Role pill for the admin customers list (Phase 9, ADMN-08/D-05). Mirrors ProductActivePill.
// Text label always present (never color-only) per UI-SPEC accessibility.

const BADGE_SHAPE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold"

export function RoleBadge({ role }: { role: "customer" | "admin" }) {
  return role === "admin" ? (
    <span className={`${BADGE_SHAPE} bg-brand-soft text-brand-strong border-brand/30`}>
      Admin
    </span>
  ) : (
    <span
      className={`${BADGE_SHAPE} bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700`}
    >
      Customer
    </span>
  )
}
