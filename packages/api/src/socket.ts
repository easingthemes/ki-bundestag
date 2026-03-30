import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { getDb, schema, getSqlite, logger } from "@ki-bundestag/engine";

let io: Server | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Track last known state to only broadcast on change
let lastStatusJson = "";
let lastEventRowid = 0;

/**
 * Attach Socket.io to an existing HTTP server.
 * Starts a server-side poll that broadcasts changes to all clients,
 * replacing per-client polling with a single DB check.
 */
export function initSocketServer(httpServer: HttpServer, frontendUrl: string): Server {
  io = new Server(httpServer, {
    cors: { origin: frontendUrl, credentials: true },
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    logger.info(`WS client connected (${socket.id})`);

    // Send current state immediately on connect
    const status = getSimStatus();
    if (status) socket.emit("sim:status", status);

    socket.on("disconnect", () => {
      logger.info(`WS client disconnected (${socket.id})`);
    });
  });

  // Initialize last known event rowid
  try {
    const row = getSqlite().prepare("SELECT MAX(rowid) as maxId FROM simulation_events").get() as { maxId: number } | undefined;
    lastEventRowid = row?.maxId ?? 0;
  } catch { /* table may not exist yet */ }

  // Server-side poll: check for changes every 3s, broadcast only when something changed
  pollInterval = setInterval(pollAndBroadcast, 3_000);

  return io;
}

function getSimStatus(): Record<string, unknown> | null {
  try {
    const db = getDb();
    const metaRows = db.select().from(schema.simulationMeta).all();
    if (metaRows.length === 0) return null;
    const meta = metaRows[0];
    const stateRows = db.select().from(schema.nationalState).all();
    const stateRow = stateRows[0];
    return {
      currentDay: meta.currentDay,
      lastRunAt: meta.lastRunAt,
      dayStartedAt: (meta as any).dayStartedAt ?? null,
      nextElectionDay: meta.nextElectionDay,
      budgetRetryDay: (meta as any).budgetRetryDay ?? null,
      provisionalBudget: (stateRow as any)?.provisionalBudget ?? false,
      dailySummary: (meta as any).dailySummary ?? null,
      timingPreset: (meta as any).timingPreset ?? "normal",
      contextDepth: (meta as any).contextDepth ?? "normal",
      startDate: (meta as any).startDate ?? null,
    };
  } catch { return null; }
}

function pollAndBroadcast(): void {
  if (!io || io.engine.clientsCount === 0) return;

  // Check simulation status
  const status = getSimStatus();
  if (status) {
    const json = JSON.stringify(status);
    if (json !== lastStatusJson) {
      lastStatusJson = json;
      io.emit("sim:status", status);
    }
  }

  // Check for new simulation events
  try {
    const simRaw = getSqlite();
    const rows = simRaw.prepare(
      `SELECT rowid, id, day_number, type, actor, title, description, data
       FROM simulation_events
       WHERE rowid > ?
       ORDER BY rowid DESC
       LIMIT 10`
    ).all(lastEventRowid) as Array<{ rowid: number; id: string; day_number: number; type: string; actor: string; title: string; description: string; data: string | null }>;

    if (rows.length > 0) {
      lastEventRowid = Math.max(...rows.map(r => r.rowid));
      const events = rows.map(r => ({
        id: r.id,
        dayNumber: r.day_number,
        type: r.type,
        actor: r.actor,
        title: r.title,
        description: r.description,
        data: r.data ? JSON.parse(r.data) : undefined,
      }));
      io.emit("sim:events", events);
      // New events often mean new notifications — tell clients to refresh
      io.emit("notifications:refresh");
    }
  } catch { /* ignore — table may not exist */ }
}

/** Broadcast notification count refresh signal */
export function broadcastNotificationRefresh(): void {
  io?.emit("notifications:refresh");
}

export function cleanupSocket(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  io?.close();
  io = null;
}
