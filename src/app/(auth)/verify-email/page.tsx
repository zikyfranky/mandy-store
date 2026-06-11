// src/app/(auth)/verify-email/page.tsx
// Email verification landing page — Server Component.
// Reads token + email from query params, calls verifyEmail() server action.
// Next.js 16: searchParams is a Promise — must await before accessing.
// cacheComponents: All dynamic data (searchParams + verifyEmail DB call) is inside Suspense.

import { Suspense } from "react"
import { verifyEmail } from "@/lib/actions/auth"
import Link from "next/link"

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; email?: string }>
}

async function VerificationContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>
}) {
  // All dynamic data access is inside this Suspense-wrapped component
  const { token, email } = await searchParams

  if (!token || !email) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Invalid verification link
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          The link is missing required parameters. Please use the link from your verification email.
        </p>
        <Link
          href="/account/login"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  const result = await verifyEmail(token, email)

  if ("error" in result) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Verification failed
        </h1>
        <p className="text-sm text-red-600 dark:text-red-400 mb-6">{result.error}</p>
        <Link
          href="/account/register"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Register again
        </Link>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mb-4 text-4xl">✓</div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Email verified
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Your email has been confirmed. You can now log in.
      </p>
      <Link
        href="/account/login"
        className="inline-block rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        Sign in
      </Link>
    </div>
  )
}

export default function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  return (
    <Suspense
      fallback={
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Verifying your email…</p>
        </div>
      }
    >
      <VerificationContent searchParams={searchParams} />
    </Suspense>
  )
}
