/**
 * Lightweight logger utility.
 * Disabled in production (NODE_ENV === "production") unless LOG_LEVEL is set.
 * Levels: debug < info < warn < error
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_RANK) return env;
  return process.env.NODE_ENV === "production" ? "warn" : "debug";
}

let currentLevel = resolveLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[currentLevel];
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) console.log(`[DEBUG] ${message}`, ...args);
  },
  info(message: string, ...args: unknown[]): void {
    if (shouldLog("info")) console.log(`[INFO] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) console.warn(`[WARN] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    if (shouldLog("error")) console.error(`[ERROR] ${message}`, ...args);
  },
  /** Reset level (useful after env changes in tests) */
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },
};
