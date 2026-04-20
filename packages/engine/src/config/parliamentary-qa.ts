/**
 * Cycle 2b — Regierungsbefragung + Fragestunde configuration.
 *
 * Shared module for both weekly parliamentary-QA sessions. Questions come
 * from a static German-language pool indexed by BillCategory + ministry.
 * Ministers are derived at session time from `government.ministers` with
 * `MINISTRY_FALLBACK_PARTY` used only when the cabinet slot is empty.
 *
 * Also houses the Schriftliche-Einzelfragen config used by PR 7 — keeps
 * both citizen-volume configs in one place to minimise cross-file churn.
 */

import type { BillCategory, MinistryPortfolio } from "@ki-bundestag/types";

// ── Parliamentary-QA session shapes ────────────────────────────────────

export const REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION = { min: 2, max: 3 } as const;
export const FRAGESTUNDE_QUESTIONS_PER_SESSION = { min: 2, max: 3 } as const;

/** Max retries for a failed batch parse before we fill in fallback answer text. */
export const PARLIAMENTARY_QA_MAX_BATCH_ATTEMPTS = 3;

/** Sentinel text used when the AI batch fails and we still need to emit an event. */
export const PARLIAMENTARY_QA_FALLBACK_ANSWER =
  "Die Bundesregierung wird diese Frage schriftlich beantworten.";

// ── MdB question pool ──────────────────────────────────────────────────

/**
 * Static German-language MdB-question pool. 6 entries × 8 BillCategory
 * slots = 48 questions. Each carries its preferred ministry portfolio,
 * which drives minister-party derivation at session time.
 *
 * Templates are intentionally generic so they stay recognisable over
 * many sim terms. Topical phrasing is P2+ polish.
 */
export interface MdbQuestionTemplate {
  id: string;
  category: BillCategory;
  ministry: MinistryPortfolio;
  text: string;
}

