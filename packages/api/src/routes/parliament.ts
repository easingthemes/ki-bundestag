import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, getUserDb, schema, getCrisisTemplates, getUserSeat, getSqlite } from "@ki-bundestag/engine";
import { eq, and } from "drizzle-orm";
import type {
  BillImpact,
  BillVote,
  ConfidenceVote,
  ConstitutionalChallenge,
  Crisis,
  Fraktion,
  Interpellation,
  Motion,
} from "@ki-bundestag/types";
import { getUserToken, requireParticipatory } from "../middleware/index.js";
import { LIMITS } from "../validation.js";

const router = Router();

// ── Mapper functions ────────────────────────────────────────────────────────

function mapConstitutionalChallengeRow(row: typeof schema.constitutionalChallenges.$inferSelect): ConstitutionalChallenge {
  return {
    id: row.id,
    billId: row.billId,
    billTitle: row.billTitle,
    filedByPartyId: row.filedByPartyId,
    arguments: row.arguments,
    decision: row.decision as ConstitutionalChallenge["decision"],
    reasoning: row.reasoning ?? null,
    status: row.status as ConstitutionalChallenge["status"],
    dayNumber: row.dayNumber,
    ruledOnDay: row.ruledOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapCrisis(row: typeof schema.crises.$inferSelect): Crisis {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    category: row.category as Crisis["category"],
    severity: row.severity as Crisis["severity"],
    startDay: row.startDay,
    endDay: row.endDay,
    dailyImpact: row.dailyImpact as unknown as BillImpact,
    resolved: row.resolved,
  };
}

function mapMotionRow(row: typeof schema.motions.$inferSelect): Motion {
  return {
    id: row.id,
    type: row.type as Motion["type"],
    title: row.title,
    description: row.description,
    proposedBy: row.proposedBy,
    status: row.status as Motion["status"],
    votes: row.votes as unknown as BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? undefined,
  };
}

function mapInterpellationRow(row: typeof schema.interpellations.$inferSelect): Interpellation {
  return {
    id: row.id,
    type: row.type as Interpellation["type"],
    title: row.title,
    question: row.question,
    filedByPartyId: row.filedByPartyId,
    targetMinistry: row.targetMinistry as Interpellation["targetMinistry"],
    targetMinisterName: row.targetMinisterName,
    targetPartyId: row.targetPartyId,
    response: row.response ?? null,
    status: row.status as Interpellation["status"],
    dayNumber: row.dayNumber,
    respondedOnDay: row.respondedOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapConfidenceVoteRow(row: typeof schema.confidenceVotes.$inferSelect): ConfidenceVote {
  return {
    id: row.id,
    type: row.type as ConfidenceVote["type"],
    governmentId: row.governmentId,
    initiatedByPartyId: row.initiatedByPartyId,
    chancellorName: row.chancellorName,
    proposedChancellor: row.proposedChancellor ?? null,
    proposedChancellorPartyId: row.proposedChancellorPartyId ?? null,
    title: row.title,
    description: row.description,
    status: row.status as ConfidenceVote["status"],
    votes: row.votes as unknown as BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapFraktionRow(row: typeof schema.fraktionen.$inferSelect): Fraktion {
  return {
    id: row.id,
    partyId: row.partyId,
    leaderName: row.leaderName,
    status: row.status as Fraktion["status"],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
  };
}

// ── GET routes ──────────────────────────────────────────────────────────────

// GET /api/crises
router.get("/api/crises", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.crises).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((c: any) => !c.resolved) : allRows;
  const crises: Crisis[] = rows.map(mapCrisis);
  res.json(crises);
});

// GET /api/crises/:id
router.get("/api/crises/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.crises).where(eq(schema.crises.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Crisis not found" });
    return;
  }
  res.json(mapCrisis(rows[0]));
});

// GET /api/fraktionen
router.get("/api/fraktionen", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.fraktionen).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((f: any) => f.status === statusFilter) : allRows;
  const fraktionen: Fraktion[] = rows.map(mapFraktionRow);
  res.json(fraktionen);
});

