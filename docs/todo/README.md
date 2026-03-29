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
| 001 | [Real user authentication](./001-real-user-auth.md) | open | API / Web | — |
| 002 | [Missing database indexes](./002-missing-db-indexes.md) | done | Engine / DB | #15 |
| 003 | [Silent error handling (empty catch blocks)](./003-silent-error-handling.md) | done | API | #13 |

## High

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 004 | [All content must be German](./004-german-content.md) | done | Web | #25 |
| 005 | [Mobile view broken on some pages](./005-mobile-view-fixes.md) | open | Web | — |
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
| 013 | [Admin pages unreachable (routes removed)](./013-admin-pages-unreachable.md) | open | Web | — |
| 014 | [Seat allocation race condition](./014-seat-race-condition.md) | done | API / Engine | #24 |
| 015 | [localStorage auth vulnerable to XSS](./015-localstorage-xss.md) | open | Web | — |

## Low

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 016 | [No test suite](./016-no-tests.md) | open | All | — |
| 017 | [No linting or formatting](./017-no-linting.md) | open | All | — |
| 018 | [Console.log in production code](./018-console-logs.md) | done | Engine | #18 |
| 019 | [Inconsistent API error response format](./019-inconsistent-error-format.md) | done | API | #14 |
| 020 | [React hook dependency warnings suppressed](./020-react-hook-deps.md) | done | Web | #19 |
| 021 | [Missing foreign key constraints](./021-missing-fk-constraints.md) | open | Engine / DB | — |

## Summary

- **Done**: 14 of 21
- **Open**: 7 remaining (#001, #005, #013, #015, #016, #017, #021)
- **Blocked**: #013 and #015 depend on #001 (real auth)
