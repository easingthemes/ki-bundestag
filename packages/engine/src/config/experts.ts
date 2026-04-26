/**
 * Cycle 5 PR 1 — Expert pool for Ausschussanhörungen + (PR 2) Enquete-Kommissionen.
 *
 * S2: ~30 named real public-figure German policy experts who routinely appear
 * at Bundestag-Anhörungen. Real institutional affiliations (DIW, Sachverstän-
 * digenrat, IfW, RWI, ZEW, IW, ifo, WZB, SWP, DGAP, GIGA, PIK, MCC, Charité,
 * Bundesbank, DIfU, DLR, KIT, MPI, Hertie, Bertelsmann, AwO, Caritas, BUND,
 * Deutsches Jugendinstitut, Wuppertal Institut, …).
 *
 * R5: Affiliations age — people change institutions. Annual review cadence
 * recommended; current as of 2026-04. Surfaced as a Cycle 6+ open item.
 *
 * Invariant (test-asserted in `experts-seed.test.ts`): every MinistryPortfolio
 * value in MINISTRY_PORTFOLIOS is covered by ≥3 experts via expertise_areas
 * overlap. Required at runtime by `pickExpertsForHearing` (S5 throws if pool
 * < ANHOERUNG_EXPERTS_PER_HEARING).
 */

import type { MinistryPortfolio } from "@ki-bundestag/types";

export interface ExpertSeedRow {
  id: string;
  name: string;
  affiliation: string;
  expertiseAreas: MinistryPortfolio[];
}

