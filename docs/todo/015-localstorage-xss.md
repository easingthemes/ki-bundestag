# 015 — localStorage Auth Vulnerable to XSS

**Status:** done
**Severity:** medium
**Area:** Web

## Problem

Auth token stored in `localStorage` is accessible to any JavaScript on the page. If XSS exists anywhere, tokens can be stolen.

## Current Implementation

- `packages/web/src/api/userContext.ts:39` — stores token in localStorage
- No HttpOnly flag possible with localStorage
- React escapes output by default (mitigates XSS), but not bulletproof

## Fix

Resolved by #026 — localStorage token storage removed entirely. Auth now uses OAuth session cookies (HttpOnly) via #001. No client-side token storage exists.

## Related

- #001 Real User Authentication
