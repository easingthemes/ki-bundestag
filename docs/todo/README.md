# KI Bundestag — Roadmap

## Completed (37 items)

### Foundation & Quality
- Real user authentication (OAuth Google/GitHub, sessions, bearer tokens)
- Missing database indexes, foreign key constraints
- Silent error handling, global Express error handler, consistent error format
- Input validation and rate limiting
- Unsafe type assertions cleaned up
- Test suite (Vitest), linting (ESLint), formatting (Prettier)
- Console.log cleanup, React hook dependency fixes
- localStorage XSS fix, hardcoded URLs/config externalized
- Missing loading/empty states, mobile view fixes

### Simulation Engine
- All content in German
- Media system: 3 outlets, sentiment diversity, feedback loop
- Polls: weekly generation, user voting, 7-day expiry
- Bürgerfragen: user questions to parties, AI answers, upvote/downvote
- Referendums: AI-generated, user voting, quorum, economic impact
- Event injection: crises, snap elections, economic shocks
- Fraktionen: parliamentary groups, 5% threshold
- Multi-stage bills: 5-reading pipeline with amendments
- Motions & resolutions: non-legislative actions
- Chancellor + 8 Ministers: coalition cabinet formation
- Interpellations: Kleine/Große Anfrage, minister AI answers
- Vertrauensfrage + Konstruktives Misstrauensvotum
- Constitutional Court (Bundesverfassungsgericht)
- Annual budget cycle with provisional budget fallback
- Bundespräsident veto on passed bills
- Sentiment model: mean-reversion, per-bill impact, membership bonus

### AI & Context
- Improve AI context quality (briefing + party profiles)
- Reduce PARSE_FAIL and VALIDATION_FAIL rates
- Context & memory management (era summaries with case facts)
- Semantic retry-with-feedback loop for invalid actions
- Batch API cost savings, polling optimization
- Real-world news grounding (knowledge-fetch + abgeordnetenwatch)
- Batch API latency monitoring (timeout tuning, slow-batch warnings)

### User Engagement
- User identity + membership (join/leave party, 7-day cooldown)
- Internal proposals + member voting + party decision engine
- Member bill signals (YES/NO on readings)
- MdB system (seats, applications, voting, speeches, discipline)
- Timing presets (ultra-fast → slow), event queue, notifications

### Tooling
- dx-core plugin installed (replaces custom plan workflow skills)

### Postponed
- Broader OAuth providers (Apple, Microsoft) — low demand
- Scalability load testing — premature until user base grows

---

## Open (5 items)

### 032 — Collect Real-World Cost & Timing Data
**Area**: Operations  
Gather more data points across context depths, election cycles, and active users to validate cost projections. Current data: 12-day sample at $0.028/day (normal depth).  
[Details →](./032-collect-real-cost-data.md)

### 040 — Timeline Scrubber with Playback Controls
**Area**: Web  
Horizontal slider from day 1 to current day. Drag to preview events, click for full day view. Playback controls (1x/2x/5x/10x). Key event markers (elections, crises, coalitions). URL-based day navigation.  
[Details →](./040-prominent-timeline-scrubber.md)

### 041 — Make Debates Visible and Prominent
**Area**: Web / API / Engine  
Phase 1: Surface existing speeches in News Feed + dedicated /debates page.  
Phase 2: AI parties generate debate arguments during bill readings.  
Phase 3: Threaded debate conversations, user responses.  
[Details →](./041-debate-visibility.md)

### 042 — Fix Deploy Workflow Not Triggering on Release
**Area**: CI/CD  
GitHub's `GITHUB_TOKEN` events don't trigger other workflows. Semantic-release creates the release with `GITHUB_TOKEN`, so the `release: published` event never fires the Deploy workflow. Fix: use a PAT secret (`RELEASE_TOKEN`) in `release.yml`, or chain deploy via `workflow_dispatch`.  
**Workaround**: Run `gh workflow run deploy.yml` manually after each release.

### 022 — Broader OAuth Providers
**Area**: API / Web  
Add Apple and Microsoft OAuth. Postponed — revisit when user demand warrants it.  
[Details →](./022-broader-oauth-providers.md)
