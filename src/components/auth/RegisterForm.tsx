"use client"
// src/components/auth/RegisterForm.tsx
// Registration form Client Component island.
// D-03: collects email, password, name, username.
// Wired to the `register` server action from Plan 03.

import { useActionState } from "react"
import { register } from "@/lib/actions/auth"
import Link from "next/link"

type RegisterState =
  | { error: string }
  | { success: true; message: string }
  | null

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState<RegisterState, FormData>(
    async (_prev: RegisterState, formData: FormData) => {
      return await register(formData)
    },
    null,
  )

  // Success: show the "check your email" message
  if (state && "success" in state) {
    return (
      <div className="text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Check your email
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {state.message}
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Create account
      </h1>

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="^[a-zA-Z0-9_]+$"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="jane_smith"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            3–30 characters: letters, numbers, underscores only
          </p>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="you@example.com"
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
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Min. 8 characters"
          />
        </div>

        {state && "error" in state && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{" "}
        <Link
          href="/account/login"
          className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
