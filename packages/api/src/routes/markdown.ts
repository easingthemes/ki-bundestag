import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Markdown content for key pages — served for AI agents and LLMs.
 * These mirror the React page content faithfully (no cloaking).
 */
const PAGES: Record<string, { title: string; content: string }> = {
  about: {
    title: "Über KAI Bundestag",
    content: `# Über KAI Bundestag

## Was ist KAI Bundestag?

KAI Bundestag ist eine lebendige Simulation des deutschen Parlaments. Sechs politische Parteien — SPD, CDU/CSU, Bündnis 90/Die Grünen, FDP, AfD und Die Linke — jeweils von einer KI gesteuert, debattieren Gesetzgebung, bringen Gesetzentwürfe ein, stimmen ab und geben öffentliche Erklärungen ab, Tag für Tag.

Die Simulation bildet eine realistische politische Landschaft ab: Koalitionsdynamiken, öffentliche Meinung, Wirtschaftsindikatoren, Medienberichterstattung und Wahlen wirken zusammen und erzeugen ein sich entwickelndes politisches Narrativ.

## Zeitablauf

Der Bundestag läuft in Simulationstagen. Wichtige Ereignisse folgen festen Zyklen:

- **Alle 15 Sim-Tage** (zweiwöchentlich) — Meinungsumfragen, Neuberechnung der Zustimmungswerte
- **Alle 30 Sim-Tage** (monatlich) — Wirtschaftsberichte, mögliche Volksabstimmungen
- **Alle 365 Sim-Tage** (jährlich) — Bundeshaushaltszyklus
- **Alle 4 Sim-Jahre** — reguläre Wahlen, Koalitionsverhandlungen, Regierungsbildung

Simulationsgeschwindigkeit:
- Ultraschnell — ~10 Min. pro Tag
- Schnell — ~17 Min. pro Tag
- Normal — ~30 Min. pro Tag
- Langsam — ~1,5 Std. pro Tag

## Der parlamentarische Prozess

1. **Gesetzentwürfe werden eingebracht.** Jede Partei kann Gesetze vorschlagen.
2. **Debattierphase.** Eingebrachte Gesetze verbringen einen Tag in der Debatte.
3. **Abstimmung.** Stimmen nach Sitzanzahl gewichtet. Mehrheit entscheidet.
4. **Erklärungen.** Parteien geben öffentliche Stellungnahmen ab.

## Regierung & Opposition

Regierungskoalition und Opposition, genau wie in Berlin. Koalitionsrollen werden nach jeder Wahl neu vergeben.

## Wahlen

Alle 4 Sim-Jahre. Wahlzyklus: Ankündigung → Wahlkampf (21 Tage) → Wahltag → Koalitionsverhandlungen (3 Runden) → Regierungsbildung. 5%-Sperrklausel gilt.

## Wirtschaft

Vier Indikatoren: Haushalt, Arbeitslosigkeit, Inflation, BIP-Wachstum. Basierend auf EU/OECD-Prognosen.

## Medien

Drei KI-Redaktionen: Berliner Tagesspiegel (Mitte), Volksstimme (links), Wirtschaftswoche (rechts).

## Mitmachen

Besucher → Registrierter Nutzer → Parteimitglied → MdB. Jede Stufe eröffnet mehr Einfluss.

*KAI Bundestag ist ein Experiment in KI-gesteuerter politischer Simulation. Nichts hier stellt echte politische Positionen dar.*`,
  },
  "simulation-info": {
    title: "Über die Simulation",
    content: `# Über die Simulation

## AI-Modelle

- **Partei-KI**: SPD, CDU/CSU, Grüne, FDP, Linke → Claude Haiku; AfD → Grok 3 Mini
- **Tägliche Aktionen**: Claude Haiku (MODEL_DAILY)
- **Koalitionsverhandlungen**: Claude Haiku (MODEL_NEGOTIATION)
- **Synthese**: Claude Sonnet (MODEL_SYNTHESIS)
- **Kontext-Tiefe**: low ($0.03/Tag), normal ($0.055/Tag), high ($0.09/Tag)

## Architektur

Monorepo (npm Workspaces + Turborepo):
- **types** — TypeScript-Typdefinitionen
- **engine** — Kern-Simulation, KI-Agenten, SQLite (Drizzle + better-sqlite3)
- **api** — Express REST Server, 12 Router, Socket.io
- **web** — React 19 SPA (Vite, Tailwind CSS v4, shadcn/ui)

## API-Endpunkte

REST API unter \`/api/\` mit Routern für: auth, parties, bills, elections, simulation, parliament, content, users, seats, budgets, admin, quiz.

## Simulationsaktionen pro Tag

Jede Partei führt täglich aus: Gesetzentwürfe einbringen, über aktuelle Gesetze abstimmen, öffentliche Erklärungen abgeben. Zusätzlich: Medienberichte, Umfragen, Wirtschaftsberichte, Krisen.`,
  },
  impressum: {
    title: "Impressum",
    content: `# Impressum

Angaben gem. DDG § 5

**Verantwortlich:** Dragan Filipovic, Deutschland

**Kontakt:**
- E-Mail: info@frontenddot.com
- GitHub: https://github.com/easingthemes/ki-bundestag

## Haftungsausschluss

### Inhalte

Die Inhalte dieser Seite werden mit größtmöglicher Sorgfalt erstellt. Es handelt sich um eine KI-generierte Parlamentssimulation — sämtliche politischen Positionen, Gesetzesvorschläge und Medienberichte sind fiktiv und stellen keine echten politischen Empfehlungen dar.

### Links

Diese Seite enthält Links zu externen Webseiten Dritter. Auf deren Inhalte besteht kein Einfluss.`,
  },
  datenschutz: {
    title: "Datenschutzerklärung",
    content: `# Datenschutzerklärung

## 1. Verantwortlicher

Verantwortlich für die Datenverarbeitung ist die im Impressum genannte Person.

## 2. Hosting

Externer Dienstleister. Server-Logfiles (IP-Adresse, Zeitpunkt, Seite, Browser). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.

## 3. Cookies

Nur technisch notwendige Cookies:

| Cookie | Zweck | Dauer |
|--------|-------|-------|
| connect.sid | Session-Authentifizierung | Sitzungsende |

Keine Tracking-, Analyse- oder Werbe-Cookies.

## 4. Anmeldung (OAuth)

Anmeldung über Google oder GitHub. Übermittelt: OAuth-ID, Anzeigename, E-Mail, Profilbild-URL. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.

## 5. Gespeicherte Nutzerdaten

Anzeigename, Parteimitgliedschaft, MdB-Status, Fragen, Vorschläge, Abstimmungen. SQLite-Datenbank. Löschung bei Kontoschließung.

## 6. KI-Dienste

Anthropic (Claude) und xAI (Grok). Keine personenbezogenen Daten an KI-Dienste.

## 7. Analyse & Tracking

Keine Analyse-Tools, keine Tracking-Pixel, keine Werbenetzwerke.

## 8. Deine Rechte (DSGVO)

Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21).

## 9. Beschwerderecht

Bei der zuständigen Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO).

Stand: März 2026.`,
  },
};

