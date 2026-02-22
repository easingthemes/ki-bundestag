import type { PolicyPriorities, CoalitionRole } from "@ki-bundestag/types";
import { getDb, getSqlite, getUserDb, getUserSqlite, getUserDbPath, schema } from "./connection.js";
import { FRAKTION_LEADERS, FRAKTION_THRESHOLD } from "../simulation/fraktionen.js";
import { MINISTER_CANDIDATES, MINISTRY_PORTFOLIOS } from "../simulation/government.js";

interface PartySeed {
  id: string;
  name: string;
  color: string;
  ideology: string;
  seatCount: number;
  approvalRating: number;
  policyPriorities: PolicyPriorities;
  coalitionRole: CoalitionRole;
}

const PARTIES: PartySeed[] = [
  {
    id: "spd",
    name: "SPD",
    color: "#E3000F",
    ideology: "Center-left social democracy",
    seatCount: 206,
    approvalRating: 26,
    policyPriorities: { economy: -0.2, social: 0.6, environment: 0.3, immigration: 0.3, spending: 0.5 },
    coalitionRole: "leader",
  },
  {
    id: "cdu",
    name: "CDU/CSU",
    color: "#000000",
    ideology: "Center-right Christian democracy",
    seatCount: 197,
    approvalRating: 28,
    policyPriorities: { economy: 0.5, social: -0.3, environment: -0.1, immigration: -0.3, spending: -0.4 },
    coalitionRole: "opposition",
  },
  {
    id: "gruene",
    name: "Bündnis 90/Die Grünen",
    color: "#64A12D",
    ideology: "Green politics, progressive",
    seatCount: 118,
    approvalRating: 15,
    policyPriorities: { economy: -0.3, social: 0.7, environment: 0.9, immigration: 0.5, spending: 0.3 },
    coalitionRole: "junior",
  },
  {
    id: "fdp",
    name: "FDP",
    color: "#FFED00",
    ideology: "Classical liberalism, free market",
    seatCount: 92,
    approvalRating: 8,
    policyPriorities: { economy: 0.8, social: 0.3, environment: -0.2, immigration: 0.2, spending: -0.7 },
    coalitionRole: "junior",
  },
  {
    id: "afd",
    name: "AfD",
    color: "#009EE0",
    ideology: "Right-wing populism",
    seatCount: 83,
    approvalRating: 14,
    policyPriorities: { economy: 0.3, social: -0.7, environment: -0.6, immigration: -0.9, spending: -0.1 },
    coalitionRole: "opposition",
  },
  {
    id: "linke",
    name: "Die Linke",
    color: "#BE3075",
    ideology: "Democratic socialism",
    seatCount: 39,
    approvalRating: 5,
    policyPriorities: { economy: -0.8, social: 0.8, environment: 0.5, immigration: 0.6, spending: 0.8 },
    coalitionRole: "opposition",
  },
];

