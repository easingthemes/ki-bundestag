# KI Bundestag — Marketing Strategy

Solo dev, minimal effort, maximum impact. Focus on dev Twitter/X, Hacker News, Reddit, and LinkedIn.

---

## Core Angles (ranked by virality potential)

1. **"I had to use a different AI for AfD"** — The hook. Anthropic's Claude runs 5 parties, but AfD uses xAI's Grok. Why? Let people fill in the blanks (content moderation differences, ideological model diversity). This will generate engagement.

2. **"6 AI agents simulate the German parliament"** — The concept pitch. Autonomous agents debate, negotiate coalitions, pass laws, trigger crises. Pure emergent political drama.

3. **"What I learned building a multi-agent AI system"** — Dev-focused learnings thread. Batch API, cost optimization, resilience patterns, prompt engineering for political personas.

4. **"Each simulation day costs $0.03"** — Cost angle. Running an entire parliament for pennies. Batch API = 50% savings.

---

## Suggested Screenshots (from live app)

Take these screenshots for maximum visual impact:

| # | Page | What to capture | Why it works |
|---|------|----------------|--------------|
| 1 | **Dashboard** (`/`) | Full hemicycle visualization with party colors, coalition status | Visually stunning, immediately communicates "parliament sim" |
| 2 | **Bill Detail** (`/bills/:id`) | A bill with votes (yes/no/abstain bar), speeches, amendments | Shows depth — this isn't a toy |
| 3 | **Elections** (`/elections`) | Election results with seat distribution, coalition negotiation rounds | The AI negotiation output is fascinating to read |
| 4 | **News Feed** (`/news`) | AI-generated German news articles with media bias indicators | Shows emergent content generation |
| 5 | **Party Detail** (`/parties/afd`) | AfD party page — approval rating, recent statements | Pair with the "different AI model" angle |
| 6 | **Simulation Log** (`/log`) | Dense event timeline showing a busy simulation day | Shows the depth of the simulation loop |
| 7 | **Terminal** | Console output showing `[AI] agent:spd | anthropic/claude-haiku... | 1034ms | OK` logs | Dev audience loves observability |
| 8 | **Confidence Vote** or **Constitutional Court** page | A dramatic political moment | Emergent drama |

---

## Twitter/X Posts

### Post 1 — The Hook (lead with controversy)

> I built an AI simulation of the German Bundestag. 6 parties, each powered by AI, debating and passing laws autonomously.
>
> 5 parties run on Claude. For the AfD, I had to use a different model.
>
> Here's what happened when I let them run for 4 years.
>
> 🧵

**Screenshot**: Hemicycle visualization (Dashboard)

---

### Post 2 — Thread continuation (the why)

> Why a different model for AfD?
>
> When 6 AI agents simulate real political parties, you need genuine ideological diversity in their outputs. Using the same model for all parties risks homogenized behavior.
>
> AfD runs on xAI's Grok. The other 5 on Anthropic's Claude Haiku. Multi-provider by design.
>
> The result: meaningfully different negotiation strategies, voting patterns, and crisis responses.

---

### Post 3 — Technical depth

> Each simulation day runs a 13-step loop:
>
> - Economic drift (GDP, inflation, unemployment)
> - Crisis triggers (8 types: energy crisis, cyber attacks, floods...)
> - 6 AI agents independently propose bills, vote, issue statements
> - Coalition negotiations (3 rounds + AI synthesis)
> - AI-generated news articles with media bias
> - Daily narrative summary
>
> Cost per day: $0.03

**Screenshot**: Simulation log or terminal output

---

### Post 4 — The drama angle

> Things that happened organically in my AI parliament:
>
> - A confidence vote collapsed the government on day 247
> - The constitutional court struck down a bill, reversing its economic impact
> - Snap elections triggered because public sentiment dropped below 25%
> - The AfD agent proposed a coalition that every other party rejected (Brandmauer working as designed)
>
> None of this was scripted.

**Screenshot**: Election results or confidence vote page

---

### Post 5 — Dev learnings

> What I learned building a 6-agent AI system:
>
> 1. Anthropic's Batch API saves 50% on tokens — game changer for simulations
> 2. You NEED circuit breakers per provider. One rate limit shouldn't kill your entire loop
> 3. Structured JSON output from LLMs requires aggressive sanitization (strip leading +, trailing commas, markdown fences)
> 4. Token-budgeted prompts with priority tiers > just stuffing context
> 5. Fallback policies per module: party agent fails → abstain all votes. Media fails → skip. Never let one failure cascade.

---

### Post 6 — Cost breakdown

> Running an entire AI parliament costs less than a coffee.
>
> Per simulation day:
> - Low context: $0.02
> - Normal: $0.03
> - High: $0.04
>
> That's 14 AI calls across 12 features, 6 autonomous agents, 3 generated news articles, and a daily summary.
>
> Secret: Anthropic Batch API (50% off) + Claude Haiku (cheap & fast).
>
> A full 4-year term (1461 days) costs ~$44.

