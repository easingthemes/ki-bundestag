# 017 — No Linting or Formatting

**Status:** done
**Severity:** low
**Area:** All

## Problem

No ESLint, Prettier, or other code quality tools configured. Code style varies across files.

## Recommended Setup

- ESLint with TypeScript plugin
- Prettier for formatting
- lint-staged + husky for pre-commit hooks
- Add `npm run lint` and `npm run format` scripts