/** Simulation table DDL — stays in simulation.db */
const SIM_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    ideology TEXT NOT NULL,
    seat_count INTEGER NOT NULL,
    approval_rating REAL NOT NULL,
    policy_priorities TEXT NOT NULL,
    coalition_role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    status TEXT NOT NULL,
    impact TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '[]',
    proposed_on_day INTEGER NOT NULL,
    reading INTEGER,
    committee_name TEXT,
    committee_recommendation TEXT,
    amendments TEXT,
    original_impact TEXT,
    status_changed_on_day INTEGER,
    vetoed_by_president INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS national_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coalition_parties TEXT NOT NULL,
    opposition_parties TEXT NOT NULL,
    budget REAL NOT NULL,
    unemployment REAL NOT NULL,
    inflation REAL NOT NULL,
    gdp_growth REAL NOT NULL,
    public_sentiment REAL NOT NULL,
    provisional_budget INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS simulation_events (
    id TEXT PRIMARY KEY,
    day_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    actor TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    data TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS crises (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    start_day INTEGER NOT NULL,
    end_day INTEGER NOT NULL,
    daily_impact TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS elections (
    id TEXT PRIMARY KEY,
    trigger_reason TEXT NOT NULL,
    announced_on_day INTEGER NOT NULL,
    campaign_start_day INTEGER NOT NULL,
    election_day INTEGER NOT NULL,
    status TEXT NOT NULL,
    results TEXT,
    new_coalition TEXT,
    new_opposition TEXT,
    negotiation_rounds TEXT,
    coalition_agreement TEXT
  );

  CREATE TABLE IF NOT EXISTS simulation_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    current_day INTEGER NOT NULL DEFAULT 0,
    last_run_at TEXT,
    next_election_day INTEGER NOT NULL DEFAULT 1461,
    low_sentiment_streak INTEGER NOT NULL DEFAULT 0,
    budget_retry_day INTEGER,
    daily_summary TEXT,
    day_started_at TEXT,
    timing_preset TEXT NOT NULL DEFAULT 'normal'
  );

  CREATE TABLE IF NOT EXISTS party_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    approval_rating REAL NOT NULL,
    seat_count INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '{}',
    created_on_day INTEGER NOT NULL,
    expires_on_day INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    category TEXT NOT NULL DEFAULT 'general'
  );

  CREATE TABLE IF NOT EXISTS pending_injections (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS referendums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    options TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '{}',
    created_on_day INTEGER NOT NULL,
    closes_on_day INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    result TEXT,
    impact TEXT,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS citizen_questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    target_party_id TEXT NOT NULL,
    response TEXT,
    responded_on_day INTEGER,
    created_on_day INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS media_articles (
    id TEXT PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    outlet TEXT NOT NULL,
    bias TEXT NOT NULL,
    category TEXT NOT NULL,
    day_number INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS motions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    status TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '[]',
    day_number INTEGER NOT NULL,
    sentiment_impact REAL
  );

  CREATE TABLE IF NOT EXISTS fraktionen (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    status TEXT NOT NULL,
    formed_on_day INTEGER NOT NULL,
    dissolved_on_day INTEGER
  );

  CREATE TABLE IF NOT EXISTS government (
    id TEXT PRIMARY KEY,
    election_id TEXT,
    chancellor_name TEXT NOT NULL,
    chancellor_party_id TEXT NOT NULL,
    ministers TEXT NOT NULL,
    formed_on_day INTEGER NOT NULL,
    dissolved_on_day INTEGER,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS interpellations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    filed_by_party_id TEXT NOT NULL,
    target_ministry TEXT NOT NULL,
    target_minister_name TEXT NOT NULL,
    target_party_id TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    responded_on_day INTEGER,
    sentiment_impact REAL
  );

  CREATE TABLE IF NOT EXISTS confidence_votes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    government_id TEXT NOT NULL,
    initiated_by_party_id TEXT NOT NULL,
    chancellor_name TEXT NOT NULL,
    proposed_chancellor TEXT,
    proposed_chancellor_party_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '[]',
    day_number INTEGER NOT NULL,
    sentiment_impact REAL
  );

  CREATE TABLE IF NOT EXISTS constitutional_challenges (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    bill_title TEXT NOT NULL,
    filed_by_party_id TEXT NOT NULL,
    arguments TEXT NOT NULL,
    decision TEXT,
    reasoning TEXT,
    status TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    ruled_on_day INTEGER,
    sentiment_impact REAL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    cycle_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    allocations TEXT NOT NULL,
    total_amount REAL NOT NULL,
    proposed_on_day INTEGER NOT NULL,
    voted_on_day INTEGER,
    votes TEXT,
    yes_seats INTEGER,
    no_seats INTEGER,
    economic_effect TEXT,
    revision_attempt INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS event_queue (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_data TEXT,
    scheduled_for_day INTEGER NOT NULL,
    queued_at TEXT NOT NULL,
    processed_at TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
  );

  CREATE TABLE IF NOT EXISTS bundestag_seats (
    id TEXT PRIMARY KEY,
    seat_number INTEGER NOT NULL,
    party_id TEXT NOT NULL,
    controller TEXT NOT NULL,
    user_id TEXT,
    election_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    proxy_default TEXT NOT NULL DEFAULT 'party_line',
    discipline_level INTEGER NOT NULL DEFAULT 0,
    discipline_reason TEXT,
    allocated_on_day INTEGER NOT NULL
  );
`;

/** User table DDL — lives in users.db */
const USER_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    party_id TEXT,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    switch_cooldown_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS internal_proposals (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    proposer_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    vote_score INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0,
    created_on_day INTEGER NOT NULL,
    review_by_day INTEGER NOT NULL,
    reviewed_on_day INTEGER,
    decline_reason TEXT,
    bundestag_bill_id TEXT
  );

  CREATE TABLE IF NOT EXISTS internal_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS member_signals (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS question_votes (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    day_number INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mdb_applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    party_id TEXT NOT NULL,
    application_text TEXT NOT NULL,
    policy_focus TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    ai_reasoning TEXT,
    priority_score REAL,
    created_on_day INTEGER NOT NULL,
    reviewed_on_day INTEGER,
    cooldown_until_day INTEGER
  );

  CREATE TABLE IF NOT EXISTS mdb_votes (
    id TEXT PRIMARY KEY,
    seat_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mdb_speeches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    reading INTEGER NOT NULL,
    content TEXT NOT NULL,
    sentiment_impact REAL,
    day_number INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

/**
 * Column migrations for simulation DB — each entry adds a column to an existing table.
 * ALTER TABLE ADD COLUMN is a no-op if the column already exists (we catch the error).
 */
const SIM_COLUMN_MIGRATIONS: Array<{ table: string; column: string; sql: string }> = [
  { table: "simulation_events", column: "created_at", sql: "ALTER TABLE simulation_events ADD COLUMN created_at TEXT" },
  // Note: Old DBs may have 120 here; migrate-timing.ts rescales to 1461
  { table: "simulation_meta", column: "next_election_day", sql: "ALTER TABLE simulation_meta ADD COLUMN next_election_day INTEGER NOT NULL DEFAULT 1461" },
  { table: "simulation_meta", column: "low_sentiment_streak", sql: "ALTER TABLE simulation_meta ADD COLUMN low_sentiment_streak INTEGER NOT NULL DEFAULT 0" },
  { table: "elections", column: "negotiation_rounds", sql: "ALTER TABLE elections ADD COLUMN negotiation_rounds TEXT" },
  { table: "elections", column: "coalition_agreement", sql: "ALTER TABLE elections ADD COLUMN coalition_agreement TEXT" },
  { table: "bills", column: "reading", sql: "ALTER TABLE bills ADD COLUMN reading INTEGER" },
  { table: "bills", column: "committee_name", sql: "ALTER TABLE bills ADD COLUMN committee_name TEXT" },
  { table: "bills", column: "committee_recommendation", sql: "ALTER TABLE bills ADD COLUMN committee_recommendation TEXT" },
  { table: "bills", column: "amendments", sql: "ALTER TABLE bills ADD COLUMN amendments TEXT" },
  { table: "bills", column: "original_impact", sql: "ALTER TABLE bills ADD COLUMN original_impact TEXT" },
  { table: "bills", column: "status_changed_on_day", sql: "ALTER TABLE bills ADD COLUMN status_changed_on_day INTEGER" },
  { table: "bills", column: "is_government_bill", sql: "ALTER TABLE bills ADD COLUMN is_government_bill INTEGER" },
  { table: "bills", column: "vetoed_by_president", sql: "ALTER TABLE bills ADD COLUMN vetoed_by_president INTEGER NOT NULL DEFAULT 0" },
  { table: "bills", column: "member_initiative", sql: "ALTER TABLE bills ADD COLUMN member_initiative INTEGER NOT NULL DEFAULT 0" },
  { table: "bills", column: "proposer_display_name", sql: "ALTER TABLE bills ADD COLUMN proposer_display_name TEXT" },
  { table: "national_state", column: "provisional_budget", sql: "ALTER TABLE national_state ADD COLUMN provisional_budget INTEGER NOT NULL DEFAULT 0" },
  { table: "simulation_meta", column: "budget_retry_day", sql: "ALTER TABLE simulation_meta ADD COLUMN budget_retry_day INTEGER" },
  { table: "budgets", column: "revision_attempt", sql: "ALTER TABLE budgets ADD COLUMN revision_attempt INTEGER NOT NULL DEFAULT 0" },
  { table: "simulation_meta", column: "daily_summary", sql: "ALTER TABLE simulation_meta ADD COLUMN daily_summary TEXT" },
  { table: "simulation_meta", column: "day_started_at", sql: "ALTER TABLE simulation_meta ADD COLUMN day_started_at TEXT" },
  { table: "simulation_meta", column: "timing_preset", sql: "ALTER TABLE simulation_meta ADD COLUMN timing_preset TEXT NOT NULL DEFAULT 'normal'" },
];

/** Column migrations for user DB */
const USER_COLUMN_MIGRATIONS: Array<{ table: string; column: string; sql: string }> = [
  { table: "users", column: "display_name_unique", sql: "DELETE FROM users WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY display_name ORDER BY last_active DESC) as rn FROM users) WHERE rn = 1); CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)" },
];

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
}

export function seedDatabase() {
  const sqlite = getSqlite();
  const db = getDb();

  // Drop simulation tables for a clean start
  sqlite.exec(`
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

  // User DB: fresh start
  const userSqlite = getUserSqlite();
  userSqlite.exec(`
    DROP TABLE IF EXISTS mdb_speeches;
    DROP TABLE IF EXISTS mdb_votes;
    DROP TABLE IF EXISTS mdb_applications;
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS question_votes;
    DROP TABLE IF EXISTS member_signals;
    DROP TABLE IF EXISTS internal_votes;
    DROP TABLE IF EXISTS internal_proposals;
    DROP TABLE IF EXISTS users;
  `);
  userSqlite.exec(USER_TABLE_DDL);

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
    coalitionParties: ["spd", "gruene", "fdp"] as any,
    oppositionParties: ["cdu", "afd", "linke"] as any,
    budget: 45,
    unemployment: 5.5,
    inflation: 2.2,
    gdpGrowth: 0.8,
    publicSentiment: 38,
  }).run();

  // Insert simulation meta
  db.insert(schema.simulationMeta).values({
    currentDay: 0,
    lastRunAt: null,
    nextElectionDay: 1461,
    lowSentimentStreak: 0,
    timingPreset: "normal",
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
