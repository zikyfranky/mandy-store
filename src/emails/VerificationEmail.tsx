// src/emails/VerificationEmail.tsx
// React Email template for email verification links.
// Used by: src/lib/email/send-verification.ts

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

interface VerificationEmailProps {
  verifyUrl: string
}

export function VerificationEmail({ verifyUrl }: VerificationEmailProps) {
  return (
    <Html lang="en">
      <Preview>Verify your YesBuy email address</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Verify your email address</Heading>

          <Text style={textStyle}>
            Thanks for signing up to YesBuy! Please verify your email
            address to activate your account.
          </Text>

          <Button href={verifyUrl} style={buttonStyle}>
            Verify Email Address
          </Button>

          <Text style={smallTextStyle}>
            Or copy and paste this link into your browser:
            <br />
            {verifyUrl}
          </Text>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            This link expires in 24 hours. If you did not create an account,
            you can safely ignore this email.
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