// GET /api/fraktionen/:id
router.get("/api/fraktionen/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.fraktionen).where(eq(schema.fraktionen.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Fraktion not found" });
    return;
  }
  res.json(mapFraktionRow(rows[0]));
});

// GET /api/motions
router.get("/api/motions", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.motions).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((m: any) => m.status === statusFilter);
  if (typeFilter) rows = rows.filter((m: any) => m.type === typeFilter);
  const motions: Motion[] = rows.map(mapMotionRow);
  motions.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(motions);
});

// GET /api/motions/:id
router.get("/api/motions/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.motions).where(eq(schema.motions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Motion not found" });
    return;
  }
  res.json(mapMotionRow(rows[0]));
});

// GET /api/interpellations
router.get("/api/interpellations", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.interpellations).all();
  const statusFilter = req.query.status as string | undefined;
  const partyFilter = req.query.partyId as string | undefined;
  const ministryFilter = req.query.targetMinistry as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((i: any) => i.status === statusFilter);
  if (partyFilter) rows = rows.filter((i: any) => i.filedByPartyId === partyFilter);
  if (ministryFilter) rows = rows.filter((i: any) => i.targetMinistry === ministryFilter);
  const interpellations: Interpellation[] = rows.map(mapInterpellationRow);
  interpellations.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(interpellations);
});

// GET /api/interpellations/:id
router.get("/api/interpellations/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.interpellations).where(eq(schema.interpellations.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Interpellation not found" });
    return;
  }
  res.json(mapInterpellationRow(rows[0]));
});

// GET /api/confidence-votes
router.get("/api/confidence-votes", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.confidenceVotes).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((v: any) => v.status === statusFilter);
  if (typeFilter) rows = rows.filter((v: any) => v.type === typeFilter);
  const votes: ConfidenceVote[] = rows.map(mapConfidenceVoteRow);
  votes.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(votes);
});

// GET /api/confidence-votes/:id
router.get("/api/confidence-votes/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.confidenceVotes).where(eq(schema.confidenceVotes.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Confidence vote not found" });
    return;
  }
  res.json(mapConfidenceVoteRow(rows[0]));
});

// GET /api/constitutional-court
router.get("/api/constitutional-court", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.constitutionalChallenges).all();
  const statusFilter = req.query.status as string | undefined;
  const billIdFilter = req.query.billId as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((c: any) => c.status === statusFilter);
  if (billIdFilter) rows = rows.filter((c: any) => c.billId === billIdFilter);
  const challenges: ConstitutionalChallenge[] = rows.map(mapConstitutionalChallengeRow);
  challenges.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(challenges);
});

// GET /api/constitutional-court/:id
router.get("/api/constitutional-court/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.constitutionalChallenges)
    .where(eq(schema.constitutionalChallenges.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Constitutional challenge not found" });
    return;
  }
  res.json(mapConstitutionalChallengeRow(rows[0]));
});

// GET /api/crisis-templates
router.get("/api/crisis-templates", (_req, res) => {
  const templates = getCrisisTemplates();
  res.json(templates.map(t => ({ id: t.id, name: t.name, severity: t.severity, category: t.category })));
});

// ── POST routes ─────────────────────────────────────────────────────────────

