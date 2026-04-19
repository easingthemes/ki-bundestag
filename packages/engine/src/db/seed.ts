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

  // Cycle 1 (todo 043) — backfill bill stage timing for in-flight bills.
  // Idempotent: each UPDATE is guarded by WHERE col IS NULL.
  try {
    // 1. stage_entry_day defaults to status_changed_on_day, falling back to proposed_on_day
    const entryBackfill = sqlite.prepare(
      "UPDATE bills SET stage_entry_day = COALESCE(status_changed_on_day, proposed_on_day) WHERE stage_entry_day IS NULL",
    ).run();
    if (entryBackfill.changes > 0) {
      console.log(`[Migrate] Backfilled stage_entry_day on ${entryBackfill.changes} bill(s)`);
    }

    // 2. Committee-stage bills without a drawn stage_min_duration — assign
    //    the ordinary-tier minimum (42 days). Existing bills already past this
    //    threshold will simply advance on the next Sitzungstag, which matches
    //    the Cycle 1 spec Q3 ("backfill + force-advance").
    const committeeBackfill = sqlite.prepare(
      "UPDATE bills SET stage_min_duration = 42, stage_max_duration = 84 WHERE status = 'committee' AND stage_min_duration IS NULL",
    ).run();
    if (committeeBackfill.changes > 0) {
      console.log(`[Migrate] Backfilled committee stage_min_duration on ${committeeBackfill.changes} bill(s)`);
    }

    // 2b. 1st/2nd reading bills get the 1-day min/max from BILL_STAGE_DURATIONS.
    //     Pipeline reads from config directly, so this is cosmetic parity with
    //     committee rows — keeps row-level state self-describing and makes DB
    //     inspection less ambiguous. third_reading excluded: legacy rows there
    //     may be mid-tally, pre-tally, or post-vote, and their intended
    //     stage_min_duration depends on which sub-phase they're in.
    const readingBackfill = sqlite.prepare(
      "UPDATE bills SET stage_min_duration = 1, stage_max_duration = 1 WHERE status IN ('first_reading','second_reading') AND stage_min_duration IS NULL",
    ).run();
    if (readingBackfill.changes > 0) {
      console.log(`[Migrate] Backfilled reading-stage stage_min_duration on ${readingBackfill.changes} bill(s)`);
    }

    // 3. Pre-PR-3 passed bills: treat as already in force (Inkrafttreten == status change day).
    //    Impact was applied at the old bill_passed emission point so no re-application needed.
    const passedBackfill = sqlite.prepare(
      "UPDATE bills SET bundesrat_state = 'cleared', inkrafttreten_day = COALESCE(status_changed_on_day, proposed_on_day) WHERE status = 'passed' AND bundesrat_state IS NULL",
    ).run();
    if (passedBackfill.changes > 0) {
      console.log(`[Migrate] Backfilled Bundesrat/Inkrafttreten state on ${passedBackfill.changes} already-passed bill(s)`);
    }
  } catch {
    // bills table might not have the new columns yet on very old DBs
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
    DROP TABLE IF EXISTS party_donations;
    DROP TABLE IF EXISTS lobbying_events;
    DROP TABLE IF EXISTS quiz_party_positions;
    DROP TABLE IF EXISTS quiz_theses;
    DROP TABLE IF EXISTS bundestag_seats;
    DROP TABLE IF EXISTS real_world_knowledge;
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

  // ── Seed quiz theses and party positions ──
  const QUIZ_THESES = [
    { id: "thesis-001", text: "Der Mindestlohn sollte auf 15 Euro angehoben werden.", category: "economy" },
    { id: "thesis-002", text: "Unternehmenssteuern sollten gesenkt werden, um Investitionen zu foerdern.", category: "economy" },
    { id: "thesis-003", text: "Das Buergergeld sollte deutlich erhoeht werden.", category: "social" },
    { id: "thesis-004", text: "Gleichgeschlechtliche Paare sollten bei Adoptionen gleichgestellt werden.", category: "social" },
    { id: "thesis-005", text: "Deutschland sollte bis 2035 vollstaendig aus der Kohle aussteigen.", category: "environment" },
    { id: "thesis-006", text: "Tempolimit von 130 km/h auf Autobahnen.", category: "environment" },
    { id: "thesis-007", text: "Deutschland sollte mehr Gefluechtete aufnehmen.", category: "immigration" },
    { id: "thesis-008", text: "Abschiebungen abgelehnter Asylbewerber sollten konsequenter durchgesetzt werden.", category: "immigration" },
    { id: "thesis-009", text: "Die Bundeswehr sollte staerker finanziell ausgestattet werden.", category: "defense" },
    { id: "thesis-010", text: "Studiengebuehren sollten bundesweit abgeschafft bleiben.", category: "education" },
    { id: "thesis-011", text: "Digitalisierung an Schulen sollte hoechste Prioritaet haben.", category: "education" },
    { id: "thesis-012", text: "Cannabis sollte vollstaendig legalisiert werden.", category: "healthcare" },
    { id: "thesis-013", text: "Die Buergerversicherung sollte die private Krankenversicherung ersetzen.", category: "healthcare" },
    { id: "thesis-014", text: "Der oeffentliche Nahverkehr sollte kostenlos sein.", category: "infrastructure" },
    { id: "thesis-015", text: "Der Ausbau von Autobahnen sollte Vorrang vor Schienenausbau haben.", category: "infrastructure" },
  ];

  for (const thesis of QUIZ_THESES) {
    db.insert(schema.quizTheses).values({
      id: thesis.id,
      text: thesis.text,
      category: thesis.category,
      generatedOnDay: 0,
      active: true,
    }).run();
  }

  // Party positions based on real-world political stances (seed data for MVP)
  type Pos = "agree" | "disagree" | "neutral";
  const PARTY_POSITIONS: Record<string, Record<string, { position: Pos; reasoning: string }>> = {
    spd: {
      "thesis-001": { position: "agree", reasoning: "Die SPD setzt sich fuer hoehere Loehne und soziale Gerechtigkeit ein." },
      "thesis-002": { position: "disagree", reasoning: "Steuersenkungen fuer Unternehmen widersprechen dem Gerechtigkeitsprinzip der SPD." },
      "thesis-003": { position: "agree", reasoning: "Als Partei des Sozialstaats unterstuetzt die SPD hoehere Sozialleistungen." },
      "thesis-004": { position: "agree", reasoning: "Die SPD steht fuer Gleichberechtigung und moderne Familienpolitik." },
      "thesis-005": { position: "agree", reasoning: "Die SPD unterstuetzt den Kohleausstieg, achtet aber auf Arbeitnehmerinteressen." },
      "thesis-006": { position: "agree", reasoning: "Die SPD befuerwortet ein Tempolimit fuer mehr Sicherheit und Klimaschutz." },
      "thesis-007": { position: "agree", reasoning: "Die SPD steht fuer eine humanitaere Fluechtlingspolitik." },
      "thesis-008": { position: "neutral", reasoning: "Die SPD differenziert zwischen humanitaerem Schutz und Durchsetzung geltenden Rechts." },
      "thesis-009": { position: "neutral", reasoning: "Die SPD unterstuetzt die Bundeswehr, setzt aber auf diplomatische Loesungen." },
      "thesis-010": { position: "agree", reasoning: "Bildung muss fuer alle zugaenglich und kostenfrei sein." },
      "thesis-011": { position: "agree", reasoning: "Die SPD setzt sich fuer Digitalisierung im Bildungsbereich ein." },
      "thesis-012": { position: "agree", reasoning: "Die SPD hat die Cannabis-Legalisierung in der Ampelkoalition mitgetragen." },
      "thesis-013": { position: "agree", reasoning: "Die SPD fordert seit langem eine solidarische Buergerversicherung." },
      "thesis-014": { position: "agree", reasoning: "Die SPD setzt auf den Ausbau des oeffentlichen Nahverkehrs." },
      "thesis-015": { position: "disagree", reasoning: "Die SPD bevorzugt Investitionen in die Schiene gegenueber dem Autobahnausbau." },
    },
    cdu: {
      "thesis-001": { position: "disagree", reasoning: "Die CDU warnt vor zu hohen Mindestloehnen als Belastung fuer den Mittelstand." },
      "thesis-002": { position: "agree", reasoning: "Die CDU setzt auf Steuererleichterungen zur Staerkung der Wirtschaft." },
      "thesis-003": { position: "disagree", reasoning: "Die CDU fordert staerkere Anreize zur Arbeitsaufnahme statt hoeherer Transfers." },
      "thesis-004": { position: "neutral", reasoning: "Die CDU ist gespalten zwischen traditionellem Familienbild und modernen Ansaetzen." },
      "thesis-005": { position: "disagree", reasoning: "Die CDU haelt einen Kohleausstieg bis 2035 fuer wirtschaftlich unrealistisch." },
      "thesis-006": { position: "disagree", reasoning: "Die CDU lehnt ein generelles Tempolimit ab und setzt auf Eigenverantwortung." },
      "thesis-007": { position: "disagree", reasoning: "Die CDU fordert eine striktere Begrenzung der Zuwanderung." },
      "thesis-008": { position: "agree", reasoning: "Die CDU fordert konsequente Durchsetzung des Aufenthaltsrechts." },
      "thesis-009": { position: "agree", reasoning: "Die CDU steht fuer eine starke Bundeswehr und NATO-Verpflichtungen." },
      "thesis-010": { position: "neutral", reasoning: "Die CDU haelt Studiengebuehren fuer Laendersache." },
      "thesis-011": { position: "agree", reasoning: "Die CDU unterstuetzt die Digitalisierung der Schulen." },
      "thesis-012": { position: "disagree", reasoning: "Die CDU lehnt eine vollstaendige Cannabis-Legalisierung ab." },
      "thesis-013": { position: "disagree", reasoning: "Die CDU verteidigt das duale Krankenversicherungssystem." },
      "thesis-014": { position: "disagree", reasoning: "Die CDU haelt kostenlosen Nahverkehr fuer nicht finanzierbar." },
      "thesis-015": { position: "agree", reasoning: "Die CDU setzt auf den Ausbau der Verkehrsinfrastruktur inkl. Autobahnen." },
    },
    gruene: {
      "thesis-001": { position: "agree", reasoning: "Die Gruenen fordern existenzsichernde Loehne und soziale Gerechtigkeit." },
      "thesis-002": { position: "disagree", reasoning: "Die Gruenen setzen auf oekologisch-soziale Steuerpolitik statt Unternehmensentlastung." },
      "thesis-003": { position: "agree", reasoning: "Die Gruenen fordern eine armutsfeste Grundsicherung." },
      "thesis-004": { position: "agree", reasoning: "Die Gruenen kaempfen fuer volle Gleichstellung aller Familienformen." },
      "thesis-005": { position: "agree", reasoning: "Der Kohleausstieg ist ein Kernthema der Gruenen fuer den Klimaschutz." },
      "thesis-006": { position: "agree", reasoning: "Ein Tempolimit ist fuer die Gruenen ein einfacher Beitrag zum Klimaschutz." },
      "thesis-007": { position: "agree", reasoning: "Die Gruenen stehen fuer eine offene und humanitaere Fluechtlingspolitik." },
      "thesis-008": { position: "disagree", reasoning: "Die Gruenen kritisieren pauschale Abschiebeforderungen als unmenschlich." },
      "thesis-009": { position: "disagree", reasoning: "Die Gruenen bevorzugen Abruestung und zivile Konfliktloesung." },
      "thesis-010": { position: "agree", reasoning: "Bildungsgerechtigkeit erfordert kostenfreie Bildung fuer alle." },
      "thesis-011": { position: "agree", reasoning: "Die Gruenen fordern nachhaltige Digitalisierung im Bildungsbereich." },
      "thesis-012": { position: "agree", reasoning: "Die Gruenen haben die Cannabis-Legalisierung massgeblich vorangetrieben." },
      "thesis-013": { position: "agree", reasoning: "Die Gruenen unterstuetzen eine solidarische Buergerversicherung." },
      "thesis-014": { position: "agree", reasoning: "Kostenloser OEPNV ist ein zentrales Mobilitaetsziel der Gruenen." },
      "thesis-015": { position: "disagree", reasoning: "Die Gruenen lehnen den Ausbau von Autobahnen zugunsten des Schienennetzes ab." },
    },
    fdp: {
      "thesis-001": { position: "disagree", reasoning: "Die FDP warnt, dass zu hohe Mindestloehne Arbeitsplaetze gefaehrden." },
      "thesis-002": { position: "agree", reasoning: "Steuersenkungen sind ein Kernanliegen der FDP fuer wirtschaftliches Wachstum." },
      "thesis-003": { position: "disagree", reasoning: "Die FDP setzt auf Eigenverantwortung und Leistungsanreize statt hoeherer Transfers." },
      "thesis-004": { position: "agree", reasoning: "Die FDP unterstuetzt individuelle Freiheit und gleiche Rechte fuer alle." },
      "thesis-005": { position: "disagree", reasoning: "Die FDP haelt starre Ausstiegsdaten fuer wirtschaftsfeindlich und technologieoffen." },
      "thesis-006": { position: "disagree", reasoning: "Die FDP lehnt ein Tempolimit als Eingriff in die individuelle Freiheit ab." },
      "thesis-007": { position: "neutral", reasoning: "Die FDP differenziert zwischen qualifizierter Zuwanderung und Asylpolitik." },
      "thesis-008": { position: "agree", reasoning: "Die FDP fordert konsequente Durchsetzung geltenden Rechts." },
      "thesis-009": { position: "agree", reasoning: "Die FDP unterstuetzt das 2%-Ziel der NATO fuer Verteidigungsausgaben." },
      "thesis-010": { position: "neutral", reasoning: "Die FDP ist offen fuer moderate Studiengebuehren nach internationalen Vorbildern." },
      "thesis-011": { position: "agree", reasoning: "Die FDP setzt auf Digitalisierung und technologische Modernisierung." },
      "thesis-012": { position: "agree", reasoning: "Die FDP hat die Cannabis-Legalisierung als liberale Drogenpolitik unterstuetzt." },
      "thesis-013": { position: "disagree", reasoning: "Die FDP verteidigt den Wettbewerb zwischen gesetzlicher und privater Versicherung." },
      "thesis-014": { position: "disagree", reasoning: "Die FDP haelt kostenlosen OEPNV fuer nicht nachhaltig finanzierbar." },
      "thesis-015": { position: "neutral", reasoning: "Die FDP setzt auf technologieoffene Verkehrspolitik ohne ideologische Praeferenzen." },
    },
    afd: {
      "thesis-001": { position: "disagree", reasoning: "Die AfD sieht zu hohe Mindestloehne als Gefahr fuer kleine Unternehmen." },
      "thesis-002": { position: "agree", reasoning: "Die AfD setzt auf Wirtschaftsliberalismus und niedrigere Steuern." },
      "thesis-003": { position: "disagree", reasoning: "Die AfD kritisiert das Buergergeld als Fehlanreiz gegen Arbeit." },
      "thesis-004": { position: "disagree", reasoning: "Die AfD vertritt ein traditionelles Familienbild." },
      "thesis-005": { position: "disagree", reasoning: "Die AfD lehnt den Kohleausstieg als wirtschaftsschaedigend ab." },
      "thesis-006": { position: "disagree", reasoning: "Die AfD lehnt ein Tempolimit als Bevormundung ab." },
      "thesis-007": { position: "disagree", reasoning: "Die AfD fordert eine stark restriktive Zuwanderungspolitik." },
      "thesis-008": { position: "agree", reasoning: "Konsequente Abschiebungen sind ein Kernthema der AfD." },
      "thesis-009": { position: "agree", reasoning: "Die AfD fordert eine starke nationale Verteidigung." },
      "thesis-010": { position: "neutral", reasoning: "Die AfD sieht Bildungspolitik als Laendersache." },
      "thesis-011": { position: "neutral", reasoning: "Die AfD unterstuetzt Digitalisierung, aber ohne ideologische Vorgaben." },
      "thesis-012": { position: "disagree", reasoning: "Die AfD lehnt die Cannabis-Legalisierung ab." },
      "thesis-013": { position: "disagree", reasoning: "Die AfD verteidigt das bestehende Versicherungssystem." },
      "thesis-014": { position: "disagree", reasoning: "Die AfD lehnt kostenlosen OEPNV als nicht finanzierbar ab." },
      "thesis-015": { position: "agree", reasoning: "Die AfD setzt auf Autobahnausbau und Individualverkehr." },
    },
    linke: {
      "thesis-001": { position: "agree", reasoning: "Die Linke fordert einen Mindestlohn von mindestens 15 Euro." },
      "thesis-002": { position: "disagree", reasoning: "Die Linke fordert hoehere Unternehmenssteuern fuer mehr Gerechtigkeit." },
      "thesis-003": { position: "agree", reasoning: "Die Linke fordert eine deutliche Erhoehung der Grundsicherung." },
      "thesis-004": { position: "agree", reasoning: "Die Linke kaempft fuer volle Gleichstellung aller Lebensformen." },
      "thesis-005": { position: "agree", reasoning: "Die Linke fordert einen schnellstmoeglichen Kohleausstieg." },
      "thesis-006": { position: "agree", reasoning: "Die Linke befuerwortet ein Tempolimit fuer Klimaschutz und Sicherheit." },
      "thesis-007": { position: "agree", reasoning: "Die Linke steht fuer offene Grenzen und solidarische Fluechtlingspolitik." },
      "thesis-008": { position: "disagree", reasoning: "Die Linke lehnt Massenabschiebungen grundsaetzlich ab." },
      "thesis-009": { position: "disagree", reasoning: "Die Linke fordert Abruestung statt Aufruestung der Bundeswehr." },
      "thesis-010": { position: "agree", reasoning: "Bildung muss komplett kostenfrei sein — von der Kita bis zur Uni." },
      "thesis-011": { position: "agree", reasoning: "Die Linke unterstuetzt Digitalisierung mit Fokus auf Chancengleichheit." },
      "thesis-012": { position: "agree", reasoning: "Die Linke befuerwortet die vollstaendige Entkriminalisierung von Cannabis." },
      "thesis-013": { position: "agree", reasoning: "Die Linke fordert eine solidarische Buergerversicherung fuer alle." },
      "thesis-014": { position: "agree", reasoning: "Kostenloser OEPNV ist eine zentrale Forderung der Linken." },
      "thesis-015": { position: "disagree", reasoning: "Die Linke bevorzugt massiven Ausbau des Schienennetzes." },
    },
  };

  let posCount = 0;
  for (const [partyId, positions] of Object.entries(PARTY_POSITIONS)) {
    for (const [thesisId, { position, reasoning }] of Object.entries(positions)) {
      db.insert(schema.quizPartyPositions).values({
        id: `pos-${partyId}-${thesisId}`,
        thesisId,
        partyId,
        position,
        reasoning,
      }).run();
      posCount++;
    }
  }

  console.log(`Seeded ${PARTIES.length} parties`);
  console.log(`Seeded ${fraktionCount} Fraktionen`);
  console.log(`Seeded initial government (Chancellor: ${chancellorName})`);
  console.log("Seeded initial national state");
  console.log("Seeded simulation meta (day 0)");
  console.log(`Seeded ${QUIZ_THESES.length} quiz theses with ${posCount} party positions`);
}
