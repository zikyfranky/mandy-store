// src/components/admin/OrderStatusBadge.tsx
// Order status badge palette (8 states, SC3/D-08) + Product Active/Deactivated pills.
// UI-SPEC "Order status badge palette" — icon + text label, never color-only.
// Shared shape: inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold

import type { ReactNode } from "react"

// ─── Icons (Heroicons v2, 14px, solid) ─────────────────────────────────────────

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
    </svg>
  )
}

function BuildingLibraryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .329.076l9 4.5A.75.75 0 0 1 21 8.25v.75a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 9v-.75a.75.75 0 0 1 .671-.746l9-4.5A.75.75 0 0 1 12 2.25Zm-6.75 8.25a.75.75 0 0 0-.75.75v6.75H3a.75.75 0 0 0 0 1.5h18a.75.75 0 0 0 0-1.5h-1.5v-6.75a.75.75 0 0 0-1.5 0v6.75h-2.25v-6.75a.75.75 0 0 0-1.5 0v6.75h-2.25v-6.75a.75.75 0 0 0-1.5 0v6.75H8.25v-6.75a.75.75 0 0 0-1.5 0v6.75H5.25v-6.75Z" clipRule="evenodd" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
    </svg>
  )
}

function ArrowPathIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clipRule="evenodd" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M8.25 18.75a1.5 1.5 0 0 1-3 0 1.5 1.5 0 0 1 3 0ZM18.75 18.75a1.5 1.5 0 0 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      <path fillRule="evenodd" d="M1.5 6.375c0-1.036.84-1.875 1.875-1.875h11.25c1.036 0 1.875.84 1.875 1.875v3.026a3.75 3.75 0 0 1 1.673.977l2.222 2.222c.14.14.26.302.354.478.09.166.15.35.174.542a3.75 3.75 0 0 1 .102.869v1.761c0 .414-.336.75-.75.75h-.75a3 3 0 1 1-5.955.75H9.705a3 3 0 1 1-5.955-.75H2.25A.75.75 0 0 1 1.5 15V6.375Z" clipRule="evenodd" />
    </svg>
  )
}

function CheckBadgeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.49 4.49 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.49 4.49 0 0 1-1.307 3.497 4.49 4.49 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
    </svg>
  )
}

function XCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.22a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
    </svg>
  )
}

function ExclamationCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Order status palette ───────────────────────────────────────────────────────

export type OrderStatusValue =
  | "pending_payment"
  | "awaiting_bank_transfer"
  | "payment_confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "payment_failed"

const ORDER_STATUS_CONFIG: Record<OrderStatusValue, { classes: string; icon: ReactNode; label: string }> = {
  pending_payment: {
    classes: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    icon: <ClockIcon />,
    label: "Pending payment",
  },
  awaiting_bank_transfer: {
    classes: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    icon: <BuildingLibraryIcon />,
    label: "Awaiting bank transfer",
  },
  payment_confirmed: {
    classes: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/30",
    icon: <CheckCircleIcon />,
    label: "Payment confirmed",
  },
  processing: {
    classes: "bg-brand-soft text-brand-strong border-brand/30",
    icon: <ArrowPathIcon />,
    label: "Processing",
  },
  shipped: {
    classes: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
    icon: <TruckIcon />,
    label: "Shipped",
  },
  delivered: {
    classes: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
    icon: <CheckBadgeIcon />,
    label: "Delivered",
  },
  cancelled: {
    classes: "bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600",
    icon: <XCircleIcon />,
    label: "Cancelled",
  },
  payment_failed: {
    classes: "bg-red-50 text-stock-out border-red-200 dark:bg-red-500/10 dark:border-red-500/30",
    icon: <ExclamationCircleIcon />,
    label: "Payment failed",
  },
}

const BADGE_SHAPE = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold"

export function OrderStatusBadge({ status }: { status: OrderStatusValue }) {
  const config = ORDER_STATUS_CONFIG[status]
  return (
    <span className={`${BADGE_SHAPE} ${config.classes}`}>
      {config.icon}
      {config.label}
    </span>
  )
}

// ─── Product active/deactivated pills (D-04) ────────────────────────────────────
// Reversible/intentional state — Deactivated is neutral zinc, not destructive red.

export function ProductActivePill({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className={`${BADGE_SHAPE} bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30`}>
      <CheckCircleIcon />
      Active
    </span>
  ) : (
    <span className={`${BADGE_SHAPE} bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700`}>
      <XCircleIcon />
      Deactivated
    </span>
  )
}
