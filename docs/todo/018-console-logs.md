# 018 — Console.log in Production Code

**Status:** open
**Severity:** low
**Area:** Engine

## Problem

Multiple `console.log()` and `console.error()` calls in engine code. Production logs are noisy without structured logging.

## Locations

- `packages/engine/src/agent/client.ts:177,201,210`
- Various simulation modules use console.log for status

## Fix

- Replace with structured logging (pino or similar)
- Or standardize log format: `[MODULE] message`
- Engine already uses `logAICall()` pattern — extend to other modules
