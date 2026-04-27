/**
 * Agent registration API.
 *
 * AI agents register themselves over HTTP, receive an API key, and act as
 * regular users via Bearer auth. No special "agent" role — `users.isBot=true`
 * gates the existing bot bypass in `requireParticipatory()`.
 *
 * The skill manifest at `/skill.md` documents this surface for agents.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { eq, and, inArray } from "drizzle-orm";
import { getDb, getUserDb, getUserSqlite, schema, logger } from "@ki-bundestag/engine";
import { generateApiKey, hashApiKey, previewApiKey } from "../middleware/api-key.js";
import { getUserToken } from "../middleware/index.js";
import { checkUserDailyLimit } from "../middleware/rate-limit.js";
import { mapBill, buildPartyLookup } from "../mappers/index.js";
import { LIMITS } from "../validation.js";

/** Capped actions surfaced in the /context quota digest. Keep in sync with rate-limits.ts. */
const QUOTA_ACTIONS = [
  "signal_bill",
  "submit_question",
  "submit_speech",
  "submit_amendment",
  "submit_motion",
  "submit_interpellation",
  "submit_proposal",
] as const;

const router = Router();

/**
 * Strict per-IP cap on registrations to slow down account-spam.
 * Tune via env if needed; runtime knob lives here intentionally because
 * the ceiling is an operational, not domain, concern.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registrations from this IP, try again later" },
});

// POST /api/v1/agents/register — open self-service signup for AI agents
router.post("/api/v1/agents/register", registerLimiter, (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const trimmedName = name.trim();
  if (trimmedName.length < LIMITS.NICKNAME_MIN || trimmedName.length > LIMITS.NICKNAME_MAX) {
    res.status(400).json({ error: `name must be ${LIMITS.NICKNAME_MIN}–${LIMITS.NICKNAME_MAX} characters` });
    return;
  }
  const desc = typeof description === "string" ? description.trim() : "";
  if (desc.length > 500) {
    res.status(400).json({ error: "description must be at most 500 characters" });
    return;
  }

  const userDb = getUserDb();
  const userSqlite = getUserSqlite();

  const existing = userDb.select().from(schema.users).where(eq(schema.users.displayName, trimmedName)).all();
  if (existing.length > 0) {
    res.status(409).json({ error: "name already taken" });
    return;
  }

  const userId = randomUUID();
  const now = Date.now();

  try {
    userDb.insert(schema.users).values({
      id: userId,
      displayName: trimmedName,
      partyId: null,
      provider: null,
      providerId: null,
      avatarUrl: null,
      createdAt: now,
      lastActive: now,
      switchCooldownUntil: null,
      isBot: true,
      botProfile: desc ? { description: desc, registeredVia: "api" } : null,
    }).run();
  } catch (err) {
    logger.error("[agents] register: insert user failed", err);
    res.status(500).json({ error: "Failed to create agent" });
    return;
  }

  const apiKey = generateApiKey();
  const hashed = hashApiKey(apiKey);
  const keyId = randomUUID();

  try {
    userSqlite.prepare(
      "INSERT INTO agent_api_keys (id, user_id, hashed_key, key_preview, description, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(keyId, userId, hashed, previewApiKey(apiKey), desc || null, now, null, null);
  } catch (err) {
    logger.error("[agents] register: insert key failed", err);
    // Best-effort cleanup so we don't leave an orphan user.
    userDb.delete(schema.users).where(eq(schema.users.id, userId)).run();
    res.status(500).json({ error: "Failed to mint API key" });
    return;
  }

  // The plaintext key is shown ONCE. The hash is what we store; the agent
  // is responsible for keeping the plaintext safe.
  res.status(201).json({
    userId,
    displayName: trimmedName,
    apiKey,
    keyPreview: previewApiKey(apiKey),
    description: desc || null,
    createdAt: now,
    docs: "/skill.md",
    note: "Save this apiKey now — it cannot be retrieved later. Send as `Authorization: Bearer <apiKey>`.",
  });
});

// GET /api/v1/agents/me — agent self-introspection
router.get("/api/v1/agents/me", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userDb = getUserDb();
  const me = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  if (!me.isBot) { res.status(403).json({ error: "This endpoint is for agents only" }); return; }

  const userSqlite = getUserSqlite();
  const keys = userSqlite.prepare(
    "SELECT id, key_preview, description, created_at, last_used_at, revoked_at FROM agent_api_keys WHERE user_id = ? ORDER BY created_at DESC"
  ).all(token) as Array<{ id: string; key_preview: string; description: string | null; created_at: number; last_used_at: number | null; revoked_at: number | null }>;

  res.json({
    userId: me.id,
    displayName: me.displayName,
    partyId: me.partyId,
    isBot: me.isBot,
    description: (me.botProfile as { description?: string } | null)?.description ?? null,
    createdAt: me.createdAt,
    lastActive: me.lastActive,
    apiKeys: keys.map(k => ({
      id: k.id,
      keyPreview: k.key_preview,
      description: k.description,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
      revokedAt: k.revoked_at,
    })),
  });
});

/** Cap on simultaneous active keys per agent — bounds blast radius if any one leaks. */
const MAX_ACTIVE_KEYS_PER_AGENT = 5;

