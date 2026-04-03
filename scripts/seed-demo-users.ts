/**
 * Seed bot users with realistic German names and varied states.
 *
 * Targets a total bot count (default 100, configurable via CLI arg).
 * First migrates existing demo users (provider_id LIKE 'demo_%') to bot status,
 * then creates new bot users to reach the target.
 *
 * Distribution:
 *   ~60% party members (across 6 parties, weighted by approval)
 *   ~40% no party
 *
 * Among party members:
 *   ~15% have MdB applications (mix of pending/approved/rejected)
 *   Some approved users get bundestag seats
 *
 * Run: npx tsx scripts/seed-demo-users.ts [count]
 *   e.g., npx tsx scripts/seed-demo-users.ts 100
 */

import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMonorepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findMonorepoRoot();
const USER_DB_PATH = process.env.USER_DATABASE_PATH
  ? path.resolve(process.env.USER_DATABASE_PATH)
  : path.join(ROOT, "data", "users.db");
const SIM_DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(ROOT, "data", "simulation.db");

// ── Name pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Anna", "Ben", "Clara", "David", "Elena", "Felix", "Greta", "Hans",
  "Ida", "Jan", "Katrin", "Leon", "Marie", "Nico", "Olivia", "Paul",
  "Rita", "Stefan", "Tina", "Uwe", "Vera", "Werner", "Xenia", "Yusuf",
  "Zoe", "Alexander", "Birgit", "Christian", "Daniela", "Erik",
  "Franziska", "Georg", "Helena", "Igor", "Julia", "Klaus", "Laura",
  "Martin", "Nina", "Oliver", "Petra", "Robert", "Sandra", "Thomas",
  "Ursula", "Volker", "Sabine", "Kai", "Lena", "Markus",
  "Annika", "Boris", "Carla", "Dirk", "Eva", "Friedrich", "Gisela",
  "Heinrich", "Ines", "Jörg", "Kerstin", "Lukas", "Monika", "Norbert",
  "Olga", "Patrick", "Renate", "Simon", "Tobias", "Ulrike",
  "Vanessa", "Wolfgang", "Yvonne", "Ahmed", "Fatima", "Mehmet", "Ayse",
  "Leila", "Omar", "Nadia", "Sven", "Heike", "Ralf", "Doris", "Bernd",
  "Silke", "Jens", "Claudia", "Matthias", "Andrea", "Holger", "Bettina",
  "Karsten", "Susanne", "Thorsten", "Manuela", "Detlef", "Cornelia",
  "Torsten", "Karin", "Axel", "Gabriele", "Lothar", "Christine",
  "Maik", "Stefanie", "Andreas", "Sonja", "Michael", "Nadine",
  "Christoph", "Simone", "Jochen", "Melanie", "Marcel", "Jasmin",
  "Fabian", "Svenja", "Florian", "Antje", "Moritz", "Miriam",
  "Dominik", "Katharina", "Philipp", "Johanna", "Tim", "Frieda",
  "Max", "Emma", "Finn", "Mia", "Noah", "Sophia", "Elias", "Hannah",
];

const LAST_NAMES = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner",
  "Becker", "Schulz", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter",
  "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann",
  "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner",
  "Schmitz", "Krause", "Meier", "Lehmann", "Schmid", "Schulze", "Maier",
  "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser",
  "Fuchs", "Peters", "Lang", "Scholz", "Möller", "Weiß", "Jung",
  "Hahn", "Schubert", "Vogel", "Friedrich", "Keller", "Günther",
  "Frank", "Berger", "Winkler", "Roth", "Beck", "Lorenz", "Baumann",
  "Franke", "Albrecht", "Schuster", "Simon", "Ludwig", "Böhm", "Winter",
  "Kraus", "Martin", "Schumacher", "Krämer", "Vogt", "Stein", "Jäger",
  "Otto", "Sommer", "Groß", "Seidel", "Heinrich", "Brandt", "Haas",
  "Schreiber", "Graf", "Schultz", "Dietrich", "Ziegler", "Kuhn",
  "Kühn", "Pohl", "Engel", "Horn", "Busch", "Bergmann", "Thomas",
  "Voigt", "Sauer", "Arnold", "Wolff", "Pfeiffer",
];

