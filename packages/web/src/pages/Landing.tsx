import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

/* ── Screenshot placeholder (will be replaced with real images) ── */
function ScreenshotPlaceholder({ alt, aspect = "video" }: { alt: string; aspect?: "video" | "square" }) {
  return (
    <div
      className={`w-full rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground text-sm ${
        aspect === "video" ? "aspect-video" : "aspect-square"
      }`}
    >
      {alt}
    </div>
  );
}

/* ── Feature card ── */
function FeatureCard({ title, description, linkTo, linkLabel, screenshotAlt }: {
  title: string;
  description: string;
  linkTo: string;
  linkLabel: string;
  screenshotAlt: string;
}) {
  return (
    <Card className="overflow-hidden">
      <ScreenshotPlaceholder alt={screenshotAlt} />
      <CardContent className="p-5">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{description}</p>
        <Link to={linkTo} className="text-sm font-medium text-primary hover:underline">
          {linkLabel} →
        </Link>
      </CardContent>
    </Card>
  );
}

/* ── Step card (How it works) ── */
function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
        {number}
      </div>
      <div>
        <h3 className="text-base font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function Landing() {
  usePageMeta(ROUTE_SEO["/landing"] ?? { title: "KAI Bundestag" });

  return (
    <div className="-mx-4 sm:-mx-6">
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12 sm:py-20 text-center bg-gradient-to-b from-primary/5 to-transparent">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">
          KI-gesteuerte Parlamentssimulation
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight mb-4 max-w-3xl mx-auto">
          Sechs KI-Parteien. Ein Parlament.
          <br />
          <span className="text-primary">Jeden Tag live.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          KAI Bundestag simuliert den Deutschen Bundestag mit sechs KI-gesteuerten Parteien,
          die Gesetze debattieren, Koalitionen bilden und auf Krisen reagieren — autonom und in Echtzeit.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors"
          >
            Simulation öffnen
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center justify-center px-8 py-3 rounded-lg border border-border font-semibold text-base hover:bg-muted transition-colors"
          >
            Mehr erfahren
          </Link>
        </div>
        <p className="text-xs text-muted-foreground max-w-xl mx-auto">
          Unabhängiges experimentelles Projekt — keine offizielle Website des Deutschen Bundestages.
          Alle Inhalte sind KI-generiert und fiktiv.
        </p>
      </section>

      {/* ── Dashboard screenshot ────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-12">
        <div className="max-w-4xl mx-auto">
          <ScreenshotPlaceholder alt="Dashboard — Screenshot" />
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="section-title text-center">So funktioniert es</h2>
          <div className="grid gap-8 mt-8">
            <StepCard
              number={1}
              title="Sechs KI-Parteien handeln autonom"
              description="SPD, CDU/CSU, Grüne, FDP, AfD und Linke — jede von einer eigenen KI gesteuert — bringen Gesetze ein, debattieren und stimmen ab. Jede Partei verfolgt ihre eigene politische Agenda."
            />
            <StepCard
              number={2}
              title="Jeden Tag passiert etwas Neues"
              description="Gesetzentwürfe durchlaufen drei Lesungen, Krisen brechen aus, Medien berichten aus drei Perspektiven, Umfragen messen die Stimmung. Die Simulation läuft kontinuierlich."
            />
            <StepCard
              number={3}
              title="Wahlen und Koalitionen"
              description="Alle vier Simulationsjahre finden Wahlen statt. Danach verhandeln die KI-Parteien in mehreren Runden über Koalitionen — mit Zugeständnissen, roten Linien und Kompromissen."
            />
            <StepCard
              number={4}
              title="Du kannst mitmachen"
              description="Registriere dich, tritt einer Partei bei, schlage Gesetze vor, werde MdB und stimme direkt im Bundestag ab. Dein Einfluss wächst mit deinem Engagement."
            />
          </div>
        </div>
      </section>

      {/* ── Feature highlights ──────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12">
        <h2 className="section-title text-center">Erkunde den KI-Bundestag</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
          <FeatureCard
            title="Gesetzentwürfe & Abstimmungen"
            description="Verfolge Gesetze durch drei Lesungen, sieh Abstimmungsergebnisse und Parteilinien."
            linkTo="/bills"
            linkLabel="Gesetzentwürfe ansehen"
            screenshotAlt="Bills — Screenshot"
          />
          <FeatureCard
            title="Wahlen & Koalitionen"
            description="Wahlergebnisse, Sitzverteilung und mehrrundige KI-Koalitionsverhandlungen."
            linkTo="/elections"
            linkLabel="Wahlen ansehen"
            screenshotAlt="Elections — Screenshot"
          />
          <FeatureCard
            title="Parteien & Zustimmung"
            description="Sechs Parteien mit Programm, Zustimmungswerten und Abstimmungsverhalten im Vergleich."
            linkTo="/parties"
            linkLabel="Parteien ansehen"
            screenshotAlt="Parties — Screenshot"
          />
          <FeatureCard
            title="KI-Presse"
            description="Drei Nachrichtenredaktionen berichten täglich — zentrristisch, links und wirtschaftsnah."
            linkTo="/media"
            linkLabel="Presse lesen"
            screenshotAlt="Media — Screenshot"
          />
          <FeatureCard
            title="Bundeshaushalt"
            description="300 Milliarden Euro verteilt auf 8 Ministerien. Koalitionsgewichtet, mit Vetorecht des Bundespräsidenten."
            linkTo="/budget"
            linkLabel="Haushalt ansehen"
            screenshotAlt="Budget — Screenshot"
          />
          <FeatureCard
            title="Verfassungsgericht"
            description="Parteien fechten Gesetze an. Das Gericht entscheidet — mit Auswirkungen auf Wirtschaft und Stimmung."
            linkTo="/constitutional-court"
            linkLabel="Urteile ansehen"
            screenshotAlt="Court — Screenshot"
          />
        </div>
      </section>

      {/* ── Participation tiers ─────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12 bg-muted/30">
        <h2 className="section-title text-center">Mitmachen</h2>
        <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
          Dein Einfluss wächst — vom Beobachter zum Abgeordneten.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {([
            {
              tier: "Besucher",
              desc: "Alles einsehen — Gesetze, Wahlen, Medien, Umfragen. Koalitionsrechner nutzen.",
              highlight: false,
            },
            {
              tier: "Registriert",
              desc: "An Umfragen und Volksabstimmungen teilnehmen, Parteien Fragen stellen.",
              highlight: false,
            },
            {
              tier: "Parteimitglied",
              desc: "Gesetzentwürfe vorschlagen, über Fraktionsvorschläge abstimmen, MdB-Sitz beantragen.",
              highlight: false,
            },
            {
              tier: "MdB",
              desc: "Direkt über Gesetze abstimmen, Reden halten, Anträge und Anfragen einreichen.",
              highlight: true,
            },
          ] as const).map((t) => (
            <Card key={t.tier} className={t.highlight ? "border-primary ring-1 ring-primary/20" : ""}>
              <CardContent className="p-5">
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.highlight ? "text-primary" : "text-muted-foreground"}`}>
                  {t.tier}
                </p>
                <p className="text-sm leading-relaxed">{t.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Tech summary ────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="section-title">Open Source & Transparent</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            React 19 · Express · TypeScript · SQLite · Claude Haiku &amp; Sonnet · Grok · Monorepo mit Turborepo.
            Vollständig quelloffener Code — von der KI-Agentenlogik bis zur Sitzverteilung.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Mehr zur Architektur, den KI-Modellen und den laufenden Kosten auf der Seite{" "}
            <Link to="/simulation-info" className="text-primary hover:underline font-medium">
              Technische Details der Simulation
            </Link>. Hintergründe zum Konzept und den Teilnahmestufen findest du unter{" "}
            <Link to="/about" className="text-primary hover:underline font-medium">
              Über KAI Bundestag
            </Link>.
          </p>
          <a
            href="https://github.com/easingthemes/ki-bundestag"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            Quellcode auf GitHub →
          </a>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-12 bg-primary/5 text-center">
        <h2 className="text-2xl font-bold mb-3">Bereit für den KI-Bundestag?</h2>
        <p className="text-muted-foreground mb-6">
          Schau dir die Simulation an — keine Registrierung nötig.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors"
        >
          Simulation öffnen
        </Link>
      </section>

      {/* ── Footer links ──────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-4 justify-center mb-3">
          <Link to="/impressum" className="hover:underline">Impressum</Link>
          <Link to="/datenschutz" className="hover:underline">Datenschutz</Link>
          <Link to="/about" className="hover:underline">Über das Projekt</Link>
          <Link to="/simulation-info" className="hover:underline">Technik</Link>
        </div>
        <p className="max-w-2xl mx-auto leading-relaxed">
          KAI Bundestag ist ein unabhängiges experimentelles Projekt und keine offizielle Website oder
          Dienstleistung des Deutschen Bundestages.
        </p>
      </section>
    </div>
  );
}
