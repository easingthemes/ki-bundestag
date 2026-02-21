# Timing Presets Plan (Draft)

> **Status**: Initial Draft  
> **Created**: 2026-02-21  
> **Purpose**: Define simulation speed presets with real-world day mapping

---

## Core Principle

**1 sim day = 1 real calendar day**. Always.

Elections every **1461 sim days** (4 years including leap year). The only variable is how fast sim days tick in real wall-clock time.

---

## Preset Overview

| Preset | Time/Sim Day | Term Duration | Participatory | Use Case |
|--------|--------------|---------------|---------------|----------|
| **Ultra-Fast** | AI-bound (~1 min) | ~24 hours | ❌ No | Dev, testing, demos |
| **Fast** | 7 min | 1 week | ❌ No | Binge watch, weekend marathon |
| **Normal** | 30 min (day) / 15 min (night) | ~30 days | ✅ Citizen | Daily check-ins |
| **Slow** | 1.5 hours (day) / paused (night) | ~5 months | ✅ MdB | Full participation |

---

## Mode Types

### Simulation Modes (Ultra-Fast, Fast)

- No user input affects simulation
- AI runs autonomously
- Perfect for: catching up, demoing, testing, watching "what if" scenarios
- User is **audience**, not participant

### Participatory Modes (Normal, Slow)

- Real-time windows for user actions
- Sim pacing allows meaningful engagement
- User input affects outcomes
- User is **actor**, not just viewer

---

## Event Cycles (Fixed in Sim Days)

| Event | Frequency | Sim Days | Real-World Equivalent |
|-------|-----------|----------|----------------------|
| **Plenarsitzung** (Session Day) | ~70/year | every 5 days | Weekly sitting |
| **Sonntagsfrage** (Poll) | 2/month | every 15 days | Bi-weekly polls |
| **Monatsbericht** (Economic Report) | Monthly | every 30 days | Monthly stats |
| **Quartalsreport** | Quarterly | every 91 days | Quarterly review |
| **Haushalt** (Budget) | Annual | every 365 days | Federal budget |
| **Bundestagswahl** (Election) | Every 4 years | every 1461 days | Constitutional term |

---

## Day/Night Handling (Participatory Modes)

### Time Zones

- **Daytime**: 8:00 - 22:00 local time (14 hours)
- **Nighttime**: 22:00 - 8:00 local time (10 hours)

### Action Classification

| Category | Actions | Night Behavior |
|----------|---------|----------------|
| **Critical** | Elections, confidence votes, budget votes | ⏸️ PAUSE until morning |
| **Important** | Bill 3rd readings, referendums, major crises | ⏸️ PAUSE until morning |
| **Standard** | Bill proposals, 1st/2nd readings, negotiations | ⏳ Can run, flag for review |
| **Routine** | Statements, polls, media, economic drift | ✅ Run silently |

### Night Mode by Preset

| Preset | Night Behavior | Rationale |
|--------|----------------|-----------|
| **Ultra-Fast** | None (runs 24/7) | Demo mode, no user interaction |
| **Fast** | None (runs 24/7) | Catch-up mode, no user interaction |
| **Normal** | Light mode (routine only) | Users check 1-2× daily, shouldn't miss key events |
| **Slow** | Full pause | MdB users need to participate in every important event |

---

## Time Budget Calculations

### Ultra-Fast
```
AI-bound: ~1 min per sim day (depends on LLM latency)
Term: 1461 × 1 min = ~24 hours
```

### Fast
```
Fixed: 7 min per sim day
Term: 1461 × 7 = 10,227 min = 170.5 hours = ~7 days
```

### Normal (with day/night)
```
Daytime (14h): 30 min/day → 28 sim days
Nighttime (10h): 15 min/day → 40 sim days (routine only)
Per real day: ~48-68 sim days (varies by content)
Term: ~30 real days
```