const POLICY_FOCUSES = [
  "Wirtschaft", "Soziales", "Umwelt", "Bildung", "Gesundheit",
  "Digitalisierung", "Verteidigung", "Infrastruktur", "Justiz",
  "Arbeit", "Wohnen", "Migration", "Finanzen", "Kultur",
  "Landwirtschaft", "Energie", "Verkehr", "Forschung",
];

const APPLICATION_TEXTS = [
  "Ich möchte mich aktiv für die politische Gestaltung unseres Landes einsetzen und die Interessen der Bürgerinnen und Bürger vertreten.",
  "Als engagierter Bürger sehe ich es als meine Pflicht, mich in der parlamentarischen Arbeit einzubringen und konstruktive Lösungen zu erarbeiten.",
  "Meine langjährige Erfahrung in der Kommunalpolitik möchte ich nun auf Bundesebene einbringen, um nachhaltige Veränderungen zu bewirken.",
  "Ich bewerbe mich um einen Sitz im Bundestag, weil ich überzeugt bin, dass unsere Demokratie von aktiver Bürgerbeteiligung lebt.",
  "Die aktuellen Herausforderungen unserer Gesellschaft erfordern engagierte Parlamentarier, die bereit sind, Verantwortung zu übernehmen.",
  "Ich möchte meine berufliche Expertise in den parlamentarischen Prozess einbringen und dabei die Perspektive der arbeitenden Bevölkerung vertreten.",
  "Als junger Mensch möchte ich die Zukunft unseres Landes mitgestalten und die Stimme meiner Generation im Bundestag stärken.",
  "Mein Engagement für soziale Gerechtigkeit und ökologische Nachhaltigkeit treibt mich an, mich für einen Sitz im Bundestag zu bewerben.",
  "Ich glaube fest daran, dass politische Teilhabe der Schlüssel zu einer besseren Gesellschaft ist, und möchte dies als MdB aktiv umsetzen.",
  "Die Verbindung zwischen Bürgern und Politik muss gestärkt werden — als MdB würde ich mich dafür einsetzen, diese Brücke zu bauen.",
];

const AI_REASONING_APPROVED = [
  "Strong commitment to democratic participation and clear policy vision.",
  "Well-articulated motivation with relevant experience in civic engagement.",
  "Demonstrates deep understanding of parliamentary processes and party values.",
  "Excellent alignment with party priorities and constructive policy proposals.",
  "Shows genuine dedication to representing constituent interests.",
];

