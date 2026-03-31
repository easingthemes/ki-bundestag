# KAI Bundestag

AI-powered simulation of the German parliament. Six political parties, each driven by Claude AI, propose bills, debate, vote, and issue statements day by day. After elections, parties negotiate coalition terms over multiple rounds. Results are stored in SQLite and served via a REST API to a React frontend.

**Live:** [https://bundestag.easingthemes.com/](https://bundestag.easingthemes.com/)

## Quick Start

```bash
# Prerequisites: Node.js 22+, npm 11+
cp .env.example .env        # Add ANTHROPIC_API_KEY (required) + XAI_API_KEY (optional)
npm install
npm run migrate              # Create DB schema
npm run seed                 # Populate parties + initial state
npm run dev:api              # Express API on :3001
npm run dev:web              # Vite dev server on :5173
```

Then open [http://localhost:5173](http://localhost:5173).

Run simulation days:
```bash
npm run simulate             # Run 1 day
npm run simulate 5           # Run 5 days
npm run simulate:auto        # Continuous loop
```

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

```
packages/
  types/    — Shared TypeScript type definitions (no runtime code)
  engine/   — Simulation logic, AI agent calls, DB access (Drizzle + SQLite)
  api/      — Express REST server (10 domain routers)
  web/      — React 19 SPA (Vite + Tailwind v4 + shadcn/ui)
```

Dependency chain: `types` <- `engine` <- `api`. Web is standalone.

### AI Models

Uses [Vercel AI SDK](https://sdk.vercel.ai/) with multiple providers:

- **Party agents:** Claude Haiku (SPD, CDU, Grune, FDP, Linke) via Anthropic API + Grok (AfD) via xAI API
- **Coalition synthesis:** Claude Sonnet via Anthropic API
- **Per-party/per-role overrides** via env vars
- **Circuit breaker** with automatic pause on rate limits

### Database

Dual SQLite setup (WAL mode):
- `data/simulation.db` — Parliament state, bills, elections, parties
- `data/users.db` — User accounts, votes, proposals

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev:api` | Express API on port 3001 |
| `npm run dev:web` | Vite dev server on port 5173 |
| `npm run build` | Build all packages |
| `npm run typecheck` | Typecheck all packages |
| `npm run seed` | Reset DB with fresh party data |
| `npm run migrate` | Apply schema changes (preserves data) |
| `npm run simulate` | Run simulation days |
| `npm run simulate:auto` | Continuous simulation loop |

## Environment Variables

Copy `.env.example` to `.env`. See the file for all options.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude models |
| `XAI_API_KEY` | Optional | xAI API key for Grok (AfD agent) |
| `API_PORT` | Optional | Express port (default: 3001) |
| `MODEL_DAILY` | Optional | Override daily simulation model |
| `MODEL_SYNTHESIS` | Optional | Override coalition synthesis model |

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/Current_Architecture.md) | Full technical architecture, DB schema, API map |
| [AI Engine](docs/AI_Engine.md) | AI infrastructure, model routing, circuit breaker |
| [Bundestag Details](docs/bundestag-details.md) | German parliamentary rules and structure |
| [Hosting Plan](docs/Hosting_Plan.md) | Deployment, CI/CD, Hetzner setup |
| [Runbook](docs/operations/runbook.md) | Operational commands and troubleshooting |

## Deployment

Hosted on Hetzner Cloud (CX22). Deploys automatically via GitHub Actions on push to `main`:

1. CI: typecheck + build web frontend
2. Deploy: rsync to server via [ssh-deploy](https://github.com/easingthemes/ssh-deploy)
3. Server: `npm ci` + migrate + PM2 restart

See [Hosting Plan](docs/Hosting_Plan.md) for full setup guide.

## License

Private.
