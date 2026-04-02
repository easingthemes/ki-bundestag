/**
 * Post-build prerender script.
 *
 * Generates static HTML files for key pages so that search-engine crawlers
 * and AI agents (which don't execute JavaScript) see real content instead
 * of an empty <div id="root"></div>.
 *
 * Run after `vite build`:
 *   node scripts/prerender.js
 *
 * For each route the script:
 *  1. Reads the built dist/index.html as a template
 *  2. Replaces <title>, meta description, canonical URL, and OG tags
 *  3. Injects plain-HTML page content into <div id="root">
 *  4. Writes to dist/{route}/index.html
 *
 * React's client-side router takes over once JS loads, so interactive
 * users are unaffected.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
const BASE_URL = "https://bundestag.easingthemes.com";
const SITE_NAME = "KAI Bundestag";

// ---------------------------------------------------------------------------
// Page definitions — static HTML content for each prerendered route
// ---------------------------------------------------------------------------

const PAGES = {
  "/": {
    title: "Dashboard",
    description:
      "Live-Übersicht der KI-Bundestag-Simulation: aktuelle Gesetze, Koalitionen, Umfragen und Parlamentsaktivität auf einen Blick.",
    html: `
<article>
  <h1>KAI Bundestag — KI-gesteuerte Simulation des deutschen Parlaments</h1>
  <p>KAI Bundestag ist eine lebendige Simulation des deutschen Bundestags. Sechs politische Parteien — SPD, CDU/CSU, Bündnis 90/Die Grünen, FDP, AfD und Die Linke — jeweils von einer KI gesteuert, debattieren Gesetzgebung, bringen Gesetzentwürfe ein, stimmen ab und geben öffentliche Erklärungen ab, Tag für Tag.</p>

  <h2>Aktuelle Übersicht</h2>
  <p>Das Dashboard zeigt live: aktuelle Regierung und Koalition, neueste Gesetzentwürfe und Abstimmungen, öffentliche Stimmung und Zustimmungswerte, Wirtschaftsindikatoren (Haushalt, Arbeitslosigkeit, Inflation, BIP-Wachstum), aktive Krisen und deren Auswirkungen, KI-generierte Medienberichte, aktuelle Umfrageergebnisse.</p>

  <h2>Sechs KI-Parteien</h2>
  <ul>
    <li><strong>SPD</strong> (Sozialdemokratische Partei) — Mitte-links, soziale Gerechtigkeit</li>
    <li><strong>CDU/CSU</strong> (Christlich Demokratische Union) — Mitte-rechts, konservativ</li>
    <li><strong>Bündnis 90/Die Grünen</strong> — Umwelt, Klimaschutz, soziale Gerechtigkeit</li>
    <li><strong>FDP</strong> (Freie Demokratische Partei) — Liberal, Marktwirtschaft</li>
    <li><strong>AfD</strong> (Alternative für Deutschland) — Rechtspopulistisch, EU-skeptisch</li>
    <li><strong>Die Linke</strong> — Links, demokratischer Sozialismus</li>
  </ul>

  <h2>Schlüsselfunktionen</h2>
  <ul>
    <li><strong>Multi-Agenten-KI-System</strong> — Sechs autonome KI-Agenten mit unterschiedlichen politischen Ideologien treffen täglich strategische Entscheidungen</li>
    <li><strong>Vollständige Gesetzgebung</strong> — Gesetzentwürfe werden eingebracht, debattiert, geändert und abgestimmt</li>
    <li><strong>Koalitionsverhandlungen</strong> — Mehrrundige KI-Verhandlungen zur Regierungsbildung</li>
    <li><strong>KI-generierte Medien</strong> — Drei simulierte Nachrichtenredaktionen mit unterschiedlicher Ausrichtung</li>
    <li><strong>Bürgerbeteiligung</strong> — Nutzer können Parteien beitreten, über Gesetze abstimmen und als MdB teilnehmen</li>
    <li><strong>Verfassungsgericht &amp; Haushalt</strong> — Gesetze können angefochten werden; Parteien verwalten die Staatsfinanzen</li>
  </ul>

  <h2>Seiten</h2>
  <nav>
    <ul>
      <li><a href="/parties">Parteien</a> — Sechs KI-gesteuerte politische Parteien</li>
      <li><a href="/bills">Gesetzentwürfe</a> — Gesetzgebung, Debatten und Abstimmungen</li>
      <li><a href="/elections">Wahlen</a> — Wahlergebnisse und Koalitionsrechner</li>
      <li><a href="/news">Nachrichten</a> — Chronologische Simulationsereignisse</li>
      <li><a href="/media">Presse</a> — KI-generierte Medienberichte</li>
      <li><a href="/polls">Umfragen</a> — Meinungsumfragen</li>
      <li><a href="/questions">Bürgerfragen</a> — Fragen an die KI-Parteien</li>
      <li><a href="/motions">Anträge</a> — Parlamentarische Anträge</li>
      <li><a href="/budget">Haushalt</a> — Bundeshaushalt</li>
      <li><a href="/referendums">Volksentscheide</a> — Bürgerabstimmungen</li>
      <li><a href="/about">Über KAI Bundestag</a> — Konzept und Hintergründe</li>
      <li><a href="/simulation-info">Simulation</a> — Technische Details und KI-Modelle</li>
    </ul>
  </nav>

  <h2>Technologie</h2>
  <p>React 19, Express, TypeScript, SQLite, Claude Haiku/Sonnet (Anthropic), Grok (xAI), Vercel AI SDK. Open Source: <a href="https://github.com/easingthemes/ki-bundestag">github.com/easingthemes/ki-bundestag</a></p>
  <p>Erstellt von <a href="https://github.com/easingthemes">Dragan Filipovic</a>.</p>
  <p>Für KI-Agenten: <a href="/llms.txt">llms.txt</a> | <a href="/llms-full.txt">llms-full.txt</a> | <a href="/sitemap.xml">sitemap.xml</a></p>
</article>`,
  },

  "/about": {
    title: "Über KAI Bundestag",
    description:
      "Was ist KAI Bundestag? Eine KI-gesteuerte Simulation des deutschen Parlaments — Technik, Konzept und Hintergründe.",
    html: `
<article>
  <h1>Über KAI Bundestag</h1>

  <h2>Was ist KAI Bundestag?</h2>
  <p>KAI Bundestag ist eine lebendige Simulation des deutschen Parlaments. Sechs politische Parteien — SPD, CDU/CSU, Bündnis 90/Die Grünen, FDP, AfD und Die Linke — jeweils von einer KI gesteuert, debattieren Gesetzgebung, bringen Gesetzentwürfe ein, stimmen ab und geben öffentliche Erklärungen ab, Tag für Tag. Die Simulation bildet eine realistische politische Landschaft ab: Koalitionsdynamiken, öffentliche Meinung, Wirtschaftsindikatoren, Medienberichterstattung und Wahlen wirken zusammen und erzeugen ein sich entwickelndes politisches Narrativ.</p>

  <h2>Zeitablauf</h2>
  <p>Der Bundestag läuft in Simulationstagen. Wichtige Ereignisse folgen festen Zyklen — Umfragen alle 2 Wochen, Wirtschaftsberichte monatlich, Haushalte jährlich, Wahlen alle 4 Jahre. Jeder Simulationstag entspricht einem echten Kalendertag.</p>
  <ul>
    <li><strong>Alle 15 Sim-Tage</strong> (zweiwöchentlich) — Meinungsumfragen, Neuberechnung der Zustimmungswerte</li>
    <li><strong>Alle 30 Sim-Tage</strong> (monatlich) — Wirtschaftsberichte, mögliche Volksabstimmungen</li>
    <li><strong>Alle 365 Sim-Tage</strong> (jährlich) — Bundeshaushaltszyklus</li>
    <li><strong>Alle 4 Sim-Jahre</strong> — reguläre Wahlen, Koalitionsverhandlungen, Regierungsbildung</li>
  </ul>
  <p>Simulationsgeschwindigkeit: Ultraschnell (~10 Min/Tag), Schnell (~17 Min/Tag), Normal (~30 Min/Tag), Langsam (~1,5 Std/Tag).</p>

  <h2>Der parlamentarische Prozess</h2>
  <ol>
    <li><strong>Gesetzentwürfe werden eingebracht.</strong> Jede Partei kann Gesetze in Bereichen wie Wirtschaft, Gesundheit, Umwelt, Verteidigung oder Einwanderung vorschlagen.</li>
    <li><strong>Debattierphase.</strong> Eingebrachte Gesetze verbringen einen Tag in der Debatte.</li>
    <li><strong>Abstimmung.</strong> Stimmen nach Sitzanzahl gewichtet. Mehrheit entscheidet.</li>
    <li><strong>Erklärungen.</strong> Parteien geben öffentliche Stellungnahmen ab.</li>
  </ol>

  <h2>Regierung &amp; Opposition</h2>
  <p>Genau wie in Berlin hat der Bundestag eine Regierungskoalition und eine Opposition. Koalitionsrollen werden nach jeder Wahl neu vergeben.</p>

  <h2>Wahlen</h2>
  <p>Wahlen finden alle 4 Sim-Jahre statt. Phasen: Ankündigung → Wahlkampf (21 Tage) → Wahltag → Koalitionsverhandlungen (3 Runden) → Regierungsbildung. 5%-Sperrklausel gilt.</p>

  <h2>Die Wirtschaft</h2>
  <p>Vier Schlüsselindikatoren: Haushalt (Milliarden Euro), Arbeitslosigkeit, Inflation, BIP-Wachstum. Basierend auf EU/OECD-Prognosen für Deutschland.</p>

  <h2>Öffentliche Stimmung &amp; Krisen</h2>
  <p>Die öffentliche Stimmung spiegelt die Zufriedenheit wider und wird durch Gesetzgebung, Krisen und Medien beeinflusst. Krisen treffen unvorhersehbar ein: Energiekrisen, Überschwemmungen, Cyberangriffe, Handelsstreitigkeiten und mehr.</p>

  <h2>Medien</h2>
  <p>Drei simulierte Nachrichtenmedien: Berliner Tagesspiegel (zentristisch), Volksstimme (linksorientiert), Wirtschaftswoche (rechtsorientiert). Jede Redaktion verfasst KI-generierte Artikel mit eigener Ausrichtung.</p>

  <h2>So kannst du mitmachen</h2>
  <h3>Besucher (kein Konto)</h3>
  <p>Alles einsehen — Gesetze, Wahlen, Haushalte, Medien, Umfragen. Koalitionsrechner nutzen.</p>
  <h3>Registrierter Nutzer</h3>
  <p>An Umfragen und Volksabstimmungen teilnehmen, Parteien Fragen stellen, einer Partei beitreten.</p>
  <h3>Parteimitglied</h3>
  <p>Gesetzentwürfe vorschlagen, über Fraktionsvorschläge abstimmen, Position zu Gesetzen signalisieren, MdB-Sitz beantragen.</p>
  <h3>MdB (Mitglied des Bundestages)</h3>
  <p>Direkt über Gesetze abstimmen, Reden halten, Anträge einreichen, Anfragen stellen, Änderungsanträge vorschlagen.</p>

  <p><em>KAI Bundestag ist ein Experiment in KI-gesteuerter politischer Simulation. Nichts hier stellt echte politische Positionen dar.</em></p>
</article>`,
  },

  "/simulation-info": {
    title: "Über die Simulation",
    description:
      "Technische Details zur KI-Bundestag-Simulation: Ablauf, Kosten und KI-Modelle.",
    html: `
<article>
  <h1>Über die Simulation — Technische Details</h1>

  <h2>KI-Modelle</h2>
  <ul>
    <li><strong>Partei-KI:</strong> SPD, CDU/CSU, Grüne, FDP, Linke → Claude Haiku (Anthropic); AfD → Grok 3 Mini (xAI)</li>
    <li><strong>Tägliche Aktionen:</strong> Claude Haiku (MODEL_DAILY)</li>
    <li><strong>Koalitionsverhandlungen:</strong> Claude Haiku (MODEL_NEGOTIATION)</li>
    <li><strong>Synthese:</strong> Claude Sonnet (MODEL_SYNTHESIS)</li>
  </ul>

  <h2>Kontext-Tiefe</h2>
  <ul>
    <li><strong>Low</strong> — ~$0.03/Tag, minimaler Kontext</li>
    <li><strong>Normal</strong> — ~$0.055/Tag, ausgewogener Kontext (Standard)</li>
    <li><strong>High</strong> — ~$0.09/Tag, maximaler Kontext</li>
  </ul>

  <h2>Architektur</h2>
  <p>Monorepo mit npm Workspaces + Turborepo:</p>
  <ul>
    <li><strong>types</strong> — TypeScript-Typdefinitionen</li>
    <li><strong>engine</strong> — Kern-Simulation, KI-Agenten, SQLite (Drizzle + better-sqlite3)</li>
    <li><strong>api</strong> — Express REST Server, 12 Domain-Router, Socket.io</li>
    <li><strong>web</strong> — React 19 SPA (Vite, Tailwind CSS v4, shadcn/ui)</li>
  </ul>

  <h2>Simulationsaktionen pro Tag</h2>
  <p>Jede Partei führt täglich aus: Gesetzentwürfe einbringen, über aktuelle Gesetze abstimmen, öffentliche Erklärungen abgeben. Zusätzlich: Medienberichte von drei KI-Redaktionen, Umfragen (alle 2 Wochen), Wirtschaftsberichte (monatlich), Krisenmanagement.</p>

  <h2>Batch-Verarbeitung</h2>
  <p>Alle KI-Aufrufe nutzen die Anthropic Message Batches API für 50% Kostenreduktion. Intelligente Anfragengruppierung über 5 Batch-Phasen: Parteiaktionen, Abstimmungen, Erklärungen, Medien, Synthese.</p>

  <h2>API-Endpunkte</h2>
  <p>REST API unter /api/ mit Routern für: auth, parties, bills, elections, simulation, parliament, content, users, seats, budgets, admin, quiz. Alle Antworten in JSON. WebSocket-Unterstützung via Socket.io für Echtzeit-Updates.</p>

  <h2>Quellcode</h2>
  <p>Open Source auf GitHub: <a href="https://github.com/easingthemes/ki-bundestag">github.com/easingthemes/ki-bundestag</a></p>
</article>`,
  },

  "/impressum": {
    title: "Impressum",
    description: "Impressum und Kontaktdaten von KAI Bundestag.",
    html: `
<article>
  <h1>Impressum</h1>

  <h2>Angaben gem. DDG § 5</h2>
  <p><strong>Verantwortlich:</strong> Dragan Filipovic, Deutschland</p>
  <p><strong>Kontakt:</strong></p>
  <ul>
    <li>E-Mail: info@frontenddot.com</li>
    <li>GitHub: <a href="https://github.com/easingthemes/ki-bundestag">github.com/easingthemes/ki-bundestag</a></li>
  </ul>

  <h2>Haftungsausschluss</h2>
  <h3>Inhalte</h3>
  <p>Die Inhalte dieser Seite werden mit größtmöglicher Sorgfalt erstellt. Es handelt sich um eine KI-generierte Parlamentssimulation — sämtliche politischen Positionen, Gesetzesvorschläge und Medienberichte sind fiktiv und stellen keine echten politischen Empfehlungen dar.</p>
  <h3>Links</h3>
  <p>Diese Seite enthält Links zu externen Webseiten Dritter (z.B. GitHub, Google, Anthropic). Auf deren Inhalte besteht kein Einfluss.</p>

  <p>Siehe auch: <a href="/datenschutz">Datenschutzerklärung</a></p>
</article>`,
  },

  "/datenschutz": {
    title: "Datenschutzerklärung",
    description:
      "Datenschutzerklärung von KAI Bundestag: Informationen zur Datenverarbeitung und Ihren Rechten.",
    html: `
<article>
  <h1>Datenschutzerklärung</h1>

  <h2>1. Verantwortlicher</h2>
  <p>Verantwortlich für die Datenverarbeitung auf dieser Webseite ist die im <a href="/impressum">Impressum</a> genannte Person.</p>

  <h2>2. Hosting</h2>
  <p>Diese Webseite wird bei einem externen Dienstleister gehostet. Beim Aufruf erhebt der Hoster automatisch technische Daten in Server-Logfiles (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser-Typ). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>

  <h2>3. Cookies</h2>
  <p>Ausschließlich technisch notwendige Cookies: connect.sid (Session-Authentifizierung, Dauer: Sitzungsende). Keine Tracking-, Analyse- oder Werbe-Cookies.</p>

  <h2>4. Anmeldung (OAuth)</h2>
  <p>Anmeldung über Google oder GitHub. Übermittelte Daten: OAuth-ID, Anzeigename, E-Mail-Adresse, Profilbild-URL. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Google LLC und GitHub Inc. sind unter dem EU-U.S. Data Privacy Framework zertifiziert.</p>

  <h2>5. Gespeicherte Nutzerdaten</h2>
  <p>Anzeigename, Parteimitgliedschaft, MdB-Status, eingereichte Fragen, Gesetzesvorschläge, Abstimmungen, Benachrichtigungseinstellungen. SQLite-Datenbank. Löschung bei Kontoschließung. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

  <h2>6. KI-Dienste (Drittanbieter)</h2>
  <p>Anthropic (Claude) und xAI (Grok) für Parteiaktionen, Debatten und Medienberichte. Keine personenbezogenen Nutzerdaten werden an KI-Dienste übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>

  <h2>7. Analyse &amp; Tracking</h2>
  <p>Keine Analyse-Tools, keine Tracking-Pixel, keine Werbenetzwerke.</p>

  <h2>8. Deine Rechte</h2>
  <p>Gemäß DSGVO: Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21). Kontakt: siehe <a href="/impressum">Impressum</a>.</p>

  <h2>9. Beschwerderecht</h2>
  <p>Recht auf Beschwerde bei der zuständigen Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO).</p>

  <p>Stand: März 2026. Siehe auch: <a href="/impressum">Impressum</a></p>
</article>`,
  },
};

// ---------------------------------------------------------------------------
// Template manipulation
// ---------------------------------------------------------------------------

function prerender() {
  const templatePath = resolve(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.error("dist/index.html not found — run `vite build` first");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf-8");
  let count = 0;

  for (const [route, page] of Object.entries(PAGES)) {
    const fullTitle =
      page.title === SITE_NAME
        ? SITE_NAME
        : `${page.title} — ${SITE_NAME}`;

    let html = template;

    // Replace <title>
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`);

    // Replace meta description
    html = html.replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${escapeAttr(page.description)}$2`
    );

    // Replace canonical URL
    html = html.replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
      `$1${BASE_URL}${route === "/" ? "/" : route + "/"}$2`
    );

    // Replace og:title
    html = html.replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
      `$1${escapeAttr(fullTitle)}$2`
    );

    // Replace og:description
    html = html.replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${escapeAttr(page.description)}$2`
    );

    // Replace og:url
    html = html.replace(
      /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
      `$1${BASE_URL}${route === "/" ? "/" : route + "/"}$2`
    );

    // Replace twitter:title
    html = html.replace(
      /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
      `$1${escapeAttr(fullTitle)}$2`
    );

    // Replace twitter:description
    html = html.replace(
      /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
      `$1${escapeAttr(page.description)}$2`
    );

    // Inject content into <div id="root">
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${page.html}</div>`
    );

    // Write to dist
    if (route === "/") {
      // Overwrite the main index.html
      writeFileSync(templatePath, html, "utf-8");
    } else {
      const dir = resolve(DIST, route.slice(1));
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "index.html"), html, "utf-8");
    }
    count++;
  }

  console.log(`Prerendered ${count} pages.`);
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

prerender();
