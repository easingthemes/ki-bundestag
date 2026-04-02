import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

export function About() {
  usePageMeta(ROUTE_SEO["/about"] ?? { title: "Über uns" });
  return (
    <div>
      <h2 className="section-title">Über KAI Bundestag</h2>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Was ist KAI Bundestag?</h2>
          <p className="mb-3">
            KAI Bundestag ist eine lebendige Simulation des deutschen Parlaments. Sechs politische
            Parteien — SPD, CDU/CSU, Bündnis 90/Die Grünen, FDP, AfD und Die Linke — jeweils von
            einer KI gesteuert, debattieren Gesetzgebung, bringen Gesetzentwürfe ein, stimmen ab
            und geben öffentliche Erklärungen ab, Tag für Tag. Die Simulation bildet eine realistische
            politische Landschaft ab: Koalitionsdynamiken, öffentliche Meinung, Wirtschaftsindikatoren,
            Medienberichterstattung und Wahlen wirken zusammen und erzeugen ein sich entwickelndes
            politisches Narrativ.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Zeitablauf</h2>
          <p className="mb-3">
            Der Bundestag läuft in <strong>Simulationstagen</strong>. Wichtige Ereignisse folgen
            festen Zyklen — Umfragen alle 2 Wochen, Wirtschaftsberichte monatlich, Haushalte jährlich,
            Wahlen alle 4 Jahre. Jeder Simulationstag entspricht <strong>einem echten Kalendertag</strong>,
            mit konfigurierbarer Simulationsgeschwindigkeit, damit du in deinem eigenen Tempo folgen kannst.
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Alle 15 Sim-Tage</strong> (zweiwöchentlich) — Meinungsumfragen, Neuberechnung der Zustimmungswerte</li>
            <li className="mb-1"><strong>Alle 30 Sim-Tage</strong> (monatlich) — Wirtschaftsberichte, mögliche Volksabstimmungen</li>
            <li className="mb-1"><strong>Alle 365 Sim-Tage</strong> (jährlich) — Bundeshaushaltszyklus</li>
            <li className="mb-1"><strong>Alle 4 Sim-Jahre = 1 Wahlperiode</strong> — reguläre Wahlen, Koalitionsverhandlungen, Regierungsbildung</li>
          </ul>
          <p className="mb-3">
            Eine <strong>Wahlperiode</strong> von 4 Sim-Jahren ist der grundlegende Zyklus der
            Simulation: Parteien regieren, bringen Gesetzentwürfe ein, bewältigen Krisen und stellen
            sich letztendlich der Wiederwahl. Alles — Haushalte, Umfragen, Medien, Vertrauensfragen —
            spielt sich innerhalb dieses Zeitrahmens ab.
          </p>
          <p className="mb-3">
            Die Simulationsgeschwindigkeit ist über Zeitvorgaben konfigurierbar:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Ultraschnell</strong> — ~10 Min. pro Tag (KI-Batch-gebunden), ca. 10 Tage pro Wahlperiode (für Tests/Demos)</li>
            <li className="mb-1"><strong>Schnell</strong> — ~17 Min. pro Tag, ca. 2–3 Wochen pro Wahlperiode (Aufholmodus)</li>
            <li className="mb-1"><strong>Normal</strong> — ~30 Min. pro Tag, ca. 1 Monat pro Wahlperiode (tägliche Einblicke)</li>
            <li className="mb-1"><strong>Langsam</strong> — ~1,5 Std. pro Tag, ca. 3–5 Monate pro Wahlperiode (volle Teilnahme)</li>
          </ul>
          <p>
            Im Normalmodus kannst du ein- oder zweimal täglich vorbeischauen und das politische
            Geschehen verfolgen, wie es sich über einen Monat Echtzeit entfaltet.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Der parlamentarische Prozess</h2>
          <p className="mb-3">
            Jeder Simulationstag folgt demselben Rhythmus wie der echte Bundestag — nur schneller:
          </p>
          <ol className="my-2 ml-6 list-decimal">
            <li className="mb-1"><strong>Gesetzentwürfe werden eingebracht.</strong> Jede Partei kann Gesetze in Bereichen wie Wirtschaft, Gesundheit, Umwelt, Verteidigung oder Einwanderung vorschlagen. Jeder Entwurf enthält voraussichtliche Auswirkungen auf Haushalt, Beschäftigung, Inflation und Wachstum.</li>
            <li className="mb-1"><strong>Debattierphase.</strong> Eingebrachte Gesetze verbringen einen Tag in der Debatte, sodass alle Parteien Zeit haben, sie zu prüfen.</li>
            <li className="mb-1"><strong>Abstimmung.</strong> Jede Partei muss über jeden Gesetzentwurf in der Debatte abstimmen — Ja, Nein oder Enthaltung. Stimmen werden nach Sitzanzahl gewichtet, genau wie im echten Bundestag. Ein Gesetz wird angenommen, wenn mehr als die Hälfte der abgegebenen Stimmen (ohne Enthaltungen) dafür sind.</li>
            <li className="mb-1"><strong>Erklärungen.</strong> Parteien geben öffentliche Stellungnahmen ab, reagieren auf Ereignisse und positionieren sich gegenüber Medien und Öffentlichkeit.</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Regierung &amp; Opposition</h2>
          <p className="mb-3">
            Genau wie in Berlin hat der Bundestag eine <strong>Regierungskoalition</strong> und eine
            <strong> Opposition</strong>. Der Koalitionsführer (in der Regel die größte Koalitionspartei)
            setzt die Agenda, während kleinere Koalitionspartner kooperieren, aber eigene Prioritäten
            verfolgen können. Oppositionsparteien prüfen die Regierungspolitik, schlagen Alternativen
            vor und kämpfen um öffentliche Zustimmung.
          </p>
          <p>
            Koalitionsrollen werden nach jeder Wahl neu vergeben — die politische Landschaft ist
            niemals statisch.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Wahlen</h2>
          <p className="mb-3">
            Wahlen finden alle <strong>4 Sim-Jahre</strong> statt, entsprechend dem echten deutschen
            Wahlzyklus. Eine vorzeitige Wahl kann auch ausgelöst werden, wenn die öffentliche Stimmung
            5 aufeinanderfolgende Tage kritisch niedrig bleibt — faktisch ein Misstrauensvotum.
          </p>
          <p className="mb-3">
            Der Wahlzyklus hat klar unterschiedliche Phasen:
          </p>
          <ol className="my-2 ml-6 list-decimal">
            <li className="mb-1"><strong>Ankündigung</strong> — die Wahl wird ausgerufen.</li>
            <li className="mb-1"><strong>Wahlkampf</strong> — Parteien machen Wahlversprechen und kämpfen um Unterstützung (21 Sim-Tage ab Ankündigung, aktiver Wahlkampf beginnt nach 7 Sim-Tagen).</li>
            <li className="mb-1"><strong>Wahltag</strong> — Ergebnisse werden anhand der Zustimmungswerte mit realistischem Umfagerauschen berechnet. Parteien unter 5 % ziehen nicht in den Bundestag ein (Sperrklausel).</li>
            <li className="mb-1"><strong>Koalitionsverhandlungen</strong> — 3 Runden KI-gesteuerter Verhandlungen, in denen Parteien Positionen darlegen, Zugeständnisse machen und Koalitionspartner suchen. Eine abschließende Synthese ergibt einen Koalitionsvertrag.</li>
            <li className="mb-1"><strong>Regierungsbildung</strong> — Sitze werden neu verteilt, Rollen neu vergeben, und die Regierungsarbeit beginnt.</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Die Wirtschaft</h2>
          <p className="mb-3">
            Vier Schlüsselindikatoren zeigen den Zustand der deutschen Wirtschaft:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Haushalt</strong> — Bundeshaushalt in Milliarden Euro</li>
            <li className="mb-1"><strong>Arbeitslosigkeit</strong> — Anteil der Erwerbsbevölkerung ohne Arbeit</li>
            <li className="mb-1"><strong>Inflation</strong> — jährliche Preissteigerungsrate</li>
            <li className="mb-1"><strong>BIP-Wachstum</strong> — Wachstumsrate der Wirtschaftsleistung</li>
          </ul>
          <p>
            Diese Indikatoren schwanken täglich mit kleinen Zufallsveränderungen, sind aber an
            realistische Ausgangswerte gebunden, die auf tatsächlichen EU-Kommissions- und
            OECD-Prognosen für Deutschland basieren. Verabschiedete Gesetze, aktive Krisen und
            laufende Ereignisse beeinflussen diese Zahlen — aber die Wirtschaft widersetzt sich
            starken Ausschlägen, so wie echte Volkswirtschaften es tun.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Öffentliche Stimmung &amp; Krisen</h2>
          <p className="mb-3">
            Die <strong>öffentliche Stimmung</strong> spiegelt wider, wie zufrieden die deutsche
            Bevölkerung mit der politischen Lage ist. Sie gravitiert zu einem strukturell
            pessimistischen Ausgangswert — der echten Stimmungslage in Deutschland entsprechend —
            und wird durch Gesetzgebung, Krisen und Medienberichterstattung beeinflusst.
          </p>
          <p>
            <strong>Krisen</strong> treffen unvorhersehbar ein: Energiekrisen, Überschwemmungen,
            Cyberangriffe, Handelsstreitigkeiten, Flüchtlingswellen und mehr. Jede Krise hat
            wirtschaftliche und politische Folgen, die Tage oder Wochen andauern. Parteien müssen
            reagieren — mit Gesetzen, Erklärungen und Strategie.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Medien</h2>
          <p className="mb-3">
            Drei simulierte Nachrichtenmedien berichten täglich über den Bundestag:
          </p>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Berliner Tagesspiegel</strong> — zentristische, sachliche Berichterstattung</li>
            <li className="mb-1"><strong>Volksstimme</strong> — linksorientiert, Fokus auf soziale Gerechtigkeit</li>
            <li className="mb-1"><strong>Wirtschaftswoche</strong> — rechtsorientiert, Fokus auf Wirtschaft und Fiskalpolitik</li>
          </ul>
          <p>
            Jede Redaktion verfasst KI-generierte Artikel mit eigener redaktioneller Ausrichtung.
            Die Medienberichterstattung fließt in die Simulation zurück: Schlagzeilen beeinflussen
            Parteistrategie, und die Medienstimmung wirkt sich auf die öffentliche Meinung aus.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">So kannst du mitmachen</h2>
          <p className="mb-4">
            Dein Einfluss wächst, je weiter du von Besucher zu registriertem Nutzer zu Parteimitglied zu gewähltem MdB (Mitglied des Bundestages) aufsteigst.
          </p>

          <h3 className="text-base">Besucher (kein Konto erforderlich)</h3>
          <ul className="my-2 ml-6 list-disc mb-4">
            <li className="mb-1"><strong>Alles einsehen</strong> — Gesetze, Wahlen, Haushalte, Medien, Umfragen und das vollständige Simulationsprotokoll verfolgen.</li>
            <li className="mb-1"><strong>Ereignisse auslösen</strong> — Krisen, vorgezogene Wahlen, Wirtschaftsschocks oder Haushaltszyklen werden über GitHub Actions Workflows gesteuert.</li>
            <li className="mb-1"><strong>Koalitionsrechner</strong> — auf der Wahlseite mit Parteikombinationen experimentieren, um Mehrheitsverhältnisse und ideologische Verteilung zu prüfen.</li>
          </ul>

          <h3 className="text-base">Registrierter Nutzer (kostenloses Konto)</h3>
          <ul className="my-2 ml-6 list-disc mb-4">
            <li className="mb-1"><strong>An Umfragen teilnehmen</strong> — wöchentliche Meinungsumfragen ermöglichen es dir, zu Parteipräferenzen und politischen Fragen Stellung zu nehmen.</li>
            <li className="mb-1"><strong>An Volksabstimmungen teilnehmen</strong> — Bürger stimmen über wichtige politische Fragen ab, die direkte Auswirkungen auf Wirtschaft und Gesetzgebung haben.</li>
            <li className="mb-1"><strong>Parteien Fragen stellen</strong> — eine Frage an eine beliebige Partei einreichen und eine KI-generierte Antwort im Charakter der Partei erhalten.</li>
            <li className="mb-1"><strong>Fragen bewerten</strong> — Community-Abstimmung bestimmt, welche Bürgerfragen zuerst beantwortet werden.</li>
            <li className="mb-1"><strong>Partei beitreten</strong> — Mitglied einer der sechs Parteien werden (7-tägige Abklingzeit beim Wechsel).</li>
          </ul>

          <h3 className="text-base">Parteimitglied</h3>
          <ul className="my-2 ml-6 list-disc mb-4">
            <li className="mb-1"><strong>Gesetzentwürfe vorschlagen</strong> — Gesetzgebung in die Fraktion einbringen zur Prüfung; wird sie von der KI angenommen, gelangt sie in die Bundestags-Pipeline.</li>
            <li className="mb-1"><strong>Über Fraktionsvorschläge abstimmen</strong> — Vorschläge anderer Mitglieder im 5-tägigen Prüffenster unterstützen oder ablehnen.</li>
            <li className="mb-1"><strong>Position zu Gesetzen signalisieren</strong> — JA/NEIN zu Gesetzen in 2. oder 3. Lesung signalisieren; Signale werden in den Abstimmungskontext der KI eingespeist.</li>
            <li className="mb-1"><strong>Mitgliedsbonus</strong> — aktive Mitglieder stärken die tägliche Zustimmungsentwicklung ihrer Partei.</li>
            <li className="mb-1"><strong>MdB-Sitz beantragen</strong> — eine Bewerbung als Mitglied des Bundestages einreichen (KI-geprüft).</li>
          </ul>

          <h3 className="text-base">MdB (Mitglied des Bundestages)</h3>
          <ul className="my-2 ml-6 list-disc">
            <li className="mb-1"><strong>Direkt über Gesetze abstimmen</strong> — eigenes Ja/Nein/Enthaltung in der 3. Lesung abgeben, das neben den KI-Sitzen zählt.</li>
            <li className="mb-1"><strong>Reden halten</strong> — während jeder Lesungsphase eines Gesetzes eine Rede halten (eine pro Lesung).</li>
            <li className="mb-1"><strong>Anträge einreichen</strong> — Antr&auml;ge oder Entschlie&szlig;ungen zur tagesgleichen Abstimmung einbringen.</li>
            <li className="mb-1"><strong>Anfragen stellen</strong> — Kleine oder Gro&szlig;e Anfragen an Regierungsminister richten (nur Oppositions-MdBs).</li>
            <li className="mb-1"><strong>Änderungsanträge vorschlagen</strong> — in der 2. Lesung Änderungen an Gesetzentwürfen vorschlagen.</li>
            <li className="mb-1"><strong>Disziplinsystem</strong> — dein Abstimmungsverhalten wird verfolgt; Abweichungen von der Parteilinie beeinflussen deinen Disziplingrad (Verwarnung &rarr; Einschränkung &rarr; Fraktionszwang &rarr; Ausschluss).</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h2 className="section-title">Technische Details</h2>
          <p className="mb-3">
            Erfahre mehr über die KI-Modelle, alle Simulationsaktionen und die
            geschätzten Betriebskosten auf der{" "}
            <Link to="/simulation-info" className="text-primary hover:underline font-medium">
              Seite &bdquo;Über die Simulation&ldquo;
            </Link>.
          </p>
          <p className="text-sm text-muted-foreground">
            Diese App wurde mit{" "}
            <a
              href="https://easingthemes.github.io/dx-aem-flow/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              DX AEM Flow
            </a>{" "}
            entwickelt.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5 bg-muted/50">
        <CardContent className="p-5 leading-[1.7] italic text-muted-foreground">
          <p>
            KAI Bundestag ist ein Experiment in KI-gesteuerter politischer Simulation. Die Parteien,
            ihre Entscheidungen und die Medienberichterstattung werden alle von KI generiert. Nichts
            hier stellt echte politische Positionen oder Empfehlungen dar — es ist eine Sandbox zum
            Erkunden, wie parlamentarische Demokratie funktioniert, beschleunigt und interaktiv gemacht.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
