# Operations Runbook

> **Doc Status**: Active operations runbook
> **Use for**: Commands, environment setup, and day-to-day execution

## Core Commands

```bash
npm run seed                 # destructive reset (backs up DB files first)
npm run migrate              # apply schema changes safely
npm run simulate             # run one simulation day
npm run simulate -- 5        # run N simulation days
npm run simulate:3           # shorthand: run 3 days
npm run simulate:6           # shorthand: run 6 days
npm run simulate:auto        # continuous simulation loop

npm run trigger:election     # force election on next simulate run

npm run dev:api              # API server (:3001 by default)
npm run dev:web              # Web app (:5173 by default)

npm run build
npm run typecheck
```

Run all commands from the monorepo root.

## Data Stores

- `data/simulation.db` — simulation state
- `data/users.db` — user-owned engagement data

Both databases run in WAL mode. Paths can be overridden with environment variables.

## Required / Relevant Environment

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes* | Required for Anthropic-backed AI calls |
| `XAI_API_KEY` | Optional | Required only if using xAI models |
| `DATABASE_PATH` | Optional | Override path for `simulation.db` |
| `USER_DATABASE_PATH` | Optional | Override path for `users.db` |
| `API_PORT` | Optional | API server port (default 3001) |
| `MODEL_DAILY` | Optional | Override daily role model |
| `MODEL_NEGOTIATION` | Optional | Override negotiation model |
| `MODEL_SYNTHESIS` | Optional | Override synthesis model |
| `MODEL_PARTY_<ID>` | Optional | Override per-party model |

\* At least one configured provider must be available for AI-dependent simulation features.

## Visitor Simulation

Use visitor simulation to stress-test engagement flows.

Prerequisites:

1. Start API and web servers (`npm run dev:api`, `npm run dev:web`)
2. Ensure Playwright dependency is installed (`npm install`)

Run:

```bash
npm run simulate:visitors
```

Behavior:

- Launches multiple concurrent visitors with isolated browser contexts
- Executes representative actions (register, ask question, vote, proposal/signals, browsing)
- Useful for quick participatory UX smoke-testing

## Canonical References

- Architecture, schema, flow, constants: `docs/Current_Architecture.md`
- AI engine infrastructure (callAI, retry, parser, prompts): `docs/AI_Engine.md`
- Participation mechanics: `docs/Engagement.md`
- Product-level behavior summary: `docs/Functional_Overview.md`
