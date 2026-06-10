// src/app/api/auth/[...nextauth]/route.ts
// Auth.js v5 GET/POST route handlers for Next.js App Router.
// Source: authjs.dev/getting-started/installation?framework=next-js

import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
