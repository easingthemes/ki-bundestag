# KI Bundestag — Future Improvements

Goal: realistic simulation + compelling visitor experience.

---

## Phase A — Visitor Experience ✓ COMPLETE

Small changes, high visitor impact. Frontend-heavy, minimal engine changes.

### A.1 Daily AI Narrative Summary ✓ Done

One Haiku call per day at end of `runDay()`. `daily_summary TEXT` in `simulation_meta`. Exposed as `dailySummary` from `GET /api/simulation/status`. Hero card on Dashboard above the coalition bar. Upgraded in Phase D with `{narrative, mood}` JSON and colored mood badge.

### A.2 Approval Sparklines on Parties Page ✓ Done

`recentApprovals: number[]` (last 14 days) batched into `GET /api/parties` response. `Sparkline` SVG component (40×22px inline polyline) rendered on each party card, color-coded by trend direction.

### A.3 Bills Page Filters ✓ Done

`Bills.tsx` has `filterCategory`, `filterParty`, `filterSearch`, `filterStatus` state. All filtering is client-side. Category dropdown (8 categories), party selector, text search on title, status selector.

### A.4 Navigation Grouping ✓ Done

`main.tsx` nav uses `<span className="nav-sep" />` separators to create four visual groups: Primary (Dashboard/Parties/Bills/Elections/Budget) | Parliamentary (Motions/Anfragen/Vertrauensvoten/Verfassungsgericht) | Public (News/Media/Polls/Votes/Questions) | System (Log/About/Admin).

### A.5 Elections Page: Next Election Countdown ✓ Done

Elections page (both "Current Composition" and "has elections" views) shows "Next scheduled election: Day Y (N days from now)" using `simStatus.nextElectionDay`. Active election status + countdown also displayed.

---

## Phase B — Content Depth (Mostly Complete)

### B.1 Bill Detail Page ✓ Done

`BillDetail.tsx` page at `/bills/:id`. Full bill lifecycle: proposer, description, pipeline stage, committee recommendation, amendments (accepted/rejected with vote breakdowns), third-reading vote bars, economic effects, constitutional challenge (if any), presidential veto note. Links from bill titles on Bills page and Party Detail pages.

### B.2 Media "Front Pages" Layout ✓ Done

`Media.tsx` has a "Today's Front Pages" three-column grid (`front-pages-grid` CSS class) at the top: one column per outlet (Berliner Tagesspiegel / Volksstimme / Wirtschaftswoche), showing headline + truncated summary, click-to-expand full article. Empty-state per column ("No coverage today") when an outlet has no articles that day. CSS includes responsive collapse to single column on mobile. Below the front pages: the existing date-grouped archive with load-more pagination.

### B.3 Party Voting Record Enhancements ✓ Done

`PartyDetail.tsx` has two sections:
- **Voting Alignment**: per-party agreement % bars (last 30 days or all-time if <5 recent), color-coded (green >70%, gray 40–70%, red <40%), links to party detail pages
- **Policy Focus Areas**: tag cloud of bill categories the party proposed or voted yes on, sorted by count

---

## Phase C — Simulation Realism ✓ COMPLETE

### C.1 Coalition Cohesion Score ✓ Done

`coalitionCohesion` computed live in `GET /api/state`: % of third-reading bills in last 14 days where all coalition partners voted the same (requires ≥3 qualifying bills). Displayed on Dashboard below the coalition bar as a colored bar + label (Stable ≥90% / Friction ≥70% / Stressed <70%). Field is `coalitionCohesion?: number | null` on `NationalState`.

### C.2 Fix Agent Vote Confusion ✓ Done

`prompt.ts` already lists explicit bill IDs + titles under "THIRD READING — MANDATORY VOTES (you MUST submit a vote action for each bill ID listed below):" with committee recommendation and accepted amendments per bill.

### C.3 Sentiment Baseline Alignment ✓ Done

Actual values in `opinion.ts`: `SENTIMENT_MIN=5`, `SENTIMENT_MAX=75`, `SENTIMENT_BASELINE=45`, `SENTIMENT_REVERSION_RATE=0.03`. These match MEMORY.md. (Earlier PROGRESS.md/Current_Architecture.md had stale 5–65/38 references — now corrected.)

### C.4 Committee Rejection ✓ Done

`loop.ts` emits `bill_committee_rejected` event when an opposition-proposed bill is rejected in committee. The `bill_committee_rejected` event type is included in `summary.ts`'s SIGNIFICANT set for daily narrative generation.

---

## Phase D — New Engagement Features ✓ COMPLETE

### D.1 "Today in Berlin" Mood Badge ✓ Done

`summary.ts` now returns `{narrative, mood}` JSON (Haiku call). Mood is one of 7 labels: Stable Majority, Coalition Friction, Political Pressure, Crisis Response, Electoral Campaign, Budget Dispute, Government Transition. Stored as JSON string in `simulation_meta.daily_summary`. Dashboard parses it and renders a colored pill badge beside the day header. Backward-compatible with old plain-text rows.

### D.2 Political Alignment Matrix ✓ Done

`GET /api/parties/alignment` computes pairwise vote-agreement % across all bills (requires ≥3 shared votes per pair). Color-coded table rendered on the Parties page below the party grid (green = high agreement, red = low, "—" when insufficient data). `AlignmentData` type added to `web/src/api.ts`. Endpoint registered before `GET /api/parties/:id` in Express to avoid route conflict.

### D.3 "Ask a Party" Widget on Dashboard ✓ Done

`AskPartyWidget` component added to the bottom of Dashboard. Party dropdown (all parties with seats) + text input (5–140 chars) + Ask button. Uses existing `POST /api/questions` endpoint. Success toast ("Check the Questions page…"), error display, "→ Questions" link in card header.

### D.4 Coalition Calculator ✓ Done

`CoalitionCalculator` component added to the bottom of the Elections page (both "no elections yet" and normal election views). Checkboxes per party with mini seat bars, running seat total, MAJORITY/MINORITY indicator (368-seat threshold), and ideological spread score computed from L1 distance across 5 `policyPriorities` keys. Pure frontend, no engine or API changes. Pre-selects current coalition parties.

---


## Summary Table

| ID | Feature | Phase | Effort | Impact | Status |
|---|---|---|---|---|---|
| A.1 | Daily AI narrative on Dashboard | A | Low | High | **Done** |
| A.2 | Approval sparklines on Parties page | A | Low | High | **Done** |
| A.3 | Bills page filters | A | Low | High | **Done** |
| A.4 | Navigation grouping | A | Low | Medium | **Done** |
| A.5 | Next election countdown | A | Very Low | Medium | **Done** |
| B.1 | Bill detail page `/bills/:id` | B | Medium | High | **Done** |
| B.2 | Media front-pages layout | B | Low | Medium | **Done** |
| B.3 | Party voting alignment + focus areas | B | Medium | Medium | **Done** |
| C.1 | Coalition cohesion score | C | Medium | High | **Done** |
| C.2 | Fix agent vote prompt confusion | C | Very Low | Low | **Done** |
| C.3 | Sentiment baseline alignment | C | Very Low | Low | **Done** |
| C.4 | Committee rejection mechanic | C | Low | Medium | **Done** |
| D.1 | "Today in Berlin" mood badge | D | Medium | High | **Done** |
| D.2 | Political alignment matrix | D | Medium | Medium | **Done** |
| D.3 | "Ask a Party" widget on Dashboard | D | Low | Medium | **Done** |
| D.4 | Coalition calculator | D | Medium | Low | **Done** |
