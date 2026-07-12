"use client"
// src/app/(auth)/reset-password/ResetPasswordForm.tsx
// Client form island for the public reset-password page (Phase 9, ADMN-09).
// Submits {email,token,password} to the resetPassword Server Action on click (single-use
// token consumed only on submit). Displays the action's generic error verbatim — no
// cause-distinguishing logic here, so no user enumeration (T-09-08, D-07.6).

import { useState, useTransition } from "react"
import Link from "next/link"
import { resetPassword } from "@/lib/actions/admin-customers"

interface ResetPasswordFormProps {
  token: string
  email: string
}

export function ResetPasswordForm({ token, email }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    startTransition(async () => {
      const r = await resetPassword({ email, token, password })
      if ("error" in r && r.error) {
        setError(r.error)
      } else {
        setDone(true)
      }
    })
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">✓</div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Password updated
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          You can now sign in with your new password.
        </p>
        <Link
          href="/account/login"
          className="inline-block rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 text-center">
        Set a new password
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
        Choose a new password for your account.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
        >
          {isPending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  )
}
