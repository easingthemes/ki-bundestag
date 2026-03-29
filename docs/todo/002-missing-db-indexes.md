# 002 — Missing Database Indexes

**Status:** open
**Severity:** critical
**Area:** Engine / DB

## Problem

No database indexes exist in the schema. Every query does a full table scan. Performance degrades as simulation produces more data.

## Indexes Needed

```sql
-- Frequently queried foreign keys
CREATE INDEX idx_bills_proposed_by ON bills(proposed_by);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_party_history_party_day ON party_history(party_id, day_number);
CREATE INDEX idx_simulation_events_day ON simulation_events(day_number);
CREATE INDEX idx_bundestag_seats_party ON bundestag_seats(party_id, controller);

-- User DB indexes
CREATE INDEX idx_member_signals_bill_user ON member_signals(bill_id, user_id);
CREATE INDEX idx_internal_votes_proposal_user ON internal_votes(proposal_id, user_id);
CREATE INDEX idx_internal_proposals_party ON internal_proposals(party_id, status);
CREATE INDEX idx_question_votes_question_user ON question_votes(question_id, user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_user_actions_user_type ON user_actions(user_id, action_type);
CREATE INDEX idx_mdb_votes_bill_user ON mdb_votes(bill_id, user_id);
```

## Implementation

Add indexes to `ddl.ts` column migrations array so they apply via `npm run migrate` without data loss.

## Files

- `packages/engine/src/db/ddl.ts` — schema definitions + migrations
