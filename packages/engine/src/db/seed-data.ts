import type { PolicyPriorities, CoalitionRole } from "@ki-bundestag/types";

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
