import { eq } from "drizzle-orm";
import type { Bill, Party, SimulationEvent } from "@ki-bundestag/types";
import { getDb, schema } from "../db/index.js";
import { shouldPresidentVeto } from "./budget.js";
import { VETO_PROPOSER_APPROVAL_PENALTY } from "../config/index.js";
import { clampApproval } from "./opinion.js";

/**
 * Presidential veto check on a bill that just passed third reading.
 *
 * Probability: two-stage filter — impact gate (summed |bill.impact|
 * >= 0.6) + capped 0.05% probability. Calibrated to match the real
 * ≈0.04% Bundespräsident veto rate (Cycle 3 PR 1, Q2 hybrid).
 * On veto: marks bill as rejected with vetoedByPresident, deducts 0.5 approval
 * from the proposing party, and emits a presidential_veto simulation event.
 *
 * Returns true if vetoed (so the caller skips applying bill economic impact).
 */
export function checkPresidentialVeto(
  bill: Bill,
  parties: Party[],
  currentDay: number,
): { vetoed: boolean; events: Array<Omit<SimulationEvent, "id">> } {
  const db = getDb();
  const { veto, reason } = shouldPresidentVeto(bill);
  const events: Array<Omit<SimulationEvent, "id">> = [];

  if (veto) {
    db.update(schema.bills)
      .set({ status: "rejected", vetoedByPresident: true })
      .where(eq(schema.bills.id, bill.id))
      .run();

    events.push({
      dayNumber: currentDay,
      type: "presidential_veto",
      actor: "system",
      title: `Bundespräsident legt Veto ein gegen "${bill.title}"`,
      description: reason,
      data: { billId: bill.id },
    });

    const proposer = parties.find(p => p.id === bill.proposedBy);
    if (proposer) {
      proposer.approvalRating = clampApproval(proposer.approvalRating - VETO_PROPOSER_APPROVAL_PENALTY);
    }

    console.log(`  [President] Veto: "${bill.title}"`);
  }

  return { vetoed: veto, events };
}
