// src/types/auth.ts
// TypeScript module augmentation — adds id and role to Auth.js Session user.
// Source: RESEARCH.md Pattern 1 augmentation block

import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "customer" | "admin"
    } & DefaultSession["user"]
  }
  interface User {
    role?: "customer" | "admin"
  }
}

// NOTE: the Auth.js JWT type extends Record<string, unknown>, so custom token fields
// (id, role, sessionToken) are already permitted without a module augmentation. The
// token is the bridge between credentials sign-in (jwt callback stashes id/role) and
// the DB-backed session (decode() returns the opaque sessionToken + id/role;
// encode()/events.signOut read sessionToken).
