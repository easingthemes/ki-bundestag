import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Party, type Fraktion, type AlignmentData } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FRAKTION_BADGE } from "@/lib/colors";
import { cn, fixColor } from "@/lib/utils";
import { PartyCard, PartyCardGrid } from "@/components/PartyCard";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 64, h = 22;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`
  ).join(" ");
  const trend = values[values.length - 1] - values[0];
  const lineColor = trend > 0.5 ? "#10b981" : trend < -0.5 ? "#ef4444" : color;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function JoinModal({ party, onClose, onJoined }: {
  party: Party;
  onClose: () => void;
  onJoined: () => void;
}) {
  const { user, login } = useUser();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=/parties");
      onClose();
    }
  }, [user, navigate, onClose]);

  if (!user) return null;

  const handle = async () => {
    setStatus("loading");
    try {
      const result = await api.joinParty(party.id);
      login(result.id, result);
      onJoined();
      onClose();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to join");
      setStatus("error");
    }
  };

  const displayColor = fixColor(party.color);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <Card className="w-[340px] shadow-lg" onClick={e => e.stopPropagation()}>
        <CardContent className="p-7">
          <h3 className="text-lg font-semibold mb-4">{party.name} beitreten</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Du trittst bei als <strong>{user.displayName}</strong>.
            {user.partyId && <span className="text-muted-foreground/60"> Es gilt eine 7-Tage-Wechselsperre.</span>}
          </p>
          {status === "error" && (
            <div className="text-xs text-destructive my-2">{errMsg}</div>
          )}
          <div className="flex gap-2 mt-4 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handle}
              disabled={status === "loading"}
              className="px-4 py-1.5 rounded border-none text-white font-bold text-sm cursor-pointer disabled:opacity-60"
              style={{ background: displayColor }}
            >
              {status === "loading" ? "Beitritt…" : `${party.name} beitreten`}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Parties() {
  const { user } = useUser();
  const [parties, setParties] = useState<Party[]>([]);
  const [fraktionen, setFraktionen] = useState<Fraktion[]>([]);
  const [alignment, setAlignment] = useState<AlignmentData | null>(null);
  const [joiningParty, setJoiningParty] = useState<Party | null>(null);

  const refresh = useCallback(() => {
    api.getParties().then(setParties).catch(console.error);
    api.getFraktionen("active").then(setFraktionen).catch(console.error);
    api.getAlignment().then(setAlignment).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  return (
    <div>
      <h2 className="section-title">Parteien</h2>

      <PartyCardGrid>
        {parties.map(p => {
          const fraktion = fraktionen.find(f => f.partyId === p.id);
          const isMyParty = user?.partyId === p.id;
          const displayColor = fixColor(p.color);

          return (
            <div key={p.id} className="relative">
              <Link to={`/parties/${p.id}`} className="no-underline">
                <PartyCard
                  party={p}
                  highlight={isMyParty}
                  className="hover:shadow-md hover:border-border/80 cursor-pointer"
                >
                  {/* Sparkline + badges */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fraktion && (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", FRAKTION_BADGE.active)}>
                          Fraktion
                        </Badge>
                      )}
                      {isMyParty && (
                        <span className="text-[10px] font-bold" style={{ color: displayColor }}>Deine Partei</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {p.memberCount} Mitgl.
                      </span>
                    </div>
                    {p.recentApprovals && p.recentApprovals.length >= 2 && (
                      <Sparkline values={p.recentApprovals} color={displayColor} />
                    )}
                  </div>
                </PartyCard>
              </Link>

              {/* Join button (overlaid) */}
              {!isMyParty && (
                <button
                  type="button"
                  onClick={() => setJoiningParty(p)}
                  className="absolute top-2.5 right-2.5 text-[10px] px-2 py-0.5 rounded border bg-card font-semibold cursor-pointer hover:opacity-80"
                  style={{ borderColor: displayColor, color: displayColor }}
                >
                  Beitreten
                </button>
              )}
            </div>
          );
        })}
      </PartyCardGrid>

      {/* Vote Alignment Matrix */}
      {alignment && (
        <div className="mt-8">
          <h2 className="section-title">Abstimmungsverhalten</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Prozentsatz der Abstimmungen, bei denen jedes Parteienpaar gleich gestimmt hat. Mindestens 3 gemeinsame Abstimmungen erforderlich.
          </p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm min-w-[400px]">
              <thead>
                <tr>
                  <th className="px-2.5 py-1.5 text-left border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Partei</th>
                  {alignment.parties.map(p => {
                    const color = fixColor(p.color);
                    return (
                      <th key={p.id} className="px-2 py-1.5 text-center border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider whitespace-nowrap">
                        <span className="inline-block size-2 rounded-full mr-1" style={{ backgroundColor: color }} />
                        {p.name}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {alignment.parties.map(rowParty => {
                  const rowColor = fixColor(rowParty.color);
                  return (
                    <tr key={rowParty.id}>
                      <td className="px-2.5 py-1.5 font-semibold border-b border-border whitespace-nowrap">
                        <span className="inline-block size-2 rounded-full mr-1.5" style={{ backgroundColor: rowColor }} />
                        {rowParty.name}
                      </td>
                      {alignment.parties.map(colParty => {
                        const val = alignment.matrix[rowParty.id]?.[colParty.id];
                        const isSelf = rowParty.id === colParty.id;
                        let bg = "#f0f0f0";
                        let textColor = "#888";
                        if (!isSelf && val != null) {
                          bg = `hsl(${val * 1.2}, 65%, 88%)`;
                          textColor = val >= 60 ? "#1a5c2a" : val >= 40 ? "#5c3a00" : "#5c1a1a";
                        }
                        return (
                          <td
                            key={colParty.id}
                            className="px-2 py-1.5 text-center border-b border-border min-w-14"
                            style={{ background: bg, color: textColor, fontWeight: val != null && !isSelf ? 600 : 400 }}
                          >
                            {isSelf ? "—" : val != null ? `${val}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {joiningParty && (
        <JoinModal
          party={joiningParty}
          onClose={() => setJoiningParty(null)}
          onJoined={() => { refresh(); setJoiningParty(null); }}
        />
      )}
    </div>
  );
}
