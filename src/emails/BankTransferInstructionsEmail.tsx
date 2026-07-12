// src/emails/BankTransferInstructionsEmail.tsx
// React Email template for bank transfer payment instructions.
// Used by: src/lib/email/send-bank-transfer-instructions.ts
// ORD-02: sent immediately after bank transfer order is created (synchronous, before redirect).
// T-04-07: bank account details flow only via server-only sender into the customer's inbox;
//          never returned in any client payload (D-10, no NEXT_PUBLIC_ prefix for BANK_* vars).

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

interface BankTransferInstructionsEmailProps {
  orderRef: string
  orderToken: string
  customerEmail: string
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
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

export function BankTransferInstructionsEmail({
  orderRef,
  orderToken,
  customerEmail,
  bankName,
  bankAccountNumber,
  bankAccountName,
  items,
  subtotalKobo,
  shippingKobo,
  totalKobo,
}: BankTransferInstructionsEmailProps) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${orderToken}`

  return (
    <Html lang="en">
      <Preview>Bank transfer instructions for order {orderRef} — YesBuy</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Complete your bank transfer</Heading>

          <Text style={textStyle}>
            Hi {customerEmail}, your order <strong>{orderRef}</strong> has been received.
            Please complete your bank transfer using the details below — we&apos;ll confirm
            your order once we receive your transfer.
          </Text>

          {/* Bank account details */}
          <div style={bankDetailsCardStyle}>
            <Text style={bankDetailsTitleStyle}>Bank Account Details</Text>
            <table style={bankTableStyle} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td style={bankLabelStyle}>Bank name</td>
                  <td style={bankValueStyle}>{bankName}</td>
                </tr>
                <tr>
                  <td style={bankLabelStyle}>Account number</td>
                  <td style={{ ...bankValueStyle, fontWeight: "700", fontSize: "18px" }}>{bankAccountNumber}</td>
                </tr>
                <tr>
                  <td style={bankLabelStyle}>Account name</td>
                  <td style={bankValueStyle}>{bankAccountName}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Narration instruction */}
          <div style={narrationCardStyle}>
            <Text style={narrationTitleStyle}>Use this as your transfer narration:</Text>
            <Text style={narrationRefStyle}>{orderRef}</Text>
            <Text style={narrationHintStyle}>
              Adding this reference helps us match your payment quickly.
            </Text>
          </div>

          {/* Amount */}
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
                <td style={{ ...totalLabelStyle, fontWeight: "700", color: "#1a1a1a", fontSize: "16px" }}>
                  Total to transfer
                </td>
                <td style={{ ...totalValueStyle, fontWeight: "700", color: "#1a1a1a", fontSize: "16px" }}>
                  {formatNGN(totalKobo)}
                </td>
              </tr>
            </tbody>
          </table>

          <Hr style={hrStyle} />

          {/* Order items */}
          <Text style={{ ...textStyle, fontSize: "14px", marginBottom: "8px" }}>Your order:</Text>
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

          <Button href={orderUrl} style={buttonStyle}>
            Check your order status
          </Button>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>Reference: {orderRef}</Text>
          <Text style={footerStyle}>
            We will send you a confirmation email once we receive your transfer.
            If you have any questions, reply to this email.
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

const bankDetailsCardStyle = {
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  padding: "20px",
  marginBottom: "16px",
}

const bankDetailsTitleStyle = {
  fontSize: "13px",
  fontWeight: "600",
  color: "#166534",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "12px",
}

const bankTableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const bankLabelStyle = {
  fontSize: "13px",
  color: "#166534",
  paddingBottom: "6px",
  paddingRight: "16px",
  width: "140px",
}

const bankValueStyle = {
  fontSize: "15px",
  color: "#14532d",
  paddingBottom: "6px",
  fontWeight: "600",
}

const narrationCardStyle = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
}

const narrationTitleStyle = {
  fontSize: "13px",
  color: "#92400e",
  marginBottom: "8px",
}

const narrationRefStyle = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#78350f",
  letterSpacing: "0.05em",
  marginBottom: "4px",
}

const narrationHintStyle = {
  fontSize: "12px",
  color: "#92400e",
  marginBottom: "0",
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
