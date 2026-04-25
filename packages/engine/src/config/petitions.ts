/**
 * Cycle 2b PR 8 — Petitions (öffentliche E-Petitionen).
 *
 * Real Bundestag GO-EPet: 30,000 signatures within 28 days to qualify for
 * öffentliche Beratung. We model that quorum + a logistic growth curve
 * whose rate is tuned so ~30% of spawned petitions cross quorum within
 * the 28-day window. Petitionsausschuss review after quorum resolves
 * either to `debated` (35%) or `rejected` (65%) after a 7-day dwell.
 *
 * No AI — title/description come from a template pool.
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 6.
 */

import type { BillCategory } from "@ki-bundestag/types";

export const PETITION_QUORUM = 30_000;
export const PETITION_PUBLIC_WINDOW_DAYS = 28;

/** Uniform draw (inclusive) — one new petition every 3–10 sim days. */
export const PETITION_SPAWN_INTERVAL_DAYS = { min: 3, max: 10 } as const;

/** Initial signatures on the day the petition is created — seeds the curve. */
export const PETITION_INITIAL_SIGNATURES = { min: 50, max: 500 } as const;

/**
 * Logistic growth daily rate. Calibrated so that with baseline salience
 * (no crisis boost, active-bill boost of 1×), ~30% of petitions cross
 * PETITION_QUORUM within PETITION_PUBLIC_WINDOW_DAYS. Tuneable constant
 * per spec R6.
 */
export const PETITION_GROWTH_RATE = 0.38;

/** Multiplicative salience boost when a petition's category matches a
 *  currently-active crisis. Stacks per matching crisis (up to 2x). */
export const PETITION_CRISIS_SALIENCE_BONUS = 0.6;

/** Multiplicative salience boost when a petition's category matches a
 *  recently-proposed bill. */
export const PETITION_ACTIVE_BILL_SALIENCE_BONUS = 0.25;

/** Petitionsausschuss dwell (sim days) before outcome roll after quorum. */
export const PETITION_COMMITTEE_DWELL_DAYS = 7;

/** Outcome distribution after Petitionsausschuss dwell. */
export const PETITION_COMMITTEE_OUTCOMES = {
  accepted: 0.35,
  rejected: 0.65,
} as const;

export interface PetitionTemplate {
  title: string;
  description: string;
  category: BillCategory;
}

/**
 * Static German-language petition template pool. Titles mirror the style
 * of real Bundestag öffentliche Petitionen (concrete ask + addressee
 * implicit). 40 entries across 8 categories.
 */
