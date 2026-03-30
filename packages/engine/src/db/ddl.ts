/** Simulation table DDL — stays in simulation.db */
export const SIM_TABLE_DDL = `
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
    vetoed_by_president INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (proposed_by) REFERENCES parties(id)
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
    timing_preset TEXT NOT NULL DEFAULT 'normal',
    context_depth TEXT NOT NULL DEFAULT 'normal',
    start_date TEXT
  );

  CREATE TABLE IF NOT EXISTS party_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    approval_rating REAL NOT NULL,
    seat_count INTEGER NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id)
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
    status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (target_party_id) REFERENCES parties(id)
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
    dissolved_on_day INTEGER,
    FOREIGN KEY (party_id) REFERENCES parties(id)
  );

  CREATE TABLE IF NOT EXISTS government (
    id TEXT PRIMARY KEY,
    election_id TEXT,
    chancellor_name TEXT NOT NULL,
    chancellor_party_id TEXT NOT NULL,
    ministers TEXT NOT NULL,
    formed_on_day INTEGER NOT NULL,
    dissolved_on_day INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (election_id) REFERENCES elections(id),
    FOREIGN KEY (chancellor_party_id) REFERENCES parties(id)
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
    sentiment_impact REAL,
    FOREIGN KEY (filed_by_party_id) REFERENCES parties(id),
    FOREIGN KEY (target_party_id) REFERENCES parties(id)
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
    sentiment_impact REAL,
    FOREIGN KEY (government_id) REFERENCES government(id),
    FOREIGN KEY (initiated_by_party_id) REFERENCES parties(id),
    FOREIGN KEY (proposed_chancellor_party_id) REFERENCES parties(id)
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
    sentiment_impact REAL,
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    FOREIGN KEY (filed_by_party_id) REFERENCES parties(id)
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
    allocated_on_day INTEGER NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (election_id) REFERENCES elections(id)
  );
`;

/** User table DDL — lives in users.db */
export const USER_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    party_id TEXT,
    provider TEXT,
    provider_id TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    switch_cooldown_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

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
    created_at INTEGER NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES internal_proposals(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS member_signals (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS question_votes (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS referendum_votes (
    id TEXT PRIMARY KEY,
    referendum_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
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
    day_number INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
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
    cooldown_until_day INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mdb_votes (
    id TEXT PRIMARY KEY,
    seat_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mdb_speeches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    reading INTEGER NOT NULL,
    content TEXT NOT NULL,
    sentiment_impact REAL,
    day_number INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_actions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    entity_id TEXT,
    entity_type TEXT,
    metadata TEXT,
    sim_day INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

/**
 * Column migrations for simulation DB — each entry adds a column to an existing table.
 * ALTER TABLE ADD COLUMN is a no-op if the column already exists (we catch the error).
 */
export const SIM_COLUMN_MIGRATIONS: Array<{ table: string; column: string; sql: string }> = [
  { table: "citizen_questions", column: "user_id", sql: "ALTER TABLE citizen_questions ADD COLUMN user_id TEXT" },
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
  { table: "simulation_meta", column: "start_date", sql: "ALTER TABLE simulation_meta ADD COLUMN start_date TEXT" },
  { table: "simulation_meta", column: "context_depth", sql: "ALTER TABLE simulation_meta ADD COLUMN context_depth TEXT NOT NULL DEFAULT 'normal'" },
  { table: "bundestag_seats", column: "unique_active_user", sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_bundestag_seats_active_user ON bundestag_seats(user_id) WHERE active = 1 AND user_id IS NOT NULL" },
];

/** Column migrations for user DB */
export const USER_COLUMN_MIGRATIONS: Array<{ table: string; column: string; sql: string }> = [
  { table: "users", column: "display_name_unique", sql: "DELETE FROM users WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY display_name ORDER BY last_active DESC) as rn FROM users) WHERE rn = 1); CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)" },
  { table: "users", column: "provider", sql: "ALTER TABLE users ADD COLUMN provider TEXT" },
  { table: "users", column: "provider_id", sql: "ALTER TABLE users ADD COLUMN provider_id TEXT" },
  { table: "users", column: "avatar_url", sql: "ALTER TABLE users ADD COLUMN avatar_url TEXT" },
  { table: "sessions", column: "_table", sql: "CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)" },
];

/**
 * Index migrations for simulation DB — each entry creates an index if it doesn't already exist.
 * All statements use CREATE INDEX IF NOT EXISTS so they are idempotent.
 */
export const SIM_INDEX_MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: "idx_bills_proposed_by", sql: "CREATE INDEX IF NOT EXISTS idx_bills_proposed_by ON bills(proposed_by)" },
  { name: "idx_bills_status", sql: "CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status)" },
  { name: "idx_party_history_party_day", sql: "CREATE INDEX IF NOT EXISTS idx_party_history_party_day ON party_history(party_id, day_number)" },
  { name: "idx_simulation_events_day", sql: "CREATE INDEX IF NOT EXISTS idx_simulation_events_day ON simulation_events(day_number)" },
  { name: "idx_simulation_events_type", sql: "CREATE INDEX IF NOT EXISTS idx_simulation_events_type ON simulation_events(type)" },
  { name: "idx_bundestag_seats_party", sql: "CREATE INDEX IF NOT EXISTS idx_bundestag_seats_party ON bundestag_seats(party_id, controller)" },
];

/** Index migrations for user DB */
export const USER_INDEX_MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: "idx_member_signals_bill_user", sql: "CREATE INDEX IF NOT EXISTS idx_member_signals_bill_user ON member_signals(bill_id, user_id)" },
  { name: "idx_notifications_user", sql: "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)" },
  { name: "idx_user_actions_user_type", sql: "CREATE INDEX IF NOT EXISTS idx_user_actions_user_type ON user_actions(user_id, action_type)" },
];
