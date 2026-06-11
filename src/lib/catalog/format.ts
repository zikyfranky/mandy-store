// src/lib/catalog/format.ts
// Pure NGN currency formatter — no server-only guard; safe in client + server.
// D-04: prices stored as kobo (integer); displayed as ₦.

export function formatNGN(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100)
  // e.g. 1_500_000 kobo → "₦15,000.00"
}
