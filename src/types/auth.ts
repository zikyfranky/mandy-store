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