export const EXPERTS_SEED: readonly ExpertSeedRow[] = [
  // ── Finance / fiscal-policy economists (Sachverständigenrat, ifo, DIW, …) ──
  { id: "expert-diw-fratzscher",     name: "Prof. Dr. Marcel Fratzscher",  affiliation: "DIW Berlin",                              expertiseAreas: ["finance", "labour"] },
  { id: "expert-svr-grimm",          name: "Prof. Dr. Veronika Grimm",     affiliation: "Sachverständigenrat / FAU Erlangen",      expertiseAreas: ["finance", "environment"] },
  { id: "expert-svr-truger",         name: "Prof. Dr. Achim Truger",       affiliation: "Sachverständigenrat / Univ. Duisburg-Essen", expertiseAreas: ["finance", "labour"] },
  { id: "expert-svr-schnitzer",      name: "Prof. Dr. Monika Schnitzer",   affiliation: "Sachverständigenrat / LMU München",       expertiseAreas: ["finance"] },
  { id: "expert-svr-wieland",        name: "Prof. Dr. Volker Wieland",     affiliation: "Goethe-Universität Frankfurt",            expertiseAreas: ["finance"] },
  { id: "expert-ifw-schularick",     name: "Prof. Dr. Moritz Schularick",  affiliation: "IfW Kiel",                                expertiseAreas: ["finance", "infrastructure"] },
  { id: "expert-rwi-schmidt",        name: "Prof. Dr. Christoph Schmidt",  affiliation: "RWI Essen",                               expertiseAreas: ["finance", "labour"] },
  { id: "expert-zew-wambach",        name: "Prof. Dr. Achim Wambach",      affiliation: "ZEW Mannheim",                            expertiseAreas: ["finance", "education"] },
  { id: "expert-iw-huether",         name: "Prof. Dr. Michael Hüther",     affiliation: "IW Köln",                                 expertiseAreas: ["finance", "labour"] },
  { id: "expert-ifo-fuest",          name: "Prof. Dr. Clemens Fuest",      affiliation: "ifo Institut",                            expertiseAreas: ["finance"] },
  { id: "expert-bundesbank-nagel",   name: "Dr. Joachim Nagel",            affiliation: "Bundesbank",                              expertiseAreas: ["finance"] },
  { id: "expert-ifo-potrafke",       name: "Prof. Dr. Niklas Potrafke",    affiliation: "ifo Institut (Public Finance)",           expertiseAreas: ["finance"] },

  // ── Labour / social policy / family ───────────────────────────────────────
  { id: "expert-wzb-allmendinger",   name: "Prof. Dr. Jutta Allmendinger", affiliation: "WZB Berlin",                              expertiseAreas: ["labour", "education", "health"] },
  { id: "expert-awo-gross",          name: "Dr. Michael Groß",             affiliation: "AwO Bundesverband",                       expertiseAreas: ["labour", "health"] },
  { id: "expert-caritas-welskop",    name: "Eva Welskop-Deffaa",           affiliation: "Caritas",                                 expertiseAreas: ["labour", "health"] },
  { id: "expert-dji-walper",         name: "Prof. Dr. Sabine Walper",      affiliation: "Deutsches Jugendinstitut (DJI)",          expertiseAreas: ["labour", "education"] },

  // ── Environment / climate / energy ────────────────────────────────────────
  { id: "expert-pik-edenhofer",      name: "Prof. Dr. Ottmar Edenhofer",   affiliation: "Potsdam-Institut PIK",                    expertiseAreas: ["environment", "finance"] },
  { id: "expert-mcc-creutzig",       name: "Prof. Dr. Felix Creutzig",     affiliation: "MCC Berlin",                              expertiseAreas: ["environment", "infrastructure"] },
  { id: "expert-diw-kemfert",        name: "Prof. Dr. Claudia Kemfert",    affiliation: "DIW Berlin (Energy)",                     expertiseAreas: ["environment", "finance"] },
  { id: "expert-bund-bandt",         name: "Olaf Bandt",                   affiliation: "BUND Bundesverband",                      expertiseAreas: ["environment"] },
  { id: "expert-wuppertal-fischedick", name: "Prof. Dr. Manfred Fischedick", affiliation: "Wuppertal Institut",                    expertiseAreas: ["environment", "infrastructure"] },

  // ── Defence / foreign policy ──────────────────────────────────────────────
  { id: "expert-swp-perthes",        name: "Dr. Volker Perthes",           affiliation: "SWP Berlin",                              expertiseAreas: ["defence", "interior"] },
  { id: "expert-dgap-schwarzer",     name: "Dr. Daniela Schwarzer",        affiliation: "DGAP",                                    expertiseAreas: ["defence"] },
  { id: "expert-hertie-lenz",        name: "Prof. Dr. Anna Lührmann",      affiliation: "Hertie School",                           expertiseAreas: ["defence", "interior"] },
  { id: "expert-giga-hofmeister",    name: "Prof. Dr. Heribert Dieter",    affiliation: "GIGA Hamburg",                            expertiseAreas: ["defence", "interior"] },

  // ── Interior / justice / security / law ───────────────────────────────────
  { id: "expert-mpi-strafrecht",     name: "Prof. Dr. Tatjana Hörnle",     affiliation: "MPI Strafrecht Freiburg",                 expertiseAreas: ["interior"] },
  { id: "expert-mpi-voelkerrecht",   name: "Prof. Dr. Anne Peters",        affiliation: "MPI Völkerrecht Heidelberg",              expertiseAreas: ["interior", "defence"] },
  { id: "expert-uni-freiburg-mehler", name: "Prof. Dr. Andreas Mehler",    affiliation: "Universität Freiburg / Arnold-Bergstraesser-Institut", expertiseAreas: ["interior"] },

  // ── Education / Bildungsforschung ─────────────────────────────────────────
  { id: "expert-mpib-trautwein",     name: "Prof. Dr. Ulrich Trautwein",   affiliation: "Universität Tübingen / Bildungsforschung", expertiseAreas: ["education"] },
  { id: "expert-dipf-koeller",       name: "Prof. Dr. Olaf Köller",        affiliation: "IPN Kiel / Bildungsmonitoring",           expertiseAreas: ["education"] },
  { id: "expert-bertelsmann-bildung", name: "Dr. Jörg Dräger",             affiliation: "Bertelsmann Stiftung (Bildung)",          expertiseAreas: ["education"] },

  // ── Health / public health / Gesundheitsökonomie ──────────────────────────
  { id: "expert-uni-bonn-streeck",   name: "Prof. Dr. Hendrik Streeck",    affiliation: "Universität Bonn / Virologie",            expertiseAreas: ["health"] },
  { id: "expert-charite-kroemer",    name: "Prof. Dr. Heyo Kroemer",       affiliation: "Charité Berlin",                          expertiseAreas: ["health"] },
  { id: "expert-bertelsmann-etgeton", name: "Dr. Stefan Etgeton",          affiliation: "Bertelsmann Stiftung (Gesundheit)",       expertiseAreas: ["health", "labour"] },

  // ── Infrastructure / Verkehr / Stadtentwicklung ───────────────────────────
  { id: "expert-difu-libbe",         name: "Dr. Jens Libbe",               affiliation: "Deutsches Institut für Urbanistik (DIfU)", expertiseAreas: ["infrastructure"] },
  { id: "expert-dlr-verkehr",        name: "Prof. Dr. Barbara Lenz",       affiliation: "DLR Verkehrsforschung",                   expertiseAreas: ["infrastructure"] },
  { id: "expert-kit-vortisch",       name: "Prof. Dr. Peter Vortisch",     affiliation: "KIT Karlsruhe / Verkehrswesen",           expertiseAreas: ["infrastructure"] },
];
