// tests/email/emails.test.ts
// Unit tests for ORD-01 + ORD-02: email templates + senders.
// Pure unit — no DB, no real Resend calls. Resend is mocked.

import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted runs before vi.mock factory hoisting — allows us to share the spy reference
const mockSend = vi.hoisted(() => vi.fn())

// Mock server-only so it doesn't throw in the test environment
vi.mock("server-only", () => ({}))

// Mock Resend so no real API calls are made.
// Using a regular function (not arrow) so `new Resend(...)` works.
vi.mock("resend", () => ({
  Resend: function MockResend() {
    return { emails: { send: mockSend } }
  },
}))

// Mock the server-only DB module so queries imported transitively don't fail
vi.mock("@/lib/db/client", () => ({
  db: {
    query: {
      orders: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}))

// Import after mocking
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"
import { sendBankTransferInstructionsEmail } from "@/lib/email/send-bank-transfer-instructions"
import { OrderConfirmationEmail } from "@/emails/OrderConfirmationEmail"
import { BankTransferInstructionsEmail } from "@/emails/BankTransferInstructionsEmail"

const sampleItems = [
  { productName: "Test Phone", variantLabel: "Black / 128GB", quantity: 1, lineTotalKobo: 50000000 },
  { productName: "Test Watch", variantLabel: "Silver", quantity: 2, lineTotalKobo: 10000000 },
]

const sampleOrder = {
  customerEmail: "customer@example.com",
  reference: "MS-ABC123",
  guestToken: "a".repeat(64),
  items: sampleItems,
  subtotalKobo: 60000000,
  shippingKobo: 200000,
  totalKobo: 60200000,
}

beforeEach(() => {
  mockSend.mockReset()
  mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null })
  // Set NEXT_PUBLIC_APP_URL for URL generation in email templates
  process.env.NEXT_PUBLIC_APP_URL = "https://mandystore.com"
})

// ─── OrderConfirmationEmail component ────────────────────────────────────────

describe("OrderConfirmationEmail component", () => {
  it("returns a non-null React element", () => {
    const element = OrderConfirmationEmail({
      orderRef: "MS-ABC123",
      orderToken: "a".repeat(64),
      customerEmail: "customer@example.com",
      items: sampleItems,
      subtotalKobo: 60000000,
      shippingKobo: 200000,
      totalKobo: 60200000,
    })
    expect(element).not.toBeNull()
    expect(element).toBeDefined()
  })

  it("renders without throwing given all required props", () => {
    expect(() =>
      OrderConfirmationEmail({
        orderRef: "MS-XYZ789",
        orderToken: "b".repeat(64),
        customerEmail: "test@example.com",
        items: sampleItems,
        subtotalKobo: 10000000,
        shippingKobo: 200000,
        totalKobo: 10200000,
      })
    ).not.toThrow()
  })

  it("renders without throwing for an empty items array", () => {
    expect(() =>
      OrderConfirmationEmail({
        orderRef: "MS-EMPTY1",
        orderToken: "c".repeat(64),
        customerEmail: "empty@example.com",
        items: [],
        subtotalKobo: 0,
        shippingKobo: 200000,
        totalKobo: 200000,
      })
    ).not.toThrow()
  })
})

// ─── BankTransferInstructionsEmail component ──────────────────────────────────

describe("BankTransferInstructionsEmail component", () => {
  it("returns a non-null React element", () => {
    const element = BankTransferInstructionsEmail({
      orderRef: "MS-BANK01",
      orderToken: "c".repeat(64),
      customerEmail: "customer@example.com",
      bankName: "Test Bank",
      bankAccountNumber: "0123456789",
      bankAccountName: "Mandy Store Ltd",
      items: sampleItems,
      subtotalKobo: 60000000,
      shippingKobo: 200000,
      totalKobo: 60200000,
    })
    expect(element).not.toBeNull()
    expect(element).toBeDefined()
  })

  it("renders without throwing given all required props", () => {
    expect(() =>
      BankTransferInstructionsEmail({
        orderRef: "MS-BANK02",
        orderToken: "d".repeat(64),
        customerEmail: "buyer@test.com",
        bankName: "First Bank",
        bankAccountNumber: "9876543210",
        bankAccountName: "Store Account",
        items: [],
        subtotalKobo: 0,
        shippingKobo: 200000,
        totalKobo: 200000,
      })
    ).not.toThrow()
  })
})

