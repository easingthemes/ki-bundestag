import session from "express-session";
import { getUserSqlite } from "@ki-bundestag/engine";

/**
 * SQLite-backed session store using the existing better-sqlite3 user database.
 * Sessions table is created by DDL/migration in engine.
 */
export class SQLiteSessionStore extends session.Store {
  private ensured = false;

  private db() {
    const raw = getUserSqlite();
    if (!this.ensured) {
      raw.exec(`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired INTEGER NOT NULL)`);
      raw.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)`);
      this.ensured = true;
    }
    return raw;
  }

  get(sid: string, cb: (err?: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = this.db().prepare("SELECT sess FROM sessions WHERE sid = ? AND expired > ?").get(sid, Date.now()) as { sess: string } | undefined;
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) { cb(err); }
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    try {
      const maxAge = sess.cookie?.maxAge ?? 86400000;
      const expired = Date.now() + maxAge;
      this.db().prepare("INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)").run(sid, JSON.stringify(sess), expired);
      cb?.();
    } catch (err) { cb?.(err); }
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    try {
      this.db().prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      cb?.();
    } catch (err) { cb?.(err); }
  }

  /** Remove expired sessions (call periodically if desired). */
  prune(): void {
    try {
      this.db().prepare("DELETE FROM sessions WHERE expired < ?").run(Date.now());
    } catch { /* ignore */ }
  }
}
