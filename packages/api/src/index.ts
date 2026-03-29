import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { closeDb } from "@ki-bundestag/engine";

import { sessionTracking } from "./middleware/index.js";
import { SQLiteSessionStore } from "./session-store.js";
import { configurePassport } from "./passport-config.js";
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

const app = express();
const PORT = parseInt(process.env.API_PORT || "3001", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Trust reverse proxy (Caddy) so secure cookies work behind HTTPS termination
app.set("trust proxy", 1);

// CORS — allow credentials (cookies) from frontend origin
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// Session middleware — SQLite-backed, HttpOnly cookie
const sessionStore = new SQLiteSessionStore();
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "ki-bundestag-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// Passport OAuth
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(sessionTracking);

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

// Global error handler — must be last middleware, after all routes
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  server.close();
  closeDb();
  process.exit(0);
});