export const MDB_QUESTION_POOL: MdbQuestionTemplate[] = [
  // economy → finance
  { id: "eco-1", category: "economy", ministry: "finance", text: "Wie bewertet die Bundesregierung die aktuelle Wirtschaftslage und welche Maßnahmen plant sie?" },
  { id: "eco-2", category: "economy", ministry: "finance", text: "Welche Schritte unternimmt das Bundesfinanzministerium gegen die Inflation?" },
  { id: "eco-3", category: "economy", ministry: "finance", text: "Wie will die Bundesregierung kleine und mittelständische Unternehmen stärker entlasten?" },
  { id: "eco-4", category: "economy", ministry: "finance", text: "Welche Auswirkungen hat die Schuldenbremse auf die geplanten Investitionen?" },
  { id: "eco-5", category: "economy", ministry: "finance", text: "Was tut die Bundesregierung gegen den Fachkräftemangel in der Industrie?" },
  { id: "eco-6", category: "economy", ministry: "finance", text: "Wie gedenkt die Bundesregierung die Steuerlast für mittlere Einkommen zu senken?" },

  // social → labour
  { id: "soc-1", category: "social", ministry: "labour", text: "Welche Maßnahmen plant die Bundesregierung gegen die wachsende Armut?" },
  { id: "soc-2", category: "social", ministry: "labour", text: "Wie bewertet das Bundesarbeitsministerium die Entwicklung des Mindestlohns?" },
  { id: "soc-3", category: "social", ministry: "labour", text: "Welche Reformen sind bei der Rente geplant?" },
  { id: "soc-4", category: "social", ministry: "labour", text: "Was unternimmt die Bundesregierung gegen Wohnungsmangel in Ballungsräumen?" },
  { id: "soc-5", category: "social", ministry: "labour", text: "Wie will die Bundesregierung Alleinerziehende besser unterstützen?" },
  { id: "soc-6", category: "social", ministry: "labour", text: "Welche Perspektive hat das Bürgergeld unter den aktuellen Haushaltsbedingungen?" },

  // environment → environment
  { id: "env-1", category: "environment", ministry: "environment", text: "Wie steht die Bundesregierung zum Tempo der Energiewende?" },
  { id: "env-2", category: "environment", ministry: "environment", text: "Welche Klimaziele hält die Bundesregierung für realistisch erreichbar?" },
  { id: "env-3", category: "environment", ministry: "environment", text: "Welche Maßnahmen sind gegen Lebensmittelverschwendung geplant?" },
  { id: "env-4", category: "environment", ministry: "environment", text: "Wie bewertet das Umweltministerium den Stand der Verkehrswende?" },
  { id: "env-5", category: "environment", ministry: "environment", text: "Plant die Bundesregierung eine Reform der CO2-Bepreisung?" },
  { id: "env-6", category: "environment", ministry: "environment", text: "Welche Strategie verfolgt die Bundesregierung im Artenschutz?" },

  // immigration → interior
  { id: "imm-1", category: "immigration", ministry: "interior", text: "Wie bewertet das Bundesinnenministerium die aktuellen Asylzahlen?" },
  { id: "imm-2", category: "immigration", ministry: "interior", text: "Welche Reformen sind beim Staatsbürgerschaftsrecht geplant?" },
  { id: "imm-3", category: "immigration", ministry: "interior", text: "Wie will die Bundesregierung Rückführungen rechtssicher beschleunigen?" },
  { id: "imm-4", category: "immigration", ministry: "interior", text: "Welche Maßnahmen plant die Bundesregierung gegen Fachkräftemangel durch gezielte Zuwanderung?" },
  { id: "imm-5", category: "immigration", ministry: "interior", text: "Wie bewertet die Bundesregierung die europäische Migrationspolitik?" },
  { id: "imm-6", category: "immigration", ministry: "interior", text: "Welche Schritte unternimmt das Innenministerium gegen rechtsextreme Netzwerke?" },

  // defense → defence
  { id: "def-1", category: "defense", ministry: "defence", text: "Wie bewertet die Bundesregierung den Zustand der Bundeswehr?" },
  { id: "def-2", category: "defense", ministry: "defence", text: "Welche Schritte folgen auf das Sondervermögen Bundeswehr?" },
  { id: "def-3", category: "defense", ministry: "defence", text: "Wie positioniert sich die Bundesregierung zur NATO-Osterweiterung?" },
  { id: "def-4", category: "defense", ministry: "defence", text: "Plant die Bundesregierung eine Wiedereinführung der Wehrpflicht?" },
  { id: "def-5", category: "defense", ministry: "defence", text: "Welche Rüstungsexporte hält die Bundesregierung derzeit für vertretbar?" },
  { id: "def-6", category: "defense", ministry: "defence", text: "Wie bewertet das Verteidigungsministerium die Cyberabwehrfähigkeiten Deutschlands?" },

  // education → education
  { id: "edu-1", category: "education", ministry: "education", text: "Welche Mittel plant die Bundesregierung zur Sanierung maroder Schulen?" },
  { id: "edu-2", category: "education", ministry: "education", text: "Wie positioniert sich das Bildungsministerium zum BAföG-Bedarfssatz?" },
  { id: "edu-3", category: "education", ministry: "education", text: "Welche Maßnahmen gegen den Lehrkräftemangel sind vorgesehen?" },
  { id: "edu-4", category: "education", ministry: "education", text: "Wie bewertet die Bundesregierung die Ergebnisse der letzten PISA-Studie?" },
  { id: "edu-5", category: "education", ministry: "education", text: "Welche Fortschritte gibt es beim Digitalpakt Schule?" },
  { id: "edu-6", category: "education", ministry: "education", text: "Plant die Bundesregierung eine Reform der Studienplatzvergabe?" },

  // healthcare → health
  { id: "hea-1", category: "healthcare", ministry: "health", text: "Wie bewertet das Gesundheitsministerium den Pflegenotstand?" },
  { id: "hea-2", category: "healthcare", ministry: "health", text: "Welche Pläne hat die Bundesregierung zur Krankenhausreform?" },
  { id: "hea-3", category: "healthcare", ministry: "health", text: "Wie soll die Versorgung im ländlichen Raum gesichert werden?" },
  { id: "hea-4", category: "healthcare", ministry: "health", text: "Welche Maßnahmen plant das Ministerium gegen den Ärztemangel?" },
  { id: "hea-5", category: "healthcare", ministry: "health", text: "Wie steht die Bundesregierung zur Bürgerversicherung?" },
  { id: "hea-6", category: "healthcare", ministry: "health", text: "Welche Lehren zieht die Bundesregierung aus den Pandemie-Jahren?" },

  // infrastructure → infrastructure
  { id: "inf-1", category: "infrastructure", ministry: "infrastructure", text: "Wie bewertet die Bundesregierung den Sanierungsstau bei Brücken und Autobahnen?" },
  { id: "inf-2", category: "infrastructure", ministry: "infrastructure", text: "Welche Maßnahmen plant das Verkehrsministerium für den Deutschlandtakt?" },
  { id: "inf-3", category: "infrastructure", ministry: "infrastructure", text: "Wie soll der Glasfaserausbau beschleunigt werden?" },
  { id: "inf-4", category: "infrastructure", ministry: "infrastructure", text: "Welche Perspektive hat das Deutschlandticket nach 2025?" },
  { id: "inf-5", category: "infrastructure", ministry: "infrastructure", text: "Welche Investitionen sind für den Schienengüterverkehr vorgesehen?" },
  { id: "inf-6", category: "infrastructure", ministry: "infrastructure", text: "Wie sieht die Strategie zum Breitbandausbau auf dem Land aus?" },
];

