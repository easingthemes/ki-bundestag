import crypto from "crypto";
import express from "express";
import { getUserSqlite, logger } from "@ki-bundestag/engine";

/** Format of issued API keys: `kib_<48 hex chars>` (24 bytes of entropy). */
export const API_KEY_PREFIX = "kib_";
const API_KEY_BYTES = 24;

/** Mint a new plaintext API key. Plaintext is shown to the agent ONCE. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(API_KEY_BYTES).toString("hex");
}

/** SHA-256 hash of a plaintext key. Stored in `agent_api_keys.hashed_key`. */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Last 8 chars of a plaintext key — safe to display in UIs and logs. */
export function previewApiKey(plaintext: string): string {
  return plaintext.slice(-8);
}

/**
 * Bearer-token middleware. Reads `Authorization: Bearer <key>`; if it resolves
 * to a non-revoked `agent_api_keys` row, hydrates `req.user` with the same
 * shape Passport produces. Falls through silently otherwise — Passport's
 * session middleware then runs and may authenticate the request via cookie.
 */
export function apiKeyAuth(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith(API_KEY_PREFIX)) {
    next();
    return;
  }

  try {
    const userSqlite = getUserSqlite();
    const hashed = hashApiKey(token);
    const row = userSqlite.prepare(
      "SELECT user_id, revoked_at FROM agent_api_keys WHERE hashed_key = ?"
    ).get(hashed) as { user_id: string; revoked_at: number | null } | undefined;

    if (!row || row.revoked_at != null) {
      next();
      return;
    }

    const user = userSqlite.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id) as Record<string, unknown> | undefined;
    if (!user) {
      next();
      return;
    }

    // Hydrate req.user with the same camelCased shape Passport produces.
    (req as { user?: unknown }).user = {
      id: user.id,
      displayName: user.display_name,
      partyId: user.party_id,
      provider: user.provider,
      providerId: user.provider_id,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      lastActive: user.last_active,
      switchCooldownUntil: user.switch_cooldown_until,
      isBot: user.is_bot === 1,
      botProfile: user.bot_profile ? JSON.parse(user.bot_profile as string) : null,
    };

    // Best-effort lastUsedAt update — never block on errors.
    try {
      userSqlite.prepare("UPDATE agent_api_keys SET last_used_at = ? WHERE hashed_key = ?")
        .run(Date.now(), hashed);
    } catch {
      // Touching lastUsedAt is observability, not correctness — swallow.
    }
  } catch (err) {
    logger.error("[api-key] auth failure:", err);
  }
  next();
}
