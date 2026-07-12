# 09-03 Summary — Admin customers UI (ADMN-08, ADMN-10)

**Status:** COMPLETE — 2026-07-12 (executed inline)

## What was built
- **`src/components/admin/RoleBadge.tsx`** — `RoleBadge({role})` mirroring `ProductActivePill` (admin = indigo/brand, customer = neutral zinc; always text-labelled).
- **`src/app/admin/customers/page.tsx`** — Suspense-wrapped list mirroring products page. Awaits `searchParams` (Next.js 16), calls `verifyAdminSession()` for the acting admin's id, `listCustomersForAdmin({q,page})`. Columns: Name, Email, Role badge, Verified (✓/—), Joined (`createdAt.toLocaleDateString()`), Orders, Actions. GET search form, empty states, `<Pagination>`. Passes ONLY `{customerId,email,role,isSelf}` to the island (no row spread — D-06).
- **`src/components/admin/CustomerRowActions.tsx`** — `"use client"`. "Send password reset" (immediate, `role="status"` confirmation) + role toggle behind a `role="dialog" aria-modal` confirm. Self-row toggle `disabled`/`aria-disabled` with hint; last-admin error surfaced verbatim from the server action (server remains sole authority).
- **`src/components/admin/AdminSidebar.tsx`** — added `{ href: "/admin/customers", label: "Customers" }` (Products, Orders, Customers, Settings).

## Verification
- `npx next build --webpack` → Compiled successfully; `/admin/customers` present as PPR route.
- Grep gates: `await searchParams` ✓; `isSelf={r.id === admin.id}` ✓; `passwordHash` count 0 in page + island ✓; `role="dialog"` ✓; sidebar entry ✓.

## Notes
- Visual/interaction verification (render, search, pagination, confirm dialog, disabled self-row) is the go-live human-verify item in 09-05.
