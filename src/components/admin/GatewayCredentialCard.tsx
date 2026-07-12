"use client"
// src/components/admin/GatewayCredentialCard.tsx
// Phase 8 (D-04/D-05/D-06, ADMN-05/ADMN-06) — 08-UI-SPEC.md "Surface 6 (extended)".
// Disclosure card per gateway: write-only secret fields (masked "Configured" + Replace,
// never re-editable until explicitly replaced), always-editable public fields, a
// non-blocking Test-connection affordance for Stripe/Paystack/Flutterwave, and the
// "Saved — not verifiable" static pill for the redirect-only NG gateways.
//
// Security-in-UI Contract: a secret field's rendered HTML/props NEVER contain the
// decrypted/stored value — only a presence boolean, updatedAt, updatedBy cross from the
// server. `publicValue` is only ever read for `!f.isSecret` fields (see renderField below).
// Newly-typed values live in local `useState` only until submission — never round-tripped
// through a server prop.

import { useState, useTransition, useRef, useEffect } from "react"
import { inputClass } from "@/components/admin/formStyles"
import { saveGatewayCredentials, testGatewayConnection } from "@/lib/actions/gateway-credentials"

export type FieldPresence = {
  field: string
  label: string // human-readable label, e.g. "Secret key"
  isSecret: boolean
  isConfigured: boolean // for isSecret fields only; for public fields this mirrors "has a value"
  updatedAt?: string // ISO string, secret fields only
  updatedBy?: string // secret fields only
  publicValue?: string // ONLY set for isSecret:false fields — NEVER set for isSecret:true
  inputType?: "text" | "url" // defaults to "text"; "url" for *_url/*_base fields
  helperText?: string // e.g. "Optional — leave blank to use the default..."
}

export type TestConnectionMode = "testable" | "not-verifiable" | "none"

interface GatewayCredentialCardProps {
  provider: string
  label: string // "Stripe", "Paystack", etc.
  icon: React.ReactNode
  status: "not-configured" | "incomplete" | "configured"
  fields: FieldPresence[]
  testConnectionMode: TestConnectionMode
}

// ─── Icons (Heroicons v2, inlined, 24x24 viewBox, matches every other admin icon) ──────

function ChevronDownIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ArrowPathIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 animate-spin" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ExclamationCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ─── Relative-date formatting — reuses the exact Intl.RelativeTimeFormat pattern from ──
// src/app/admin/orders/page.tsx's relativeDate() (the only existing analog in the repo).

function relativeDate(iso: string): string {
  const date = new Date(iso)
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"],
  ]

  let duration = diffSec
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit)
    }
    duration /= amount
  }
  return rtf.format(Math.round(duration), "years")
}

// ─── Status dot + label (collapsed row) ────────────────────────────────────────────────

const STATUS_COPY: Record<GatewayCredentialCardProps["status"], { dot: string; label: string; trigger: string }> = {
  "not-configured": { dot: "bg-zinc-300 dark:bg-zinc-600", label: "Not configured", trigger: "Configure credentials" },
  incomplete: { dot: "bg-amber-500", label: "Incomplete", trigger: "Finish setup" },
  configured: { dot: "bg-green-500", label: "Configured", trigger: "Manage credentials" },
}

