# Documentation Structure

> **Doc Status**: Canonical index
> **Use for**: Navigating docs folders and naming rules

This folder is organized for a greenfield workflow: only active, current-reference documentation is kept.

## Root (canonical, frequently referenced)

- `Current_Architecture.md` — code-synced architecture/source-of-truth
- `AI_Engine.md` — AI call infrastructure: callAI, circuit breaker, retry, JSON parser, prompts, fallback policies
- `Functional_Overview.md` — product-level overview
- `Engagement.md` — participation system design + implementation notes
- `bundestag-details.md` — domain/political model details
- `operations/runbook.md` — operational commands, environments, and visitor simulation usage

## Folders

- `operations/`
  - active operational runbooks

## Naming Rules

- Prefer fewer files, each actively maintained.
- Avoid legacy/backward-compatibility tracking docs.
- Consolidate implementation history into canonical docs when it still provides current value.