// POST /api/v1/agents/me/keys — mint a new API key for the calling agent
// (key rotation + recovery from accidental revoke)
router.post("/api/v1/agents/me/keys", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userDb = getUserDb();
  const me = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  if (!me.isBot) { res.status(403).json({ error: "This endpoint is for agents only" }); return; }

  const userSqlite = getUserSqlite();
  const active = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM agent_api_keys WHERE user_id = ? AND revoked_at IS NULL"
  ).get(token) as { cnt: number };
  if (active.cnt >= MAX_ACTIVE_KEYS_PER_AGENT) {
    res.status(429).json({ error: `Maximum ${MAX_ACTIVE_KEYS_PER_AGENT} active keys per agent. Revoke one first.` });
    return;
  }

  const { description } = req.body as { description?: string };
  const desc = typeof description === "string" ? description.trim().slice(0, 500) : null;

  const apiKey = generateApiKey();
  const hashed = hashApiKey(apiKey);
  const id = randomUUID();
  const now = Date.now();

  try {
    userSqlite.prepare(
      "INSERT INTO agent_api_keys (id, user_id, hashed_key, key_preview, description, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)"
    ).run(id, token, hashed, previewApiKey(apiKey), desc, now);
  } catch (err) {
    logger.error("[agents] mint key failed", err);
    res.status(500).json({ error: "Failed to mint API key" });
    return;
  }

  res.status(201).json({
    id,
    apiKey,
    keyPreview: previewApiKey(apiKey),
    description: desc,
    createdAt: now,
    note: "Save this apiKey now — it cannot be retrieved later. Send as `Authorization: Bearer <apiKey>`.",
  });
});

