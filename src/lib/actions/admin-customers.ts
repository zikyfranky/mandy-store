"use server"
import "server-only"
// src/lib/actions/admin-customers.ts
// Admin customer-management Server Actions (Phase 9, ADMN-09 / ADMN-10).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement of the two ADMIN actions
//     (sendCustomerPasswordReset, updateCustomerRole) before any DB access (D-02, T-09-02).
//   - resetPassword is a PUBLIC action (unauthenticated customer consuming an emailed link) —
//     it MUST NOT be admin-gated, but every failure path returns the SAME generic message
//     to avoid user enumeration (D-07.6), and it enforces the pwreset_ prefix (D-07.3).
//   - The reset token is NEVER returned to the browser (D-06, T-09-06) — it lives only in
//     the DB and the emailed link.
//   - Last-admin demotion uses a single atomic conditional UPDATE guarded by COUNT>1 — no
//     read-then-write TOCTOU (D-07.4, mirrors CLAUDE.md atomic-decrement doctrine).

import { eq, and, like, sql } from "drizzle-orm"
import * as argon2 from "argon2"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { users, verificationTokens, sessions } from "@/lib/db/schema"
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset"

type ActionResult = { success: true } | { success: false; error: string }

const GENERIC_RESET_ERROR = "Invalid or expired reset link"

// ─── sendCustomerPasswordReset (ADMN-09, D-03/D-07.2) ─────────────────────────
// Admin-gated. Issues exactly one live pwreset_ link, 1h expiry, emails it best-effort.
export async function sendCustomerPasswordReset(userId: string): Promise<ActionResult> {
  await verifyAdminSession() // D-02 — first statement

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) {
    return { success: false, error: "User not found" }
  }

  // D-07.2 (Pitfall 3): drop any prior reset link for this email — keep exactly one live.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, user.email),
        like(verificationTokens.token, "pwreset_%"),
      ),
    )

  const token = `pwreset_${crypto.randomUUID()}` // D-03 — namespaced token
  await db.insert(verificationTokens).values({
    identifier: user.email,
    token,
    expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  })

  // Best-effort email — the token is still issued if RESEND_API_KEY is unset (dev).
  try {
    await sendPasswordResetEmail(user.email, token)
  } catch (err) {
    console.error("[admin] reset email failed (token still issued):", err)
  }

  // Never return the token (D-06, T-09-06).
  return { success: true }
}

// ─── resetPassword (ADMN-09, D-03/D-07 — PUBLIC action) ───────────────────────
export async function resetPassword(input: {
  email: string
  token: string
  password: string
}): Promise<ActionResult> {
  const { email, token, password } = input

  // Password policy (reuse register's rule).
  if (!z.string().min(8).safeParse(password).success) {
    return { success: false, error: "Password must be at least 8 characters" }
  }

  // D-07.3 / T-09-04: only reset-namespaced tokens are valid here.
  if (!token.startsWith("pwreset_")) {
    return { success: false, error: GENERIC_RESET_ERROR }
  }

  const tokenRow = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.identifier, email),
      eq(verificationTokens.token, token),
    ),
  })
  if (!tokenRow) {
    return { success: false, error: GENERIC_RESET_ERROR }
  }

  // Expiry check — delete on expiry to prevent reuse.
  if (tokenRow.expires < new Date()) {
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token),
        ),
      )
    return { success: false, error: GENERIC_RESET_ERROR }
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!user) {
    return { success: false, error: GENERIC_RESET_ERROR }
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  await db.update(users).set({ passwordHash }).where(eq(users.email, email))

  // Single-use — consume the token.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
      ),
    )

  // D-07.1 / T-09-05: revoke all of the target's live sessions after a credential reset.
  await db.delete(sessions).where(eq(sessions.userId, user.id))

  return { success: true }
}

// ─── updateCustomerRole (ADMN-10, D-04/D-07.4) ────────────────────────────────
export async function updateCustomerRole(
  userId: string,
  newRole: "customer" | "admin",
): Promise<ActionResult> {
  const admin = await verifyAdminSession() // D-02 — first statement

  const parsed = z.enum(["customer", "admin"]).safeParse(newRole)
  if (!parsed.success) {
    return { success: false, error: "Invalid role" }
  }

  // Self-lockout guard — an admin cannot change their own role.
  if (userId === admin.id) {
    return { success: false, error: "You cannot change your own role" }
  }

  if (parsed.data === "customer") {
    // D-07.4: atomic last-admin guard — demote only if another admin remains.
    const demoted = await db
      .update(users)
      .set({ role: "customer" })
      .where(
        and(
          eq(users.id, userId),
          sql`(SELECT COUNT(*) FROM "user" WHERE role = 'admin') > 1`,
        ),
      )
      .returning({ id: users.id })
    if (demoted.length === 0) {
      return { success: false, error: "Cannot demote the last remaining admin" }
    }
  } else {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId))
  }

  revalidatePath("/admin/customers")
  return { success: true }
}
