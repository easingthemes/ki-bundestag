# Server-Side Day Progress Bar — Fresh Implementation Plan

## Problem

The current progress bar in the header (`SimStatus` component in `main.tsx:392-476`) is **purely time-based guesswork**. It calculates `elapsed / expectedMs * 95%` using hardcoded `PRESET_DAY_MS` constants per timing preset, then caps at 95% until `lastRunAt` updates. This means:

- Progress sits at 95% for minutes when AI calls take longer than expected
- No correlation to actual simulation phase
- Different day types (normal vs election vs negotiation) have wildly different durations but use the same estimate
- Users can't tell _what_ the simulation is doing

## Analysis of runDay() Phases

The 13-step `runDay()` loop (in `loop.ts:139`) has distinct phases with **very different durations**:

| Phase | Steps | Duration | Description |
|-------|-------|----------|-------------|
| **Init** | 1-3a | ~instant | Load state, economic drift, injections |
| **Elections** | 4 | 0 or **minutes** | Negotiation round (AI batch), voting, or skip |
| **Bill Pipeline** | 5a-5g | ~instant | Advance readings, load context |
| **Knowledge** | ~5h | 0 or seconds | Weekly fetch + digest (conditional) |
| **Party Agents** | 6 | **3-8 min** | The big batch — 6 AI calls via batch API |
| **Process Actions** | 7-10e | ~instant | Proposals, amendments, votes, statements, motions |
| **Interpellation Answers** | 11 | 0 or **1-2 min** | Batch AI (conditional) |
| **Polls & Referendums** | 12 | 0 or seconds | Weekly (conditional) |
| **Media** | 13 | **1-2 min** | 2-3 article generation (batch AI) |
| **Summary** | 14 | **30s-1min** | Daily narrative (batch AI) |
| **Finalize** | 15 | ~instant | Save state, persist events |

**Key insight**: ~90% of wall-clock time is spent in 3-4 AI batch calls. The rest is instant. A useful progress bar should track batch completion, not count steps linearly.

## Design Principles

1. **Track what matters**: Progress should reflect AI batch completion since that's what takes time
2. **Simple DB column**: Single `day_progress` integer (0-100) on `simulation_meta` — no complex phase objects
3. **Server writes, client reads**: Engine updates progress at key milestones; frontend interpolates smoothly between updates
4. **Graceful degradation**: Frontend falls back to time-based estimate if `day_progress` is 0 or missing (old server)
5. **No over-engineering**: No phase labels, no sub-step tracking, no estimated time remaining

## Implementation Plan

### Step 1: Schema — Add `day_progress` column

**File**: `packages/engine/src/db/schema-sim.ts`
- Add `dayProgress: integer("day_progress").notNull().default(0)` to `simulationMeta` table

**File**: `packages/engine/src/db/ddl.ts`
- Add migration entry: `ALTER TABLE simulation_meta ADD COLUMN day_progress INTEGER NOT NULL DEFAULT 0`

### Step 2: Engine — DayProgress helper class in loop.ts

**File**: `packages/engine/src/simulation/loop.ts`

Create a lightweight `DayProgress` class at the top of the file:

```typescript
class DayProgress {
  private stepsDone = 0;
  private totalSteps: number;

  constructor(dayType: "normal" | "negotiation" | "election") {
    // Weight steps by approximate time cost
    // normal: init(5) + agents(40) + actions(5) + interpellations(10) + media(20) + summary(15) + finalize(5) = 100
    // negotiation: init(5) + negotiation(80) + finalize(15) = 100
    // election: init(5) + election(30) + agents(30) + media(20) + summary(10) + finalize(5) = 100
    this.totalSteps = 100; // always 100, weights are the progress values
  }

  /** Set progress to a specific percentage and write to DB */
  set(pct: number): void {
    this.stepsDone = Math.min(pct, 99); // never 100 until explicitly completed
    try {
      getSqlite().prepare("UPDATE simulation_meta SET day_progress = ?").run(this.stepsDone);
    } catch { /* best-effort */ }
  }

  complete(): void {
    try {
      getSqlite().prepare("UPDATE simulation_meta SET day_progress = 100").run();
    } catch { /* best-effort */ }
  }
}
```

Then insert `progress.set(N)` calls at these points in `runDay()`:

