# 013 — Admin Pages Unreachable (Routes Removed)

**Status:** open
**Severity:** medium
**Area:** Web

## Problem

Admin page components exist but routes were removed from `main.tsx` for security. The pages are now dead code.

## Files

- `packages/web/src/pages/Admin.tsx` — main admin page, links to /admin/costs and /admin/analytics
- `packages/web/src/pages/AdminCosts.tsx` — AI cost tracking
- `packages/web/src/pages/AdminAnalytics.tsx` — user analytics

## Options

1. **Delete admin pages entirely** — manage via DB queries and GitHub Actions workflows
2. **Re-add routes behind auth** — requires real auth (see #001) with admin role
3. **Keep as-is** — dead code but harmless until auth is implemented

## Decision

Blocked by #001 (real auth). Once auth exists, re-add routes with admin role check.
