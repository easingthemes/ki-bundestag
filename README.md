# KAI Bundestag

**An AI-powered simulation of the German parliament — where six political parties, each driven by their own AI agent, govern a virtual nation in real time.**

**[Live Demo](https://bundestag.easingthemes.com/)**

---

## What is this?

KAI Bundestag simulates the full lifecycle of German parliamentary democracy. AI agents representing six political parties autonomously propose legislation, debate bills, form coalitions, hold elections, and respond to national crises — all without human intervention.

Every day in the simulation, parties make strategic decisions based on their ideology, public approval ratings, and the current political landscape. The result is an emergent, ever-evolving political drama powered entirely by AI.

## Key Features

- **Multi-Agent AI System** — Six autonomous AI agents, each with distinct political ideologies, make independent strategic decisions every simulation day
- **Full Legislative Pipeline** — Bills are proposed, debated, amended, and voted on through a realistic parliamentary process
- **Coalition Negotiations** — Multi-round AI-to-AI negotiations where parties bargain over policy priorities to form governments
- **AI-Generated Media & Polls** — Simulated news outlets with editorial biases and dynamic public sentiment tracking
- **Constitutional Court & Budget System** — Bills can be challenged and struck down; parties must manage national finances
- **Citizen Participation** — Real users can join parties, vote on bills, submit proposals, and influence the simulation
- **24-Page Dashboard** — Modern React SPA with real-time news feed, party profiles, election results, and full simulation timeline

## AI & Engineering Highlights

- **Cost-Optimized Batch Processing** — All simulation AI calls use the Anthropic Message Batches API for 50% cost reduction, with intelligent request grouping across 5 batch phases
- **Multi-Provider Architecture** — Seamless model routing across Anthropic (Claude) and xAI (Grok) via Vercel AI SDK, with per-party and per-role model configuration
- **Production Resilience** — Circuit breaker pattern for API rate limits, exponential retry for transient failures, and per-module fallback policies ensuring simulation continuity
- **Token-Budgeted Prompts** — Priority-based context assembly that fits rich political state into constrained token budgets
- **12+ AI-Powered Features** — Party actions, coalition synthesis, media generation, poll creation, speech scoring, proposal review, and more — each with structured JSON output and typed validation
- **Cost Monitoring** — Three context depth presets (`low`/`normal`/`high`) with per-day cost tracking and admin controls

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **AI** | Claude Haiku & Sonnet (Anthropic), Grok (xAI), Vercel AI SDK v6, Batch API |
| **Backend** | Node.js, Express, TypeScript, Drizzle ORM |
| **Database** | Dual SQLite (WAL mode) — simulation state + user data |
| **Frontend** | React 19, Vite, React Router v7, Tailwind CSS v4, shadcn/ui |
| **Infrastructure** | Turborepo monorepo, GitHub Actions CI/CD, PM2, Hetzner Cloud |

## How It Works

1. **Each simulation day**, AI agents receive a token-budgeted briefing about the current political landscape
2. **Parties act autonomously** — proposing bills, making statements, responding to crises — all via batched API calls
3. **Bills progress** through debate, amendments, and parliamentary votes with structured AI output
4. **Elections trigger** multi-round AI coalition negotiations, with algorithmic fallback if synthesis fails
5. **The web dashboard** presents everything as a living news feed across 24 interactive pages

## Project Structure

```
packages/
  types/    — Shared TypeScript definitions
  engine/   — Simulation core (AI agents, database, game loop)
  api/      — REST API server (11 domain routers)
  web/      — React SPA with 24 pages
```

For full technical documentation, see [TECHNICAL.md](TECHNICAL.md).

## Getting Started

```bash
# Prerequisites: Node.js 22+, npm 11+
cp .env.example .env        # Add your ANTHROPIC_API_KEY
npm install
npm run migrate              # Create DB schema
npm run seed                 # Populate parties + initial state
npm run dev:api              # Start API server
npm run dev:web              # Start frontend
```

Open [http://localhost:5173](http://localhost:5173) and run `npm run simulate` to advance the simulation.

## Built By

**[Dragan Filipovic](https://github.com/easingthemes)** — Full-stack engineer specializing in AI-integrated systems. This project demonstrates:

- Designing and orchestrating **multi-agent AI architectures** with structured output and fallback policies
- Implementing **cost-optimized AI pipelines** (batch processing, token budgeting, multi-provider routing)
- Building **production-grade resilience** (circuit breakers, retry strategies, graceful degradation)
- Delivering a **complete product** end-to-end: database design, REST API, real-time frontend, CI/CD, and cloud deployment

## Documentation

- [Technical Details](TECHNICAL.md) — Architecture, database schema, API reference, environment setup
- [AI Engine](docs/AI_Engine.md) — Model routing, circuit breaker, agent system
- [Bundestag Details](docs/bundestag-details.md) — German parliamentary rules and structure

## License

[MIT](LICENSE)
