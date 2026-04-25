import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import passport from "passport";
import { closeDb, logger } from "@ki-bundestag/engine";

import { sessionTracking, flushLastActive } from "./middleware/index.js";
import { voteLimiter, actionLimiter, adminLimiter } from "./middleware/rate-limit.js";
import { SQLiteSessionStore } from "./session-store.js";
import { configurePassport } from "./passport-config.js";
import { initSocketServer, cleanupSocket } from "./socket.js";
import authRouter from "./routes/auth.js";
import partiesRouter from "./routes/parties.js";
import billsRouter from "./routes/bills.js";
import electionsRouter from "./routes/elections.js";
import simulationRouter from "./routes/simulation.js";
import parliamentRouter from "./routes/parliament.js";
import contentRouter from "./routes/content.js";
import usersRouter from "./routes/users.js";
import seatsRouter from "./routes/seats.js";
import budgetRouter from "./routes/budget.js";
import adminRouter from "./routes/admin.js";
import quizRouter from "./routes/quiz.js";
import markdownRouter from "./routes/markdown.js";
import petitionsRouter from "./routes/petitions.js";

const app = express();
const PORT = parseInt(process.env.API_PORT || "3001", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Validate FRONTEND_URL is a proper origin (not wildcard)
if (FRONTEND_URL === "*") {
  throw new Error("FRONTEND_URL must be a specific origin, not '*'");
}

// Warn if SESSION_SECRET is not set in production
const isProd = process.env.NODE_ENV === "production";
if (isProd && !process.env.SESSION_SECRET) {
  logger.warn("SESSION_SECRET is not set — using default. Set this env var in production!");
}

// Trust reverse proxy (Caddy) so secure cookies work behind HTTPS termination
app.set("trust proxy", 1);

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: false, // CSP managed separately or by reverse proxy
  crossOriginEmbedderPolicy: false, // allow loading cross-origin images (OAuth avatars)
}));

// CORS — allow credentials (cookies) from frontend origin
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// Session middleware — SQLite-backed, HttpOnly cookie
const sessionStore = new SQLiteSessionStore();

// Prune expired sessions every 30 minutes
const pruneInterval = setInterval(() => sessionStore.prune(), 30 * 60 * 1000);

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "ki-bundestag-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
  },
}));

// Passport OAuth
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(sessionTracking);

// Rate limiting — POST-only for user actions, all methods for admin brute-force protection
app.post("/api/polls/:id/vote", voteLimiter);
app.post("/api/questions/:id/vote", voteLimiter);
app.post("/api/referendums/:id/vote", voteLimiter);
app.post("/api/questions", actionLimiter);
app.use("/api/admin", adminLimiter);
app.use("/api/simulation/preset", adminLimiter);
app.use("/api/simulate", adminLimiter);

// Mount domain routers
app.use(authRouter);
app.use(partiesRouter);
app.use(billsRouter);
app.use(electionsRouter);
app.use(simulationRouter);
app.use(parliamentRouter);
app.use(contentRouter);
app.use(usersRouter);
app.use(seatsRouter);
app.use(budgetRouter);
app.use(adminRouter);
app.use(quizRouter);
app.use(markdownRouter);
app.use(petitionsRouter);

// Global error handler — must be last middleware, after all routes
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`);
});

// Attach Socket.io to the HTTP server
initSocketServer(server, FRONTEND_URL);

process.on("SIGINT", () => {
  clearInterval(pruneInterval);
  flushLastActive();
  cleanupSocket();
  server.close();
  closeDb();
  process.exit(0);
});
