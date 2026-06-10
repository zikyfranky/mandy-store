# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 1-Foundation
**Areas discussed:** Auth methods & registration, Session strategy, Admin role & first admin, Schema breadth this phase

---

## Auth Methods & Registration

| Option | Description | Selected |
|--------|-------------|----------|
| Email/password only | Matches v1 reqs; simplest; social addable later | ✓ |
| Email/password + Google | Adds Google OAuth now; lower friction, more setup | |

**User's choice:** Email/password only

| Option | Description | Selected |
|--------|-------------|----------|
| No — trust on signup | Logged in immediately; lowest friction | |
| Yes — require verified email | Block login until email confirmed | ✓ |

**User's choice:** Require verified email before login
**Notes:** Pulls Resend email infra forward into Phase 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Email, password, name | Name useful for orders/greeting | ✓ (+username) |
| Email + password only | Absolute minimum | |

**User's choice:** Email, password, name — **plus username**

Follow-up — Username behavior:
| Option | Description | Selected |
|--------|-------------|----------|
| Unique handle, log in with email | One login identifier | |
| Unique, log in with username OR email | Either identifier accepted | ✓ |
| Optional, non-unique nickname | Display only | |

**User's choice:** Unique username; login with username OR email

Follow-up — Email infra:
| Option | Description | Selected |
|--------|-------------|----------|
| Wire up Resend now | Real email in Phase 1; reused later | ✓ |
| Dev mode now, real email Phase 4 | Log/print link, defer Resend | |
| Token + link, swap sender later | Stub sender behind interface | |

**User's choice:** Wire up Resend now

---

## Session Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Database-backed sessions | Revocable; fits admin + payments | ✓ |
| Stateless JWT cookie | Simpler, no revocation | |

**User's choice:** Database-backed sessions
**Notes:** Flagged for research — Auth.js v5 Credentials provider defaults to JWT strategy; DB sessions need explicit handling.

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days, sliding | Standard ecommerce default | ✓ |
| 7 days | Shorter, more secure, more friction | |
| You decide | Planner picks | |

**User's choice:** 30 days, sliding

---

## Admin Role & First Admin

| Option | Description | Selected |
|--------|-------------|----------|
| role enum: customer \| admin | Single users table, role column | ✓ |
| Boolean isAdmin flag | Simplest two-role | |
| Separate roles/permissions tables | Full RBAC, overkill | |

**User's choice:** role enum (customer / admin)

| Option | Description | Selected |
|--------|-------------|----------|
| Env allowlist promotes on signup | ADMIN_EMAILS auto-promote | ✓ |
| Seed script | Explicit npm run seed | ✓ |
| Manual DB insert | Flip role by hand | |

**User's choice:** Both env allowlist AND seed script

---

## Schema Breadth This Phase

| Option | Description | Selected |
|--------|-------------|----------|
| Auth + locked constraints only | Auth tables + order_status enum + webhook table; defer rest | ✓ |
| Full data model up front | All tables now; risk of rework | |
| Auth + order/payment skeleton | Adds bare orders/order_items skeleton | |

**User's choice:** Auth + locked constraints only

---

## Claude's Discretion

- Password complexity rules, verification-link/token expiry, login rate-limiting, post-login/post-logout redirect targets.
- Drizzle migration workflow, schema file organization, Neon connection driver.

## Deferred Ideas

- Social / Google sign-in → post-v1 (architect Auth.js to allow it).
- Product / category / variant tables → Phase 2.
- Cart schema → Phase 3.
- Orders / order_items / addresses tables + atomic decrement + webhook idempotency enforcement → Phase 4.
- Password policy, rate-limiting, password reset/recovery flow → future hardening or follow-up discussion.
