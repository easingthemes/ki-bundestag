import { getDb, getSqlite, getUserDb, getUserSqlite, getUserDbPath, schema } from "./connection.js";
import { FRAKTION_LEADERS, FRAKTION_THRESHOLD } from "../simulation/fraktionen.js";
import { MINISTER_CANDIDATES, MINISTRY_PORTFOLIOS } from "../simulation/government.js";
import { getHumanSeatRatio } from "../simulation/timing.js";
import { PARTIES, INITIAL_NATIONAL_STATE } from "./seed-data.js";
import { SIM_TABLE_DDL, USER_TABLE_DDL, SIM_COLUMN_MIGRATIONS, USER_COLUMN_MIGRATIONS, SIM_INDEX_MIGRATIONS, USER_INDEX_MIGRATIONS } from "./ddl.js";

/**
 * Ensure all tables and columns exist without touching data.
 * Safe to run repeatedly — creates missing tables, adds missing columns.
 */
export function migrateDatabase() {
  // ── Simulation DB ──
  const sqlite = getSqlite();

  // Create any missing tables
  sqlite.exec(SIM_TABLE_DDL);

  // Add any missing columns to existing tables
  for (const m of SIM_COLUMN_MIGRATIONS) {
    try {
      sqlite.exec(m.sql);
    } catch (err: any) {
      // "duplicate column name" means it already exists — that's fine
      if (!err.message?.includes("duplicate column")) {
        throw err;
      }
    }
  }

  // Apply index migrations
  for (const m of SIM_INDEX_MIGRATIONS) {
    sqlite.exec(m.sql);
  }

  // Backfill start_date for existing DBs
  try {
    sqlite.prepare("UPDATE simulation_meta SET start_date = ? WHERE start_date IS NULL").run(new Date().toISOString());
  } catch { /* table may not exist yet */ }

  // Migrate existing "debate" bills to "third_reading" for the new multi-stage pipeline
  try {
    const debateBills = sqlite.prepare("SELECT id FROM bills WHERE status = 'debate'").all() as Array<{ id: string }>;
    if (debateBills.length > 0) {
      const metaRow = sqlite.prepare("SELECT current_day FROM simulation_meta LIMIT 1").get() as { current_day: number } | undefined;
      const currentDay = metaRow?.current_day ?? 0;
      sqlite.prepare("UPDATE bills SET status = 'third_reading', reading = 3, status_changed_on_day = ? WHERE status = 'debate'").run(currentDay);
      console.log(`[Migrate] Converted ${debateBills.length} debate bills → third_reading`);
    }
  } catch {
    // bills table might not have the new columns yet
  }

  // Auto-populate fraktionen if table exists but is empty and parties have seats
  try {
    const fraktionCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM fraktionen").get() as { cnt: number };
    if (fraktionCount.cnt === 0) {
      const partyRows = sqlite.prepare("SELECT id, seat_count FROM parties").all() as Array<{ id: string; seat_count: number }>;
      for (const row of partyRows) {
        if (row.seat_count >= FRAKTION_THRESHOLD && FRAKTION_LEADERS[row.id]) {
          sqlite.prepare(
            "INSERT INTO fraktionen (id, party_id, leader_name, status, formed_on_day, dissolved_on_day) VALUES (?, ?, ?, 'active', 0, NULL)"
          ).run(`frak-${row.id}`, row.id, FRAKTION_LEADERS[row.id]);
        }
      }
      const inserted = sqlite.prepare("SELECT COUNT(*) as cnt FROM fraktionen").get() as { cnt: number };
      if (inserted.cnt > 0) {
        console.log(`[Migrate] Auto-populated ${inserted.cnt} Fraktionen`);
      }
    }
  } catch {
    // fraktionen table might not exist yet — that's fine
  }

  // Backfill initial election + bundestag seats if parliament exists but no election record
  try {
    const electionCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM elections").get() as { cnt: number };
    const partyRows = sqlite.prepare("SELECT id, seat_count, coalition_role FROM parties").all() as Array<{ id: string; seat_count: number; coalition_role: string }>;
    if (electionCount.cnt === 0 && partyRows.length > 0 && partyRows.some(p => p.seat_count > 0)) {
      const coalition = partyRows.filter(p => p.coalition_role === "leader" || p.coalition_role === "junior").map(p => p.id);
      const opposition = partyRows.filter(p => p.coalition_role === "opposition").map(p => p.id);
      const results = partyRows.map(p => ({ partyId: p.id, seatsWon: p.seat_count, voteShare: +(p.seat_count / 735 * 100).toFixed(1) }));
      const electionId = "election-initial";

      sqlite.prepare(
        "INSERT INTO elections (id, trigger_reason, announced_on_day, campaign_start_day, election_day, status, results, new_coalition, new_opposition, negotiation_rounds, coalition_agreement) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        electionId, "Initial parliament formation", 0, 0, 0, "completed",
        JSON.stringify(results), JSON.stringify(coalition), JSON.stringify(opposition),
        JSON.stringify([]), null,
      );
      console.log(`[Migrate] Created initial election record (${coalition.length} coalition, ${opposition.length} opposition)`);

      // Backfill bundestag seats linked to the synthetic election
      const seatCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM bundestag_seats").get() as { cnt: number };
      if (seatCount.cnt === 0) {
        const metaRow = sqlite.prepare("SELECT timing_preset FROM simulation_meta LIMIT 1").get() as { timing_preset?: string } | undefined;
        const preset = (metaRow?.timing_preset ?? "normal") as import("../simulation/timing.js").TimingPreset;
        const humanRatio = getHumanSeatRatio(preset);
        let totalInserted = 0;
        for (const row of partyRows) {
          if (row.seat_count <= 0) continue;
          const humanCount = Math.round(row.seat_count * humanRatio);
          const aiCount = row.seat_count - humanCount;
          let seatNum = 1;
          for (let i = 0; i < humanCount; i++) {
            sqlite.prepare(
              "INSERT INTO bundestag_seats (id, seat_number, party_id, controller, user_id, election_id, active, proxy_default, discipline_level, discipline_reason, allocated_on_day) VALUES (?, ?, ?, 'human', NULL, ?, 1, 'party_line', 0, NULL, 0)"
            ).run(`seat-${row.id}-${seatNum}`, seatNum, row.id, electionId);
            seatNum++;
          }
          for (let i = 0; i < aiCount; i++) {
            sqlite.prepare(
              "INSERT INTO bundestag_seats (id, seat_number, party_id, controller, user_id, election_id, active, proxy_default, discipline_level, discipline_reason, allocated_on_day) VALUES (?, ?, ?, 'ai', NULL, ?, 1, 'party_line', 0, NULL, 0)"
            ).run(`seat-${row.id}-${seatNum}`, seatNum, row.id, electionId);
            seatNum++;
          }
          totalInserted += row.seat_count;
        }
        if (totalInserted > 0) {
          console.log(`[Migrate] Auto-populated ${totalInserted} Bundestag seats (${Math.round(humanRatio * 100)}% human)`);
        }
      } else {
        // Seats exist but have no election_id — link them to the synthetic election
        const unlinked = sqlite.prepare("UPDATE bundestag_seats SET election_id = ? WHERE election_id IS NULL").run(electionId);
        if (unlinked.changes > 0) {
          console.log(`[Migrate] Linked ${unlinked.changes} existing seats to initial election`);
        }
      }

      // Link initial government to the election if it has no election_id
      try {
        const govUpdate = sqlite.prepare("UPDATE government SET election_id = ? WHERE election_id IS NULL OR election_id = ''").run(electionId);
        if (govUpdate.changes > 0) {
          console.log(`[Migrate] Linked government to initial election`);
        }
      } catch { /* government table might not have election_id column */ }
    }
  } catch {
    // tables might not exist yet — that's fine
  }

  // ── User DB ──
  const userSqlite = getUserSqlite();
  userSqlite.exec(USER_TABLE_DDL);

  for (const m of USER_COLUMN_MIGRATIONS) {
    try {
      userSqlite.exec(m.sql);
    } catch (err: any) {
      if (!err.message?.includes("duplicate column")) {
        throw err;
      }
    }
  }

  // Apply user DB index migrations
  for (const m of USER_INDEX_MIGRATIONS) {
    userSqlite.exec(m.sql);
  }
}

