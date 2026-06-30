// src/components/order/ShippingAddressBlock.tsx
// Read-only shipping address display — shared across all /order/[token] states (§7e).
// Server Component. Shows name, phone, street, city+state, optional landmark.

interface ShippingAddressBlockProps {
  shippingName: string
  shippingPhone: string
  shippingStreet: string
  shippingCity: string
  shippingState: string
  shippingLandmark: string | null
}

export function ShippingAddressBlock({
  shippingName,
  shippingPhone,
  shippingStreet,
  shippingCity,
  shippingState,
  shippingLandmark,
}: ShippingAddressBlockProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-2">Shipping to</h2>
      <div className="text-sm text-muted space-y-0.5">
        <p>{shippingName}</p>
        <p>{shippingPhone}</p>
        <p>{shippingStreet}</p>
        <p>
          {shippingCity}, {shippingState}
        </p>
        {shippingLandmark && <p>{shippingLandmark}</p>}
      </div>
    </div>
  )
}