// ── Minister fallback mapping (R3) ─────────────────────────────────────

/**
 * Used ONLY when `government.ministers` is empty (fresh seed, pre-PR-6 DB,
 * or an interregnum edge case). Maps each ministry portfolio to the party
 * that typically heads it when the baseline GroKo-style cabinet is unseeded.
 * Parliamentary-QA modules must call `deriveMinisterPartyId()` which checks
 * the live cabinet first and only falls back to this map on empty.
 */
export const MINISTRY_FALLBACK_PARTY: Record<MinistryPortfolio, string> = {
  finance: "spd",
  labour: "spd",
  environment: "gruene",
  interior: "cdu",
  defence: "cdu",
  education: "fdp",
  health: "spd",
  infrastructure: "fdp",
};

// ── Schriftliche Einzelfragen (PR 7) ───────────────────────────────────

/**
 * Poisson λ + clip bounds for daily schriftliche Einzelfragen counters.
 * Real Bundestag cadence: ~33 filed/day, ~15 answered/day. Sample count
 * is 1–3 template questions surfaced to the news feed "Tages-Statistik".
 *
 * Configured here to keep both citizen-volume configs in one module —
 * see spec §Design Piece 5.
 */
export const SCHRIFTLICHE_EINZELFRAGEN = {
  filedPerDay: { mean: 33, min: 15, max: 60 },
  answeredPerDay: { mean: 15, min: 5, max: 40 },
  sampleCount: { min: 1, max: 3 },
} as const;

/** Template pool for surfaced sample questions. ~40 entries × 8 categories. */
export interface SchriftlicheEinzelfrageTemplate {
  text: string;
  category: BillCategory;
}