// POST /api/motions/submit — user files a motion
router.post("/api/motions/submit", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  // Check Fraktion
  const db = getDb();
  const fraktion = db.select().from(schema.fraktionen)
    .where(and(eq(schema.fraktionen.partyId, seat.partyId), eq(schema.fraktionen.status, "active")))
    .all()[0];
  if (!fraktion) { res.status(403).json({ error: "Your party has no Fraktion — cannot submit motions" }); return; }

  const { motionType, title, description } = req.body as { motionType?: string; title?: string; description?: string };
  if (!motionType || !["motion", "resolution"].includes(motionType)) {
    res.status(400).json({ error: "motionType must be 'motion' or 'resolution'" }); return;
  }
  if (!title || title.trim().length < LIMITS.TEXT_SHORT_MIN || title.trim().length > LIMITS.POLICY_FOCUS_ITEM_MAX) {
    res.status(400).json({ error: `title must be ${LIMITS.TEXT_SHORT_MIN}–${LIMITS.POLICY_FOCUS_ITEM_MAX} characters` }); return;
  }
  if (!description || description.trim().length < LIMITS.TEXT_MEDIUM_MIN || description.trim().length > LIMITS.TEXT_MEDIUM_MAX) {
    res.status(400).json({ error: `description must be ${LIMITS.TEXT_MEDIUM_MIN}–${LIMITS.TEXT_MEDIUM_MAX} characters` }); return;
  }

  // Cooldown: max 1 pending motion at a time per user
  const sqlite = getSqlite();
  // Check user-filed motions via pending_injections
  const recentUserMotion = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_motion' AND json_extract(data, '$.userId') = ?"
  ).get(token) as { cnt: number };
  if (recentUserMotion.cnt > 0) {
    // Count how many were filed in last 7 days (from motions table, attributed to this party by user)
    // Simpler: just limit to 1 pending at a time
    const unconsumed = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_motion' AND consumed = 0 AND json_extract(data, '$.userId') = ?"
    ).get(token) as { cnt: number };
    if (unconsumed.cnt > 0) {
      res.status(429).json({ error: "You already have a pending motion" }); return;
    }
  }

  // Get user display name
  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_motion",
    data: {
      motionType,
      title: title.trim(),
      description: description.trim(),
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  res.json({ status: "queued", message: "Motion will be processed on next simulation day" });
});

// POST /api/interpellations/submit — user files an interpellation
router.post("/api/interpellations/submit", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  // Must be opposition
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, seat.partyId)).all()[0];
  if (!party || (party.coalitionRole as string) !== "opposition") {
    res.status(403).json({ error: "Only opposition parties can file interpellations" }); return;
  }
  // Must have Fraktion
  const fraktion = db.select().from(schema.fraktionen)
    .where(and(eq(schema.fraktionen.partyId, seat.partyId), eq(schema.fraktionen.status, "active")))
    .all()[0];
  if (!fraktion) { res.status(403).json({ error: "Your party has no Fraktion" }); return; }

  const { interpellationType, title, question, targetMinistry } = req.body as {
    interpellationType?: string; title?: string; question?: string; targetMinistry?: string;
  };
  if (!interpellationType || !["kleine", "große"].includes(interpellationType)) {
    res.status(400).json({ error: "interpellationType must be 'kleine' or 'große'" }); return;
  }
  if (!title || title.trim().length < LIMITS.TEXT_SHORT_MIN || title.trim().length > LIMITS.POLICY_FOCUS_ITEM_MAX) {
    res.status(400).json({ error: `title must be ${LIMITS.TEXT_SHORT_MIN}–${LIMITS.POLICY_FOCUS_ITEM_MAX} characters` }); return;
  }
  if (!question || question.trim().length < LIMITS.TEXT_MEDIUM_MIN || question.trim().length > LIMITS.TEXT_MEDIUM_MAX) {
    res.status(400).json({ error: `question must be ${LIMITS.TEXT_MEDIUM_MIN}–${LIMITS.TEXT_MEDIUM_MAX} characters` }); return;
  }
  const validMinistries = ["finance", "labour", "environment", "interior", "defence", "education", "health", "infrastructure"];
  if (!targetMinistry || !validMinistries.includes(targetMinistry)) {
    res.status(400).json({ error: `targetMinistry must be one of: ${validMinistries.join(", ")}` }); return;
  }

  // Cooldown: 1 pending at a time
  const sqlite = getSqlite();
  const unconsumed = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_interpellation' AND consumed = 0 AND json_extract(data, '$.userId') = ?"
  ).get(token) as { cnt: number };
  if (unconsumed.cnt > 0) {
    res.status(429).json({ error: "You already have a pending interpellation" }); return;
  }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_interpellation",
    data: {
      interpellationType,
      title: title.trim(),
      question: question.trim(),
      targetMinistry,
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  res.json({ status: "queued", message: "Interpellation will be processed on next simulation day" });
});

export default router;
