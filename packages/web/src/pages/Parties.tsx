import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Party, type Fraktion, type AlignmentData } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE, FRAKTION_BADGE } from "@/lib/colors";
import { cn } from "@/lib/utils";

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
  const [name, setName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handle = async () => {
    if (name.trim().length < 2) return;
    setStatus("loading");
    try {
      let result;
      if (user) {
        result = await api.joinParty(party.id);
      } else {
        result = await api.registerUser(name.trim(), party.id);
      }
      login(result.id, result);
      onJoined();
      onClose();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to join");
      setStatus("error");
    }
  };

  const displayColor = party.color === "#FFED00" ? "#c4a900" : party.color;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <Card className="w-[340px] shadow-lg" onClick={e => e.stopPropagation()}>
        <CardContent className="p-7">
          <h3 className="text-lg font-semibold mb-4">Join {party.name}</h3>
          {!user && (
            <>
              <label className="text-sm text-muted-foreground block mb-1">
                Display name (public within the party)
              </label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                placeholder="Your name"
                className="w-full px-2.5 py-2 rounded border border-input text-sm"
                onKeyDown={e => e.key === "Enter" && handle()}
              />
            </>
          )}
          {user && (
            <p className="text-sm text-muted-foreground mb-4">
              You'll join as <strong>{user.displayName}</strong>.
              {user.partyId && <span className="text-muted-foreground/60"> A 7-day switching cooldown will apply.</span>}
            </p>
          )}
          {status === "error" && (
            <div className="text-xs text-destructive my-2">{errMsg}</div>
          )}
          <div className="flex gap-2 mt-4 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handle}
              disabled={status === "loading" || (!user && name.trim().length < 2)}
              className="px-4 py-1.5 rounded border-none text-white font-bold text-sm cursor-pointer disabled:opacity-60"
              style={{ background: displayColor }}
            >
              {status === "loading" ? "Joining…" : `Join ${party.name}`}
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

  if (parties.length === 0) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  return (
    <div>
      <h1>Parties</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {parties.map(p => {
          const fraktion = fraktionen.find(f => f.partyId === p.id);
          const isMyParty = user?.partyId === p.id;
          const displayColor = p.color === "#FFED00" ? "#c4a900" : p.color;
          return (
            <div key={p.id} className="relative">
              <Link to={`/parties/${p.id}`} className="no-underline text-inherit">
                <Card className="transition-colors hover:border-border" style={{ borderColor: p.color }}>
                  <CardContent className="p-5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-lg" style={{ color: displayColor }}>{p.name}</div>
                      <div className="flex gap-1.5 items-center">
                        {isMyParty && (
                          <span className="text-xs font-bold" style={{ color: displayColor }}>Your Party ✓</span>
                        )}
                        <Badge className={fraktion
                          ? FRAKTION_BADGE.active
                          : FRAKTION_BADGE.none
                        }>
                          {fraktion ? "Fraktion" : "No Fraktion"}
                        </Badge>
                        <Badge className={ROLE_BADGE[p.coalitionRole] || ""}>
                          {p.coalitionRole}
                        </Badge>
                      </div>
                    </div>
                    {fraktion && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Fraktion Leader: {fraktion.leaderName}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground mt-1">{p.ideology}</div>

                    <div className="flex gap-6 items-end mt-3">
                      <div>
                        <div className="text-2xl font-bold" style={{ color: displayColor }}>{p.seatCount}</div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Seats</div>
                      </div>
                      <div className="flex items-center justify-between flex-1">
                        <div>
                          <div className="text-2xl font-bold" style={{ color: displayColor }}>{p.approvalRating.toFixed(1)}%</div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Approval</div>
                        </div>
                        {p.recentApprovals && p.recentApprovals.length >= 2 && (
                          <Sparkline values={p.recentApprovals} color={displayColor} />
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Policy Priorities</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(p.policyPriorities).map(([key, val]) => (
                          <span
                            key={key}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              val > 0 ? "bg-emerald-50" : val < 0 ? "bg-red-50" : "bg-zinc-100"
                            )}
                          >
                            {key}: {val > 0 ? "+" : ""}{val}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Member count + Join button */}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">
                        👥 {p.memberCount} member{p.memberCount !== 1 ? "s" : ""}
                        {p.memberCount > 0 && (() => {
                          const bonus = Math.min(5, Math.log10(p.memberCount + 1) * 2.5) * 0.01;
                          return <span className="ml-1 text-emerald-500">+{bonus.toFixed(3)}/day</span>;
                        })()}
                      </span>
                      {!isMyParty && (
                        <button
                          onClick={e => { e.preventDefault(); setJoiningParty(p); }}
                          className="text-xs px-2.5 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80"
                          style={{ borderColor: displayColor, color: displayColor }}
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Vote Alignment Matrix */}
      {alignment && (
        <div className="mt-8">
          <h2>Vote Alignment</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Percentage of votes where each pair of parties voted the same way. Requires at least 3 shared votes to show a value.
          </p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm min-w-[400px]">
              <thead>
                <tr>
                  <th className="px-2.5 py-1.5 text-left border-b-2 border-border bg-muted/50">Party</th>
                  {alignment.parties.map(p => {
                    const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                    return (
                      <th key={p.id} className="px-2 py-1.5 text-center border-b-2 border-border bg-muted/50 whitespace-nowrap">
                        <span className="inline-block size-2 rounded-full mr-1" style={{ backgroundColor: color }} />
                        {p.name}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {alignment.parties.map(rowParty => {
                  const rowColor = rowParty.color === "#FFED00" ? "#c4a900" : rowParty.color;
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
