import "server-only"
// src/lib/payments/crypto.ts
// Phase 8 (D-02 / ADMN-06): AES-256-GCM encrypt/decrypt for gateway credentials at rest.
// Versioned envelope "v1:<iv>:<authTag>:<ciphertext>" (all base64). Fresh random IV per call.
// The master key (CREDENTIALS_ENCRYPTION_KEY) is server-only and read here only — never logged,
// never re-exported. decryptSecret throws on missing/wrong-length key or tampered ciphertext
// (D-07 — the throw MUST propagate; never swallow it into a fail-open path).
import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const ENVELOPE_VERSION = "v1"

function getKey(): Buffer {
  const b64 = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!b64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt gateway credentials")
  }
  const key = Buffer.from(b64, "base64")
  if (key.length !== 32) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}) — regenerate with e.g. "openssl rand -base64 32"`)
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [ENVELOPE_VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":")
}

export function decryptSecret(envelope: string): string {
  const key = getKey()
  const parts = envelope.split(":")
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error(`Unrecognized credential envelope (expected "${ENVELOPE_VERSION}:iv:tag:ciphertext")`)
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()])
  return plaintext.toString("utf8")
}
