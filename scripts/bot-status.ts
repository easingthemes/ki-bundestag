/**
 * bot-status.ts — Report bot system status
 *
 * Queries the DB for bot user counts, activity profiles, and recent activity.
 * Also checks if the ki-bot PM2 process is running.
 *
 * Usage: npm run bot:status
 */

import Database from "better-sqlite3";
import { execSync } from "node:child_process";
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

function main() {
  // ── PM2 process status ──────────────────────────────────────────────────
  let pm2Status = "not running";
  let pm2Uptime = "";
  let pm2Pid = "";
  try {
    const pm2Out = execSync("pm2 jlist 2>/dev/null", { encoding: "utf-8" });
    const pm2List = JSON.parse(pm2Out) as Array<{
      name: string;
      pm2_env: { status: string; pm_uptime: number };
      pid: number;
    }>;
    const botProc = pm2List.find(p => p.name === "ki-bot");
    if (botProc) {
      pm2Status = botProc.pm2_env.status;
      pm2Pid = String(botProc.pid);
      const uptimeMs = Date.now() - botProc.pm2_env.pm_uptime;
      const hours = Math.floor(uptimeMs / 3600000);
      const mins = Math.floor((uptimeMs % 3600000) / 60000);
      pm2Uptime = `${hours}h ${mins}m`;
    }
  } catch {
    // PM2 not available or not installed
  }

  console.log("╔══════════════════════════════════════╗");
  console.log("║         Bot Activity Status          ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  PM2 Process:  ${pm2Status.padEnd(21)}║`);
  if (pm2Pid) console.log(`║  PID:          ${pm2Pid.padEnd(21)}║`);
  if (pm2Uptime) console.log(`║  Uptime:       ${pm2Uptime.padEnd(21)}║`);
  console.log("╠══════════════════════════════════════╣");

  // ── DB stats ──────────────────────────────────────────────────────────
  if (!fs.existsSync(USER_DB_PATH)) {
    console.log("║  No users.db found                   ║");
    console.log("╚══════════════════════════════════════╝");
    return;
  }

  const db = new Database(USER_DB_PATH, { readonly: true });

  // Total bots
  const totalBots = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_bot = 1").get() as { cnt: number }).cnt;
  const totalReal = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_bot = 0").get() as { cnt: number }).cnt;

  console.log(`║  Bot users:    ${String(totalBots).padEnd(21)}║`);
  console.log(`║  Real users:   ${String(totalReal).padEnd(21)}║`);

  // Activity level breakdown
  if (totalBots > 0) {
    const profiles = db.prepare(
      "SELECT bot_profile FROM users WHERE is_bot = 1 AND bot_profile IS NOT NULL",
    ).all() as Array<{ bot_profile: string }>;

    const levelCounts: Record<string, number> = { high: 0, medium: 0, low: 0, lurker: 0 };
    const styleCounts: Record<string, number> = {};
    for (const row of profiles) {
      try {
        const p = JSON.parse(row.bot_profile) as { activityLevel?: string; engagementStyle?: string };
        if (p.activityLevel) levelCounts[p.activityLevel] = (levelCounts[p.activityLevel] ?? 0) + 1;
        if (p.engagementStyle) styleCounts[p.engagementStyle] = (styleCounts[p.engagementStyle] ?? 0) + 1;
      } catch {}
    }

    console.log("╠══════════════════════════════════════╣");
    console.log("║  Activity Levels:                    ║");
    for (const [level, count] of Object.entries(levelCounts)) {
      if (count > 0) console.log(`║    ${level.padEnd(10)} ${String(count).padStart(4)} bots              ║`);
    }
    console.log("║  Engagement Styles:                  ║");
    for (const [style, count] of Object.entries(styleCounts)) {
      if (count > 0) console.log(`║    ${style.padEnd(10)} ${String(count).padStart(4)} bots              ║`);
    }
  }

  // Party distribution
  const partyDist = db.prepare(
    "SELECT party_id, COUNT(*) as cnt FROM users WHERE is_bot = 1 AND party_id IS NOT NULL GROUP BY party_id ORDER BY cnt DESC",
  ).all() as Array<{ party_id: string; cnt: number }>;
  const noParty = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE is_bot = 1 AND party_id IS NULL").get() as { cnt: number }).cnt;

  if (partyDist.length > 0) {
    console.log("╠══════════════════════════════════════╣");
    console.log("║  Party Distribution:                 ║");
    for (const { party_id, cnt } of partyDist) {
      console.log(`║    ${party_id.padEnd(10)} ${String(cnt).padStart(4)} bots              ║`);
    }
    console.log(`║    ${"(none)".padEnd(10)} ${String(noParty).padStart(4)} bots              ║`);
  }

  // Recent activity (last 24h)
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const recentActions = db.prepare(`
    SELECT action_type, COUNT(*) as cnt
    FROM user_actions
    WHERE user_id IN (SELECT id FROM users WHERE is_bot = 1)
      AND created_at > ?
    GROUP BY action_type
    ORDER BY cnt DESC
  `).all(oneDayAgo) as Array<{ action_type: string; cnt: number }>;

  const totalRecent = recentActions.reduce((s, r) => s + r.cnt, 0);

  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Last 24h: ${String(totalRecent).padEnd(4)} bot actions          ║`);
  for (const { action_type, cnt } of recentActions.slice(0, 6)) {
    console.log(`║    ${action_type.padEnd(18)} ${String(cnt).padStart(4)}          ║`);
  }

  // Last 7 days daily breakdown
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const dailyActions = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as cnt
    FROM user_actions
    WHERE user_id IN (SELECT id FROM users WHERE is_bot = 1)
      AND created_at > ?
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  `).all(sevenDaysAgo) as Array<{ day: string; cnt: number }>;

  if (dailyActions.length > 0) {
    console.log("╠══════════════════════════════════════╣");
    console.log("║  Daily Activity (7 days):            ║");
    for (const { day, cnt } of dailyActions) {
      const bar = "█".repeat(Math.min(Math.ceil(cnt / 5), 16));
      console.log(`║    ${day} ${bar.padEnd(16)} ${String(cnt).padStart(4)}  ║`);
    }
  }

  console.log("╚══════════════════════════════════════╝");

  db.close();
}

main();
