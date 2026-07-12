// src/app/(auth)/reset-password/page.tsx
// Public password-reset consume page (Phase 9, ADMN-09, D-03). Mirrors verify-email/page.tsx.
// Next.js 16: searchParams is a Promise — MUST await. The (auth) layout provides the card.
// NOTE: the token is consumed only on form submit (client island), never during server render,
// so a link prefetch/preview cannot burn the single-use link (T-09-03).

import { Suspense } from "react"
import Link from "next/link"
import { ResetPasswordForm } from "./ResetPasswordForm"

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string; email?: string }>
}

async function ResetPasswordContent({ searchParams }: ResetPasswordPageProps) {
  const { token, email } = await searchParams

  if (!token || !email) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Invalid reset link
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          The link is missing required parameters. Please use the link from your password reset email.
        </p>
        <Link
          href="/account/login"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm token={token} email={email} />
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  return (
    <Suspense
      fallback={
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      }
    >
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  )
}
