# 015 — localStorage Auth Vulnerable to XSS

**Status:** wontfix
**Severity:** medium
**Area:** Web

## Problem

Auth token stored in `localStorage` is accessible to any JavaScript on the page. If XSS exists anywhere, tokens can be stolen.

## Current Implementation

- `packages/web/src/api/userContext.ts:39` — stores token in localStorage
- No HttpOnly flag possible with localStorage
- React escapes output by default (mitigates XSS), but not bulletproof

## Fix

Not needed — React's default JSX escaping prevents XSS across all user content rendering. No `dangerouslySetInnerHTML`, no HTML/markdown rendering, no attribute injection points exist. All user input is validated and length-limited on the API side.

HttpOnly cookie migration belongs under #001 (real auth) if pursued later.

## Related

- #001 Real User Authentication
