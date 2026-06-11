// src/app/(auth)/layout.tsx
// Centered card layout for auth pages (login, register, verify-email).
// No site navigation — focused UI for unauthenticated flows.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8">
        {children}
      </div>
    </div>
  )
}
