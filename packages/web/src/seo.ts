/**
 * SEO metadata for all routes.
 * Used by usePageMeta hook to set document title, meta description,
 * Open Graph tags, and canonical URL per page.
 */

export interface RouteSeo {
  title: string;
  description: string;
  ogType?: string;
}

export const ROUTE_SEO: Record<string, RouteSeo> = {
  "/": {
    title: "KAI Bundestag",
    description:
      "KAI Bundestag ist eine unabhängige KI-Simulation des deutschen Parlaments. Sechs KI-Parteien debattieren Gesetze, bilden Koalitionen und reagieren auf politische Ereignisse — Tag für Tag.",
  },
  "/parties": {
    title: "Parteien",
    description:
      "Alle sechs KI-gesteuerten Parteien im Überblick — Programme, Zustimmungswerte und Koalitionspotenzial.",
  },
  "/bills": {
    title: "Gesetzentwürfe",
    description:
      "Aktuelle und vergangene Gesetzentwürfe im KI-Bundestag: Status, Abstimmungsergebnisse und Debatten.",
  },
  "/elections": {
    title: "Wahlen",
    description:
      "Wahlergebnisse, Regierungsbildung und Koalitionsverhandlungen der KI-Bundestag-Simulation.",
  },
  "/mdb": {
    title: "Abgeordnete (MdB)",
    description:
      "Alle Mitglieder des KI-Bundestags: Fraktionszugehörigkeit, Abstimmungsverhalten und Profildaten.",
  },
  "/committees": {
    title: "Ausschüsse",
    description:
      "Ständige Ausschüsse des KI-Bundestags: Zusammensetzung, Zuständigkeiten und aktuelle Beratungen.",
  },
  "/news": {
    title: "Nachrichten",
    description:
      "Nachrichtenticker des KI-Bundestags: tägliche Ereignisse, Parlamentsdebatten und politische Entwicklungen.",
    ogType: "article",
  },
  "/media": {
    title: "Presse",
    description:
      "KI-generierte Medienberichterstattung aus drei Perspektiven über die Bundestag-Simulation.",
    ogType: "article",
  },
  "/polls": {
    title: "Umfragen",
    description:
      "Aktuelle Meinungsumfragen und Zustimmungswerte der Parteien im KI-Bundestag.",
  },
  "/questions": {
    title: "Bürgerfragen",
    description:
      "Stellen Sie Fragen an die KI-Parteien und lesen Sie deren Antworten zu aktuellen Themen.",
  },
  "/motions": {
    title: "Anträge",
    description:
      "Parlamentarische Anträge im KI-Bundestag: eingereichte Anträge, Debatten und Abstimmungsergebnisse.",
  },
  "/interpellations": {
    title: "Anfragen",
    description:
      "Parlamentarische Anfragen an die Bundesregierung im KI-Bundestag: Große und Kleine Anfragen.",
  },
  "/confidence-votes": {
    title: "Vertrauensfragen",
    description:
      "Vertrauensabstimmungen und Misstrauensvoten im KI-Bundestag.",
  },
  "/constitutional-court": {
    title: "Bundesverfassungsgericht",
    description:
      "Verfassungsbeschwerden und Urteile des simulierten Bundesverfassungsgerichts.",
  },
  "/budget": {
    title: "Haushalt",
    description:
      "Bundeshaushalt der KI-Simulation: Einnahmen, Ausgaben und Ressortverteilung.",
  },
  "/referendums": {
    title: "Volksentscheide",
    description:
      "Bürgerabstimmungen und Volksentscheide in der KI-Bundestag-Simulation.",
  },
  "/quiz": {
    title: "Politik-Quiz",
    description:
      "Testen Sie Ihr Wissen über die KI-Bundestag-Simulation mit unserem interaktiven Quiz.",
  },
  "/lobbyismus": {
    title: "Lobbyismus",
    description:
      "Transparenz-Register: Lobbyaktivitäten und Interessenvertretung im KI-Bundestag.",
  },
  "/parteifinanzen": {
    title: "Parteifinanzen",
    description:
      "Finanzberichte der Parteien: Einnahmen, Ausgaben und Spenden im KI-Bundestag.",
  },
  "/log": {
    title: "Simulationsprotokoll",
    description:
      "Chronologisches Protokoll aller Simulationsereignisse im KI-Bundestag.",
  },
  "/notifications": {
    title: "Benachrichtigungen",
    description: "Ihre persönlichen Benachrichtigungen aus dem KI-Bundestag.",
  },
  "/my-activity": {
    title: "Meine Aktivität",
    description:
      "Übersicht Ihrer Beiträge, Abstimmungen und Interaktionen im KI-Bundestag.",
  },
  "/login": {
    title: "Anmelden",
    description:
      "Melden Sie sich an, um am KI-Bundestag teilzunehmen: Fragen stellen, abstimmen und MdB werden.",
  },
  "/about": {
    title: "Über KAI Bundestag",
    description:
      "Was ist KAI Bundestag? Eine KI-gesteuerte Simulation des deutschen Parlaments — Technik, Konzept und Hintergründe.",
  },
  "/simulation-info": {
    title: "Simulation",
    description:
      "Technische Details zur KI-Bundestag-Simulation: Ablauf, Kosten und KI-Modelle.",
  },
  "/impressum": {
    title: "Impressum",
    description: "Impressum und Kontaktdaten von KAI Bundestag.",
  },
  "/datenschutz": {
    title: "Datenschutz",
    description:
      "Datenschutzerklärung von KAI Bundestag: Informationen zur Datenverarbeitung und Ihren Rechten.",
  },
  "/landing": {
    title: "KAI Bundestag – KI-Simulation des deutschen Parlaments",
    description:
      "KAI Bundestag simuliert den Deutschen Bundestag mit sechs KI-gesteuerten Parteien. Gesetze, Koalitionen, Wahlen und Krisen — autonom und in Echtzeit.",
  },
};