// ─── sendOrderConfirmationEmail ────────────────────────────────────────────────

describe("sendOrderConfirmationEmail", () => {
  it("calls resend.emails.send with the correct subject", async () => {
    await sendOrderConfirmationEmail(sampleOrder)

    expect(mockSend).toHaveBeenCalledOnce()
    const [arg] = mockSend.mock.calls[0]
    expect(arg.subject).toBe("Order confirmed — MS-ABC123")
  })

  it("sends to the customer's email address", async () => {
    await sendOrderConfirmationEmail(sampleOrder)

    const [arg] = mockSend.mock.calls[0]
    expect(arg.to).toBe("customer@example.com")
  })

  it("sends from Yesbuy Store sender address", async () => {
    await sendOrderConfirmationEmail(sampleOrder)

    const [arg] = mockSend.mock.calls[0]
    expect(arg.from).toContain("Yesbuy Store")
  })

  it("throws when Resend returns an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "API limit exceeded" } })

    await expect(sendOrderConfirmationEmail(sampleOrder)).rejects.toThrow(
      "Failed to send order confirmation email"
    )
  })
})

// ─── sendBankTransferInstructionsEmail ────────────────────────────────────────

describe("sendBankTransferInstructionsEmail", () => {
  beforeEach(() => {
    // Set bank env vars for each test
    process.env.BANK_NAME = "Test Bank"
    process.env.BANK_ACCOUNT_NUMBER = "0123456789"
    process.env.BANK_ACCOUNT_NAME = "Mandy Store Ltd"
  })

  it("calls resend.emails.send with subject containing 'Bank transfer'", async () => {
    await sendBankTransferInstructionsEmail(sampleOrder)

    expect(mockSend).toHaveBeenCalledOnce()
    const [arg] = mockSend.mock.calls[0]
    expect(arg.subject).toContain("Bank transfer")
  })

  it("includes the order reference in the subject", async () => {
    await sendBankTransferInstructionsEmail(sampleOrder)

    const [arg] = mockSend.mock.calls[0]
    expect(arg.subject).toContain("MS-ABC123")
  })

  it("sends to the customer's email address", async () => {
    await sendBankTransferInstructionsEmail(sampleOrder)

    const [arg] = mockSend.mock.calls[0]
    expect(arg.to).toBe("customer@example.com")
  })

  it("throws when BANK_NAME env var is missing", async () => {
    delete process.env.BANK_NAME

    await expect(sendBankTransferInstructionsEmail(sampleOrder)).rejects.toThrow(
      "Bank account env vars not configured"
    )
  })

  it("throws when BANK_ACCOUNT_NUMBER env var is missing", async () => {
    delete process.env.BANK_ACCOUNT_NUMBER

    await expect(sendBankTransferInstructionsEmail(sampleOrder)).rejects.toThrow(
      "Bank account env vars not configured"
    )
  })

  it("throws when BANK_ACCOUNT_NAME env var is missing", async () => {
    delete process.env.BANK_ACCOUNT_NAME

    await expect(sendBankTransferInstructionsEmail(sampleOrder)).rejects.toThrow(
      "Bank account env vars not configured"
    )
  })

  it("throws when Resend returns an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Resend error" } })

    await expect(sendBankTransferInstructionsEmail(sampleOrder)).rejects.toThrow(
      "Failed to send bank transfer instructions email"
    )
  })
})
