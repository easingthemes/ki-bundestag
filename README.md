# KI Bundestag

AI-powered simulation of the German parliament. Six political parties, each driven by Claude AI, propose bills, debate, vote, and issue statements day by day. After elections, parties negotiate coalition terms over multiple rounds. Results are stored in SQLite and served via a REST API to a React frontend.

**Live:** [http://49.13.230.58](http://49.13.230.58)

## Quick Start

```bash
# Prerequisites: Node.js 22+, npm 11+
cp .env.example .env        # Add your ANTHROPIC_API_KEY
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

- **Party agents:** Claude Haiku (SPD, CDU, Grune, FDP, Linke) + Grok (AfD)
- **Coalition synthesis:** Claude Sonnet
- **Per-party/per-role overrides** via env vars

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

Copy `.env.example` to `.env`. Required: `ANTHROPIC_API_KEY`. See the file for all options.

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/Current_Architecture.md) | Full technical architecture, DB schema, API map |
| [AI Engine](docs/AI_Engine.md) | AI infrastructure, model routing, circuit breaker |
| [Functional Overview](docs/Functional_Overview.md) | Product concept and features |
| [Engagement](docs/Engagement.md) | User participation and internal democracy |
| [Bundestag Details](docs/bundestag-details.md) | German parliamentary rules and structure |
| [Hosting Plan](docs/Hosting_Plan.md) | Deployment, CI/CD, Hetzner setup |
| [Model Costs](docs/Model_Costs.md) | AI API cost analysis |
| [Runbook](docs/operations/runbook.md) | Operational commands and troubleshooting |

## Deployment

Hosted on Hetzner Cloud (CX22). Deploys automatically via GitHub Actions on push to `main`:

1. CI: typecheck + build web frontend
2. Deploy: rsync to server via [ssh-deploy](https://github.com/easingthemes/ssh-deploy)
3. Server: `npm ci` + migrate + PM2 restart

See [Hosting Plan](docs/Hosting_Plan.md) for full setup guide.

## License

Private.
