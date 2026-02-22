# Refactor Plan: API Package

## TL;DR

[packages/api/src/index.ts](../../packages/api/src/index.ts) is a 2826-line monolith containing 87 routes, helper functions, middleware, and mappers all in one file. Split it into domain `express.Router()` modules. `index.ts` becomes a thin ~80-line bootstrap that imports and mounts all routers.

## Current State

- **1 file, 2826 lines, 87 routes**
- Middleware (`getUserToken`, `requireParticipatory`, session tracking) defined inline
- Mapper helpers (`mapParty`, `mapBill`, `getMemberCounts`, `getTimingPreset`) defined inline
- All query logic sits directly in route handlers — no service layer (out of scope for this refactor)

## Target Structure

```
packages/api/src/
  index.ts                  ← thin bootstrap (~80L): cors, json, mounts all routers
  middleware/
    auth.ts                 ← getUserToken(), requireParticipatory(), session-tracking middleware
    index.ts                ← barrel re-export
  mappers/
    party.ts                ← mapParty(), getMemberCounts()
    bill.ts                 ← mapBill()
    index.ts                ← barrel re-export
  routes/
    parties.ts              ← /api/parties + /api/parties/:id/* + /api/proposals/*
    bills.ts                ← /api/bills + /api/bills/:id/* (signals, speeches, mdb-votes, amendments)
    elections.ts            ← /api/elections + /api/government
    simulation.ts           ← /api/simulation, /api/simulate/inject, /api/state, /api/calendar, /api/health
    parliament.ts           ← motions, interpellations, confidence-votes, constitutional-court, fraktionen, crises
    content.ts              ← media, questions, polls, referendums
    users.ts                ← login, register, /me, /me/activity, /me/impact, /me/catchup, join, leave
    seats.ts                ← /api/seats/*
    budget.ts               ← /api/budgets
    admin.ts                ← /api/admin/analytics + /api/simulation/preset
```

## Steps

1. Create `src/middleware/auth.ts`
   - Move `getUserToken()` function from `index.ts`
   - Move `requireParticipatory()` middleware from `index.ts`
   - Move session-tracking middleware from `index.ts`

2. Create `src/middleware/index.ts`
   - Barrel: `export * from "./auth.js"`

3. Create `src/mappers/party.ts`
   - Move `mapParty()` function
   - Move `getMemberCounts()` function

4. Create `src/mappers/bill.ts`
   - Move `mapBill()` function

5. Create `src/mappers/index.ts`
   - Barrel: `export * from "./party.js"; export * from "./bill.js"`

6. Create `src/routes/parties.ts`
   - `GET /api/parties` (with alignment query param)
   - `GET /api/parties/:id`
   - `GET /api/parties/:id/history`
   - `GET /api/parties/:id/bills`
   - `GET /api/parties/:id/votes`
   - `GET /api/parties/:id/statements`
   - `GET /api/parties/:id/proposals`
   - `POST /api/parties/:id/proposals`
   - `GET /api/proposals/:id`
   - `POST /api/proposals/:id/vote`
   - `DELETE /api/proposals/:id/vote`
   - Import from `../middleware/index.js` and `../mappers/index.js`

7. Create `src/routes/bills.ts`
   - `GET /api/bills`
   - `GET /api/bills/:id`
   - `GET /api/bills/:id/signal`
   - `POST /api/bills/:id/signal`
   - `GET /api/bills/:id/speeches`
   - `POST /api/bills/:id/speech`
   - `GET /api/bills/:id/mdb-votes`
   - `POST /api/bills/:id/mdb-vote`
   - `POST /api/bills/:id/amendment`

8. Create `src/routes/elections.ts`
   - `GET /api/elections`
   - `GET /api/elections/active`
   - `GET /api/elections/:id`
   - `GET /api/government`
   - `GET /api/government/history`

9. Create `src/routes/simulation.ts`
   - `GET /api/health`
   - `GET /api/state`
   - `GET /api/simulation/status`
   - `GET /api/simulation/preset`
   - `GET /api/simulation/days`
   - `GET /api/simulation/days/:dayNumber`
   - `GET /api/simulation/events`
   - `GET /api/simulation/events/latest`
   - `GET /api/simulation/queue`
   - `GET /api/calendar`
   - `GET /api/calendar/upcoming`
   - `POST /api/simulate/inject`
   - `GET /api/simulate/injections`
   - Move `getTimingPreset()` helper into this file (private, used only here)

10. Create `src/routes/parliament.ts`
    - `GET /api/motions`, `GET /api/motions/:id`, `POST /api/motions/submit`
    - `GET /api/interpellations`, `GET /api/interpellations/:id`, `POST /api/interpellations/submit`
    - `GET /api/confidence-votes`, `GET /api/confidence-votes/:id`
    - `GET /api/constitutional-court`, `GET /api/constitutional-court/:id`
    - `GET /api/fraktionen`, `GET /api/fraktionen/:id`
    - `GET /api/crises`, `GET /api/crises/:id`
    - `GET /api/crisis-templates`

11. Create `src/routes/content.ts`
    - `GET /api/media`, `GET /api/media/:id`
    - `GET /api/questions`, `GET /api/questions/:id`
    - `POST /api/questions`
    - `POST /api/questions/:id/vote`, `DELETE /api/questions/:id/vote`
    - `GET /api/polls`, `GET /api/polls/:id`
    - `POST /api/polls/:id/vote`
    - `GET /api/referendums`, `GET /api/referendums/:id`
    - `POST /api/referendums/:id/vote`

12. Create `src/routes/users.ts`
    - `POST /api/users/login`
    - `POST /api/users/register`
    - `GET /api/users/me`
    - `GET /api/users/me/activity`
    - `GET /api/users/me/impact`
    - `GET /api/users/me/catchup`
    - `POST /api/users/me/join/:partyId`
    - `POST /api/users/me/leave`
    - `GET /api/notifications`, `GET /api/notifications/unread-count`
    - `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`

13. Create `src/routes/seats.ts`
    - `GET /api/seats/apply`
    - `POST /api/seats/apply`
    - `GET /api/seats/my-seat`
    - `GET /api/seats/party/:partyId`
    - `GET /api/seats/available`

14. Create `src/routes/budget.ts`
    - `GET /api/budgets`
    - `GET /api/budgets/:id`

15. Create `src/routes/admin.ts`
    - `GET /api/admin/analytics`
    - `POST /api/simulation/preset`

16. Rewrite `src/index.ts`
    - Keep only: Express app creation, cors, json body parser, port binding, `app.listen()`
    - Import and mount all 10 routers with `app.use(router)`
    - Target: ~80 lines

## Verification

```bash
npm run typecheck
npm run build
npm run dev:api
# Test representative routes from each domain group via curl or browser
curl http://localhost:3001/api/health
curl http://localhost:3001/api/parties
curl http://localhost:3001/api/bills
curl http://localhost:3001/api/simulation/status
```

## Notes

- All imports within route files must use `.js` extensions (ESM requirement)
- `getDb()` and `getUserDb()` are called directly in route handlers — no change to that pattern
- Router files import middleware from `../middleware/index.js` and mappers from `../mappers/index.js`
- No service layer is introduced — that is a separate concern beyond this refactor's scope
