---
paths:
  - "packages/api/**"
---

# API Rules (Express REST)

## Structure

Express server on port 3001 (`API_PORT` env var). 10 domain routers in `src/routes/`:

| Router | Prefix | Domain |
|--------|--------|--------|
| `parties.ts` | `/api/parties` | Party profiles, approval, coalition |
| `bills.ts` | `/api/bills` | Bill CRUD, signals, amendments, votes |
| `elections.ts` | `/api/elections` | Elections, results, coalitions |
| `simulation.ts` | `/api/simulation` | Sim status, day triggers, injections |
| `parliament.ts` | `/api/parliament` | Motions, interpellations, confidence votes, court |
| `content.ts` | `/api/content` | Media, polls, questions, referendums, logs |
| `users.ts` | `/api/users` | Auth, profile, proposals, MdB applications |
| `seats.ts` | `/api/seats` | MdB seat management |
| `budget.ts` | `/api/budget` | Budget proposals, allocations |
| `admin.ts` | `/api/admin` | Model config, costs, analytics |

## Conventions

- All routes prefixed with `/api/`
- Import DB access and simulation logic from `@ki-bundestag/engine`
- Import types from `@ki-bundestag/types`
- Use `getSqlite()` / `getUserSqlite()` for raw queries — never instantiate DB connections in API layer
- JSON responses — Express `res.json()` for all endpoints
- Error handling via middleware in `src/middleware/index.ts`

## Middleware

- **`src/middleware/index.ts`** — Session tracking, global error handler
- **`src/middleware/auth.ts`** — Token-based user auth (extracts user from headers)

## Mappers

DTO transformations live in `src/mappers/`:
- `party.ts` — Party → API response shape
- `bill.ts` — Bill → API response shape

When adding new endpoints that return complex objects, add mappers here rather than inlining transformations in route handlers.

## Adding New Routes

1. Create `src/routes/<domain>.ts` with an Express router
2. Register in `src/index.ts` under `/api/<domain>`
3. Import engine functions — don't duplicate DB logic
4. Use `.js` extensions on local imports (ESM requirement)
