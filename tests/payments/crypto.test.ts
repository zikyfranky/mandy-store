// tests/payments/crypto.test.ts — Phase 8 (D-02 / ADMN-06)
// AES-256-GCM envelope round-trip, fail-loud key validation, GCM tamper detection.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import crypto from "crypto"

// server-only is a build-time guard with no runtime behavior — stub it for the test env.
vi.mock("server-only", () => ({}))

import { encryptSecret, decryptSecret } from "@/lib/payments/crypto"

// Flip one character in the given ":"-delimited segment (avoids padding by targeting the middle),
// guaranteeing the new char differs from the original.
function tamperSegment(envelope: string, segmentIndex: number): string {
  const parts = envelope.split(":")
  const seg = parts[segmentIndex]
  const i = Math.floor(seg.length / 2)
  const orig = seg[i]
  const replacement = orig === "A" ? "B" : "A"
  parts[segmentIndex] = seg.slice(0, i) + replacement + seg.slice(i + 1)
  return parts.join(":")
}

describe("payments/crypto — AES-256-GCM envelope", () => {
  beforeEach(() => {
    // Valid 32-byte key (base64) for the happy-path tests.
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("round-trip: decrypt(encrypt(x)) returns x exactly", () => {
    expect(decryptSecret(encryptSecret("sk_test_abc123"))).toBe("sk_test_abc123")
  })

  it("round-trip: empty string encrypts and decrypts back to empty", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("")
  })

  it("invalid key: throws when CREDENTIALS_ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "")
    expect(() => encryptSecret("x")).toThrow(/not set/)
  })

  it("invalid key: throws with byte-length detail when key is wrong length", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", Buffer.from("short").toString("base64"))
    expect(() => encryptSecret("x")).toThrow(/32 bytes/)
  })

  it("tamper: flipping a ciphertext byte makes decrypt throw (never returns a value)", () => {
    const envelope = encryptSecret("sk_live_sensitive")
    const tampered = tamperSegment(envelope, 3) // ciphertext segment
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("tamper: flipping an authTag byte makes decrypt throw", () => {
    const envelope = encryptSecret("sk_live_sensitive")
    const tampered = tamperSegment(envelope, 2) // authTag segment
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("envelope format: starts with v1: and has exactly 4 colon-delimited segments", () => {
    const envelope = encryptSecret("x")
    expect(envelope.startsWith("v1:")).toBe(true)
    expect(envelope.split(":")).toHaveLength(4)
  })

  it("fresh IV: encrypting the same plaintext twice yields different envelopes", () => {
    const a = encryptSecret("same-plaintext")
    const b = encryptSecret("same-plaintext")
    expect(a).not.toBe(b)
    // both still decrypt back to the same value
    expect(decryptSecret(a)).toBe("same-plaintext")
    expect(decryptSecret(b)).toBe("same-plaintext")
  })
})
