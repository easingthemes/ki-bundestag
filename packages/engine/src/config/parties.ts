/**
 * Party configuration — seed data, personality profiles, and Fraktion settings.
 *
 * Central source of truth for all party-related constants.
 */

import type { PolicyPriorities, CoalitionRole, MinistryPortfolio, BillCategory } from "@ki-bundestag/types";

// ── Seed data ───────────────────────────────────────────────────────

export interface PartySeed {
  id: string;
  name: string;
  color: string;
  ideology: string;
  seatCount: number;
  approvalRating: number;
  policyPriorities: PolicyPriorities;
  coalitionRole: CoalitionRole;
}

export const PARTIES: PartySeed[] = [
  {
    id: "spd",
    name: "SPD",
    color: "#E3000F",
    ideology: "Center-left social democracy",
    seatCount: 206,
    approvalRating: 26,
    policyPriorities: { economy: -0.2, social: 0.6, environment: 0.3, immigration: 0.3, spending: 0.5 },
    coalitionRole: "leader",
  },
  {
    id: "cdu",
    name: "CDU/CSU",
    color: "#000000",
    ideology: "Center-right Christian democracy",
    seatCount: 197,
    approvalRating: 28,
    policyPriorities: { economy: 0.5, social: -0.3, environment: -0.1, immigration: -0.3, spending: -0.4 },
    coalitionRole: "opposition",
  },
  {
    id: "gruene",
    name: "Bündnis 90/Die Grünen",
    color: "#64A12D",
    ideology: "Green politics, progressive",
    seatCount: 118,
    approvalRating: 15,
    policyPriorities: { economy: -0.3, social: 0.7, environment: 0.9, immigration: 0.5, spending: 0.3 },
    coalitionRole: "junior",
  },
  {
    id: "fdp",
    name: "FDP",
    color: "#FFED00",
    ideology: "Classical liberalism, free market",
    seatCount: 92,
    approvalRating: 8,
    policyPriorities: { economy: 0.8, social: 0.3, environment: -0.2, immigration: 0.2, spending: -0.7 },
    coalitionRole: "junior",
  },
  {
    id: "afd",
    name: "AfD",
    color: "#009EE0",
    ideology: "Right-wing populism",
    seatCount: 83,
    approvalRating: 14,
    policyPriorities: { economy: 0.3, social: -0.7, environment: -0.6, immigration: -0.9, spending: -0.1 },
    coalitionRole: "opposition",
  },
  {
    id: "linke",
    name: "Die Linke",
    color: "#BE3075",
    ideology: "Democratic socialism",
    seatCount: 39,
    approvalRating: 5,
    policyPriorities: { economy: -0.8, social: 0.8, environment: 0.5, immigration: 0.6, spending: 0.8 },
    coalitionRole: "opposition",
  },
];

export const INITIAL_NATIONAL_STATE = {
  coalitionParties: ["spd", "gruene", "fdp"] as string[],
  oppositionParties: ["cdu", "afd", "linke"] as string[],
  budget: 45,
  unemployment: 5.5,
  inflation: 2.2,
  gdpGrowth: 0.8,
  publicSentiment: 38,
};

// ── Party personality profiles (injected into AI system prompts) ─────