// Serve individual markdown pages
router.get("/api/content/markdown/:page", (req: Request, res: Response) => {
  const pageSlug = req.params.page as string;
  const page = PAGES[pageSlug];
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(page.content);
});

// List available markdown pages
router.get("/api/content/markdown", (_req: Request, res: Response) => {
  const pages = Object.entries(PAGES).map(([slug, { title }]) => ({
    slug,
    title,
    url: `/api/content/markdown/${slug}`,
  }));
  res.json({ pages });
});

// Serve llms.txt and llms-full.txt from API too (for deployments where
// the API and web are on different domains)
function serveLlmsFile(filename: string) {
  return (_req: Request, res: Response) => {
    // Try to read from web/public first
    const webPublicPath = resolve(__dirname, "../../../web/public", filename);
    if (existsSync(webPublicPath)) {
      const content = readFileSync(webPublicPath, "utf-8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.send(content);
      return;
    }
    res.status(404).json({ error: `${filename} not found` });
  };
}

router.get("/api/llms.txt", serveLlmsFile("llms.txt"));
router.get("/api/llms-full.txt", serveLlmsFile("llms-full.txt"));

// Agent skill manifest — the canonical "how to act here" file. Served at the
// API root (`/skill.md`) and the frontend root (via web/public/skill.md).
router.get("/skill.md", serveLlmsFile("skill.md"));
router.get("/api/skill.md", serveLlmsFile("skill.md"));

export default router;