const AI_REASONING_REJECTED = [
  "Application lacks specific policy focus; too generic for current needs.",
  "Party seat allocation at maximum capacity for this cycle.",
  "Insufficient alignment with current party strategic priorities.",
  "Application text does not demonstrate adequate understanding of parliamentary role.",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const PARTY_IDS = ["spd", "cdu", "gruene", "fdp", "afd", "linke"];
// Weighted by rough popularity for realistic distribution
const PARTY_WEIGHTS = [0.26, 0.28, 0.15, 0.08, 0.14, 0.09];

function weightedParty(): string {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < PARTY_IDS.length; i++) {
    cum += PARTY_WEIGHTS[i];
    if (r <= cum) return PARTY_IDS[i];
  }
  return PARTY_IDS[PARTY_IDS.length - 1];
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const TOTAL_USERS = parseInt(process.argv[2] || "100", 10);

  // Ensure data directory exists
  for (const dbPath of [USER_DB_PATH, SIM_DB_PATH]) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Open databases
  const userDb = new Database(USER_DB_PATH);
  userDb.pragma("journal_mode = WAL");
  userDb.pragma("foreign_keys = ON");

  const simDb = new Database(SIM_DB_PATH);
  simDb.pragma("journal_mode = WAL");
  simDb.pragma("foreign_keys = ON");

  // Ensure required tables exist (in case DB is fresh)
  userDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL UNIQUE, party_id TEXT,
      provider TEXT, provider_id TEXT, avatar_url TEXT,
      created_at INTEGER NOT NULL, last_active INTEGER NOT NULL, switch_cooldown_until INTEGER,
      is_bot INTEGER NOT NULL DEFAULT 0, bot_profile TEXT
    );
    CREATE TABLE IF NOT EXISTS mdb_applications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, party_id TEXT NOT NULL,
      application_text TEXT NOT NULL, policy_focus TEXT, status TEXT NOT NULL DEFAULT 'pending',
      ai_reasoning TEXT, priority_score REAL, created_on_day INTEGER NOT NULL,
      reviewed_on_day INTEGER, cooldown_until_day INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS user_actions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_type TEXT NOT NULL,
      entity_id TEXT, entity_type TEXT, metadata TEXT,
      sim_day INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, data TEXT,
      read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, day_number INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Ensure is_bot and bot_profile columns exist (for DBs created before these columns were added)
  try { userDb.exec("ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { userDb.exec("ALTER TABLE users ADD COLUMN bot_profile TEXT"); } catch { /* already exists */ }

  simDb.exec(`
    CREATE TABLE IF NOT EXISTS simulation_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT, current_day INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT, next_election_day INTEGER NOT NULL DEFAULT 1461,
      low_sentiment_streak INTEGER NOT NULL DEFAULT 0, budget_retry_day INTEGER,
      daily_summary TEXT, day_started_at TEXT, heartbeat_at TEXT,
      timing_preset TEXT NOT NULL DEFAULT 'normal', context_depth TEXT NOT NULL DEFAULT 'normal', start_date TEXT
    );
    CREATE TABLE IF NOT EXISTS bundestag_seats (
      id TEXT PRIMARY KEY, seat_number INTEGER NOT NULL, party_id TEXT NOT NULL,
      controller TEXT NOT NULL, user_id TEXT, election_id TEXT,
      active INTEGER NOT NULL DEFAULT 1, proxy_default TEXT NOT NULL DEFAULT 'party_line',
      discipline_level INTEGER NOT NULL DEFAULT 0, discipline_reason TEXT,
      allocated_on_day INTEGER NOT NULL
    );
  `);

  // Get current sim day
  const meta = simDb.prepare("SELECT current_day FROM simulation_meta LIMIT 1").get() as
    | { current_day: number }
    | undefined;
  const currentDay = meta?.current_day ?? 30;

  // Check existing users to avoid display_name conflicts
  const existingNames = new Set(
    (userDb.prepare("SELECT display_name FROM users").all() as Array<{ display_name: string }>).map(
      (r) => r.display_name.toLowerCase(),
    ),
  );

  console.log(`Current sim day: ${currentDay}`);
  console.log(`Existing users: ${existingNames.size}`);

  // Generate unique display names
  const usedNames = new Set(existingNames);
  function generateName(): { displayName: string; firstName: string; lastName: string } {
    for (let attempt = 0; attempt < 100; attempt++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const displayName =
        attempt < 50
          ? `${first} ${last}`
          : `${first} ${last}${randInt(1, 99)}`;
      if (!usedNames.has(displayName.toLowerCase())) {
        usedNames.add(displayName.toLowerCase());
        return { displayName, firstName: first, lastName: last };
      }
    }
    // Fallback with UUID suffix
    const first = pick(FIRST_NAMES);
    const dn = `${first}_${uuid().slice(0, 6)}`;
    usedNames.add(dn.toLowerCase());
    return { displayName: dn, firstName: first, lastName: "" };
  }

  // Prepare statements
  const insertUser = userDb.prepare(`
    INSERT INTO users (id, display_name, party_id, provider, provider_id, avatar_url, created_at, last_active, switch_cooldown_until, is_bot, bot_profile)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertApplication = userDb.prepare(`
    INSERT INTO mdb_applications (id, user_id, party_id, application_text, policy_focus, status, ai_reasoning, priority_score, created_on_day, reviewed_on_day, cooldown_until_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAction = userDb.prepare(`
    INSERT INTO user_actions (id, user_id, action_type, entity_id, entity_type, metadata, sim_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertNotification = userDb.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at, day_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Get next seat number
  const maxSeatRow = simDb
    .prepare("SELECT MAX(seat_number) as max_seat FROM bundestag_seats")
    .get() as { max_seat: number | null } | undefined;
  let nextSeat = (maxSeatRow?.max_seat ?? 0) + 1;

  const insertSeat = simDb.prepare(`
    INSERT INTO bundestag_seats (id, seat_number, party_id, controller, user_id, active, proxy_default, discipline_level, allocated_on_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // ── Migrate existing demo users to bot status (capped at TOTAL_USERS) ────
  // Count how many bots already exist
  const existingBotCount = (userDb.prepare(
    "SELECT COUNT(*) as cnt FROM users WHERE is_bot = 1"
  ).get() as { cnt: number }).cnt;

  const botsNeeded = Math.max(0, TOTAL_USERS - existingBotCount);
  let migrated = 0;

  if (botsNeeded > 0) {
    // First, promote unmarked demo users up to the cap
    const unmarkedDemoUsers = userDb.prepare(
      "SELECT id FROM users WHERE provider_id LIKE 'demo_%' AND is_bot = 0 LIMIT ?"
    ).all(botsNeeded) as Array<{ id: string }>;

    if (unmarkedDemoUsers.length > 0) {
      const ENGAGEMENT_STYLES = ["questioner", "voter", "proposer", "observer"] as const;
      const migrateStmt = userDb.prepare(
        "UPDATE users SET is_bot = 1, bot_profile = ? WHERE id = ?"
      );
      const migrateTransaction = userDb.transaction(() => {
        for (const row of unmarkedDemoUsers) {
          const activityRoll = Math.random();
          const activityLevel = activityRoll < 0.1 ? "high" : activityRoll < 0.4 ? "medium" : activityRoll < 0.8 ? "low" : "lurker";
          const engagementStyle = pick([...ENGAGEMENT_STYLES]);
          const profile = JSON.stringify({ activityLevel, engagementStyle });
          migrateStmt.run(profile, row.id);
        }
      });
      migrateTransaction();
      migrated = unmarkedDemoUsers.length;
      console.log(`✅ Migrated ${migrated} existing demo users to bot status`);
    }
  } else {
    console.log(`Already have ${existingBotCount} bots (target: ${TOTAL_USERS}), skipping migration`);
  }

  // How many new bots still need to be created?
  const stillNeeded = Math.max(0, TOTAL_USERS - existingBotCount - migrated);
  console.log(`Bots: ${existingBotCount} existing + ${migrated} migrated + ${stillNeeded} to create = ${TOTAL_USERS} target`);

  // Stats
  let created = 0;
  let withParty = 0;
  let withoutParty = 0;
  let pendingApps = 0;
  let approvedApps = 0;
  let rejectedApps = 0;
  let seatsCreated = 0;
  const partyCount: Record<string, number> = {};

  const now = Date.now();
  // Spread creation times over the last ~60 days
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  const transaction = userDb.transaction(() => {
    for (let i = 0; i < stillNeeded; i++) {
      const { displayName, firstName, lastName } = generateName();
      const userId = uuid();

      // ~60% get a party
      const hasParty = Math.random() < 0.6;
      const partyId = hasParty ? weightedParty() : null;

      // Random creation time in the last 60 days
      const createdAt = now - Math.floor(Math.random() * sixtyDaysMs);
      // Last active: between creation and now
      const lastActive = createdAt + Math.floor(Math.random() * (now - createdAt));

      // Provider: ~70% github, ~30% google (demo markers)
      const provider = Math.random() < 0.7 ? "github" : "google";
      const providerId = `demo_${uuid().slice(0, 12)}`;
      // No avatar for demo users
      const avatarUrl = null;

      // Some party members might have a switch cooldown (recently switched)
      const switchCooldown =
        hasParty && Math.random() < 0.05
          ? currentDay + randInt(1, 7)
          : null;

      // Bot profile: assign activity level + engagement style
      const activityRoll = Math.random();
      const activityLevel = activityRoll < 0.1 ? "high" : activityRoll < 0.4 ? "medium" : activityRoll < 0.8 ? "low" : "lurker";
      const ENGAGEMENT_STYLES = ["questioner", "voter", "proposer", "observer"] as const;
      const engagementStyle = pick([...ENGAGEMENT_STYLES]);
      const botProfile = JSON.stringify({ activityLevel, engagementStyle });

      insertUser.run(
        userId,
        displayName,
        partyId,
        provider,
        providerId,
        avatarUrl,
        createdAt,
        lastActive,
        switchCooldown,
        1,  // is_bot = true
        botProfile,
      );

      created++;
      if (partyId) {
        withParty++;
        partyCount[partyId] = (partyCount[partyId] || 0) + 1;
      } else {
        withoutParty++;
      }

      // Log join_party action for party members
      if (partyId) {
        const joinDay = Math.max(1, currentDay - randInt(1, 55));
        insertAction.run(
          uuid(),
          userId,
          "join_party",
          partyId,
          "party",
          JSON.stringify({ partyId }),
          joinDay,
          new Date(createdAt + 60000).toISOString(),
        );
      }

      // ~15% of party members apply for MdB
      if (partyId && Math.random() < 0.15) {
        const appId = uuid();
        const appDay = Math.max(1, currentDay - randInt(1, 40));
        const appText = pick(APPLICATION_TEXTS);
        const policyFocus = JSON.stringify(pickN(POLICY_FOCUSES, randInt(2, 4)));

        // Distribution: 30% pending, 45% approved, 25% rejected
        const roll = Math.random();
        let status: string;
        let aiReasoning: string | null = null;
        let priorityScore: number | null = null;
        let reviewedOnDay: number | null = null;
        let cooldownUntilDay: number | null = null;

        if (roll < 0.3) {
          status = "pending";
          pendingApps++;
        } else if (roll < 0.75) {
          status = "approved";
          aiReasoning = pick(AI_REASONING_APPROVED);
          priorityScore = 0.6 + Math.random() * 0.4;
          reviewedOnDay = appDay + randInt(1, 3);
          approvedApps++;
        } else {
          status = "rejected";
          aiReasoning = pick(AI_REASONING_REJECTED);
          priorityScore = 0.1 + Math.random() * 0.4;
          reviewedOnDay = appDay + randInt(1, 3);
          cooldownUntilDay = (reviewedOnDay ?? appDay) + randInt(5, 14);
          rejectedApps++;
        }

        insertApplication.run(
          appId,
          userId,
          partyId,
          appText,
          policyFocus,
          status,
          aiReasoning,
          priorityScore,
          appDay,
          reviewedOnDay,
          cooldownUntilDay,
        );

        // Log MdB application action
        insertAction.run(
          uuid(),
          userId,
          "apply_mdb",
          appId,
          "application",
          JSON.stringify({ partyId, status }),
          appDay,
          new Date(createdAt + 120000).toISOString(),
        );

        // Create bundestag seat for approved applications
        if (status === "approved") {
          try {
            insertSeat.run(
              uuid(),
              nextSeat++,
              partyId,
              "user",
              userId,
              1, // active
              "party_line",
              0,
              reviewedOnDay,
            );
            seatsCreated++;
          } catch {
            // Seat creation may fail if unique constraint on user_id
          }
        }

        // Notification for reviewed applications
        if (status === "approved" || status === "rejected") {
          insertNotification.run(
            uuid(),
            userId,
            "participation_window",
            status === "approved"
              ? "MdB-Bewerbung angenommen"
              : "MdB-Bewerbung abgelehnt",
            status === "approved"
              ? "Ihre Bewerbung für einen Sitz im Bundestag wurde angenommen. Sie können nun an Abstimmungen teilnehmen."
              : "Ihre Bewerbung für einen Sitz im Bundestag wurde leider abgelehnt. Sie können sich nach Ablauf der Wartezeit erneut bewerben.",
            null,
            Math.random() < 0.7 ? 1 : 0, // 70% read
            new Date(createdAt + 180000).toISOString(),
            reviewedOnDay!,
          );
        }
      }

      // ~10% of all users get a welcome notification
      if (Math.random() < 0.1) {
        insertNotification.run(
          uuid(),
          userId,
          "summary",
          "Willkommen bei KI Bundestag",
          "Willkommen! Treten Sie einer Partei bei und beteiligen Sie sich an der demokratischen Simulation.",
          null,
          Math.random() < 0.8 ? 1 : 0,
          new Date(createdAt + 30000).toISOString(),
          Math.max(1, currentDay - randInt(1, 50)),
        );
      }

      // Log session_start for realism
      if (Math.random() < 0.6) {
        insertAction.run(
          uuid(),
          userId,
          "session_start",
          null,
          null,
          null,
          Math.max(1, currentDay - randInt(0, 30)),
          new Date(lastActive).toISOString(),
        );
      }
    }
  });

  transaction();

  userDb.close();
  simDb.close();

  console.log(`\n✅ Created ${created} demo users`);
  console.log(`   With party: ${withParty}`);
  console.log(`   Without party: ${withoutParty}`);
  console.log(`   Party distribution:`, partyCount);
  console.log(`   MdB applications: ${pendingApps} pending, ${approvedApps} approved, ${rejectedApps} rejected`);
  console.log(`   Bundestag seats created: ${seatsCreated}`);
}

main();
