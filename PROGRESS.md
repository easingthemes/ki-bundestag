# Visitor Simulation User Mix

## Summary

- **Status**: completed (3 steps)
- **Date**: February 21, 2026
- **Changes**:
  - Reviewed current visitor simulation logic (all-new users, hardcoded 5)
  - Implemented 2/3 existing + 1/3 new user mix with activity-based selection and deduplication
  - Tested empty DB fallback, existing user reuse, and party affiliation preservation

## Goal

Update the visitor simulation script (`npm run simulate:visitors`) to use a realistic mix of ~2/3 existing users and ~1/3 new users instead of creating all new users.

## Completed Steps

### Step 1: Review current visitor simulation logic
- **Status**: done
- **Files**: `scripts/simulate-visitors.ts`
- **Result**: Documented current implementation — creates 5 new visitors from hardcoded names, no existing user reuse

### Step 2: Implement user mix logic
- **Status**: done
- **Files**: `scripts/simulate-visitors.ts`
- **Result**: Added `fetchExistingUsers()` + `selectUserMix()` with activity-based selection, deduplication, party balancing; existing users skip registration via localStorage token injection

### Step 3: Test and validate
- **Status**: done
- **Result**: Empty DB: 5/5 new users. With existing users: 3-4 reused + 1-2 new. Party affiliation preserved.
