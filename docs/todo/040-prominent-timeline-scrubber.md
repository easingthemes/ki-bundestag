# 040 — Prominent Timeline Scrubber with Playback Controls

**Status**: open
**Area**: Web
**Priority**: Medium

## Problem

Users lack a prominent way to navigate the simulation timeline. The existing CalendarWidget and SimulationLog page require clicking through months or scrolling a reverse-chronological list. There's no intuitive "scrub through time" experience or playback speed control.

## Current State

- `CalendarWidget` on Dashboard: month-by-month calendar grid, click a day to see events
- `SimulationLog` page: paginated reverse-chronological list (10 days at a time)
- `UpcomingCalendar`: shows future scheduled events (elections, budget cycles, etc.)
- No timeline slider, no day jumping, no URL-based day navigation (`/day/123`)
- No playback speed concept for browsing historical events

## Proposed Solution

Add a prominent timeline component (slider/scrubber) that:

1. **Timeline scrubber bar** — a horizontal slider spanning day 1 to current day, always visible (e.g. sticky header or sidebar). Dragging shows a preview tooltip with key events for that day.
2. **Day detail view** — clicking/selecting a day opens a full view of that day's events, narrative, and mood.
3. **Playback controls** — play/pause/speed buttons to auto-advance through days at configurable speeds (1x, 2x, 5x, 10x). Shows events appearing in sequence like a news ticker.
4. **Key event markers** — visual markers on the timeline for important events (elections, coalition changes, crises, major bills passed).
5. **URL-based navigation** — `/timeline?day=123` or similar, so users can share links to specific days.

## Affected Files

- `packages/web/src/components/` — new Timeline component
- `packages/web/src/pages/` — possibly a new Timeline page or enhance SimulationLog
- `packages/web/src/main.tsx` — route registration
- `packages/api/src/routes/simulation.ts` — may need a day-range events endpoint

## Notes

- Consider mobile-friendliness — horizontal scrubber may need a different UX on small screens
- Could reuse existing `/api/simulation/days` and `/api/calendar` endpoints
- Playback is client-side only (auto-advancing the selected day, not triggering simulation)
