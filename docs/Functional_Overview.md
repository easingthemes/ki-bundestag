# Virtual AI Government — Functional Overview

> **Doc Status**: Active (product overview)
> **Use for**: High-level concept and baseline capabilities

## Core Concept
A public-facing virtual government where political parties are controlled by independent AI agents.  
They propose legislation, negotiate coalitions, govern, respond to crises, and compete in elections.  
The public can follow events in real time through a web platform.

---

## Main Goals
1. Create a living political simulation.
2. Make politics understandable and engaging.
3. Allow public interaction with political decisions.
4. Provide educational and entertainment value.

---

## Key Features

### 1. Live Government Dashboard
A central page showing:
- Current ruling coalition
- Opposition parties
- Approval ratings
- Major policies and decisions
- National indicators (economy, budget, public sentiment)

---

### 2. Parliament Activity
Users can track:
- Proposed bills
- Multi-stage legislative progress
- Voting results
- Coalition negotiations

All actions appear in a chronological timeline.

---

### 3. Elections
Regular election cycles:
- Campaign period
- Party positioning and campaign statements
- Poll updates
- Election night results
- Coalition formation

Elections serve as major public events.

---

### 4. Public Opinion Interaction
Users can influence the simulation:
- Vote in public polls
- Participate in referendums
- Submit questions to politicians

Public opinion affects party strategies and outcomes.

---

### 5. Political Crises and Events
Random or scheduled events:
- Economic downturns
- Migration waves
- Energy shortages
- Corruption scandals
- International conflicts

These force political decisions and change public opinion.

---

### 6. Politician or Party Profiles
Each party profile includes:
- Ideology and priorities
- Approval rating
- Voting history
- Major decisions
- Public statements

---

### 7. AI Media Layer
A simulated media environment:
- Daily headlines
- Political analysis
- Opinion pieces
- Scandal coverage

Different outlets may have different biases.

---

## Public Experience
Users can:
- Follow daily political updates
- Observe legislative and coalition dynamics
- Track elections
- Predict outcomes
- Influence public opinion

The system should feel like a **living political world** rather than a static simulation.

---

## Current Baseline (Implemented)
Current implementation includes:
- 5–6 parties
- Daily decisions
- 4 timing presets (`ultra-fast`, `fast`, `normal`, `slow`) with watch-only and participatory modes
- Bi-weekly poll cycle (every 15 sim days)
- Crisis system with daily trigger chance (8%) and monthly escalation chance (25%), max 2 concurrent crises
- Federal election cadence every 1461 sim days (4-year term), with campaign and negotiation phases

---

## Source Anchors (Code)

- Main simulation loop and daily flow: [packages/engine/src/simulation/loop.ts](packages/engine/src/simulation/loop.ts#L63-L2084)
- Election lifecycle + trigger logic: [packages/engine/src/simulation/elections.ts](packages/engine/src/simulation/elections.ts#L22-L77)
- Timing model (term length, campaign offsets, cycle intervals): [packages/engine/src/simulation/timing.ts](packages/engine/src/simulation/timing.ts#L30-L66)
- Poll/monthly/budget cycle checks: [packages/engine/src/simulation/cycles.ts](packages/engine/src/simulation/cycles.ts#L20-L31)
- AI model routing and provider limits: [packages/engine/src/agent/client.ts](packages/engine/src/agent/client.ts#L17-L174), [packages/engine/src/agent/model-config.ts](packages/engine/src/agent/model-config.ts#L23-L92)
- Media layer generation: [packages/engine/src/simulation/media.ts](packages/engine/src/simulation/media.ts#L69-L149)
- Public Q&A / referendums / polls: [packages/engine/src/simulation/questions.ts](packages/engine/src/simulation/questions.ts#L7-L88), [packages/engine/src/simulation/referendums.ts](packages/engine/src/simulation/referendums.ts#L14-L106), [packages/engine/src/simulation/polls.ts](packages/engine/src/simulation/polls.ts#L12-L129)
- API surface: [packages/api/src/index.ts](packages/api/src/index.ts#L38-L2387)
- Web route map: [packages/web/src/main.tsx](packages/web/src/main.tsx#L515-L537)