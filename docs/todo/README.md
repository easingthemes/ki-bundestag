# Issue Tracker

All known issues, improvements, and feature requests for KI Bundestag.

Each item links to a detail file with full description, affected files, and implementation notes.

## Status Legend

| Status | Meaning |
|--------|---------|
| `open` | Not started |
| `in-progress` | Work underway |
| `done` | Completed |
| `wontfix` | Decided against |

## Critical

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 001 | [Real user authentication](./001-real-user-auth.md) | done | API / Web | — |
| 002 | [Missing database indexes](./002-missing-db-indexes.md) | done | Engine / DB | #15 |
| 003 | [Silent error handling (empty catch blocks)](./003-silent-error-handling.md) | done | API | #13 |

## High

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 004 | [All content must be German](./004-german-content.md) | done | Web | #25 |
| 005 | [Mobile view broken on some pages](./005-mobile-view-fixes.md) | done | Web | — |
| 006 | [/me endpoint issues](./006-me-endpoint-issues.md) | done | API / Web | #20 |
| 007 | [Missing input validation and rate limiting](./007-input-validation.md) | done | API | #16 |
| 008 | [Unsafe type assertions (as unknown as)](./008-unsafe-type-assertions.md) | done | Engine / API | #22 |

## Medium

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 009 | [No global Express error handler](./009-global-error-handler.md) | done | API | #14 |
| 010 | [Missing loading and empty states](./010-loading-empty-states.md) | done | Web | #23 |
| 011 | [Hardcoded external URLs (avatars, images)](./011-hardcoded-external-urls.md) | done | Web | #17 |
| 012 | [Hardcoded validation limits and polling intervals](./012-hardcoded-config.md) | done | API / Web | #21 |
| 013 | [Admin pages unreachable (routes removed)](./013-admin-pages-unreachable.md) | done | Web | — |
| 014 | [Seat allocation race condition](./014-seat-race-condition.md) | done | API / Engine | #24 |
| 015 | [localStorage auth vulnerable to XSS](./015-localstorage-xss.md) | wontfix | Web | — |

## Low

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 016 | [No test suite](./016-no-tests.md) | done | All | — |
| 017 | [No linting or formatting](./017-no-linting.md) | done | All | — |
| 018 | [Console.log in production code](./018-console-logs.md) | done | Engine | #18 |
| 019 | [Inconsistent API error response format](./019-inconsistent-error-format.md) | done | API | #14 |
| 020 | [React hook dependency warnings suppressed](./020-react-hook-deps.md) | done | Web | #19 |
| 021 | [Missing foreign key constraints](./021-missing-fk-constraints.md) | done | Engine / DB | — |
| 022 | [Add broader OAuth providers (Apple, Microsoft)](./022-broader-oauth-providers.md) | open | API / Web | — |
| 023 | [Allow users to change display name after OAuth login](./023-change-display-name.md) | done | API / Web | — |
| 024 | [Blank page after joining party](./024-blank-page-join-party.md) | done | Web | — |
| 025 | [Missing React types / SimulationLog TS errors](./025-missing-react-types-simulation-log.md) | done | Web | — |

## Summary

- **Done**: 23 of 25
- **Wontfix**: 1 (#015 — React escaping prevents XSS; HttpOnly cookies now used via #001)
- **Open**: 1 remaining (#022)
