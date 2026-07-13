"use client"
// src/components/admin/PaymentToggleRow.tsx
// Payment-method toggle row (ADMN-04) — UI-SPEC Surface 6. Toggle switch has no prior
// art in the codebase; built exactly to the UI-SPEC spec (track/thumb/focus classes).
// D-11 dual gate: server credential presence is read server-side (never the secret
// VALUE) and passed down as a boolean — the amber note renders when the DB flag is on
// but env credentials are missing.

import { useState, useTransition } from "react"
import { toggleStoreSetting } from "@/lib/actions/admin-settings"
import type { PaymentMethod } from "@/lib/payments/config"

type ToggleableMethod = PaymentMethod

function ExclamationTriangleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

interface PaymentToggleRowProps {
  method: ToggleableMethod
  label: string
  description: string
  icon: React.ReactNode
  enabled: boolean
  credentialsPresent: boolean
  envVarName?: string
}

export function PaymentToggleRow({
  method,
  label,
  description,
  icon,
  enabled,
  credentialsPresent,
  envVarName,
}: PaymentToggleRowProps) {
  const [checked, setChecked] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !checked
    setError(null)
    setChecked(next) // optimistic
    startTransition(async () => {
      const result = await toggleStoreSetting(method, next)
      if (!result.success) {
        setChecked(!next) // snap back
        setError("Couldn't update this setting. Try again.")
      }
    })
  }

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-sm text-muted">{description}</p>

          {checked && !credentialsPresent && (
            <div className="flex items-start gap-1.5 mt-1 text-amber-700 dark:text-amber-400">
              <ExclamationTriangleIcon />
              <p className="text-sm">
                {`${label} is toggled on, but its credentials aren't configured yet. Customers won't see it as a payment option until you add its keys in "Gateway credentials" below${envVarName ? ` (or set ${envVarName})` : ""}.`}
              </p>
            </div>
          )}

          {method === "paypal" && (
            <p className="text-sm text-muted mt-1">
              {"PayPal doesn't support NGN yet — this toggle has no effect until enabled."}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm font-semibold text-stock-out mt-1">
              {error}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
        onClick={handleToggle}
        disabled={isPending}
        className={[
          "relative shrink-0 w-11 h-6 rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          isPending ? "opacity-60" : "",
          checked ? "bg-brand" : "bg-zinc-300 dark:bg-zinc-600",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  )
}
