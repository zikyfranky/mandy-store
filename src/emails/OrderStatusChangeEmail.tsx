// src/emails/OrderStatusChangeEmail.tsx
// React Email template for ORD-03 fulfillment status-change notifications.
// Used by: src/lib/email/send-order-status-change.ts
// Fires ONLY on shipped/delivered (D-10) — modeled on OrderConfirmationEmail.tsx's structure.

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

export type NotifiableStatus = "processing" | "shipped" | "delivered" | "cancelled"

interface OrderStatusChangeEmailProps {
  reference: string
  guestToken: string
  newStatus: NotifiableStatus
}

const STATUS_COPY: Record<NotifiableStatus, { heading: string; body: string; preview: string }> = {
  processing: {
    heading: "Your order is being processed",
    body: "We've received your payment and started preparing your order. We'll email you again as soon as it ships.",
    preview: "Your order is being processed",
  },
  shipped: {
    heading: "Your order has shipped!",
    body: "Good news — your order is on its way. You can view your order details below.",
    preview: "Your order has shipped",
  },
  delivered: {
    heading: "Your order was delivered",
    body: "Your order has been delivered. We hope you enjoy your purchase! If anything is wrong, just reply to this email.",
    preview: "Your order was delivered",
  },
  cancelled: {
    heading: "Your order was cancelled",
    body: "Your order has been cancelled. If you believe this is a mistake or have any questions, just reply to this email.",
    preview: "Your order was cancelled",
  },
}

export function OrderStatusChangeEmail({ reference, guestToken, newStatus }: OrderStatusChangeEmailProps) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${guestToken}`
  const copy = STATUS_COPY[newStatus]

  return (
    <Html lang="en">
      <Preview>Order {reference} — {copy.preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>{copy.heading}</Heading>

          <Text style={textStyle}>{copy.body}</Text>

          <Button href={orderUrl} style={buttonStyle}>
            View your order
          </Button>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>Reference: {reference}</Text>
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