export function GatewayCredentialCard({ provider, label, icon, status, fields, testConnectionMode }: GatewayCredentialCardProps) {
  const [expanded, setExpanded] = useState(false)
  // per-secret-field "replace" mode + typed values live in local component state only —
  // NEVER pre-populated from a server value (Security-in-UI Contract). Unconfigured secret
  // fields start in "replacing" mode too, since they render directly as an editable input
  // (there is no masked state to replace out of).
  const [replacing, setReplacing] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const f of fields) if (f.isSecret && !f.isConfigured) initial[f.field] = true
    return initial
  })
  const [typedValues, setTypedValues] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Client-side "just saved" override so the masked display flips to Configured with a
  // fresh "just now" caption immediately after a successful save, without requiring a
  // full page reload (UI-SPEC "Save success" state).
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<{ pass: boolean; message?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isTesting, startTestTransition] = useTransition()
  const firstFieldRef = useRef<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (expanded) firstFieldRef.current?.focus()
  }, [expanded])

  function handleSave() {
    setSaveError(null)
    startTransition(async () => {
      // Only include: public fields the admin typed into + secret fields the admin
      // actually typed into (replacing[field] === true AND typedValues[field] is
      // non-empty). An untouched masked secret is OMITTED entirely — never submitted as "".
      const payload: Record<string, string> = {}
      const savedSecretFields: string[] = []
      for (const f of fields) {
        if (!f.isSecret) {
          if (typedValues[f.field] !== undefined) payload[f.field] = typedValues[f.field]
        } else if (replacing[f.field] && typedValues[f.field]) {
          payload[f.field] = typedValues[f.field]
          savedSecretFields.push(f.field)
        }
      }
      const result = await saveGatewayCredentials(provider, payload)
      if (!result.success) {
        setSaveError(result.error)
      } else {
        setSaved(true)
        setReplacing({})
        setJustSaved((prev) => {
          const next = { ...prev }
          for (const field of savedSecretFields) next[field] = true
          return next
        })
        setTypedValues((prev) => {
          const next = { ...prev }
          for (const f of fields) if (f.isSecret) delete next[f.field]
          return next
        })
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  function handleTest() {
    setTestResult(null)
    startTestTransition(async () => {
      const candidate: Record<string, string> = {}
      for (const f of fields) if (replacing[f.field] && typedValues[f.field]) candidate[f.field] = typedValues[f.field]
      const result = await testGatewayConnection(provider, candidate)
      setTestResult(result.success ? { pass: true } : { pass: false, message: result.error })
    })
  }

  function handleReplace(field: string) {
    setReplacing((prev) => ({ ...prev, [field]: true }))
  }

  function handleCancelReplace(field: string) {
    setReplacing((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    setTypedValues((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleCollapse() {
    setExpanded(false)
    triggerRef.current?.focus()
  }

  const statusCopy = STATUS_COPY[status]
  const panelId = `${provider}-credentials-panel`

  return (
    <div className="border-b border-border last:border-0">
      {/* ── Collapsed row anatomy ── */}
      <div className="flex items-center justify-between py-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusCopy.dot}`} />
              <span className="text-sm text-muted">{statusCopy.label}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          ref={triggerRef}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="min-h-11 px-2 flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-md"
        >
          {statusCopy.trigger}
          <ChevronDownIcon expanded={expanded} />
        </button>
      </div>

      {/* ── Expanded panel anatomy ── */}
      {expanded && (
        <div id={panelId} className="bg-background border-t border-border p-4 rounded-b-xl space-y-4 mb-2">
          <h3 className="text-sm font-semibold text-foreground">{label} credentials</h3>

          {saveError && (
            <div role="alert" aria-live="assertive" className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4">
              <p className="text-sm font-semibold text-stock-out">{`Couldn't save ${label} credentials`}</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{saveError}. Nothing was lost — try saving again.</p>
            </div>
          )}

          <div className="space-y-4">
            {fields.map((f, i) => (
              <FieldRow
                key={f.field}
                field={f}
                isReplacing={!!replacing[f.field]}
                isJustSaved={!!justSaved[f.field]}
                typedValue={typedValues[f.field] ?? ""}
                isPending={isPending}
                firstFieldRef={i === 0 ? firstFieldRef : undefined}
                onChange={(value) => setTypedValues((prev) => ({ ...prev, [f.field]: value }))}
                onReplace={() => handleReplace(f.field)}
                onCancelReplace={() => handleCancelReplace(f.field)}
              />
            ))}
          </div>

          {/* ── Footer: test-connection slot (left) + Save button (right) ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border">
            <div>
              {testConnectionMode === "testable" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={isTesting}
                    className={[
                      "min-h-11 px-3 rounded-lg border text-sm font-semibold flex items-center gap-1.5",
                      "text-brand border-brand hover:bg-brand-soft transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                      isTesting ? "opacity-60" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {isTesting && <ArrowPathIcon />}
                    {isTesting ? "Testing…" : "Test connection"}
                  </button>

                  {testResult && testResult.pass && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 px-2.5 py-1 text-sm font-semibold text-green-700 dark:text-green-300">
                      <CheckCircleIcon />
                      Connected
                    </span>
                  )}
                  {testResult && !testResult.pass && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-2.5 py-1 text-sm font-semibold text-stock-out">
                      <ExclamationCircleIcon />
                      {testResult.message ? `Test failed — ${testResult.message}` : "Test failed"}
                    </span>
                  )}

                  {!testResult && (
                    <p className="text-xs text-muted basis-full">Testing is optional — saving never requires a passing test.</p>
                  )}
                </div>
              )}

              {testConnectionMode === "not-verifiable" && (
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    Saved — not verifiable
                  </span>
                  <p className="text-xs text-muted mt-1">
                    This gateway can&apos;t be pinged directly — credentials are validated the first time a customer completes a payment.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className={[
                "min-h-11 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5",
                "bg-brand text-white hover:bg-brand-strong transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                isPending ? "opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isPending && <ArrowPathIcon />}
              {isPending ? "Saving…" : saved ? "Saved" : `Save ${label} credentials`}
              {saved && !isPending && <CheckCircleIcon />}
            </button>
          </div>

          {/* Collapse control mirrors the header trigger, kept at the bottom of the panel for
              a natural "done editing" close affordance without duplicating the header button. */}
          <div>
            <button
              type="button"
              onClick={handleCollapse}
              className="text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-md"
            >
              Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field Rendering Contract ───────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldPresence
  isReplacing: boolean
  isJustSaved: boolean
  typedValue: string
  isPending: boolean
  firstFieldRef?: React.MutableRefObject<HTMLElement | null>
  onChange: (value: string) => void
  onReplace: () => void
  onCancelReplace: () => void
}

function FieldRow({ field: f, isReplacing, isJustSaved, typedValue, isPending, firstFieldRef, onChange, onReplace, onCancelReplace }: FieldRowProps) {
  const labelId = `${f.field}-label`
  const helperId = `${f.field}-helper`
  // Local ref for the "Replace clicked -> autofocus the newly-shown password input" rule —
  // distinct from firstFieldRef (which only fires once, on initial panel expand, for field
  // index 0). Combined via combinedInputRef below so both concerns share one <input>.
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  // Skip the very first render — unconfigured secret fields start with isReplacing=true
  // (see parent's initial state), and that initial state must NOT steal focus from
  // whichever field the panel-open effect focuses; only a genuine user-triggered
  // Replace click (a state transition after mount) should autofocus this input.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (isReplacing) replaceInputRef.current?.focus()
  }, [isReplacing])

  function combinedInputRef(el: HTMLInputElement | null) {
    replaceInputRef.current = el
    if (firstFieldRef) firstFieldRef.current = el
  }

  // ── Public field (is_secret: false) — always a normal, always-editable input ──
  if (!f.isSecret) {
    return (
      <div>
        <label htmlFor={f.field} id={labelId} className="block text-sm font-semibold text-foreground mb-1">
          {f.label}
        </label>
        <input
          id={f.field}
          ref={firstFieldRef as React.Ref<HTMLInputElement>}
          type={f.inputType === "url" ? "url" : "text"}
          defaultValue={f.publicValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={isPending}
          aria-describedby={f.helperText ? helperId : undefined}
          className={inputClass(false)}
        />
        {f.helperText && (
          <p id={helperId} className="text-sm text-muted mt-1">
            {f.helperText}
          </p>
        )}
      </div>
    )
  }

  // ── Secret field, Configured (and not currently in Replace mode) — masked, read-only ──
  const effectivelyConfigured = f.isConfigured || isJustSaved
  if (effectivelyConfigured && !isReplacing) {
    const updatedAtLabel = isJustSaved && !f.updatedAt ? "just now" : f.updatedAt ? relativeDate(f.updatedAt) : "just now"
    const byLabel = f.updatedBy ? ` by ${f.updatedBy}` : ""
    const announcement = `${f.label}: configured, last updated ${updatedAtLabel}${byLabel}`

    return (
      <div>
        <p id={labelId} className="block text-sm font-semibold text-foreground mb-1">
          {f.label}
        </p>
        <div className="flex items-center justify-between gap-3" aria-label={announcement}>
          <div aria-hidden="true">
            <p className="font-mono text-sm text-muted">••••••••</p>
            <p className="text-xs text-muted mt-0.5">{`Last updated ${updatedAtLabel}${byLabel}`}</p>
          </div>
          <button
            type="button"
            ref={firstFieldRef as React.Ref<HTMLButtonElement>}
            onClick={onReplace}
            aria-label={`Replace ${f.label}`}
            className="min-h-11 px-2 text-sm font-semibold text-brand hover:text-brand-strong shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-md"
          >
            Replace
          </button>
        </div>
      </div>
    )
  }

  // ── Secret field, Unconfigured OR Replace clicked — empty, focused password input ──
  return (
    <div>
      <label htmlFor={f.field} id={labelId} className="block text-sm font-semibold text-foreground mb-1">
        {f.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={f.field}
          ref={combinedInputRef}
          type="password"
          autoComplete="off"
          placeholder="Not set"
          value={typedValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={isPending}
          aria-describedby={helperId}
          className={inputClass(false)}
        />
        {f.isConfigured && (
          <button
            type="button"
            onClick={onCancelReplace}
            className="text-sm font-semibold text-muted hover:text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-md"
          >
            Cancel
          </button>
        )}
      </div>
      <p id={helperId} className="text-sm text-muted mt-1">
        {f.isConfigured
          ? "Enter a new value to replace the saved credential, or click Cancel to keep the current one unchanged."
          : "This value is never displayed once saved."}
      </p>
    </div>
  )
}
