import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type MdbProfile } from "../api";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MDB_BADGE, STATUS_BADGE, VOTE_HEX } from "@/lib/colors";
import { DisciplineBadge } from "@/components/MdbBadge";

type Tab = "votes" | "speeches" | "info";

const VOTE_BADGE: Record<string, string> = {
  yes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  no: "bg-red-50 text-red-700 border-red-200",
  abstain: "bg-amber-50 text-amber-700 border-amber-200",
};

const VOTE_LABEL: Record<string, string> = {
  yes: "Ja",
  no: "Nein",
  abstain: "Enthaltung",
};

export function MdbDetail() {
  const { seatId } = useParams<{ seatId: string }>();
  const [profile, setProfile] = useState<MdbProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("votes");

  const refresh = useCallback(() => {
    if (!seatId) return;
    api.getMdbProfile(seatId)
      .then(p => { setProfile(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, [seatId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="py-8"><LoadingSkeleton lines={6} /></div>;
  if (!profile) return <p className="text-muted-foreground py-8 text-center">Abgeordneter nicht gefunden.</p>;

  const { seat, party, application, votes, speeches, committees } = profile;
  const displayName = seat.displayName ?? `Sitz ${seat.seatNumber}`;

  // Vote statistics
  const voteStats = { yes: 0, no: 0, abstain: 0 };
  for (const v of votes) {
    if (v.vote === "yes") voteStats.yes++;
    else if (v.vote === "no") voteStats.no++;
    else voteStats.abstain++;
  }
  const totalVotes = votes.length;

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "votes", label: "Abstimmungen", count: votes.length },
    { key: "speeches", label: "Reden", count: speeches.length },
    { key: "info", label: "Profil", count: 0 },
  ];

  return (
    <div>
      <Link to="/mdb" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
        ← Alle Abgeordneten
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
          style={{ backgroundColor: party?.color ?? "#6b7280" }}
        >
          {seat.seatNumber}
        </div>
        <div>
          <h2 className="section-title mb-1">{displayName}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {party && (
              <Link to={`/parties/${party.id}`} className="text-sm font-medium hover:underline" style={{ color: party.color }}>
                {party.name}
              </Link>
            )}
            <span className="text-muted-foreground text-sm">Sitz #{seat.seatNumber}</span>
            {seat.controller === "human" && (
              <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>Spieler</Badge>
            )}
            {seat.controller === "ai" && (
              <Badge variant="outline" className="text-xs bg-zinc-50 text-zinc-500">KI</Badge>
            )}
            <DisciplineBadge level={seat.disciplineLevel} />
          </div>
        </div>
      </div>

      {/* Quick stats */}
      {totalVotes > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(["yes", "no", "abstain"] as const).map(key => (
            <Card key={key}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold" style={{ color: VOTE_HEX[key] }}>
                  {voteStats[key]}
                </p>
                <p className="text-xs text-muted-foreground">{VOTE_LABEL[key]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-4 gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "votes" && (
        <div>
          {votes.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Noch keine Abstimmungen.</p>
          ) : (
            <div className="space-y-2">
              {votes.map((v, i) => (
                <Card key={i}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/bills/${v.billId}`} className="text-sm font-medium text-primary hover:underline truncate block">
                        {v.billTitle}
                      </Link>
                      <Badge variant="outline" className={cn("text-xs mt-1", STATUS_BADGE[v.billStatus])}>
                        {v.billStatus}
                      </Badge>
                    </div>
                    <Badge variant="outline" className={cn("text-xs shrink-0", VOTE_BADGE[v.vote])}>
                      {VOTE_LABEL[v.vote] ?? v.vote}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "speeches" && (
        <div>
          {speeches.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Noch keine Reden gehalten.</p>
          ) : (
            <div className="space-y-3">
              {speeches.map(s => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Link to={`/bills/${s.billId}`} className="text-sm font-medium text-primary hover:underline">
                        {s.billTitle}
                      </Link>
                      <Badge variant="outline" className="text-xs">
                        {s.reading}. Lesung
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">Tag {s.dayNumber}</span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-line">{s.content}</p>
                    {s.sentimentImpact != null && s.sentimentImpact !== 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Stimmungseffekt: {s.sentimentImpact > 0 ? "+" : ""}{s.sentimentImpact.toFixed(1)}%
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "info" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-2">Sitzinformationen</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Sitznummer</dt>
                <dd>{seat.seatNumber}</dd>
                <dt className="text-muted-foreground">Partei</dt>
                <dd>{party?.name ?? seat.partyId}</dd>
                <dt className="text-muted-foreground">Steuerung</dt>
                <dd>{seat.controller === "human" ? "Spieler" : "KI-gesteuert"}</dd>
                <dt className="text-muted-foreground">Proxy-Standard</dt>
                <dd>{seat.proxyDefault === "party_line" ? "Parteilinie" : "Enthaltung"}</dd>
                <dt className="text-muted-foreground">Zugewiesen am</dt>
                <dd>Tag {seat.allocatedOnDay}</dd>
                {seat.disciplineReason && (
                  <>
                    <dt className="text-muted-foreground">Fraktionsdisziplin</dt>
                    <dd>{seat.disciplineReason}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {committees && committees.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Ausschüsse</h3>
                <div className="space-y-2">
                  {committees.map(c => (
                    <div key={c.committeeId} className="flex items-center justify-between">
                      <Link to={`/committees/${c.committeeId}`} className="text-sm text-foreground hover:text-primary no-underline">
                        {c.committeeName}
                      </Link>
                      <Badge variant="outline" className={cn("text-xs",
                        c.role === "chair" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        c.role === "deputy_chair" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-zinc-50 text-zinc-600 border-zinc-200"
                      )}>
                        {c.role === "chair" ? "Vorsitz" : c.role === "deputy_chair" ? "Stv. Vorsitz" : "Mitglied"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {application && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Bewerbung</h3>
                <p className="text-sm mb-2">{application.motivation}</p>
                {application.policyFocus && application.policyFocus.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {application.policyFocus.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
