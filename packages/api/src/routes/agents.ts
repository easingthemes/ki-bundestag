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
import { eq } from "drizzle-orm";
import { getUserDb, getUserSqlite, schema, logger } from "@ki-bundestag/engine";
import { generateApiKey, hashApiKey, previewApiKey } from "../middleware/api-key.js";
import { getUserToken } from "../middleware/index.js";
import { LIMITS } from "../validation.js";

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

// POST /api/v1/agents/me/keys/:id/revoke — revoke one of my keys
router.post("/api/v1/agents/me/keys/:id/revoke", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const userSqlite = getUserSqlite();
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