export const SCHRIFTLICHE_EINZELFRAGE_TEMPLATES: SchriftlicheEinzelfrageTemplate[] = [
  { text: "Wie viele Anträge auf Kindergrundsicherung wurden im letzten Quartal bearbeitet?", category: "social" },
  { text: "Welche Mittel wurden im laufenden Haushaltsjahr für Bundesstraßen abgerufen?", category: "infrastructure" },
  { text: "Wie viele Stellen sind im Bundesamt für Migration und Flüchtlinge aktuell unbesetzt?", category: "immigration" },
  { text: "Welche Erkenntnisse liegen über die CO2-Emissionen bundeseigener Liegenschaften vor?", category: "environment" },
  { text: "Wie hoch war die Beteiligung an der letzten Ausschreibung für Offshore-Windparks?", category: "environment" },
  { text: "Welche Kosten verursachte die Beschaffung des letzten Transportflugzeugs?", category: "defense" },
  { text: "Wie viele Schulabgänger ohne Abschluss registrierten die Länder im vergangenen Schuljahr?", category: "education" },
  { text: "Welche Summen flossen in die Krankenhausförderung im letzten Berichtszeitraum?", category: "healthcare" },
  { text: "Wie entwickelt sich die Investitionsquote deutscher Unternehmen laut Bundesbank-Daten?", category: "economy" },
  { text: "Welche konkreten Fortschritte gibt es beim Bürokratieentlastungsgesetz IV?", category: "economy" },
  { text: "Wie viele Petitionen erreichten im letzten Jahr das öffentliche Quorum?", category: "social" },
  { text: "Welche Bundesbehörden haben einen Evaluierungsbericht zur Digitalstrategie vorgelegt?", category: "infrastructure" },
  { text: "Wie hat sich die durchschnittliche Verfahrensdauer bei Asylanträgen entwickelt?", category: "immigration" },
  { text: "Welche Ausgaben verursachte das Bundesministerium für Auslandsdienstreisen?", category: "defense" },
  { text: "Wie viele IT-Sicherheitsvorfälle wurden im letzten Jahr in Bundesbehörden registriert?", category: "infrastructure" },
  { text: "Welche Fördermittel gingen an private Kliniken im vergangenen Quartal?", category: "healthcare" },
  { text: "Wie hat sich der Anteil E-Mobilität im Fuhrpark der Bundesregierung verändert?", category: "environment" },
  { text: "Welche Prognose hat die Bundesregierung für die Energiepreise im kommenden Winter?", category: "economy" },
  { text: "Wie viele Berufsausbildungsplätze blieben zuletzt unbesetzt?", category: "education" },
  { text: "Welche konkreten Maßnahmen gegen Schwarzarbeit wurden eingeleitet?", category: "economy" },
  { text: "Wie viele Aufenthaltstitel wurden im Rahmen des Fachkräfteeinwanderungsgesetzes ausgestellt?", category: "immigration" },
  { text: "Welche Sanierungsstände weisen die Standorte der Bundeswehrliegenschaften aus?", category: "defense" },
  { text: "Wie hoch sind die kumulierten Investitionen in die Deutsche Bahn seit 2020?", category: "infrastructure" },
  { text: "Welche Fortschritte gibt es bei der Umsetzung der Wasserstoffstrategie?", category: "environment" },
  { text: "Wie entwickelte sich die Zahl offener Hausarztpraxen im letzten Jahr?", category: "healthcare" },
  { text: "Welche Empfehlungen des Bundesrechnungshofs wurden bislang umgesetzt?", category: "economy" },
  { text: "Wie viele Schüler nahmen im letzten Schuljahr am Digitalpakt-Programm teil?", category: "education" },
  { text: "Welche Forschungsprojekte fördert der Bund im Bereich Quantencomputing?", category: "education" },
  { text: "Wie hoch ist die Nachfrage nach dem Deutschlandticket in den Flächenländern?", category: "infrastructure" },
  { text: "Welche Ausgaben entstanden für Unterstützungsleistungen an die Ukraine?", category: "defense" },
  { text: "Wie haben sich die Beiträge zur gesetzlichen Krankenversicherung entwickelt?", category: "healthcare" },
  { text: "Welche Kapazitäten stehen in Aufnahmeeinrichtungen der Länder bereit?", category: "immigration" },
  { text: "Wie viele Anträge auf BAföG wurden im letzten Wintersemester gestellt?", category: "education" },
  { text: "Welche Maßnahmen ergreift die Bundesregierung gegen die Wohnungsnot in Ballungsgebieten?", category: "social" },
  { text: "Wie viele Stellen im öffentlichen Dienst blieben zuletzt unbesetzt?", category: "social" },
  { text: "Welche Mittel flossen in die Förderung der erneuerbaren Energien im Haushalt?", category: "environment" },
  { text: "Wie hoch ist der Stand bei der Einführung der elektronischen Patientenakte?", category: "healthcare" },
  { text: "Welche Konsequenzen zog die Bundesregierung aus dem letzten Abschiebebericht?", category: "immigration" },
  { text: "Wie viele Kilometer Glasfaserkabel wurden im letzten Jahr neu verlegt?", category: "infrastructure" },
  { text: "Welche Fortschritte gibt es bei der Reform der Schuldenbremse?", category: "economy" },
];
