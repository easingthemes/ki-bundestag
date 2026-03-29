# 021 — Missing Foreign Key Constraints

**Status:** done
**Severity:** low
**Area:** Engine / DB

## Problem

No foreign key constraints between tables. Orphaned records possible if data is deleted.

## Missing Constraints — Simulation DB

| Table | Column | References |
|-------|--------|------------|
| `bills` | `proposed_by` | `parties.id` |
| `motions` | `proposed_by` | `parties.id` |
| `party_history` | `party_id` | `parties.id` |
| `fraktionen` | `party_id` | `parties.id` |
| `government` | `chancellor_party_id` | `parties.id` |
| `government` | `election_id` | `elections.id` |
| `interpellations` | `filed_by_party_id` | `parties.id` |
| `interpellations` | `target_party_id` | `parties.id` |
| `confidence_votes` | `government_id` | `government.id` |
| `confidence_votes` | `initiated_by_party_id` | `parties.id` |
| `confidence_votes` | `proposed_chancellor_party_id` | `parties.id` |
| `constitutional_challenges` | `bill_id` | `bills.id` |
| `constitutional_challenges` | `filed_by_party_id` | `parties.id` |
| `citizen_questions` | `target_party_id` | `parties.id` |
| `bundestag_seats` | `party_id` | `parties.id` |
| `bundestag_seats` | `election_id` | `elections.id` |

## Missing Constraints — User DB (same-DB only)

| Table | Column | References |
|-------|--------|------------|
| `internal_votes` | `proposal_id` | `internal_proposals.id` |
| `internal_votes` | `user_id` | `users.id` |
| `member_signals` | `user_id` | `users.id` |
| `question_votes` | `user_id` | `users.id` |
| `referendum_votes` | `user_id` | `users.id` |
| `mdb_applications` | `user_id` | `users.id` |
| `mdb_votes` | `user_id` | `users.id` |
| `mdb_speeches` | `user_id` | `users.id` |
| `notifications` | `user_id` | `users.id` |
| `user_actions` | `user_id` | `users.id` |

## Cross-DB References (cannot use FK constraints)

User DB tables reference simulation DB entities (`parties.id`, `bills.id`, `citizen_questions.id`, `referendums.id`, `bundestag_seats.id`). These cannot have FK constraints due to the dual-DB architecture. Application-layer validation is needed instead.

Affected columns: `users.party_id`, `internal_proposals.party_id`, `internal_proposals.bundestag_bill_id`, `member_signals.bill_id`, `question_votes.question_id`, `referendum_votes.referendum_id`, `mdb_applications.party_id`, `mdb_votes.seat_id`, `mdb_votes.bill_id`, `mdb_speeches.bill_id`.

## Notes

- `PRAGMA foreign_keys = ON` is already set in `connection.ts` but there are no constraints to enforce
- Adding FKs to existing tables requires table recreation in SQLite
- Schema defined in both Drizzle (`schema.ts`, `user-schema.ts`) and DDL strings (`ddl.ts`) — both need updating
- Low priority since data is only modified by the simulation engine (controlled writes)
