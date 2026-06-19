"use client"
// src/components/auth/LoginForm.tsx
// Login form Client Component island.
// D-04: single "Email or username" identifier field — resolves to user by either column.
// Wired to the `login` server action from Plan 03.

import { useActionState } from "react"
import { login } from "@/lib/actions/auth"
import Link from "next/link"

type LoginState = { error: string } | null

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    async (_prev: LoginState, formData: FormData) => {
      const result = await login(formData)
      if (result && "error" in result) {
        return result
      }
      return null
    },
    null,
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Sign in
      </h1>

      <form action={formAction} className="space-y-4">
        {/* D-04: single identifier field accepts email or username */}
        <div>
          <label
            htmlFor="identifier"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email or username
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="you@example.com or your_username"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/account/register"
          className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
