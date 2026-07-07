"use client"
// src/components/checkout/RemitaPaymentPanel.tsx
// Thin wrapper over RedirectLauncherPanel. Remita uses a plain GET redirect (D-13/D-16).

import { RedirectLauncherPanel } from "./RedirectLauncherPanel"
import { initRemitaPayment } from "@/lib/actions/remita"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

export function RemitaPaymentPanel(props: {
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}) {
  return <RedirectLauncherPanel initAction={initRemitaPayment} gatewayName="Remita" {...props} />
}
