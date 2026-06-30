// src/components/checkout/OOSWarningBanner.tsx
// Amber warning banner shown when cart has OOS items at /checkout.
// UI-SPEC §1 / §8 / Copywriting Contract
// role="status" aria-live="polite" — less urgent announcement (accessibility contract)

import Link from "next/link"

export function OOSWarningBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 flex gap-3 items-start mb-6"
    >
      {/* Heroicons ExclamationTriangleIcon 20px */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
          clipRule="evenodd"
        />
      </svg>

      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Some items in your cart are out of stock. Remove them to continue.
        </p>
        <Link
          href="/cart"
          className="text-sm font-semibold text-brand hover:text-brand-strong transition-colors mt-1 inline-block"
        >
          Go back and remove them
        </Link>
      </div>
    </div>
  )
}