| Call site | Value | After what |
|-----------|-------|------------|
| Day start (after `dayStartedAt` write) | `0` | Reset progress |
| After election/negotiation check (step 4) | `10` | Init phase done |
| After `submitBatch(agentRequests)` returns | `50` | Party agents complete (biggest batch) |
| After processing all actions (steps 7-10e) | `65` | Actions processed |
| After interpellation batch | `75` | Interpellations answered |
| After media batch | `90` | Media generated |
| After summary batch | `95` | Summary done |
| After final state persist | `100` | Day complete |

For **negotiation days** (skipPartyAgents = true):
| Call site | Value |
|-----------|-------|
| Day start | `0` |
| After negotiation round submitted | `50` |
| After synthesis (if max rounds) | `80` |
| Final persist | `100` |

### Step 3: API — Expose `dayProgress` in status response

**File**: `packages/api/src/socket.ts`
- Add `dayProgress: (meta as any).dayProgress ?? 0` to `getSimStatus()` return object
- Add `heartbeatAt: (meta as any).heartbeatAt ?? null` (already available but not exposed)

**File**: `packages/api/src/routes/simulation.ts`
- Ensure `/api/simulation/status` includes `dayProgress` field

### Step 4: Frontend — Server-driven progress with smooth interpolation

**File**: `packages/web/src/api/types.ts`
- Add `dayProgress?: number` to `SimulationStatus` type

**File**: `packages/web/src/main.tsx`
- Replace the current `useMemo` progress calculation with:

```typescript
const { running, pct } = useMemo(() => {
  if (!status?.dayStartedAt) return { running: false, pct: 0 };
  const started = new Date(status.dayStartedAt).getTime();
  const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;
  const heartbeat = status.heartbeatAt ? new Date(status.heartbeatAt).getTime() : 0;

  if (started > completed) {
    const isAlive = heartbeat > 0
      ? (now - heartbeat) < 120_000
      : (now - started) < 1_800_000;
    if (!isAlive) return { running: false, pct: 0 };

    const serverPct = status.dayProgress ?? 0;
    if (serverPct > 0) {
      // Server-side progress available — use it directly
      // Smooth interpolation: creep up to 2% above server value between updates
      const elapsed = now - heartbeat;
      const drift = Math.min(2, Math.round(elapsed / 10_000)); // +1% per 10s
      return { running: true, pct: Math.min(serverPct + drift, 99) };
    }

    // Fallback: time-based estimate (for old servers without day_progress)
    const elapsed = now - started;
    const expectedMs = PRESET_DAY_MS[status.timingPreset] ?? 600_000;
    return { running: true, pct: Math.min(Math.round((elapsed / expectedMs) * 95), 95) };
  }

  const sinceCompleted = now - completed;
  if (sinceCompleted < 2_000) return { running: false, pct: 100 };
  return { running: false, pct: 0 };
}, [status, now]);
```

### Step 5: Reset progress on day start

In `runDay()`, right after writing `dayStartedAt`, also reset `day_progress = 0`:

```typescript
db.update(schema.simulationMeta)
  .set({ dayStartedAt: now, heartbeatAt: now, dayProgress: 0 } as any)
  .where(eq(schema.simulationMeta.id, meta.id))
  .run();
```

## File Change Summary

| File | Change |
|------|--------|
| `packages/engine/src/db/schema-sim.ts` | Add `dayProgress` column |
| `packages/engine/src/db/ddl.ts` | Add ALTER TABLE migration |
| `packages/engine/src/simulation/loop.ts` | Add `DayProgress` class + 7-8 `progress.set()` calls |
| `packages/api/src/socket.ts` | Add `dayProgress` to `getSimStatus()` |
| `packages/api/src/routes/simulation.ts` | Add `dayProgress` to status endpoint |
| `packages/web/src/api/types.ts` | Add `dayProgress` to `SimulationStatus` |
| `packages/web/src/main.tsx` | Replace time-based calc with server-driven + interpolation |

## What This Does NOT Do (by design)

- **No phase labels/names** — would require complex tracking and UI for minimal user value
- **No WebSocket push on progress change** — the existing 3s poll in `socket.ts` is frequent enough; progress changes naturally via `getSimStatus()` which already broadcasts on change
- **No sub-step tracking within batches** — Anthropic batch API doesn't provide progress callbacks
- **No estimated time remaining** — unreliable and distracting
- **No progress for individual party agents** — batch API returns all-or-nothing

## Migration Safety

- `ALTER TABLE ... ADD COLUMN ... DEFAULT 0` is safe for existing DBs
- Frontend checks `dayProgress ?? 0` — old servers without the column return 0, triggering time-based fallback
- No breaking API changes — `dayProgress` is an additive optional field
