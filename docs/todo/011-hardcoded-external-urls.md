# 011 — Hardcoded External URLs (Avatars, Images)

**Status:** open
**Severity:** medium
**Area:** Web

## Problem

Pages depend on external services for UI content with no fallback if they go down.

## Instances

- `packages/web/src/pages/Elections.tsx:46` — `https://ui-avatars.com/api/?name=...` for candidate avatars
- `packages/web/src/pages/Media.tsx:149` — `https://picsum.photos/seed/${id}/800/280` for article images

## Fix

- Generate avatars locally (CSS initials or bundled library)
- Use local placeholder images or CSS gradient backgrounds for media
- Remove external service dependencies entirely
