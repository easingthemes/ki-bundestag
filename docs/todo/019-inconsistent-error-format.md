# 019 — Inconsistent API Error Response Format

**Status:** open
**Severity:** low
**Area:** API

## Problem

API endpoints use different error response shapes:
- Some: `{ error: "message" }`
- Some: `{ success: false }`
- Some: plain status codes with no body

## Fix

Standardize on `{ error: string }` for all error responses. Update frontend API client to handle consistently.
