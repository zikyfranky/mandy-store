// src/emails/PasswordResetEmail.tsx
// React Email template for admin-triggered password reset links (Phase 9, ADMN-09).
// Used by: src/lib/email/send-password-reset.ts

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

interface PasswordResetEmailProps {
  resetUrl: string
}

export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <Html lang="en">
      <Preview>Reset your YesBuy password</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Reset your password</Heading>

          <Text style={textStyle}>
            A YesBuy administrator initiated a password reset for your
            account. Click the button below to set a new password.
          </Text>

          <Button href={resetUrl} style={buttonStyle}>
            Set new password
          </Button>

          <Text style={smallTextStyle}>
            Or copy and paste this link into your browser:
            <br />
            {resetUrl}
          </Text>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            This link expires in 1 hour. If you did not expect this, contact the
            store — your password has not changed.
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

const smallTextStyle = {
  fontSize: "13px",
  color: "#666666",
  lineHeight: "1.6",
  wordBreak: "break-all" as const,
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
