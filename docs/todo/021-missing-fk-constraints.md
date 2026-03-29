# 021 — Missing Foreign Key Constraints

**Status:** open
**Severity:** low
**Area:** Engine / DB

## Problem

No foreign key constraints between tables. Orphaned records possible if data is deleted.

## Missing Constraints

- `bills.proposed_by` → `parties.id`
- `motions.proposed_by` → `parties.id`
- `interpellations.filed_by_party_id` → `parties.id`
- `government.chancellor_party_id` → `parties.id`
- `bundestag_seats.party_id` → `parties.id`
- `mdb_applications.party_id` → `parties.id`
- `internal_proposals.party_id` → `parties.id`

## Notes

SQLite has FK support but it must be enabled per connection with `PRAGMA foreign_keys = ON`. Adding FKs to existing tables requires table recreation in SQLite. Low priority since data is only modified by the simulation engine (controlled writes).
