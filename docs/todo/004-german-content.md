# 004 — All Content Must Be German

**Status:** open
**Severity:** high
**Area:** Web

## Problem

UI mixes German and English throughout. The app simulates the German parliament — all user-facing content should be in German.

## English Content Found

- `packages/web/src/pages/About.tsx` — entire page in English
- `packages/web/src/pages/Polls.tsx:72` — "Register and join a party"
- `packages/web/src/pages/Bills.tsx:87` — "Register and join a party"
- `packages/web/src/pages/Dashboard.tsx:149` — "Watch-Only Mode", "Ultra-Fast"
- `packages/web/src/pages/Login.tsx:85` — "2-30 characters" placeholder
- `packages/web/src/components/bills/SpeechSubmitForm.tsx:26` — "Speech submitted!"
- Various form placeholders with English character counts ("20-500 characters")
- Error messages in API client (`packages/web/src/api/client.ts`)
- Button labels, status badges, and tooltips scattered across pages

## Approach

- Translate all user-facing strings to German
- Keep code comments, variable names, and git messages in English
- Consider i18n library for future multi-language support (low priority)
