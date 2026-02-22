import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@ki-bundestag/engine";
import type { Budget, BudgetAllocations, BudgetVote } from "@ki-bundestag/types";

const router = Router();

function mapBudgetRow(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id: row.id,
    cycleNumber: row.cycleNumber,
    status: row.status as Budget["status"],
    allocations: row.allocations as unknown as BudgetAllocations,
    totalAmount: row.totalAmount,
    proposedOnDay: row.proposedOnDay,
    votedOnDay: row.votedOnDay ?? null,
    votes: (row.votes as unknown as BudgetVote[]) ?? [],
    yesSeats: row.yesSeats ?? null,
    noSeats: row.noSeats ?? null,
    economicEffect: row.economicEffect as unknown as Record<string, number> | null,
    revisionAttempt: (row as any).revisionAttempt ?? 0,
  };
}

// GET /api/budgets(?status=)
router.get("/api/budgets", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.budgets).all();
  const statusFilter = req.query.status as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((r: any) => r.status === statusFilter);
  const budgets: Budget[] = rows.map(mapBudgetRow);
  budgets.sort((a, b) => b.proposedOnDay - a.proposedOnDay);
  res.json(budgets);
});

// GET /api/budgets/:id
router.get("/api/budgets/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.budgets)
    .where(eq(schema.budgets.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(mapBudgetRow(rows[0]));
});

export default router;
