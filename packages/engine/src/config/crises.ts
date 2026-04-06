/**
 * Crisis system configuration.
 *
 * Defines crisis templates (types, severity, duration, daily impacts)
 * and trigger probabilities.
 */

import type { BillCategory, BillImpact, CrisisSeverity } from "@ki-bundestag/types";

export interface CrisisTemplate {
  id: string;
  name: string;
  description: string;
  category: BillCategory;
  severity: CrisisSeverity;
  durationDays: [number, number]; // [min, max]
  dailyImpact: BillImpact;
}

export const CRISIS_TEMPLATES: CrisisTemplate[] = [
  {
    id: "energiekrise",
    name: "Energiekrise",
    description: "Steigende Energiepreise belasten Haushalte und Industrie. Sofortige Maßnahmen zur Preisstabilisierung werden gefordert.",
    category: "economy",
    severity: "high",
    durationDays: [5, 12],
    dailyImpact: { budget: -0.5, inflation: 0.04, gdpGrowth: -0.02, publicSentiment: -0.8 },
  },
  {
    id: "fluechtlingswelle",
    name: "Flüchtlingswelle",
    description: "Ein starker Anstieg der Asylanträge stellt die Aufnahmekapazitäten auf die Probe und dominiert die politische Debatte.",
    category: "immigration",
    severity: "high",
    durationDays: [7, 14],
    dailyImpact: { budget: -0.3, publicSentiment: -0.6 },
  },
  {
    id: "industrieskandal",
    name: "Industrieskandal",
    description: "Ein großer deutscher Konzern steht wegen Betrug unter Verdacht. Vertrauen in die Wirtschaftsaufsicht sinkt.",
    category: "economy",
    severity: "medium",
    durationDays: [3, 8],
    dailyImpact: { gdpGrowth: -0.02, publicSentiment: -0.5 },
  },
  {
    id: "hochwasser",
    name: "Hochwasserkatastrophe",
    description: "Schwere Überschwemmungen zerstören Infrastruktur in mehreren Bundesländern. Soforthilfe und Wiederaufbau werden gebraucht.",
    category: "infrastructure",
    severity: "high",
    durationDays: [4, 10],
    dailyImpact: { budget: -0.5, unemployment: 0.01, publicSentiment: -0.4 },
  },
  {
    id: "krankenhausnotstand",
    name: "Krankenhausnotstand",
    description: "Personalmangel und Überlastung der Krankenhäuser führen zu Versorgungsengpässen im Gesundheitssystem.",
    category: "healthcare",
    severity: "medium",
    durationDays: [5, 12],
    dailyImpact: { budget: -0.2, publicSentiment: -0.5 },
  },
  {
    id: "cyberangriff",
    name: "Cyberangriff auf Bundesbehörden",
    description: "Ein massiver Cyberangriff legt IT-Systeme mehrerer Bundesbehörden lahm. Sicherheitslücken werden offenbar.",
    category: "defense",
    severity: "medium",
    durationDays: [3, 7],
    dailyImpact: { budget: -0.3, publicSentiment: -0.6 },
  },
  {
    id: "handelsstreit",
    name: "Handelsstreit mit den USA",
    description: "Neue Zölle bedrohen den deutschen Export. Die Automobilindustrie und der Maschinenbau sind besonders betroffen.",
    category: "economy",
    severity: "medium",
    durationDays: [6, 14],
    dailyImpact: { gdpGrowth: -0.04, unemployment: 0.01, publicSentiment: -0.3 },
  },
  {
    id: "protestwelle",
    name: "Protestwelle",
    description: "Landesweite Proteste gegen die Regierungspolitik legen den öffentlichen Verkehr lahm und erhöhen den politischen Druck.",
    category: "social",
    severity: "low",
    durationDays: [3, 7],
    dailyImpact: { publicSentiment: -1.0 },
  },
];

// ── Trigger probabilities ───────────────────────────────────────────
/** Daily crisis trigger probability (non-monthly days) */
export const CRISIS_DAILY_PROBABILITY = 0.08;
/** Monthly crisis trigger probability */
export const CRISIS_MONTHLY_PROBABILITY = 0.25;
/** Maximum concurrent active crises */
export const CRISIS_MAX_CONCURRENT = 2;
