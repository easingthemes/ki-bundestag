# 013 — Admin Pages Unreachable (Routes Removed)

**Status:** done
**Severity:** medium
**Area:** Web

## Problem

Admin page components exist but routes were removed from `main.tsx` for security. The pages are now dead code.

## Resolution

Admin functionality replaced with GitHub Actions workflows + public info pages:

**Moved to GH Workflows (`simulation.yml`):**
- Event injection: 8 crisis templates, economic shock, budget cycle, election invalidation
- Timing preset changes (already existed)
- User analytics report (new `analytics-report` action)

**Moved to public pages:**
- Model config → `/simulation-info` (public reference)
- Actions catalog → `/simulation-info` (public reference)
- AI cost estimates → `/simulation-info` (public reference)

**Deleted:**
- `Admin.tsx`, `AdminAnalytics.tsx`, `AdminCosts.tsx` (renamed to `SimulationCosts.tsx`)
- `PresetSelector.tsx`, `InjectForms.tsx` (admin action components)
- Admin API client functions (`injectEvent`, `setPreset`, `getAnalytics`, `getCrisisTemplates`)