export const PETITION_TEMPLATES: PetitionTemplate[] = [
  { category: "economy", title: "Abschaffung der kalten Progression",
    description: "Die Bundesregierung wird aufgefordert, die Einkommenssteuertarife jährlich an die Inflation anzupassen." },
  { category: "economy", title: "Entlastung kleiner Handwerksbetriebe",
    description: "Reduzierung der Bürokratiepflichten und Schwellenwerte für Betriebe bis 20 Mitarbeiter." },
  { category: "economy", title: "Transparenz bei Lobbyregister",
    description: "Offenlegung aller Lobbykontakte von Regierungsmitgliedern mit Tagessatz." },
  { category: "economy", title: "Reform der Schuldenbremse",
    description: "Lockerung der Schuldenbremse für öffentliche Investitionen in Bildung und Infrastruktur." },
  { category: "economy", title: "Stopp des Soli-Aufschlags",
    description: "Vollständige Abschaffung des Solidaritätszuschlags für alle Einkommensgruppen." },

  { category: "social", title: "Kindergrundsicherung ohne Hürden",
    description: "Automatische Auszahlung der Kindergrundsicherung ohne separate Antragsverfahren." },
  { category: "social", title: "Mietpreisbremse verschärfen",
    description: "Bundesweite Absenkung der zulässigen Mieterhöhung auf maximal 4% alle drei Jahre." },
  { category: "social", title: "Rente ab 63 ohne Abschläge",
    description: "Langjährige Beitragszahler sollen ohne Abzüge früher in Rente gehen können." },
  { category: "social", title: "Bürgergeld-Sanktionen abschaffen",
    description: "Vollständige Abschaffung aller Sanktionsmechanismen beim Bürgergeld." },
  { category: "social", title: "Pflegebonus auf Dauer",
    description: "Dauerhafte Zulage von 250€ monatlich für alle Pflegekräfte in Kliniken und Heimen." },

  { category: "environment", title: "Tempolimit 130 auf Autobahnen",
    description: "Einführung eines generellen Tempolimits zum Klimaschutz und zur Verkehrssicherheit." },
  { category: "environment", title: "Pfand auf alle Kunststoffverpackungen",
    description: "Ausweitung des Pfandsystems auf sämtliche Kunststoffverpackungen inklusive Kosmetik." },
  { category: "environment", title: "Subventionen für fossile Energien streichen",
    description: "Vollständiger Abbau aller direkten und indirekten Subventionen für Kohle, Öl und Gas bis 2028." },
  { category: "environment", title: "Einwegplastik komplett verbieten",
    description: "Vollständiges Verbot von Einwegplastik über das EU-Mandat hinaus." },
  { category: "environment", title: "Solarpflicht auf Neubauten",
    description: "Bundesweite Pflicht zur Installation von Photovoltaik auf allen Neubauten." },

  { category: "immigration", title: "Schnellere Asylverfahren",
    description: "Gesetzliche Höchstdauer von 6 Monaten für alle Asylverfahren." },
  { category: "immigration", title: "Integrationskurse kostenfrei",
    description: "Bundesweit kostenfreie Integrations- und Sprachkurse für alle Anspruchsberechtigten." },
  { category: "immigration", title: "Familiennachzug beschleunigen",
    description: "Verkürzung der Verfahrensdauern beim Familiennachzug auf unter 6 Monate." },
  { category: "immigration", title: "Abschiebestopp in Kriegsgebiete",
    description: "Gesetzlicher Abschiebestopp für Personen aus Kriegs- und Konfliktgebieten." },
  { category: "immigration", title: "Fachkräfteeinwanderung vereinfachen",
    description: "Reduzierung der administrativen Hürden beim Fachkräfteeinwanderungsgesetz." },

  { category: "defense", title: "Wehrpflicht nicht wieder einführen",
    description: "Absage an jede Form der Wiedereinführung der allgemeinen Wehrpflicht." },
  { category: "defense", title: "Rüstungsexporte stoppen",
    description: "Verbot von Rüstungsexporten in Krisen- und Spannungsgebiete." },
  { category: "defense", title: "Bundeswehr-Beschaffung transparent machen",
    description: "Öffentliche Nachvollziehbarkeit aller Großbeschaffungen über 25 Millionen Euro." },
  { category: "defense", title: "Zivilschutz ausbauen",
    description: "Erhebliche Aufstockung der Mittel für zivile Katastrophenvorsorge und Bevölkerungsschutz." },
  { category: "defense", title: "Atomwaffen abziehen",
    description: "Abzug aller in Deutschland stationierten Atomwaffen im Rahmen der nuklearen Teilhabe." },

  { category: "education", title: "BAföG-Bedarfssatz erhöhen",
    description: "Anhebung des BAföG-Bedarfssatzes auf mindestens 1000€ monatlich." },
  { category: "education", title: "Lehrerausbildung modernisieren",
    description: "Bundesweit einheitliche Mindeststandards in der Lehrkräfteausbildung." },
  { category: "education", title: "Studiengebühren verbieten",
    description: "Bundesgesetzliches Verbot von Studiengebühren an staatlichen Hochschulen." },
  { category: "education", title: "Schulsanierung beschleunigen",
    description: "Sondervermögen des Bundes für die Sanierung maroder Schulgebäude." },
  { category: "education", title: "Digitalpakt verstetigen",
    description: "Dauerhafte Bundesfinanzierung für die digitale Ausstattung von Schulen statt Einmalzahlungen." },

  { category: "healthcare", title: "Hausärzte auf dem Land stärken",
    description: "Bundesweite Niederlassungsförderung für Hausärzte in unterversorgten Regionen." },
  { category: "healthcare", title: "Bürgerversicherung einführen",
    description: "Schrittweise Zusammenführung von GKV und PKV in eine einheitliche Bürgerversicherung." },
  { category: "healthcare", title: "Cannabis-Legalisierung ausweiten",
    description: "Vollständige Legalisierung von Cannabis für Erwachsene mit reguliertem Verkauf." },
  { category: "healthcare", title: "E-Rezept vereinfachen",
    description: "Abschaffung der Pflicht zur App-Installation für E-Rezepte — analoger Zugang für alle." },
  { category: "healthcare", title: "Pflege-Personalschlüssel festschreiben",
    description: "Bundesweit verbindliche Mindest-Personalschlüssel in Kliniken und Pflegeheimen." },

  { category: "infrastructure", title: "Deutschlandticket dauerhaft",
    description: "Gesetzliche Verankerung des 49-Euro-Tickets bis mindestens 2030." },
  { category: "infrastructure", title: "Glasfaser bis 2028",
    description: "Verpflichtung des Bundes zum Glasfaser-Vollausbau für alle Haushalte bis 2028." },
  { category: "infrastructure", title: "Bahn-Modernisierung priorisieren",
    description: "Sondervermögen für die Modernisierung der Schieneninfrastruktur statt neuer Autobahnprojekte." },
  { category: "infrastructure", title: "Nachtzugnetz ausbauen",
    description: "Systematischer Ausbau des europäischen Nachtzugnetzes mit direkter Bundesförderung." },
  { category: "infrastructure", title: "Barrierefreier ÖPNV",
    description: "Verpflichtender barrierefreier Ausbau aller ÖPNV-Stationen bis 2030." },
];

/** Simulated author display names for petition seeding. */
export const PETITION_AUTHOR_NAMES: string[] = [
  "Marie Schneider", "Ahmed Khan", "Jonas Berger", "Emma Wagner",
  "Luca Fischer", "Sofia Hoffmann", "Paul Schmidt", "Hannah Weber",
  "Elias Becker", "Mia Schulz", "Noah Richter", "Lea Koch",
];