### Slow (with night pause)
```
Daytime only (14h): 1.5 hours/day → ~9 sim days per real day
Nighttime: Paused (0 sim days)
Term: 1461 ÷ 9 = ~162 days = ~5.5 months
```

---

## User Experience Patterns

### Simulation Modes

| Preset | Experience |
|--------|------------|
| **Ultra-Fast** | Watch full 4-year term in an afternoon. Good for testing or demos. |
| **Fast** | Weekend marathon — see a complete government cycle in a week. |

### Participatory Modes

| Preset | Check Frequency | Per Visit | Experience |
|--------|-----------------|-----------|------------|
| **Normal** | 1-2× daily | ~1-2 weeks of politics | Like reading weekly news digest |
| **Slow** | 3-4× daily | ~1-2 days of politics | Live it in near real-time |

---

## Queue System (Participatory Modes)

When important event would fire at night:

```typescript
if (isNightTime() && isImportantEvent(nextAction)) {
  queueForMorning(nextAction);
  sendNotification("Budget vote scheduled for 8:00 AM");
  return;
}
```

### Morning Summary Example

```
Good morning! While you slept:
- 2 routine statements were made
- Budget vote is now scheduled (queued overnight)
- Coalition negotiations continue at Day 3

Ready to proceed?
```

---

## Feature Availability by Mode

| Feature | Ultra-Fast | Fast | Normal | Slow |
|---------|------------|------|--------|------|
| Watch simulation | ✅ | ✅ | ✅ | ✅ |
| Read news/events | ✅ | ✅ | ✅ | ✅ |
| Browse history | ✅ | ✅ | ✅ | ✅ |
| Vote in polls | ❌ | ❌ | ✅ | ✅ |
| Ask party questions | ❌ | ❌ | ✅ | ✅ |
| Upvote/downvote | ❌ | ❌ | ✅ | ✅ |
| Vote in referendums | ❌ | ❌ | ✅ | ✅ |
| Internal party proposals | ❌ | ❌ | ❌ | ✅ |
| Request to speak | ❌ | ❌ | ❌ | ✅ |
| Give Bundestag speech | ❌ | ❌ | ❌ | ✅ |
| Vote on bills (as MdB) | ❌ | ❌ | ❌ | ✅ |
| Propose amendments | ❌ | ❌ | ❌ | ✅ |

---

## Configuration Structure

```typescript
export const TIME_CONFIG = {
  // Fixed constants (real-world mapping)
  TERM_DAYS: 1461,           // 4 years including leap
  POLL_INTERVAL: 15,         // bi-weekly
  ECONOMY_INTERVAL: 30,      // monthly
  BUDGET_INTERVAL: 365,      // annual
  SESSION_INTERVAL: 5,       // ~weekly Plenarsitzung
  
  // Night hours (local time)
  nightStart: 22,            // 10 PM
  nightEnd: 8,               // 8 AM
  
  // Presets
  presets: {
    "ultra-fast": { 
      msPerDay: 0,                    // AI-bound, no delay
      participatory: false,
      nightMode: "none",
      label: "Ultra-Fast (Demo)",
      termRealTime: "~24 hours"
    },
    "fast": { 
      msPerDay: 420_000,              // 7 minutes
      participatory: false,
      nightMode: "none",
      label: "Fast (Weekly)",
      termRealTime: "1 week"
    },
    "normal": { 
      msPerDayDay: 1_800_000,         // 30 min daytime
      msPerDayNight: 900_000,         // 15 min nighttime
      participatory: true,
      nightMode: "light",             // routine actions only
      userRole: "citizen",
      label: "Normal (Citizen)",
      termRealTime: "~30 days"
    },
    "slow": { 
      msPerDayDay: 5_400_000,         // 1.5 hours daytime
      msPerDayNight: null,            // paused
      participatory: true,
      nightMode: "pause",             // full pause
      userRole: "mdb",
      label: "Slow (MdB)",
      termRealTime: "~5 months"
    },
  },
  
  // Event importance classification
  criticalEvents: ["election_voting", "confidence_vote", "budget_vote"],
  importantEvents: ["bill_third_reading", "referendum", "crisis_major"],
  routineEvents: ["statement", "poll", "media", "economic_drift", "bill_propose"],
};
```

