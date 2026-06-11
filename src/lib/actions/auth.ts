"use server"
// src/lib/actions/auth.ts
// Authentication Server Actions: register, login, logout, verifyEmail
// Sources: RESEARCH.md Pattern 7 (register), Pattern 1 (signIn/signOut), Pattern 6 (email verification)
// Threat model: T-01-10 (zod validation), T-01-11 (login enumeration), T-01-12 (token), T-01-13 (ADMIN_EMAILS), T-01-14 (argon2id)

import { db } from "@/lib/db/client"
import { users, verificationTokens, sessions } from "@/lib/db/schema"
import { sendVerificationEmail } from "@/lib/email/send-verification"
import { signIn, signOut } from "@/lib/auth"
import * as argon2 from "argon2"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { AuthError } from "next-auth"

// ─── Validation Schemas ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
})

// ─── register() ──────────────────────────────────────────────────────────────

/**
 * Registers a new user: validates input, rejects duplicates, hashes password,
 * auto-promotes ADMIN_EMAILS matches to admin role (D-10a), creates verification
 * token, and sends a verification email.
 *
 * Security:
 * - T-01-10: zod server-side validation on all fields
 * - T-01-13: role derived only from server-only ADMIN_EMAILS env (no NEXT_PUBLIC_)
 * - T-01-14: argon2id hashing; plaintext never persisted
 * - T-01-12: verification token is crypto.randomUUID(), expires in 24h, single-use
 */
export async function register(
  formData: FormData,
): Promise<{ error: string } | { success: true; message: string }> {
  // T-01-10: Validate all fields with zod
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: "Invalid input: " + parsed.error.issues[0]?.message }
  }

  const { email, password, name, username } = parsed.data

  // Check for duplicate email
  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  if (existingByEmail) {
    return { error: "Email already registered" }
  }

  // Check for duplicate username (D-04: username is unique)
  const existingByUsername = await db.query.users.findFirst({
    where: eq(users.username, username),
  })
  if (existingByUsername) {
    return { error: "Username already taken" }
  }

  // T-01-14: Hash password with argon2id (OWASP 2025 recommendation)
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

  // D-10a: ADMIN_EMAILS server-only allowlist auto-promotes matching email to admin
  // T-01-13: Never use NEXT_PUBLIC_ prefix on this env var — server-only
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
  const role = adminEmails.includes(email) ? "admin" : "customer"

  const userId = crypto.randomUUID()

  // Insert user with emailVerified: null (D-02: must verify before login)
  await db.insert(users).values({
    id:            userId,
    email,
    name,
    username,
    passwordHash,
    role,
    emailVerified: null,
  })

  // T-01-12: Generate single-use, expiring verification token (24h, RESEARCH Pattern 6)
  const token   = crypto.randomUUID()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  await db.insert(verificationTokens).values({
    identifier: email,
    token,
    expires,
  })

  // Send the verification email via Resend seam
  await sendVerificationEmail(email, token)

  return { success: true, message: "Check your email to verify your account." }
}

// ─── verifyEmail() ────────────────────────────────────────────────────────────

/**
 * Validates a verification token from the email link, marks the user's email
 * as verified, and deletes the token (single-use — T-01-12, RESEARCH Pitfall 6).
 *
 * Security:
 * - T-01-12: token is single-use (deleted on both success and expiry)
 * - RESEARCH Pitfall 6: expiry check before accepting the token
 */
export async function verifyEmail(
  token: string,
  email: string,
): Promise<{ error: string } | { success: true }> {
  // Look up the token row by identifier + token (compound PK)
  const tokenRow = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.identifier, email),
      eq(verificationTokens.token, token),
    ),
  })

  if (!tokenRow) {
    return { error: "Invalid token" }
  }

  // RESEARCH Pitfall 6: always check expiry; delete expired tokens to prevent reuse
  if (tokenRow.expires < new Date()) {
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token),
        ),
      )
    return { error: "Token expired" }
  }

  // Mark the user's email as verified
  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.email, email))

  // T-01-12: Delete the token (single-use — cannot verify twice with the same link)
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
      ),
    )

  return { success: true }
}

// ─── login() ─────────────────────────────────────────────────────────────────

/**
 * Authenticates a user via credentials. Delegates to Auth.js signIn("credentials"),
 * which calls authorize() in src/lib/auth.ts (already enforces emailVerified gate
 * and email-OR-username resolution — D-02, D-04).
 *
 * Security:
 * - T-01-11: Returns a single generic error regardless of whether user doesn't exist
 *   or password is wrong — prevents user enumeration
 */
export async function login(
  formData: FormData,
): Promise<{ error: string } | void> {
  const identifier = formData.get("identifier") as string
  const password   = formData.get("password") as string

  try {
    await signIn("credentials", { identifier, password, redirectTo: "/" })
  } catch (error) {
    // Auth.js throws a NEXT_REDIRECT for successful logins; re-throw it
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error
    }
    // Auth.js v5 throws AuthError subclasses on failure
    if (error instanceof AuthError) {
      // T-01-11: Generic message — never leak whether user exists or password is wrong
      return { error: "Invalid credentials" }
    }
    // Unknown errors — re-throw
    throw error
  }
}

// ─── logout() ─────────────────────────────────────────────────────────────────

/**
 * Signs the user out. Auth.js deletes the DB session row for the database strategy.
 * (D-08 workaround: session was manually inserted in jwt callback; signOut removes it
 * because the adapter's deleteSession() is called by Auth.js on sign-out.)
 */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/account/login" })
}
