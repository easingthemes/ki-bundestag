# 041 — Make Debates Visible and Prominent

**Status**: open
**Area**: Web / API / Engine
**Priority**: High

## Problem

Debates are a core selling point of the simulation ("AI parties debate bills") but they are nearly invisible to users:

1. **No dedicated Debates page** — speeches only appear buried in individual Bill Detail pages during reading phases
2. **News Feed gap** — `mdb_speech` events are created but not mapped to any News Feed filter category, so they don't appear in filtered views
3. **No AI-generated debate content** — the simulation engine doesn't generate party debate speeches/arguments during bill readings. Only user-submitted MdB speeches exist.
4. **`bill_debate` event type is a ghost** — defined in the News Feed UI filter (`EVENT_CATEGORIES.legislative`) but never actually created by the simulation engine
5. **No debate aggregation** — there's no concept of a "debate" as a first-class entity; only individual disconnected speeches

## Current State

- `mdbSpeeches` table stores user-submitted speeches tied to bill readings
- `processDaySpeeches()` evaluates sentiment via AI and creates `mdb_speech` simulation events
- `BillDetail.tsx` shows `SpeechDisplay` + `SpeechSubmitForm` components
- News Feed defines `bill_debate` in filter categories but nothing creates this event type
- AI parties never generate debate arguments or responses to each other's positions on bills

## Proposed Solution

### Phase 1: Surface existing content
- Add `mdb_speech` to News Feed event categories so user speeches appear in the feed
- Create a dedicated `/debates` page that aggregates all speeches grouped by bill + reading
- Add debate activity counts to the Dashboard

### Phase 2: AI-generated debates
- During bill readings, have AI parties generate short debate arguments (pro/contra) for the bill
- Store as `bill_debate` events with party positions and reasoning
- Show these on the Bill Detail page alongside user speeches
- Surface in News Feed under the `bill_debate` category

### Phase 3: Interactive debate experience
- Show debates as threaded conversations (party A argues, party B responds)
- Allow users (MdBs) to respond to AI party arguments
- Real-time debate feed during active readings

## Affected Files

- `packages/engine/src/simulation/` — new debate generation logic in daily simulation
- `packages/engine/src/agent/` — debate prompt templates for AI parties
- `packages/api/src/routes/bills.ts` — debate retrieval endpoints
- `packages/web/src/pages/NewsFeed.tsx` — add `mdb_speech` to event categories
- `packages/web/src/pages/` — new Debates page
- `packages/web/src/main.tsx` — route registration
- `packages/web/src/components/` — debate display components

## Notes

- Phase 1 is low-effort and immediately improves visibility
- Phase 2 is the key feature — AI parties actually debating makes the simulation come alive
- Keep debate generation costs low (use Haiku, short responses, batch where possible)
- Consider debate quality: parties should reference their actual platform positions and prior votes