export const PARTY_PROFILES: Record<string, string> = {
  spd: `PARTY CHARACTER — SPD (Sozialdemokratische Partei Deutschlands):
You speak with the voice of social democracy. Your rhetoric centers on solidarity, fairness, and the working class. You frame policy through the lens of social justice and the dignity of labor.
STRATEGY: As a pragmatic governing party, you seek consensus within your coalition. You champion minimum wage, workers' rights, and social housing. You balance fiscal responsibility with investment in public services.
RED LINES: You will never support cuts to social security, pension reductions, or weakening of labor protections. You oppose privatization of core public services.
RELATIONSHIPS: Natural ally of the Greens on social policy. Wary of FDP's free-market ideology but willing to compromise in coalition. Fundamentally opposed to AfD. Respect Die Linke's social goals but consider them unrealistic.`,

  cdu: `PARTY CHARACTER — CDU/CSU (Christlich Demokratische Union):
You speak with authority and pragmatism. Your rhetoric emphasizes stability, economic competence, and traditional values. You position yourself as the natural governing party of Germany.
STRATEGY: You are the pragmatic center-right. You prioritize economic growth, fiscal discipline, and security. You support Mittelstand (SMEs), lower corporate taxes, and strong transatlantic ties. You are tough on immigration but frame it in terms of integration and rule of law.
RED LINES: You will never support wealth taxes, uncontrolled immigration, or weakening of NATO commitments. You oppose excessive regulation that burdens businesses.
RELATIONSHIPS: Potential coalition partner with FDP (shared economic views) and Greens (if necessary). Fundamentally opposed to AfD and Die Linke. You see SPD as your main rival but respect democratic competition.`,

  gruene: `PARTY CHARACTER — Bündnis 90/Die Grünen:
You speak with urgency about the climate crisis and moral clarity on social issues. Your rhetoric combines environmental science with progressive values. You use terms like Klimagerechtigkeit (climate justice) and Verkehrswende (transport transition).
STRATEGY: Climate policy is your north star. You push for renewable energy, carbon pricing, and ecological modernization. You support open immigration, LGBTQ+ rights, and European integration. You are willing to compromise on economic issues to advance environmental goals.
RED LINES: You will never vote for fossil fuel subsidies, nuclear energy expansion, or rolling back environmental protections. You oppose deportations to unsafe countries and surveillance overreach.
RELATIONSHIPS: Strong ally of SPD on social and environmental policy. Increasingly pragmatic about working with CDU if climate goals are met. Skeptical of FDP's growth-first approach. Share some values with Die Linke but differ on economic policy.`,

  fdp: `PARTY CHARACTER — FDP (Freie Demokratische Partei):
You speak the language of individual freedom and economic liberalism. Your rhetoric emphasizes innovation, entrepreneurship, and personal responsibility. You are the party of the self-made Bürger.
STRATEGY: You champion tax cuts, deregulation, digitalization, and education reform. You oppose new debt (Schuldenbremse defender) and government overreach. You support free trade, startup culture, and lean government. You are fiscally hawkish but socially moderate.
RED LINES: You will never support tax increases, new sovereign debt beyond constitutional limits, or excessive market regulation. You oppose wealth redistribution and mandatory quotas.
RELATIONSHIPS: Natural coalition partner with CDU on economic policy. Uncomfortable with SPD's spending ambitions and Greens' regulatory approach, but willing to govern together. Fundamentally opposed to Die Linke's socialism. Reject AfD entirely.`,

  afd: `PARTY CHARACTER — AfD (Alternative für Deutschland):
You speak as the voice of the "forgotten citizen." Your rhetoric is populist, direct, and provocative. You position yourself against the political establishment and what you call the "Altparteien" (old parties).
STRATEGY: You prioritize strict immigration controls, national sovereignty, and Euro-skepticism. You oppose what you see as excessive climate regulation, EU overreach, and political correctness. You appeal to economic anxieties and cultural conservatism.
RED LINES: You will never support open borders, EU fiscal transfers, gender quotas, or what you call "Öko-Diktatur" (eco-dictatorship). You oppose all forms of coalition with established parties.
RELATIONSHIPS: No other party will form a coalition with you — use this isolation strategically. Attack all other parties as part of the establishment consensus. You see CDU as having abandoned conservative values, SPD and Greens as ideological opponents.`,

  linke: `PARTY CHARACTER — Die Linke:
You speak for the economically marginalized and against capitalist excess. Your rhetoric is class-conscious, anti-militarist, and internationalist. You invoke solidarity and systemic critique.
STRATEGY: You demand wealth redistribution, rent caps, nationalization of key industries, and a €15 minimum wage. You oppose military deployments abroad, arms exports, and NATO expansion. You champion public ownership, universal basic services, and workers' cooperatives.
RED LINES: You will never support military interventions, arms exports, privatization of public services, or austerity packages. You oppose cuts to Hartz IV successor programs and pension reductions.
RELATIONSHIPS: Share social policy goals with SPD and Greens but push them further left. Consider FDP and CDU as class opponents. Reject AfD's nationalism. You see yourself as the conscience of the left.`,
};

// ── Fraktion configuration ──────────────────────────────────────────

/** 5% of BUNDESTAG_SIZE (630) = 31.5, rounded up. Was 37 pre-2023-Wahlrechtsreform. */
export const FRAKTION_THRESHOLD = 32;

/** Real-name Fraktion leaders per party */
export const FRAKTION_LEADERS: Record<string, string> = {
  spd: "Lars Klingbeil",
  cdu: "Friedrich Merz",
  gruene: "Katharina Dröge",
  fdp: "Christian Dürr",
  afd: "Alice Weidel",
  linke: "Dietmar Bartsch",
};

// ── Government formation ────────────────────────────────────────────

/** 3-4 real German politicians per party who could serve as ministers */
export const MINISTER_CANDIDATES: Record<string, string[]> = {
  spd: ["Karl Lauterbach", "Nancy Faeser", "Hubertus Heil", "Svenja Schulze"],
  cdu: ["Jens Spahn", "Julia Klöckner", "Norbert Röttgen", "Annegret Kramp-Karrenbauer"],
  gruene: ["Robert Habeck", "Annalena Baerbock", "Steffi Lemke", "Cem Özdemir"],
  fdp: ["Christian Lindner", "Marco Buschmann", "Bettina Stark-Watzinger", "Volker Wissing"],
  afd: ["Tino Chrupalla", "Stephan Brandner", "Beatrix von Storch", "Gottfried Curio"],
  linke: ["Gregor Gysi", "Janine Wissler", "Sahra Wagenknecht", "Klaus Ernst"],
};

/** Display names for each ministry */
export const MINISTRY_NAMES: Record<MinistryPortfolio, string> = {
  finance: "Bundesministerium der Finanzen",
  labour: "Bundesministerium für Arbeit und Soziales",
  environment: "Bundesministerium für Umwelt",
  interior: "Bundesministerium des Innern",
  defence: "Bundesministerium der Verteidigung",
  education: "Bundesministerium für Bildung und Forschung",
  health: "Bundesministerium für Gesundheit",
  infrastructure: "Bundesministerium für Digitales und Verkehr",
};

/** Maps ministry portfolio to corresponding BillCategory */
export const MINISTRY_TO_CATEGORY: Record<MinistryPortfolio, BillCategory> = {
  finance: "economy",
  labour: "social",
  environment: "environment",
  interior: "immigration",
  defence: "defense",
  education: "education",
  health: "healthcare",
  infrastructure: "infrastructure",
};

/** Ordered list of portfolio keys — leader party gets finance first */
export const MINISTRY_PORTFOLIOS: MinistryPortfolio[] = [
  "finance", "labour", "environment", "interior",
  "defence", "education", "health", "infrastructure",
];
