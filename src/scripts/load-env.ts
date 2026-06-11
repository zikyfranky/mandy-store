// src/scripts/load-env.ts
// Loads .env.local for STANDALONE scripts (seed, one-off tsx runs).
// Next.js auto-loads .env.local for the app, but `tsx`/`node` invocations do not.
// This module MUST be imported FIRST — before any module that reads process.env
// at import time (e.g. src/lib/db/client.ts calls neon(process.env.DATABASE_URL)
// during evaluation). ESM evaluates imports in source order, so importing this
// before the db client guarantees env vars are populated first.
//
// loadEnvFile does not override variables already present in process.env, so this
// is a no-op (and safely caught) in environments that inject real env vars and
// have no .env.local file (e.g. CI/production).

import { loadEnvFile } from "node:process"

try {
  loadEnvFile(".env.local")
} catch {
  // No .env.local present — assume env vars are already provided by the runtime.
}
