// src/app/admin/page.tsx
// /admin now redirects into the Products list — the admin shell (layout.tsx) handles
// auth + sidebar; this route no longer needs its own dashboard stub (Phase 5, Plan 05).

import { redirect } from "next/navigation"

export default function AdminPage() {
  redirect("/admin/products")
}
