import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
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

const MONOREPO_ROOT = findMonorepoRoot();

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function getDbPath(): string {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }
  return path.join(MONOREPO_ROOT, "data", "simulation.db");
}

export function getDb() {
  if (!_db) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    _sqlite = new Database(dbPath);
    _sqlite.pragma("journal_mode = WAL");
    _sqlite.pragma("foreign_keys = ON");

    _db = drizzle(_sqlite, { schema });
  }
  return _db;
}

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    getDb(); // initializes both
  }
  return _sqlite!;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
  closeUserDb();
}

// ── User DB (separate file for user-owned tables) ────────────────────────────

let _userDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _userSqlite: Database.Database | null = null;

export function getUserDbPath(): string {
  if (process.env.USER_DATABASE_PATH) {
    return path.resolve(process.env.USER_DATABASE_PATH);
  }
  return path.join(MONOREPO_ROOT, "data", "users.db");
}

export function getUserDb() {
  if (!_userDb) {
    const dbPath = getUserDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    _userSqlite = new Database(dbPath);
    _userSqlite.pragma("journal_mode = WAL");
    _userSqlite.pragma("foreign_keys = ON");

    _userDb = drizzle(_userSqlite, { schema });
  }
  return _userDb;
}

export function getUserSqlite(): Database.Database {
  if (!_userSqlite) {
    getUserDb(); // initializes both
  }
  return _userSqlite!;
}

export function closeUserDb() {
  if (_userSqlite) {
    _userSqlite.close();
    _userSqlite = null;
    _userDb = null;
  }
}

export { schema };
