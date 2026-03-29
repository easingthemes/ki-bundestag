# 015 — localStorage Auth Vulnerable to XSS

**Status:** open
**Severity:** medium
**Area:** Web

## Problem

Auth token stored in `localStorage` is accessible to any JavaScript on the page. If XSS exists anywhere, tokens can be stolen.

## Current Implementation

- `packages/web/src/api/userContext.ts:39` — stores token in localStorage
- No HttpOnly flag possible with localStorage
- React escapes output by default (mitigates XSS), but not bulletproof

## Fix

Blocked by #001 (real auth). When implementing proper auth:
- Use HttpOnly cookies for session tokens
- Add CSRF protection
- Remove token from localStorage

## Related

- #001 Real User Authentication