---

## UI Considerations

### Mode Selector (Admin/Settings)

```
┌─────────────────────────────────────────────────────────┐
│ Simulation Speed                                        │
│                                                         │
│ ○ Ultra-Fast (Demo)        ~24h per term    [Watch]     │
│ ○ Fast (Weekly)            ~1 week per term [Watch]     │
│ ● Normal (Citizen)         ~30 days per term [Interact] │
│ ○ Slow (MdB)               ~5 months per term [Full]    │
│                                                         │
│ ⚠️ Ultra-Fast/Fast disable user participation           │
└─────────────────────────────────────────────────────────┘
```

### When in Simulation-Only Mode

```
╭────────────────────────────────────────╮
│ 👁️ Watch-Only Mode                     │
│                                        │
│ Simulation running in demo mode.       │
│ Switch to Normal or Slow to interact.  │
╰────────────────────────────────────────╯
```

---

## Migration from Current System

### Current (v1)
- 120 arbitrary sim days per term
- 1 sim day ≈ 12 real days (compressed)
- Fixed 30s interval + AI time

### New (v2)
- 1461 real sim days per term
- 1 sim day = 1 real calendar day
- Variable speed presets

### Migration Path
1. Add `timing_preset` to `simulation_meta`
2. Update cycle intervals (polls, budgets, etc.) to new values
3. Recalculate `nextElectionDay` for existing sims
4. Add night mode logic to runner
5. Add event queue table for overnight important events

---

## Decisions

### 1. Timezone Handling
**Decision**: Use Germany timezone (Europe/Berlin)

All day/night calculations use CET/CEST. Server runs on German time regardless of user location.

### 2. Notification System
**Decision**: In-app only

New UI components:
- **Notifications page** (`/notifications`) — Full listing of all notifications, filterable by type
- **Nav icon** — Bell icon in main navigation with unread count badge
- **Dropdown** — Click bell to see latest 5-10 items, "View all" link to full page

Notification types:
- `queued_event` — Important event queued overnight
- `event_ready` — Queued event now ready to proceed
- `participation_window` — Action window opening (votes, speeches)
- `summary` — Daily/morning summary available

### 3. Mode Switching Mid-Simulation
**Decision**: Not allowed (for now)

**What this means**: Changing preset (e.g., Fast → Normal) while simulation is already running at Day 500.

**Current rule**: Preset is locked when simulation starts. To change speed, start a new simulation.

**Future consideration** (if we revisit):
- **Fast → Slower**: Queue system would activate, participatory features enable
- **Slower → Faster**: Pending queue cleared (events fire immediately), participatory features disable
- **Progress preserved**: Current day, all history, pending bills — everything stays
- **No reset**: Simulation continues from current state, just at new speed

*Revisit if user demand emerges.*

### 4. Multiple Concurrent Users in Slow Mode
**Status**: Future planning (approximate idea for now)

**Challenge**: In Slow mode, users need to participate in votes, speeches, etc. If multiple users are MdBs, how do we coordinate?

**Approximate approach**:
- **Participation windows**: Important events have a real-time window (e.g., 2 hours for a bill vote)
- **Async participation**: Users vote/speak anytime within window, results tallied at window close
- **Quorum rules**: Minimum participation % required, or AI fills remaining votes
- **Session scheduling**: Major events (budget, elections) scheduled at predictable times (e.g., 19:00 CET)

*Detailed design deferred to implementation phase.*

---

## Next Steps

- [ ] Review and finalize preset timings
- [ ] Design database schema changes
- [ ] Implement timing configuration module
- [ ] Update runner with preset support
- [ ] Add night mode logic
- [ ] Build event queue system
- [ ] Update UI with mode selector
- [ ] Migration script for existing simulations
