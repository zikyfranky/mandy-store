// src/lib/db/client.ts
// Source: orm.drizzle.team/docs/get-started/neon-new [VERIFIED]

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// DATABASE_URL format: postgres://user:password@host.neon.tech/dbname?sslmode=require
const sql = neon(process.env.DATABASE_URL!)

export const db = drizzle({ client: sql, schema })