---

### Post 7 — Scale flex

> The full stack:
>
> - 199 TypeScript files, ~34k lines
> - 25 pages (React 19 + Vite + Tailwind v4)
> - 93+ API endpoints (Express)
> - 25 database tables (SQLite + Drizzle)
> - 14 distinct AI call sites
> - 8 crisis types
> - 4 timing presets (from "watch AI go brrr" to "full citizen participation")
> - 1 solo dev
>
> Built with Claude Code.

**Screenshot**: Dashboard + party detail side by side

---

### Post 8 — Coalition negotiation deep dive

> How AI coalition negotiations work in KI Bundestag:
>
> Round 1: Each party submits position + acceptable partners + concession offer
> Round 2: They see each other's positions, adjust
> Round 3: Final positions
>
> Then Claude Sonnet synthesizes the agreement — analyzing mutual acceptability, ideological distances, and seat math.
>
> If AI synthesis fails? Algorithmic fallback: greedy coalition formation by ideological proximity.
>
> Always have a fallback.

---

## Reddit Posts

### r/artificial or r/MachineLearning

**Title**: "I built an AI simulation of the German parliament — 6 autonomous agents debate, negotiate coalitions, and pass laws"

**Body**: Focus on technical architecture, multi-agent design, cost optimization. Include 2-3 screenshots. Mention the AfD/different model angle as a technical design choice.

### r/germany or r/de

**Title**: "KI Bundestag: Eine KI-Simulation des Deutschen Bundestags"

**Body**: In German. Focus on political realism — 735 seats, 5% threshold, Brandmauer, Fraktionen, constitutional court. The German audience will appreciate the accuracy of the parliamentary mechanics.

### r/SideProject

**Title**: "Solo dev project: AI-powered German parliament simulation (6 autonomous agents, 25 pages, $0.03/day to run)"

**Body**: Focus on the "one person built this" angle. Tech stack, scope, timeline.

---

## LinkedIn Post

> I built an AI-powered simulation of the German Bundestag as a side project.
>
> 6 political parties, each driven by a separate AI agent, autonomously propose legislation, negotiate coalitions, respond to crises, and form governments — day by day, for 4-year terms.
>
> Some technical highlights:
> • Multi-provider AI architecture (Anthropic Claude + xAI Grok)
> • 50% cost reduction via Anthropic's Batch API
> • Production-grade resilience: circuit breakers, retry logic, per-module fallbacks
> • 25-page React SPA with real-time parliament visualization
> • Full economic simulation (GDP, inflation, budget cycles)
>
> What surprised me most: the emergent political dynamics. Coalition negotiations produce genuine disagreements. Crises force unexpected alliances. Low public sentiment triggers snap elections. None of it scripted.
>
> Running an entire parliament costs $0.03/day.
>
> Tech stack: TypeScript, React 19, Vite, Express, SQLite, Drizzle, Vercel AI SDK, Claude Haiku, Grok.
>
> #AI #MultiAgent #TypeScript #SideProject

---

## Hacker News

**Title**: "Show HN: KI Bundestag – 6 AI agents simulate the German parliament"

**Body**: Keep it short. Link to live app. Mention: multi-agent, coalition negotiations, $0.03/day, different model for AfD. HN loves cost efficiency and controversial design choices.

---

## Posting Schedule (minimal effort)

| Day | Platform | Content |
|-----|----------|---------|
| 1 | Twitter/X | Post 1 (hook) + Post 2 (why different model) |
| 1 | HN | Show HN submission |
| 2 | Twitter/X | Post 3 (technical) + Post 4 (drama) |
| 2 | Reddit | r/artificial post |
| 3 | Twitter/X | Post 5 (dev learnings) + Post 6 (cost) |
| 3 | LinkedIn | LinkedIn post |
| 4 | Twitter/X | Post 7 (scale) + Post 8 (negotiations) |
| 4 | Reddit | r/SideProject post |
| 5+ | | Engage with comments, share follow-up insights |

---

## Key Hashtags

`#AI #MultiAgent #LLM #Claude #TypeScript #Bundestag #AISimulation #SideProject #BuildInPublic #IndieHacker`

---

## Extra Catchy Facts for Engagement

- "The AfD agent keeps proposing coalitions that get rejected by every party — the Brandmauer (firewall) works even in AI"
- "A presidential veto has a 3% base probability, increasing with bill impact magnitude — the AI president occasionally vetoes popular bills"
- "The simulation generates biased news articles — each outlet favors/opposes certain parties, shifting public sentiment"
- "Coalition negotiations sometimes fail entirely. The AI just can't agree. So the algorithmic fallback kicks in — greedy coalition by ideological proximity"
- "Public sentiment below 25 for 5 consecutive days triggers snap elections — the government literally loses legitimacy"
- "I track every AI call: task, model, latency, cost. Full observability. My parliament has better monitoring than most startups"