export function seedDatabase() {
  const sqlite = getSqlite();
  const db = getDb();

  // Drop simulation tables for a clean start
  sqlite.exec(`
    DROP TABLE IF EXISTS ai_calls;
    DROP TABLE IF EXISTS bundestag_seats;
    DROP TABLE IF EXISTS event_queue;
    DROP TABLE IF EXISTS budgets;
    DROP TABLE IF EXISTS constitutional_challenges;
    DROP TABLE IF EXISTS confidence_votes;
    DROP TABLE IF EXISTS government;
    DROP TABLE IF EXISTS motions;
    DROP TABLE IF EXISTS fraktionen;
    DROP TABLE IF EXISTS pending_injections;
    DROP TABLE IF EXISTS referendums;
    DROP TABLE IF EXISTS citizen_questions;
    DROP TABLE IF EXISTS media_articles;
    DROP TABLE IF EXISTS polls;
    DROP TABLE IF EXISTS party_history;
    DROP TABLE IF EXISTS simulation_meta;
    DROP TABLE IF EXISTS elections;
    DROP TABLE IF EXISTS simulation_events;
    DROP TABLE IF EXISTS crises;
    DROP TABLE IF EXISTS bills;
    DROP TABLE IF EXISTS national_state;
    DROP TABLE IF EXISTS parties;
  `);

  // Recreate simulation schema
  sqlite.exec(SIM_TABLE_DDL);

  // User DB: preserve user accounts, clear bundestag-related activity
  const userSqlite = getUserSqlite();

  // Ensure all user tables exist (safe for fresh DBs)
  userSqlite.exec(USER_TABLE_DDL);

  // Clear bundestag-activity tables (these reference simulation data that was just wiped)
  userSqlite.exec(`
    DELETE FROM user_actions;
    DELETE FROM mdb_speeches;
    DELETE FROM mdb_votes;
    DELETE FROM mdb_applications;
    DELETE FROM notifications;
    DELETE FROM referendum_votes;
    DELETE FROM question_votes;
    DELETE FROM member_signals;
    DELETE FROM internal_votes;
    DELETE FROM internal_proposals;
  `);

  // Reset bundestag-related fields on users without deleting accounts
  userSqlite.exec(`
    UPDATE users SET party_id = NULL, switch_cooldown_until = NULL;
  `);

  const userCount = (userSqlite.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
  console.log(`Preserved ${userCount} user accounts (reset party affiliations, cleared activity data)`);

  // Insert parties
  for (const party of PARTIES) {
    db.insert(schema.parties).values({
      id: party.id,
      name: party.name,
      color: party.color,
      ideology: party.ideology,
      seatCount: party.seatCount,
      approvalRating: party.approvalRating,
      policyPriorities: party.policyPriorities as any,
      coalitionRole: party.coalitionRole,
    }).run();
  }

  // Insert initial national state
  db.insert(schema.nationalState).values({
    coalitionParties: INITIAL_NATIONAL_STATE.coalitionParties as any,
    oppositionParties: INITIAL_NATIONAL_STATE.oppositionParties as any,
    budget: INITIAL_NATIONAL_STATE.budget,
    unemployment: INITIAL_NATIONAL_STATE.unemployment,
    inflation: INITIAL_NATIONAL_STATE.inflation,
    gdpGrowth: INITIAL_NATIONAL_STATE.gdpGrowth,
    publicSentiment: INITIAL_NATIONAL_STATE.publicSentiment,
  }).run();

  // Insert simulation meta
  db.insert(schema.simulationMeta).values({
    currentDay: 0,
    lastRunAt: null,
    nextElectionDay: 1461,
    lowSentimentStreak: 0,
    timingPreset: "normal",
    contextDepth: "normal",
    startDate: new Date().toISOString(),
  }).run();

  // Insert initial fraktionen for parties with enough seats
  let fraktionCount = 0;
  for (const party of PARTIES) {
    if (party.seatCount >= FRAKTION_THRESHOLD && FRAKTION_LEADERS[party.id]) {
      db.insert(schema.fraktionen).values({
        id: `frak-${party.id}`,
        partyId: party.id,
        leaderName: FRAKTION_LEADERS[party.id],
        status: "active",
        formedOnDay: 0,
        dissolvedOnDay: null,
      }).run();
      fraktionCount++;
    }
  }

  // Seed initial government for the default SPD-led coalition
  const coalitionIds = ["spd", "gruene", "fdp"];
  const coalitionParties = PARTIES.filter(p => coalitionIds.includes(p.id));
  const totalCoalitionSeats = coalitionParties.reduce((s, p) => s + p.seatCount, 0);

  // Chancellor = Fraktion leader of coalition leader
  const chancellorPartyId = coalitionIds[0];
  const chancellorName = FRAKTION_LEADERS[chancellorPartyId];

  // Distribute 8 ministries proportionally
  const ministers: Array<{ name: string; partyId: string; portfolio: string }> = [];
  const candidateIndexes: Record<string, number> = {};
  for (const id of coalitionIds) candidateIndexes[id] = 0;

  // Calculate ministry allocation per party
  const partyMinistryCount: Record<string, number> = {};
  const remainders: Array<{ partyId: string; remainder: number }> = [];
  let allocated = 0;

  for (const p of coalitionParties) {
    const share = (p.seatCount / totalCoalitionSeats) * MINISTRY_PORTFOLIOS.length;
    const whole = Math.floor(share);
    partyMinistryCount[p.id] = whole;
    allocated += whole;
    remainders.push({ partyId: p.id, remainder: share - whole });
  }

  remainders.sort((a, b) => b.remainder - a.remainder);
  let remIdx = 0;
  while (allocated < MINISTRY_PORTFOLIOS.length) {
    partyMinistryCount[remainders[remIdx].partyId]++;
    allocated++;
    remIdx++;
  }

  // Assign ministries — leader party gets finance first
  let portfolioIdx = 0;
  for (const partyId of coalitionIds) {
    const count = partyMinistryCount[partyId] ?? 0;
    const candidates = MINISTER_CANDIDATES[partyId] ?? [];
    for (let i = 0; i < count && portfolioIdx < MINISTRY_PORTFOLIOS.length; i++) {
      ministers.push({
        name: candidates[candidateIndexes[partyId]++ % candidates.length],
        partyId,
        portfolio: MINISTRY_PORTFOLIOS[portfolioIdx++],
      });
    }
  }

  db.insert(schema.government).values({
    id: "gov-initial",
    electionId: null,
    chancellorName,
    chancellorPartyId,
    ministers: ministers as any,
    formedOnDay: 0,
    dissolvedOnDay: null,
    active: true,
  }).run();

  console.log(`Seeded ${PARTIES.length} parties`);
  console.log(`Seeded ${fraktionCount} Fraktionen`);
  console.log(`Seeded initial government (Chancellor: ${chancellorName})`);
  console.log("Seeded initial national state");
  console.log("Seeded simulation meta (day 0)");
}
