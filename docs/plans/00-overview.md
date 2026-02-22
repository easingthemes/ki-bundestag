# Refactor Plan: Overview & Index

## Goal

Modularise all four packages without changing any functionality, API contracts, DB schema, or visual UI.
Each file should have a single clear responsibility. After the refactor, `npm run typecheck` and `npm run build` must pass cleanly.

## Guiding Principles

- **No functional changes** — behaviour, API responses, DB queries, UI appearance all stay identical.
- **Incremental** — each group can be executed independently and verified before moving to the next.
- **Barrel re-exports** — wherever a split touches an existing public import path, a barrel re-export in the original location keeps all consumers unchanged.
- **Prefer domain folders** — related files live together (`components/dashboard/`, `routes/`, `api/`, etc.).

## Groups (execute in order)

| # | Document | Package | Main Files Touched | Urgency |
|---|----------|---------|--------------------|---------|
| 1 | [01-api-refactor.md](./01-api-refactor.md) | `api` | `index.ts` (2826L) | 🔴 Highest |
| 2 | [02-web-shared.md](./02-web-shared.md) | `web` | `lib/utils.ts`, new hooks + components | 🔴 High (unblocks other web work) |
| 3 | [03-web-pages.md](./03-web-pages.md) | `web` | `Dashboard`, `Elections`, `PartyDetail`, `Admin`, `BillDetail` | 🟠 Medium |
| 4 | [04-web-api-split.md](./04-web-api-split.md) | `web` | `api.ts` (796L) | 🟠 Medium |
| 5 | [05-engine-loop.md](./05-engine-loop.md) | `engine` | `simulation/loop.ts` (2137L) | 🟠 Medium |
| 6 | [06-engine-db.md](./06-engine-db.md) | `engine` | `db/seed.ts` (821L), `db/schema.ts` (400L) | 🟡 Lower |
| 7 | [07-types.md](./07-types.md) | `types` | `src/index.ts` (623L) | 🟢 Low |

## Verification (all groups)

After each group:
```bash
npm run typecheck   # must pass with zero errors
npm run build       # must succeed
```

After groups 1–4 (runtime check):
```bash
npm run dev:api     # smoke-test all route categories
npm run dev:web     # smoke-test all pages
```

## Key Decisions

- `express.Router()` used for API split — no framework change.
- `src/api/index.ts` barrel keeps existing `from "../api"` imports valid in web.
- `packages/types/src/index.ts` barrel keeps cross-package consumers unchanged.
- `packages/engine/src/db/schema.ts` stays as unified re-export so `connection.ts` and `seed.ts` see no change.
