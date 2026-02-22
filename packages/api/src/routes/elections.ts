import { Router } from "express";
import { getDb, schema, getActiveGovernment } from "@ki-bundestag/engine";
import { eq } from "drizzle-orm";
import type {
  Election,
  ElectionResult,
  NegotiationRound,
  CoalitionAgreement,
  Government,
  Minister,
} from "@ki-bundestag/types";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapElection(row: typeof schema.elections.$inferSelect): Election {
  return {
    id: row.id,
    triggerReason: row.triggerReason,
    announcedOnDay: row.announcedOnDay,
    campaignStartDay: row.campaignStartDay,
    electionDay: row.electionDay,
    status: row.status as Election["status"],
    results: row.results as unknown as ElectionResult[] | null,
    newCoalition: row.newCoalition as unknown as string[] | null,
    newOpposition: row.newOpposition as unknown as string[] | null,
    negotiationRounds: row.negotiationRounds as unknown as NegotiationRound[][] | null,
    coalitionAgreement: row.coalitionAgreement as unknown as CoalitionAgreement | null,
  };
}

function mapGovernmentRow(row: typeof schema.government.$inferSelect): Government {
  return {
    id: row.id,
    electionId: row.electionId,
    chancellorName: row.chancellorName,
    chancellorPartyId: row.chancellorPartyId,
    ministers: row.ministers as unknown as Minister[],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
    active: row.active,
  };
}

// ── Election routes ─────────────────────────────────────────────────────────

// GET /api/elections
router.get("/api/elections", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((e: any) => e.status === status) : allRows;
  const elections: Election[] = rows.map(mapElection);
  res.json(elections);
});

// GET /api/elections/active
router.get("/api/elections/active", (_req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const active = allRows.find((e: any) => e.status !== "completed" && e.status !== "invalidated");
  res.json(active ? mapElection(active) : null);
});

// GET /api/elections/:id
router.get("/api/elections/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.elections).where(eq(schema.elections.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  res.json(mapElection(rows[0]));
});

// ── Government routes ───────────────────────────────────────────────────────

// GET /api/government
router.get("/api/government", (_req, res) => {
  const gov = getActiveGovernment();
  res.json(gov);
});

// GET /api/government/history
router.get("/api/government/history", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.government).all();
  const govs: Government[] = rows.map(mapGovernmentRow);
  govs.sort((a, b) => b.formedOnDay - a.formedOnDay);
  res.json(govs);
});

export default router;
