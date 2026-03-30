import crypto from "crypto";
import express from "express";
import { getDb, getUserDb, getUserSqlite, schema, logUserAction, isParticipatoryPreset, isFeatureEnabled, logger } from "@ki-bundestag/engine";
import type { TimingPreset } from "@ki-bundestag/engine";
import { eq } from "drizzle-orm";

// ── Buffered lastActive writes ──────────────────────────────────────────────
const lastActiveBuffer = new Map<string, number>();

/** Flush buffered lastActive timestamps to the database. */
export function flushLastActive(): void {
  if (lastActiveBuffer.size === 0) return;
  try {
    const userDb = getUserDb();
    const raw = getUserSqlite();
    const stmt = raw.prepare("UPDATE users SET last_active = ? WHERE id = ?");
    const run = raw.transaction(() => {
      for (const [userId, ts] of lastActiveBuffer) {
        stmt.run(ts, userId);
      }
    });
    run();
    lastActiveBuffer.clear();
  } catch {
    // Never block the server due to flush errors
  }
}

const FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(flushLastActive, FLUSH_INTERVAL);

// ── Session tracking middleware ──────────────────────────────────────────────
export function sessionTracking(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  try {
    const token = req.user ? (req.user as any).id : null;
    if (token) {
      const userDb = getUserDb();
      const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
      if (user) {
        const now = Date.now();
        const lastKnown = lastActiveBuffer.get(token) ?? user.lastActive ?? 0;
        const gap = now - lastKnown;
        if (gap > 15 * 60 * 1000) {
          // New session detected
          const db = getDb();
          const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
          logUserAction(token, "session_start", md?.day ?? 0, undefined, undefined, { gap_minutes: Math.round(gap / 60000) });
        }
        // Buffer lastActive instead of writing to DB on every request
        lastActiveBuffer.set(token, now);
      }
    }
  } catch {
    // Never block requests due to session tracking
  }
  next();
}

// ── Preset cache (10s TTL) ───────────────────────────────────────────────────
let cachedPreset: { value: TimingPreset; expiresAt: number } | null = null;

export function getTimingPreset(): TimingPreset {
  const now = Date.now();
  if (cachedPreset && now < cachedPreset.expiresAt) return cachedPreset.value;
  const db = getDb();
  const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];
  const preset = ((meta as any)?.timingPreset ?? "normal") as TimingPreset;
  cachedPreset = { value: preset, expiresAt: now + 10_000 };
  return preset;
}

/**
 * Guard for participatory endpoints. Returns true (and sends 403) if blocked.
 */
export function requireParticipatory(_req: express.Request, res: express.Response, feature?: string): boolean {
  const preset = getTimingPreset();
  if (!isParticipatoryPreset(preset)) {
    res.status(403).json({
      error: "Watch-only mode",
      preset,
      message: `Simulation is in ${preset} mode. Switch to Normal or Slow to interact.`,
    });
    return true;
  }
  if (feature && !isFeatureEnabled(preset, feature)) {
    res.status(403).json({
      error: "Feature not available",
      preset,
      feature,
      message: `"${feature}" is not enabled in ${preset} mode.`,
    });
    return true;
  }
  return false;
}

export function getUserToken(req: express.Request): string | null {
  if (req.user && (req.user as any).id) return (req.user as any).id;
  return null;
}

/**
 * Middleware: require ADMIN_SECRET header to access admin routes.
 * If ADMIN_SECRET env var is not set, all admin routes are blocked.
 */
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(403).json({ error: "Admin access disabled" });
    return;
  }
  const provided = req.headers["x-admin-secret"];
  if (typeof provided !== "string" || provided.length === 0) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
