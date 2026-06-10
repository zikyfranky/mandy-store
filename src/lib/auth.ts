// src/lib/auth.ts
// Auth.js v5 configuration — Credentials provider with database-session workaround (D-08).
// Source: RESEARCH.md Pattern 1, §Pitfall 1 (D-08), §Pitfall 5 (emailVerified gate)

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db/client"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"
import * as argon2 from "argon2"
import { eq, or } from "drizzle-orm"

// Ensure the type augmentation is picked up
import "@/types/auth"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days (D-07)
    updateAge: 24 * 60 * 60,   // Sliding: refresh session row if older than 24h
  },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or Username" },
        password:   { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null

        const identifier = credentials.identifier as string
        const password   = credentials.password as string

        // Look up user by email OR username (D-04)
        const user = await db.query.users.findFirst({
          where: or(
            eq(users.email, identifier),
            eq(users.username, identifier),
          ),
        })

        if (!user || !user.passwordHash) return null

        // Email must be verified before login is allowed (D-02, RESEARCH Pitfall 5)
        if (!user.emailVerified) return null

        const passwordValid = await argon2.verify(user.passwordHash, password)
        if (!passwordValid) return null

        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
          role:  user.role,
        }
      },
    }),
  ],
  callbacks: {
    // D-08 WORKAROUND: Credentials provider does NOT auto-create DB session rows.
    // Detect credentials login and manually insert a session row so that auth()
    // can retrieve it on subsequent requests (RESEARCH §Pitfall 1).
    // Source: github.com/nextauthjs/next-auth/discussions/12848
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        const expires      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        const sessionToken = crypto.randomUUID()

        // Insert the session row directly — cleanest pattern for the D-08 workaround
        await db.insert(sessions).values({
          sessionToken,
          userId: user.id!,
          expires,
        })

        token.sessionToken = sessionToken
        token.role         = (user as { role?: string }).role ?? "customer"
        token.id           = user.id
      }
      return token
    },
    async session({ session, user, token }) {
      // For database sessions, `user` is populated from the DB session lookup.
      // For JWT fallback path, `token` carries role and id stashed above.
      if (user) {
        session.user.id   = user.id
        // role comes from the users table via the adapter's session lookup
        session.user.role = ((user as { role?: string }).role ?? "customer") as "customer" | "admin"
      } else if (token) {
        session.user.id   = token.id as string
        session.user.role = (token.role as "customer" | "admin") ?? "customer"
      }
      return session
    },
  },
  pages: {
    signIn: "/account/login",
    error:  "/account/login",
  },
})
