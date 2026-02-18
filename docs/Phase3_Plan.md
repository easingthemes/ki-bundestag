# Phase 3 — Full Platform: Implementation Plan

> Created: 2026-02-17

## Current State

Phase 1 (Prototype) and Phase 2 (Public Beta) are complete. Phase 3 has started with **Media Simulation** (done). The simulation is feature-rich but mostly **observational** — users can only vote on polls. The remaining Phase 3 work should make the simulation more interactive and dynamic.

## Remaining Features (ordered by priority)

### 3B. Media Feedback Loop
**Priority: HIGH | Effort: SMALL | Files: 3**

Media articles currently exist in isolation — parties don't see them, and they don't affect the simulation. This makes them decorative rather than functional.

**Changes:**
1. **Agent awareness**: Inject last 3 media headlines into party agent context in `prompt.ts` → add a `RECENT MEDIA:` section to `buildUserPrompt()`. Load from `media_articles` table (last 3 by day_number desc).
2. **Sentiment influence**: After generating articles, apply a small sentiment nudge in `loop.ts` based on article count and category. Crisis articles: -0.2 sentiment, positive government coverage: +0.1. Capped at ±0.5 per day from media.

**Files to modify:**
- `packages/engine/src/agent/prompt.ts` — Add media headlines to user prompt
- `packages/engine/src/simulation/loop.ts` — Pass recent media to agent context; apply media sentiment
- `packages/engine/src/simulation/media.ts` — Export helper to load recent articles

---

### 3C. Bürgerfragen (Citizen Questions)
**Priority: HIGH | Effort: MEDIUM | Files: ~10**

Users submit a political question to a specific party. The party's AI agent generates an in-character response. This is the simplest meaningful interaction between users and the simulation.

**Data model:**
```ts
// types
interface CitizenQuestion {
  id: string;
  question: string;        // user-submitted question text
  targetPartyId: string;   // which party to address
  response: string | null; // AI-generated party response
  respondedOnDay: number | null;
  createdOnDay: number;
  status: "pending" | "answered";
}
```

**Schema:** New `citizen_questions` table (id, question, target_party_id, response, responded_on_day, created_on_day, status).

**Engine:**
- New file `packages/engine/src/simulation/questions.ts`
- `answerPendingQuestions(allParties, currentDay)`: Load pending questions, make one Haiku call per question with party context, store response
- Called in `loop.ts` after party agents run (max 3 questions answered per day to control costs)
- Questions older than 14 days without answer are auto-closed

**API:**
- `POST /api/questions` — Submit question (body: `{ question, targetPartyId }`). Rate limit: max 5 pending questions total (no auth, simple abuse prevention).
- `GET /api/questions` — List questions (optional `?partyId=`, `?status=` filters), sorted by day desc
- `GET /api/questions/:id` — Single question with response

**Web:**
- Add question submission form to PartyDetail page (text input + submit button below party header)
- New `/questions` page showing all Q&A pairs, grouped by party
- Add "Questions" nav link

---

### 3D. Referendums
**Priority: MEDIUM | Effort: MEDIUM | Files: ~10**

Referendums are like enhanced polls that actually affect the simulation. AI generates referendum topics based on current events, or users can propose them.

**Data model:**
```ts
interface Referendum {
  id: string;
  title: string;           // e.g., "Should Germany exit nuclear energy?"
  description: string;     // context paragraph
  options: string[];       // typically ["Yes", "No"]
  votes: Record<string, number>;
  createdOnDay: number;
  closesOnDay: number;
  status: "active" | "passed" | "rejected" | "expired";
  result: string | null;   // winning option
  impact: BillImpact | null; // applied when resolved
  category: string;
}
```

**Schema:** New `referendums` table.

**Engine:**
- New file `packages/engine/src/simulation/referendums.ts`
- Auto-generate 1 referendum every 30 days via Haiku call (using current political context)
- On resolution: apply impact to economy/sentiment, create simulation event, parties react in next day's context
- Threshold: needs minimum 10 votes to be valid; majority wins

**API:**
- `GET /api/referendums` — List (optional `?status=` filter)
- `GET /api/referendums/:id` — Single referendum
- `POST /api/referendums/:id/vote` — Vote (same pattern as polls)

**Web:**
- New `/referendums` page with active referendum cards (prominent voting UI), past results
- Add "Referendums" nav link
- Dashboard: show active referendum count

---

### 3E. Event Injection (Lightweight Scenario Mode)
**Priority: MEDIUM | Effort: SMALL | Files: ~5**

Instead of full save/fork scenario mode, allow users to inject events that alter the simulation. This is the "what if" experience in its simplest form.

**API:**
- `POST /api/simulate/inject` — Inject an event before the next simulation day
  - Types: `{ type: "crisis", templateId: string }` — force a specific crisis
  - Types: `{ type: "election" }` — trigger snap election (like trigger:election but via API)
  - Types: `{ type: "economic_shock", impact: BillImpact }` — one-time economic event
  - Store in a `pending_injections` table, consumed by next `runDay()`

**Engine:**
- New `pending_injections` table (id, type, data JSON, consumed boolean)
- At start of `runDay()`, load unconsumed injections and apply them
- Mark as consumed after processing

**Web:**
- Add "Inject Event" panel to Dashboard (collapsible)
- Buttons: "Trigger Crisis" (dropdown of templates), "Call Election", "Economic Shock" (slider for severity)
- Show confirmation when injection is queued

---

### ~~3F. Notable Politicians~~ → Moved to Phase 4

Moved to Phase 4 due to high effort and cost. See PROGRESS.md for Phase 4 backlog.

---

## Implementation Status

All Phase 3 features (3A–3E) are **COMPLETE**.

```
3B. Media Feedback Loop    ✅ Done (3 files)
3C. Bürgerfragen           ✅ Done (~10 files)
3D. Referendums            ✅ Done (~10 files)
3E. Event Injection        ✅ Done (~8 files)
```

Each feature follows the established pattern: type → schema → seed DDL → engine logic → API endpoints → web types/client → web page → nav/routes → CSS.

## Implementation Notes

- All new tables need entries in both `TABLE_DDL` and the `DROP TABLE` list in `seed.ts`
- New engine files export from `simulation/index.ts`
- New API endpoints go in `api/src/index.ts` with `map*()` helper functions
- Web types are duplicated in `web/src/api.ts` (not shared with types package)
- All POST endpoints should have basic validation (non-empty strings, valid IDs)
- Run `npm run typecheck` after each feature to catch issues early
- Run `npm run migrate` to create new tables without losing data
