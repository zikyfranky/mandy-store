// src/emails/OrderConfirmationEmail.tsx
// React Email template for order confirmation.
// Used by: src/lib/email/send-order-confirmation.ts
// Threat model: T-04-07 (bank details never in this email — only in BankTransferInstructionsEmail)
// ORD-01: sent when payment is confirmed (Stripe webhook)

import {
  Html,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
  Preview,
} from "@react-email/components"
import { formatNGN } from "@/lib/catalog/format"

interface OrderConfirmationEmailProps {
  orderRef: string
  orderToken: string
  customerEmail: string
  items: Array<{
    productName: string
    variantLabel: string
    quantity: number
    lineTotalKobo: number
  }>
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
}

export function OrderConfirmationEmail({
  orderRef,
  orderToken,
  customerEmail,
  items,
  subtotalKobo,
  shippingKobo,
  totalKobo,
}: OrderConfirmationEmailProps) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${orderToken}`

  return (
    <Html lang="en">
      <Preview>Order {orderRef} confirmed — YesBuy</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Order confirmed!</Heading>

          <Text style={textStyle}>
            Hi {customerEmail}, thanks for your order! We&apos;ve received your payment
            and your order is being processed.
          </Text>

          {/* Line items */}
          <table style={tableStyle} cellPadding="0" cellSpacing="0">
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td style={itemCellStyle}>
                    <Text style={itemNameStyle}>{item.productName}</Text>
                    <Text style={itemVariantStyle}>{item.variantLabel} · Qty: {item.quantity}</Text>
                  </td>
                  <td style={itemPriceStyle}>{formatNGN(item.lineTotalKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Hr style={hrStyle} />

          {/* Totals */}
          <table style={totalsTableStyle} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={totalLabelStyle}>Subtotal</td>
                <td style={totalValueStyle}>{formatNGN(subtotalKobo)}</td>
              </tr>
              <tr>
                <td style={totalLabelStyle}>Shipping</td>
                <td style={totalValueStyle}>{formatNGN(shippingKobo)}</td>
              </tr>
              <tr>
                <td style={{ ...totalLabelStyle, fontWeight: "700", color: "#1a1a1a" }}>Total</td>
                <td style={{ ...totalValueStyle, fontWeight: "700", color: "#1a1a1a" }}>{formatNGN(totalKobo)}</td>
              </tr>
            </tbody>
          </table>

          <Button href={orderUrl} style={buttonStyle}>
            View your order
          </Button>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>Reference: {orderRef}</Text>
          <Text style={footerStyle}>
            If you have questions about your order, reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// ─── Inline Styles ────────────────────────────────────────────────────────────

const bodyStyle = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const containerStyle = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 24px",
  maxWidth: "560px",
  borderRadius: "8px",
}

const headingStyle = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "16px",
}

const textStyle = {
  fontSize: "16px",
  color: "#444444",
  lineHeight: "1.6",
  marginBottom: "24px",
}

const buttonStyle = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "6px",
  display: "inline-block",
  marginBottom: "24px",
}

const hrStyle = {
  borderColor: "#e5e7eb",
  margin: "24px 0",
}

const footerStyle = {
  fontSize: "12px",
  color: "#999999",
  lineHeight: "1.6",
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  marginBottom: "8px",
}

const itemCellStyle = {
  paddingBottom: "12px",
  verticalAlign: "top" as const,
}

const itemNameStyle = {
  fontSize: "15px",
  color: "#1a1a1a",
  fontWeight: "600",
  margin: "0",
}

const itemVariantStyle = {
  fontSize: "13px",
  color: "#666666",
  margin: "2px 0 0 0",
}

const itemPriceStyle = {
  paddingBottom: "12px",
  textAlign: "right" as const,
  fontSize: "15px",
  color: "#1a1a1a",
  verticalAlign: "top" as const,
  whiteSpace: "nowrap" as const,
}

const totalsTableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  marginBottom: "24px",
}

const totalLabelStyle = {
  paddingBottom: "6px",
  fontSize: "14px",
  color: "#666666",
}

const totalValueStyle = {
  paddingBottom: "6px",
  fontSize: "14px",
  color: "#666666",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
}
