"use client"
// src/components/ui/CopyButton.tsx
// Generic clipboard copy button with "Copied!" feedback.
// Accessibility: aria-label changes from "Copy order reference" → "Order reference copied" for 2s.
// Used by BankTransferView to copy the order reference (D-11).

import { useState } from "react"

interface CopyButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  className?: string
}

export function CopyButton({
  value,
  label = "Copy reference",
  copiedLabel = "Copied!",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: noop — clipboard may be unavailable in some environments
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Order reference copied" : "Copy order reference"}
      className={className ?? "text-sm font-semibold text-brand hover:text-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
