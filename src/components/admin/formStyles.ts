// src/components/admin/formStyles.ts
// Shared admin form field styling — extracted verbatim from
// src/components/checkout/CheckoutForm.tsx:62-73 (UI-SPEC Interaction Rules: "copy this
// helper into an admin-shared module rather than reimplementing it").
// Used by ProductForm, VariantEditor, ImageUploadField.

export const inputClass = (hasError?: boolean) =>
  [
    "w-full rounded-lg border bg-surface px-3 py-2.5",
    "text-sm text-foreground placeholder:text-muted",
    "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand",
    "transition-colors",
    hasError
      ? "border-stock-out ring-2 ring-stock-out"
      : "border-border",
  ]
    .filter(Boolean)
    .join(" ")
