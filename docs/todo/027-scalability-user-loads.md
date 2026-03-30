# 027 — Scalability: User Load Testing & Architecture Improvements

**Status**: open
**Area**: Engine / API / DB
**Priority**: Medium

## Summary

The current architecture (single-process Node.js + SQLite via better-sqlite3) works well for up to ~1,000 concurrent users but hits fundamental limits beyond that. This issue tracks findings and required improvements for scaling to 100K–1M users.

## Current Architecture

- **Database**: SQLite (better-sqlite3) — synchronous, single-connection singleton per DB
- **Dual-DB**: `simulation.db` (shared state) + `users.db` (user data + sessions)
- **WAL mode**: Enables concurrent reads, but writes remain serialized
- **Sessions**: Stored in SQLite (`sessions` table) — no Redis/distributed option
- **Rate limiting**: In-memory per-IP (express-rate-limit) — not distributed
- **Real-time**: None — clients poll REST endpoints every 5–30s
- **Process model**: Single Express process, no clustering or horizontal scaling

## Scalability Findings by User Count

### 100 Users — Works Fine

- ~10–20 concurrent requests
- ~1–2 `lastActive` writes/sec
- ~100 session rows
- ~1K–5K `user_actions` rows/day
- MdB application backlog: negligible (AI reviews up to 18/day)
- No bottlenecks observed

### 100K Users — Breaks Down

| Bottleneck | Detail |
|-----------|--------|
| **SQLite write serialization** | `lastActive` update on every authenticated request (~500–1K writes/sec). Synchronous better-sqlite3 blocks the Node event loop. |
| **Session store** | 100K rows in SQLite with no automatic pruning. No distributed session support prevents horizontal scaling. |
| **MdB application backlog** | ~~AI reviews max 18/day~~ Fixed: batch review now processes all pending applicants per party per day via Anthropic batch API. |
| **Polling storm** | 100K clients polling every 5–30s = 3K–20K req/s. Single Express process handles ~5K req/s max. |
| **Rate limiting** | In-memory per-IP limits fail behind shared NAT and with multiple server instances. |
| **`user_actions` growth** | 1M–5M rows/day with no archival strategy. |

### 1M Users — Fundamentally Incompatible

Everything above is 10× worse. Single-process + single-file SQLite cannot serve this load. Session table at 1M rows, polling at 30K–200K req/s, MdB backlog less of an issue now (batch review scales), but AI costs grow linearly.

## Required Improvements by Scale

### Tier 1: 1K → 10K Users

- [x] **Batch `lastActive` updates** — In-memory buffer with 5-min flush interval (`middleware/auth.ts`)
- [x] **Session pruning cron** — Scheduled every 30 min in `api/src/index.ts`, cleaned on shutdown
- [x] **WebSocket for real-time updates** — Socket.io server broadcasts sim status, events, and notification signals; clients use WS with automatic polling fallback
- [x] **Increase MdB review throughput** — 3/party/day cap removed; batch AI review processes all pending apps per party via Anthropic batch API

### Tier 2: 10K → 100K Users

- [ ] **Replace SQLite with Postgres** — Connection pooling, concurrent writes, better query planning
- [ ] **Redis for sessions** — Distributed session store (connect-redis)
- [ ] **Redis for rate limiting** — Distributed rate limits (rate-limit-redis). Note: per-user daily rolling-window caps already exist in SQLite for content actions.
- [ ] **Horizontal scaling** — Multiple Express instances behind a load balancer
- [ ] **Async job queue** — Bull/BullMQ for AI calls, action logging, event processing
- [ ] **`user_actions` archival** — Partition or archive old action logs (e.g., monthly rollup)

### Tier 3: 100K → 1M Users

- [ ] **Postgres read replicas** — Separate read/write traffic
- [ ] **Redis cluster** — High-availability caching and session storage
- [ ] **Event sourcing** — Replace direct DB writes with event stream for user actions
- [ ] **CDN for static assets** — Offload Vite build artifacts
- [ ] **User table sharding** — Partition users by ID range or region

## Affected Files

### Database & Connection
- `packages/engine/src/db/connection.ts` — Singleton connections, WAL mode setup
- `packages/engine/src/db/ddl.ts` — Schema definitions, indexes, migrations
- `packages/engine/src/db/schema-user.ts` — User table schema

### Session & Auth
- `packages/api/src/session-store.ts` — SQLiteSessionStore (pruning, get/set/destroy)
- `packages/api/src/passport-config.ts` — OAuth user lookup/creation
- `packages/api/src/middleware/auth.ts` — `sessionTracking()` writes `lastActive` every request

### Rate Limiting
- `packages/api/src/middleware/rate-limit.ts` — In-memory IP-based limiters

### User Routes (write-heavy)
- `packages/api/src/routes/users.ts` — Profile, party join/leave, activity, impact
- `packages/api/src/routes/seats.ts` — MdB applications, seat management
- `packages/api/src/routes/bills.ts` — Signals, MdB votes, speeches, amendments

### Simulation Integration
- `packages/engine/src/simulation/seats.ts` — `reviewMdbApplications()` (3/party/day cap)
- `packages/engine/src/simulation/voting.ts` — `tallyVotes()` iterates all MdB votes
- `packages/engine/src/simulation/event-queue.ts` — Unbounded event logging

## Quick Wins (Low Effort, High Impact)

1. ~~**Schedule session pruning**~~ — ✅ Done. 30-min interval in `api/src/index.ts`
2. ~~**Buffer `lastActive` writes**~~ — ✅ Done. 5-min flush in `middleware/auth.ts`
3. ~~**Add pagination**~~ — ✅ Done. Cursor-based pagination on `/api/users/me/activity` (1–50 items/page)
4. ~~**Index `user_actions(created_at)`**~~ — ✅ Done. Plus composite indexes on `(user_id, action_type)` and `(user_id, sim_day)`
