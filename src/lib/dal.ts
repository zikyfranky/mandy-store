import "server-only"
// src/lib/dal.ts
// Data Access Layer — server-only auth verification helpers.
// Source: RESEARCH.md Pattern 5, §Pitfall 3 (re-verify in every Server Action), §Pitfall 7 (role from session only)
//
// SECURITY: `import "server-only"` is a structural guard — importing this module in a
// client component causes a build-time error, preventing accidental secret exposure.
// (Threat model T-01-08, T-01-09)

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export type SessionUser = {
  id: string
  role: "customer" | "admin"
  email: string
}

/**
 * Verifies the current session and returns the authenticated user.
 *
 * Redirects to /account/login if the session is missing or has no user id.
 *
 * Call this at the TOP of every protected Server Action and Server Component.
 * Do NOT rely on proxy.ts alone — proxy.ts cannot protect Server Actions.
 *
 * Role is read EXCLUSIVELY from the verified session (RESEARCH Pitfall 7).
 * Never pass role from URL params, form data, or request headers.
 */
export async function verifySession(): Promise<SessionUser> {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/account/login")
  }

  return {
    id:    session.user.id,
    role:  session.user.role ?? "customer",
    email: session.user.email ?? "",
  }
}

/**
 * Like verifySession(), but additionally asserts that the user has the admin role.
 *
 * Redirects to / for authenticated users without admin role.
 * Redirects to /account/login for unauthenticated users (via verifySession).
 *
 * Use this in all /admin/* Server Actions and layouts.
 */
export async function verifyAdminSession(): Promise<SessionUser> {
  const user = await verifySession()

  if (user.role !== "admin") {
    redirect("/")
  }

  return user
}
