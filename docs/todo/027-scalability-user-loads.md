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
| **MdB application backlog** | AI reviews max 18/day (3/party × 6 parties) vs thousands of pending applications. Users wait weeks/months. |
| **Polling storm** | 100K clients polling every 5–30s = 3K–20K req/s. Single Express process handles ~5K req/s max. |
| **Rate limiting** | In-memory per-IP limits fail behind shared NAT and with multiple server instances. |
| **`user_actions` growth** | 1M–5M rows/day with no archival strategy. |

### 1M Users — Fundamentally Incompatible

Everything above is 10× worse. Single-process + single-file SQLite cannot serve this load. Session table at 1M rows, polling at 30K–200K req/s, MdB backlog at 50K+ (18 reviews/day = 7+ years to clear).

## Required Improvements by Scale

### Tier 1: 1K → 10K Users

- [ ] **Batch `lastActive` updates** — Write every 5 min instead of every request (in-memory buffer)
- [ ] **Session pruning cron** — `SQLiteSessionStore.prune()` exists but is never scheduled
- [ ] **WebSocket for notifications** — Replace polling for real-time events (Socket.io or native WS)
- [ ] **Increase MdB review throughput** — Raise the 3/party/day cap or add batch AI review

### Tier 2: 10K → 100K Users

- [ ] **Replace SQLite with Postgres** — Connection pooling, concurrent writes, better query planning
- [ ] **Redis for sessions** — Distributed session store (connect-redis)
- [ ] **Redis for rate limiting** — Distributed rate limits (rate-limit-redis)
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

1. **Schedule session pruning** — Call `sessionStore.prune()` on a setInterval in `api/src/index.ts`
2. **Buffer `lastActive` writes** — Keep in-memory map, flush every 5 min
3. **Add pagination** — `/api/users/me/activity` currently loads up to 100 items with no cursor
4. **Index `user_actions(created_at)`** — Time-range queries on activity logs are unindexed