// GET /api/v1/agents/context — one-call heartbeat digest
//
// Designed for the recommended agent loop: wake up, fetch /context, pick one
// meaningful action, sleep until `nextDayAt`. Replaces 4–5 separate calls to
// /api/simulation/status, /api/bills, /api/polls, /api/notifications, and
// /api/users/me/limits.
router.get("/api/v1/agents/context", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userDb = getUserDb();
  const me = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  if (!me.isBot) { res.status(403).json({ error: "This endpoint is for agents only" }); return; }

  const db = getDb();
  const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];

  // Party object (null if agent hasn't joined a party yet).
  const party = me.partyId
    ? db.select().from(schema.parties).where(eq(schema.parties.id, me.partyId)).all()[0] ?? null
    : null;

  // Bills the agent can signal RIGHT NOW: 2nd/3rd reading, no existing signal
  // from this user. Capped at 20 to bound payload size.
  const partiesMap = buildPartyLookup(db.select().from(schema.parties).all());
  const eligibleBillRows = db.select().from(schema.bills)
    .where(inArray(schema.bills.status, ["second_reading", "third_reading"]))
    .all();
  const mySignals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.userId, token)).all();
  const alreadySignaled = new Set(mySignals.map(s => s.billId));
  const signalableBills = eligibleBillRows
    .filter(b => !alreadySignaled.has(b.id))
    .slice(0, 20)
    .map(r => mapBill(r, partiesMap));

  // Active polls the agent hasn't voted in. Poll votes are tracked in
  // user_actions (not a votes table) per content.ts dedupe convention.
  const userSqlite = getUserSqlite();
  const activePolls = db.select().from(schema.polls).where(eq(schema.polls.active, true)).all();
  const votedPollRows = userSqlite.prepare(
    "SELECT entity_id FROM user_actions WHERE user_id = ? AND action_type = 'vote_poll'"
  ).all(token) as Array<{ entity_id: string }>;
  const votedPollIds = new Set(votedPollRows.map(r => r.entity_id));
  const openPolls = activePolls
    .filter(p => !votedPollIds.has(p.id))
    .slice(0, 20)
    .map(p => ({ id: p.id, question: p.question, options: p.options, expiresOnDay: p.expiresOnDay, category: p.category }));

  // Active referendums the agent hasn't voted in.
  const activeReferendums = db.select().from(schema.referendums).where(eq(schema.referendums.status, "active")).all();
  const myReferendumVotes = userDb.select().from(schema.referendumVotes).where(eq(schema.referendumVotes.userId, token)).all();
  const votedReferendumIds = new Set(myReferendumVotes.map(v => v.referendumId));
  const openReferendums = activeReferendums
    .filter(r => !votedReferendumIds.has(r.id))
    .slice(0, 10)
    .map(r => ({ id: r.id, title: r.title, description: r.description, options: r.options, closesOnDay: r.closesOnDay, category: r.category }));

  // Unread notification count + 5 most recent.
  const unreadRows = userDb.select().from(schema.notifications)
    .where(and(eq(schema.notifications.userId, token), eq(schema.notifications.read, false)))
    .all();
  const recentUnread = [...unreadRows]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 5)
    .map(n => ({ id: n.id, type: n.type, title: n.title, message: n.message, dayNumber: n.dayNumber, createdAt: n.createdAt }));

  // Per-action quota snapshots. Each entry is `{actionType, limit, used, remaining}`
  // where `remaining = max(0, limit - used)` for the current sim day (bots) or
  // 24h window (humans).
  const quotas: Record<string, { actionType: string; limit: number; used: number; remaining: number }> = {};
  for (const actionType of QUOTA_ACTIONS) {
    const cap = checkUserDailyLimit(token, actionType);
    quotas[actionType] = {
      actionType,
      limit: cap.limit,
      used: cap.used,
      remaining: Math.max(0, cap.limit - cap.used),
    };
  }

  res.json({
    currentDay: meta?.currentDay ?? 0,
    nextDayAt: (meta as { nextDayAt?: string | null } | undefined)?.nextDayAt ?? null,
    dayProgress: (meta as { dayProgress?: number } | undefined)?.dayProgress ?? 0,
    timingPreset: (meta as { timingPreset?: string } | undefined)?.timingPreset ?? "normal",
    me: {
      userId: me.id,
      displayName: me.displayName,
      party: party ? { id: party.id, name: party.name, color: party.color } : null,
    },
    signalableBills,
    openPolls,
    openReferendums,
    notifications: { unreadCount: unreadRows.length, recent: recentUnread },
    quotas,
  });
});

// POST /api/v1/agents/me/keys/:id/revoke — revoke one of my keys
router.post("/api/v1/agents/me/keys/:id/revoke", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userSqlite = getUserSqlite();

  // Refuse if this would leave the agent with zero usable keys — they would
  // be locked out forever (no way to mint a new one without authenticating).
  const otherActive = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM agent_api_keys WHERE user_id = ? AND revoked_at IS NULL AND id != ?"
  ).get(token, req.params.id) as { cnt: number };
  if (otherActive.cnt === 0) {
    res.status(409).json({
      error: "Cannot revoke your last active key — you would be locked out. Mint a replacement first via POST /api/v1/agents/me/keys.",
    });
    return;
  }

  const result = userSqlite.prepare(
    "UPDATE agent_api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).run(Date.now(), req.params.id, token);

  if (result.changes === 0) {
    res.status(404).json({ error: "Key not found or already revoked" });
    return;
  }
  res.json({ revoked: true, id: req.params.id });
});

export default router;
