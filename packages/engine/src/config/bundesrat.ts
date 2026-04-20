/**
 * Bundesrat configuration — static 16-Länder model (Cycle 2a, sub-decisions S1–S4).
 *
 * The real Bundesrat has 69 votes distributed across the 16 Länder per
 * Art. 51 Abs. 2 GG (≤2m inhabitants → 3 / ≤6m → 4 / ≤7m → 5 / >7m → 6).
 * Absolute majority = 35. Governing coalitions seeded from the 2025/2026
 * real distribution; Landtagswahlen simulation is deferred to Cycle 3+.
 *
 * `simParties` is the list of sim-party IDs used for the weighted-ideology
 * Land vote. `realParties` retains the real-world party names for audit and
 * frontend display. Mapping rules (sub-decision S2):
 *   - BSW / Linke-splitter → `linke`
 *   - Freie Wähler → `cdu`
 *   - SSW → excluded from government weight (minority status in SH)
 * Dedup: when both partners map to the same sim-party (Bayern CSU+Freie Wähler
 * → `cdu`), `simParties` collapses to `["cdu"]` so the single-party Land always
 * takes a stance rather than structurally abstaining from ideological spread.
 */

import type { BillCategory, BundesratMode } from "@ki-bundestag/types";

export type { BundesratMode } from "@ki-bundestag/types";

/** Art. 51 Abs. 2 GG total Stimmengewicht. */
export const BUNDESRAT_TOTAL_VOTES = 69;

/** Absolute-majority threshold for Zustimmungsgesetze. */
export const BUNDESRAT_MAJORITY = 35;

/** Intra-coalition ideological-spread cutoff above which a Land abstains. */
export const LAND_ABSTENTION_THRESHOLD = 0.35;

/** Vermittlungsausschuss dwell range (sim days). */
export const VERMITTLUNG_DURATION = { min: 14, max: 56 } as const;

/** Vermittlungsausschuss outcome distribution (viewer-drama tuned, not empirical). */
export const VERMITTLUNG_OUTCOMES = {
  compromise: 0.60,
  bundestagRejects: 0.25,
  bundesratRejects: 0.15,
} as const;

/**
 * BillCategory → Zustimmung/Einspruch classification (sub-decision S1).
 *
 * Zustimmungsbedürftig: categories that carry a Länder-Verwaltung hook.
 * Einspruchsgesetz: categories under federal competence alone.
 *
 * The 4/4 split is a modelling choice, not an empirical fit — realised
 * Zustimmung share depends on AI propose-frequencies per category.
 */
export const BUNDESRAT_MODE_BY_CATEGORY: Record<BillCategory, BundesratMode> = {
  education: "zustimmung",
  healthcare: "zustimmung",
  social: "zustimmung",
  infrastructure: "zustimmung",
  economy: "einspruch",
  environment: "einspruch",
  immigration: "einspruch",
  defense: "einspruch",
};

/** One Land's static governing coalition, vote weight, and sim-party mapping. */
export interface LandConfig {
  id: string;
  name: string;
  votes: 3 | 4 | 5 | 6;
  simParties: string[];
  realParties: string[];
}

/** Sum of votes = 69 (sanity-checked against Art. 51 Abs. 2 GG). */
export const BUNDESRAT_LAENDER: LandConfig[] = [
  { id: "bw", name: "Baden-Württemberg",      votes: 6, simParties: ["gruene", "cdu"],           realParties: ["Grüne", "CDU"] },
  { id: "by", name: "Bayern",                 votes: 6, simParties: ["cdu"],                     realParties: ["CSU", "Freie Wähler"] },
  { id: "be", name: "Berlin",                 votes: 4, simParties: ["cdu", "spd"],              realParties: ["CDU", "SPD"] },
  { id: "bb", name: "Brandenburg",            votes: 4, simParties: ["spd", "linke"],            realParties: ["SPD", "BSW"] },
  { id: "hb", name: "Bremen",                 votes: 3, simParties: ["spd", "gruene", "linke"],  realParties: ["SPD", "Grüne", "Linke"] },
  { id: "hh", name: "Hamburg",                votes: 3, simParties: ["spd", "gruene"],           realParties: ["SPD", "Grüne"] },
  { id: "he", name: "Hessen",                 votes: 5, simParties: ["cdu", "spd"],              realParties: ["CDU", "SPD"] },
  { id: "mv", name: "Mecklenburg-Vorpommern", votes: 3, simParties: ["spd", "linke"],            realParties: ["SPD", "Linke"] },
  { id: "ni", name: "Niedersachsen",          votes: 6, simParties: ["spd", "gruene"],           realParties: ["SPD", "Grüne"] },
  { id: "nw", name: "Nordrhein-Westfalen",    votes: 6, simParties: ["cdu", "gruene"],           realParties: ["CDU", "Grüne"] },
  { id: "rp", name: "Rheinland-Pfalz",        votes: 4, simParties: ["spd", "gruene", "fdp"],    realParties: ["SPD", "Grüne", "FDP"] },
  { id: "sl", name: "Saarland",               votes: 3, simParties: ["spd"],                     realParties: ["SPD"] },
  // Sachsen: CDU+SPD Minderheitsregierung since Sep 2024 (pre-2024 was CDU+SPD+Grüne).
  { id: "sn", name: "Sachsen",                votes: 4, simParties: ["cdu", "spd"],              realParties: ["CDU", "SPD"] },
  { id: "st", name: "Sachsen-Anhalt",         votes: 4, simParties: ["cdu", "spd", "fdp"],       realParties: ["CDU", "SPD", "FDP"] },
  { id: "sh", name: "Schleswig-Holstein",     votes: 4, simParties: ["cdu", "gruene"],           realParties: ["CDU", "Grüne"] },
  { id: "th", name: "Thüringen",              votes: 4, simParties: ["cdu", "spd", "linke"],     realParties: ["CDU", "SPD", "BSW"] },
];
