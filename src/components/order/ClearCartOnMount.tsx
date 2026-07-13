"use client"
// Clears the cart once, right after a completed checkout. Rendered on /order/[token] but
// self-gates on the ?checkout=1 flag added at the post-checkout redirect, so revisiting an
// order later (e.g. from the confirmation email) never wipes a fresh cart. Strips the flag
// after firing so a refresh doesn't re-run it.

import { useEffect, useRef } from "react"
import { clearCart } from "@/lib/actions/cart"

export function ClearCartOnMount() {
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get("checkout") !== "1") return
    done.current = true

    clearCart().catch(() => {})

    params.delete("checkout")
    const qs = params.toString()
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""))
  }, [])

  return null
}
