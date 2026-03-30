import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

export function Impressum() {
  return (
    <div>
      <h2 className="section-title">Impressum</h2>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">Angaben gem. DDG &sect; 5</h3>

          <p className="mb-1"><strong>Verantwortlich:</strong></p>
          <p className="mb-3 text-muted-foreground">
            [Vorname Nachname]<br />
            [Stra&szlig;e Hausnummer]<br />
            [PLZ Ort]<br />
            Deutschland
          </p>

          <p className="mb-1"><strong>Kontakt:</strong></p>
          <p className="mb-3 text-muted-foreground">
            E-Mail: [deine@email.de]<br />
            GitHub:{" "}
            <a
              href="https://github.com/easingthemes/ki-bundestag"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              github.com/easingthemes/ki-bundestag
            </a>
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-5 leading-[1.7]">
          <h3 className="text-base font-semibold mb-3">Haftungsausschluss</h3>

          <h4 className="text-sm font-semibold mt-3 mb-1">Inhalte</h4>
          <p className="mb-3 text-sm">
            Die Inhalte dieser Seite werden mit gr&ouml;&szlig;tm&ouml;glicher Sorgfalt erstellt.
            Es handelt sich um eine KI-generierte Parlamentssimulation &mdash; s&auml;mtliche
            politischen Positionen, Gesetzesvorschl&auml;ge und Medienberichte sind fiktiv und
            stellen keine echten politischen Empfehlungen dar. F&uuml;r die Richtigkeit,
            Vollst&auml;ndigkeit und Aktualit&auml;t der Inhalte wird keine Gew&auml;hr &uuml;bernommen.
          </p>

          <h4 className="text-sm font-semibold mt-3 mb-1">Links</h4>
          <p className="text-sm">
            Diese Seite enth&auml;lt Links zu externen Webseiten Dritter (z.&nbsp;B. GitHub,
            Google, Anthropic). Auf deren Inhalte besteht kein Einfluss; die jeweiligen Anbieter
            sind f&uuml;r ihre Inhalte selbst verantwortlich.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-5 bg-muted/50">
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p>
            Siehe auch:{" "}
            <Link to="/datenschutz" className="text-primary hover:underline font-medium">
              Datenschutzerkl&auml;rung
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
