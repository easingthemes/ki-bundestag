import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

export function Datenschutz() {
  return (
    <div>
      <h2 className="section-title">Datenschutzerkl&auml;rung</h2>

      {/* 1. Verantwortlicher */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">1. Verantwortlicher</h3>
          <p className="mb-3 text-sm">
            Verantwortlich f&uuml;r die Datenverarbeitung auf dieser Webseite ist die im{" "}
            <Link to="/impressum" className="text-primary hover:underline">Impressum</Link>{" "}
            genannte Person.
          </p>
        </CardContent>
      </Card>

      {/* 2. Hosting */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">2. Hosting</h3>
          <p className="text-sm">
            Diese Webseite wird bei einem externen Dienstleister gehostet (Hoster). Beim Aufruf
            der Seite erhebt der Hoster automatisch technische Daten in Server-Logfiles
            (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser-Typ). Diese Daten sind f&uuml;r
            den sicheren Betrieb technisch erforderlich. Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1
            lit.&nbsp;f DSGVO (berechtigtes Interesse an einem sicheren Webauftritt).
          </p>
        </CardContent>
      </Card>

      {/* 3. Cookies */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">3. Cookies</h3>
          <p className="mb-3 text-sm">
            Diese Webseite verwendet ausschlie&szlig;lich <strong>technisch notwendige
            Cookies</strong>:
          </p>
          <div className="overflow-x-auto mb-3">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold">Cookie</th>
                  <th className="text-left py-2 pr-4 font-semibold">Zweck</th>
                  <th className="text-left py-2 font-semibold">Dauer</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-xs">connect.sid</td>
                  <td className="py-2 pr-4">Session-Authentifizierung</td>
                  <td className="py-2">Sitzungsende</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            Es werden <strong>keine</strong> Tracking-, Analyse- oder Werbe-Cookies eingesetzt.
            Da ausschlie&szlig;lich technisch notwendige Cookies verwendet werden, ist gem.
            &sect;&nbsp;25 Abs.&nbsp;2 TTDSG keine Einwilligung erforderlich.
          </p>
        </CardContent>
      </Card>

      {/* 4. Anmeldung / OAuth */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">4. Anmeldung (OAuth)</h3>
          <p className="mb-3 text-sm">
            Du kannst dich &uuml;ber <strong>Google</strong> oder <strong>GitHub</strong> anmelden.
            Dabei werden folgende Daten vom jeweiligen Anbieter &uuml;bermittelt und gespeichert:
          </p>
          <ul className="my-2 ml-6 list-disc text-sm mb-3">
            <li className="mb-1">OAuth-ID (interne Kennung)</li>
            <li className="mb-1">Anzeigename</li>
            <li className="mb-1">E-Mail-Adresse</li>
            <li className="mb-1">Profilbild-URL</li>
          </ul>
          <p className="mb-3 text-sm">
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO
            (Vertragserf&uuml;llung &mdash; Bereitstellung des Dienstes auf Nutzerwunsch).
          </p>
          <p className="mb-3 text-sm">
            <strong>Drittlandtransfer:</strong> Google LLC und GitHub Inc. (Microsoft) sind unter
            dem EU-U.S. Data Privacy Framework zertifiziert. Weitere Informationen:
          </p>
          <ul className="my-2 ml-6 list-disc text-sm">
            <li className="mb-1">
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Google Datenschutzerkl&auml;rung
              </a>
            </li>
            <li className="mb-1">
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                GitHub Datenschutzerkl&auml;rung
              </a>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* 5. Nutzerdaten */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">5. Gespeicherte Nutzerdaten</h3>
          <p className="mb-3 text-sm">
            Neben den OAuth-Daten werden bei registrierten Nutzern folgende Daten gespeichert:
          </p>
          <ul className="my-2 ml-6 list-disc text-sm mb-3">
            <li className="mb-1">Gew&auml;hlter Anzeigename</li>
            <li className="mb-1">Parteimitgliedschaft und ggf. MdB-Status</li>
            <li className="mb-1">Eingereichte Fragen, Gesetzesvorschl&auml;ge und Abstimmungen</li>
            <li className="mb-1">Benachrichtigungseinstellungen</li>
          </ul>
          <p className="mb-3 text-sm">
            Die Daten werden in einer SQLite-Datenbank auf dem Server gespeichert.
            <strong> Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO.
          </p>
          <p className="text-sm">
            <strong>Speicherdauer:</strong> Daten werden gespeichert, solange dein Konto besteht.
            Bei Kontol&ouml;schung werden alle personenbezogenen Daten gel&ouml;scht.
          </p>
        </CardContent>
      </Card>

      {/* 6. KI-Dienste */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">6. KI-Dienste (Drittanbieter)</h3>
          <p className="mb-3 text-sm">
            Die Simulation nutzt KI-Modelle externer Anbieter:
          </p>
          <ul className="my-2 ml-6 list-disc text-sm mb-3">
            <li className="mb-1">
              <strong>Anthropic</strong> (Claude) &mdash; f&uuml;r die Generierung von
              Parteiaktionen, Debatten und Medienberichten
            </li>
            <li className="mb-1">
              <strong>xAI</strong> (Grok) &mdash; f&uuml;r einzelne Partei-KIs
            </li>
          </ul>
          <p className="mb-3 text-sm">
            An diese Dienste werden <strong>keine personenbezogenen Nutzerdaten</strong> &uuml;bermittelt.
            Die KI-Aufrufe enthalten ausschlie&szlig;lich Simulationsdaten (Parteipositionen,
            Gesetzestexte, Wirtschaftsindikatoren). Wenn du als Nutzer eine B&uuml;rgerfrage
            einreichst, wird der Fragetext (ohne deinen Namen oder andere pers&ouml;nliche
            Angaben) an die KI &uuml;bermittelt, um eine Antwort zu generieren.
          </p>
          <p className="text-sm">
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO
            (berechtigtes Interesse an der Bereitstellung der KI-Simulation). Beide Anbieter
            sind in den USA ans&auml;ssig und unter dem EU-U.S. Data Privacy Framework erreichbar.
          </p>
        </CardContent>
      </Card>

      {/* 7. Keine Analyse / Tracking */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">7. Analyse &amp; Tracking</h3>
          <p className="text-sm">
            Diese Webseite verwendet <strong>keine</strong> Analyse-Tools (z.&nbsp;B. Google
            Analytics), keine Tracking-Pixel und keine Werbenetzwerke. Es findet kein Profiling
            und keine Weitergabe von Nutzerdaten zu Werbezwecken statt.
          </p>
        </CardContent>
      </Card>

      {/* 8. Betroffenenrechte */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">8. Deine Rechte</h3>
          <p className="mb-3 text-sm">
            Du hast gem&auml;&szlig; DSGVO folgende Rechte:
          </p>
          <ul className="my-2 ml-6 list-disc text-sm mb-3">
            <li className="mb-1"><strong>Auskunft</strong> (Art.&nbsp;15) &mdash; Welche Daten &uuml;ber dich gespeichert sind</li>
            <li className="mb-1"><strong>Berichtigung</strong> (Art.&nbsp;16) &mdash; Falsche Daten korrigieren lassen</li>
            <li className="mb-1"><strong>L&ouml;schung</strong> (Art.&nbsp;17) &mdash; Deine Daten l&ouml;schen lassen</li>
            <li className="mb-1"><strong>Einschr&auml;nkung</strong> (Art.&nbsp;18) &mdash; Verarbeitung einschr&auml;nken lassen</li>
            <li className="mb-1"><strong>Daten&uuml;bertragbarkeit</strong> (Art.&nbsp;20) &mdash; Deine Daten in einem g&auml;ngigen Format erhalten</li>
            <li className="mb-1"><strong>Widerspruch</strong> (Art.&nbsp;21) &mdash; Der Verarbeitung widersprechen</li>
          </ul>
          <p className="text-sm">
            Zur Aus&uuml;bung deiner Rechte wende dich an die im{" "}
            <Link to="/impressum" className="text-primary hover:underline">Impressum</Link>{" "}
            genannte Kontaktadresse.
          </p>
        </CardContent>
      </Card>

      {/* 9. Beschwerderecht */}
      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">9. Beschwerderecht</h3>
          <p className="text-sm">
            Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbeh&ouml;rde zu beschweren
            (Art.&nbsp;77 DSGVO). Zust&auml;ndig ist in der Regel der
            Landesdatenschutzbeauftragte deines Bundeslandes bzw. des Bundeslandes, in dem der
            Verantwortliche seinen Sitz hat.
          </p>
        </CardContent>
      </Card>

      {/* 10. Aktualität */}
      <Card className="mb-5 bg-muted/50">
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p>
            Stand: M&auml;rz 2026. Diese Datenschutzerkl&auml;rung kann bei &Auml;nderungen der
            Datenverarbeitung aktualisiert werden.
          </p>
          <p className="mt-2">
            Siehe auch:{" "}
            <Link to="/impressum" className="text-primary hover:underline font-medium">
              Impressum
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
