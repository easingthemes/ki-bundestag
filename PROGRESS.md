# Question Voting

## Summary

- **Status**: completed (3 steps)
- **Date**: February 21, 2026
- **Changes**:
  - Added `question_votes` table in user DB with `POST/DELETE /api/questions/:id/vote` endpoints
  - Engine answers top-voted pending questions first (instead of oldest-first)
  - Questions page split into Pending/Answered sections with upvote/downvote UI

## Goal

Add community voting (upvote/downvote) to citizen questions so parties prioritize answering the most popular ones first.

## Completed Steps

### Step 1: Add question_votes table + API endpoints
- **Status**: done
- **Files**: `schema.ts`, `seed.ts`, `types/index.ts`, `web/api.ts`, `api/index.ts`
- **Result**: Added `questionVotes` table (user DB), `voteScore`/`totalVotes`/`userVote` to `CitizenQuestion` type, `POST/DELETE /api/questions/:id/vote` endpoints, updated `GET /api/questions` with score aggregation + smart sorting

### Step 2: Sort questions by vote score, answer top-voted first
- **Status**: done
- **Files**: `packages/engine/src/simulation/questions.ts`
- **Result**: Engine sorts pending questions by vote score (highest first) before answering top 3/day

### Step 3: Update Questions web page with vote UI
- **Status**: done
- **Files**: `packages/web/src/pages/Questions.tsx`
- **Result**: Split into Pending/Answered sections with independent ShowMoreButton; vote buttons for authenticated users; read-only score on answered questions
