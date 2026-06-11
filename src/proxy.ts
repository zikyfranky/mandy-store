// src/proxy.ts
// WARNING: proxy is redirect UX only, NOT security. Every Server Action/protected page
// re-verifies via verifySession() (CLAUDE.md, RESEARCH Pitfall 3).
//
// Source: nextjs.org/docs/app/api-reference/file-conventions/proxy [VERIFIED]
// Next.js 16 renamed middleware.ts → proxy.ts; runs in Node.js runtime by default.
// auth() wrapper works directly — no manual JWT decryption needed.

import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export const proxy = auth((req) => {
  const { nextUrl } = req
  const path = nextUrl.pathname
  const session = req.auth

  // /admin/* requires admin role (D-09, D-12)
  const isAdminRoute = path.startsWith("/admin")

  // /account/orders and /account/settings require any authenticated user (D-12)
  // NOTE: /account/login and /account/register are NOT protected — they are the auth routes
  const isAccountRoute =
    path.startsWith("/account/orders") || path.startsWith("/account/settings")

  // Auth routes redirect already-authenticated users away (avoid double-login)
  const isAuthRoute =
    path === "/account/login" || path === "/account/register"

  // Redirect unauthenticated users away from protected routes
  if ((isAdminRoute || isAccountRoute) && !session?.user) {
    const loginUrl = new URL("/account/login", nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect non-admin authenticated users away from /admin/* (D-09)
  if (isAdminRoute && session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", nextUrl.origin))
  }

  // Redirect already-authenticated users away from login/register
  if (isAuthRoute && session?.user) {
    return NextResponse.redirect(new URL("/", nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Match all routes except Next.js static files, image optimization, favicon, and api routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
}
