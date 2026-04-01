# Progress: Server-Side Day Progress Bar

**Plan**: [docs/plans/server-side-progress.md](docs/plans/server-side-progress.md)
**Goal**: Replace the time-based progress bar with real server-side phase tracking. Engine writes completion percentages to `simulation_meta.day_progress` at AI batch milestones; frontend interpolates smoothly between updates with time-based fallback.
**Validation**: `npm run typecheck && npm test`

---

### Step 1: Schema — Add `day_progress` column

- **Status**: done
- **Files**: `packages/engine/src/db/schema-sim.ts`, `packages/engine/src/db/ddl.ts`
- **Result**: Added `dayProgress` integer column to schema and DDL + column migration. Typecheck passes (6/6).

### Step 2: Engine — DayProgress helper + progress calls in loop.ts

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Added `DayProgress` class with `set(pct)` + `complete()`. Placed 8 milestone calls: 0% (reset), 10% (init done), 15/50% (negotiation), 50% (agents), 60% (actions), 75% (interpellations), 80/95% (media+summary), 100% (final). Typecheck passes (6/6).

### Step 3: API — Expose `dayProgress` in status response

- **Status**: done
- **Files**: `packages/api/src/socket.ts`, `packages/api/src/routes/simulation.ts`
- **Result**: Added `dayProgress` and `heartbeatAt` to socket `getSimStatus()` and REST `/api/simulation/status` endpoint. Typecheck passes (6/6).

### Step 4: Frontend — Server-driven progress with smooth interpolation

- **Status**: done
- **Files**: `packages/web/src/api/types.ts`, `packages/web/src/main.tsx`
- **Result**: Added `dayProgress` to `SimulationStatus` type. Replaced time-based progress calc with server-driven progress (uses `dayProgress` with +1%/10s drift interpolation, falls back to time-based for servers without the field). Typecheck 6/6, 187 tests pass.

### Step 5: Reset progress on day start

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Combined with Step 2 — `dayProgress: 0` set in the `dayStartedAt` update at the start of `runDay()`.
