# 016 — No Test Suite

**Status:** open
**Severity:** low
**Area:** All

## Problem

No tests exist anywhere in the project. No test runner configured.

## Recommended Setup

- **Unit tests**: Vitest (fast, Vite-native, ESM-compatible)
- **API tests**: Supertest + Vitest for route testing
- **Frontend tests**: @testing-library/react + Vitest
- **E2E**: Playwright (already in devDependencies)

## Priority Test Targets

1. Simulation loop (`runDay()`) — most complex logic
2. Action parser — validation rules
3. API routes — input validation, auth middleware
4. Bill pipeline — state machine transitions
