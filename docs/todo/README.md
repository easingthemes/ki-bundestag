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
| 030 | [Improve AI context quality (briefing + party profiles)](./030-improve-ai-context-quality.md) | done | Engine / Agent | #49 |
| 033 | [Reduce PARSE_FAIL and VALIDATION_FAIL rates](./033-reduce-parse-validation-failures.md) | mostly-done | Engine / Agent | #81 |
| 037 | [Context & memory management for long-running simulation](./037-context-memory-management.md) | done | Engine / Agent | #81 |

## Medium

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 009 | [No global Express error handler](./009-global-error-handler.md) | done | API | #14 |
| 010 | [Missing loading and empty states](./010-loading-empty-states.md) | done | Web | #23 |
| 011 | [Hardcoded external URLs (avatars, images)](./011-hardcoded-external-urls.md) | done | Web | #17 |
| 012 | [Hardcoded validation limits and polling intervals](./012-hardcoded-config.md) | done | API / Web | #21 |
| 013 | [Admin pages unreachable (routes removed)](./013-admin-pages-unreachable.md) | done | Web | — |
| 014 | [Seat allocation race condition](./014-seat-race-condition.md) | done | API / Engine | #24 |
| 015 | [localStorage auth vulnerable to XSS](./015-localstorage-xss.md) | done | Web | — |

## Low

| # | Title | Status | Area | PR |
|---|-------|--------|------|----|
| 016 | [No test suite](./016-no-tests.md) | done | All | — |
| 017 | [No linting or formatting](./017-no-linting.md) | done | All | — |
| 018 | [Console.log in production code](./018-console-logs.md) | done | Engine | #18 |
| 019 | [Inconsistent API error response format](./019-inconsistent-error-format.md) | done | API | #14 |
| 020 | [React hook dependency warnings suppressed](./020-react-hook-deps.md) | done | Web | #19 |
| 021 | [Missing foreign key constraints](./021-missing-fk-constraints.md) | done | Engine / DB | — |
| 022 | [Add broader OAuth providers (Apple, Microsoft)](./022-broader-oauth-providers.md) | postponed | API / Web | — |
| 027 | [Scalability: user load testing & architecture improvements](./027-scalability-user-loads.md) | open | Engine / API / DB | — |
| 028 | [Batch API cost savings for scaling users](./028-batch-api-cost-savings.md) | done | Engine / Agent | — |
| 029 | [Real-world news grounding for simulation](./029-real-world-news-grounding.md) | open | Engine / Agent | — |
| 031 | [Explore abgeordnetenwatch API for deeper integration](./031-abgeordnetenwatch-api-deep-dive.md) | open | Engine / Agent | — |
| 032 | [Collect more real-world cost & timing data](./032-collect-real-cost-data.md) | open | Operations / Docs | — |
| 034 | [Batch API polling optimization](./034-batch-api-polling-optimization.md) | open | Engine / Agent | — |
| 035 | [Media sentiment stuck / lacks diversity](./035-media-sentiment-diversity.md) | open | Engine / Simulation | — |
| 036 | [Presidential veto rate tuning](./036-presidential-veto-tuning.md) | open | Engine / Simulation | — |
| 023 | [Allow users to change display name after OAuth login](./023-change-display-name.md) | done | API / Web | — |
| 024 | [Blank page after joining party](./024-blank-page-join-party.md) | done | Web | — |
| 025 | [Missing React types / SimulationLog TS errors](./025-missing-react-types-simulation-log.md) | done | Web | — |
| 026 | [Remove legacy nickname auth and backward-compatibility shims](./026-legacy-auth-cleanup.md) | done | API / Web | — |

## Summary

- **Done**: 28 of 36
- **Mostly done**: 1 (#033 — 3/4 fixes shipped in #037, retry-on-parse-fail remains)
- **Postponed**: 1 (#022)
- **Open**: 7 remaining (#027, #029, #031, #032, #034, #035, #036)
