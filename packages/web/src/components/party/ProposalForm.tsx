import { useState } from "react";
import { api, type InternalProposal } from "../../api";
import { UserActionIcon } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { useUser } from "../../userContext";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const PROPOSAL_STATUS: Record<string, string> = {
  open: STATUS_BADGE.proposed,
  accepted: STATUS_BADGE.passed,
  declined: STATUS_BADGE.rejected,
};

interface ProposalFormProps {
  partyId: string;
  displayColor: string;
  proposals: InternalProposal[];
  simCurrentDay: number | undefined;
  onProposalsChange: (proposals: InternalProposal[]) => void;
  onNavigateToLogin: () => void;
}

export function ProposalForm({ partyId, displayColor, proposals, simCurrentDay, onProposalsChange, onNavigateToLogin }: ProposalFormProps) {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [propTitle, setPropTitle] = useState("");
  const [propDesc, setPropDesc] = useState("");
  const [propCategory, setPropCategory] = useState("economy");
  const [propSubmitting, setPropSubmitting] = useState(false);
  const [propMsg, setPropMsg] = useState<string | null>(null);

  const isMyParty = user?.partyId === partyId;

  return (
    <div id="proposals" className="mb-8">
      <div className="flex justify-between items-center mb-3">
        <h2 className="section-title m-0">Mitgliedervorschläge ({proposals.length})</h2>
        {isMyParty && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3.5 py-1 rounded border bg-card font-semibold text-sm cursor-pointer hover:opacity-80"
            style={{ borderColor: displayColor, color: displayColor }}
          >
            + Gesetzentwurf vorschlagen
          </button>
        )}
      </div>

      {showForm && (
        <Card className="mb-4" style={{ borderLeft: `3px solid ${displayColor}` }}>
          <CardContent className="p-5">
            <div className="font-semibold mb-2">Neuer Mitgliedervorschlag</div>
            <input
              type="text"
              value={propTitle}
              onChange={e => setPropTitle(e.target.value)}
              placeholder="Titel des Gesetzentwurfs (10–120 Zeichen)"
              maxLength={120}
              className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2"
            />
            <textarea
              value={propDesc}
              onChange={e => setPropDesc(e.target.value)}
              placeholder="Kurze Beschreibung (20–300 Zeichen)"
              maxLength={300}
              rows={3}
              className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
            />
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={propCategory}
                onChange={e => setPropCategory(e.target.value)}
                className={SELECT_CLS}
              >
                {["economy","social","environment","immigration","defense","education","healthcare","infrastructure"].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <button
                onClick={async () => {
                  if (propTitle.trim().length < 10 || propDesc.trim().length < 20) return;
                  setPropSubmitting(true);
                  setPropMsg(null);
                  try {
                    await api.createProposal(partyId, { title: propTitle.trim(), description: propDesc.trim(), category: propCategory });
                    setPropTitle(""); setPropDesc(""); setPropCategory("economy");
                    setShowForm(false);
                    setPropMsg("Vorschlag eingereicht!");
                    api.getPartyProposals(partyId).then(onProposalsChange).catch(console.error);
                  } catch (e) {
                    setPropMsg(e instanceof Error ? e.message : "Einreichen fehlgeschlagen");
                  } finally {
                    setPropSubmitting(false);
                    setTimeout(() => setPropMsg(null), 4000);
                  }
                }}
                disabled={propSubmitting || propTitle.trim().length < 10 || propDesc.trim().length < 20}
                className="px-3.5 py-1.5 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                style={{ background: displayColor }}
              >
                {propSubmitting ? "Wird eingereicht…" : "Einreichen"}
              </button>
              <button
                onClick={() => { setShowForm(false); setPropTitle(""); setPropDesc(""); }}
                className="px-2.5 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
              >
                Abbrechen
              </button>
              {propMsg && <span className={`text-xs ${propMsg.includes("fehlgeschlagen") ? "text-destructive" : "text-emerald-500"}`}>{propMsg}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {proposals.length === 0 ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>Noch keine Vorschläge.{isMyParty ? " Sei der Erste, der einen Gesetzentwurf vorschlägt!" : " Tritt dieser Partei bei, um Gesetze vorzuschlagen."}</span>
          {!isMyParty && (
            <button
              onClick={onNavigateToLogin}
              className="text-sm px-3 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80"
              style={{ borderColor: displayColor, color: displayColor }}
            >
              Beitreten
            </button>
          )}
        </div>
      ) : (
        <div>
          {proposals.slice(0, 20).map(p => {
            const isOpen = p.status === "open";
            const daysLeft = p.reviewByDay - (simCurrentDay ?? p.createdOnDay);
            return (
              <Card key={p.id} className="mb-2" style={{ opacity: isOpen ? 1 : 0.75 }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex gap-1.5 flex-wrap items-center mb-1">
                        {isOpen && isMyParty && <UserActionIcon title="Vote on this proposal" />}
                        <span className="font-semibold text-sm">{p.title}</span>
                        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50">{p.category}</Badge>
                        <Badge variant="outline" className={p.proposedBy === "ai"
                          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        }>
                          {p.proposedBy === "ai" ? "AI" : "Member"}
                        </Badge>
                        <Badge variant="outline" className={PROPOSAL_STATUS[p.status] || ""}>{p.status}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{p.description}</div>
                      {p.bundestagBillId && (
                        <div className="text-xs text-emerald-500 mt-1">
                          Im Bundestag eingereicht —{" "}
                          <a href={`/bills/${p.bundestagBillId}`} className="text-xs text-blue-600 hover:underline">
                            Gesetzentwurf ansehen →
                          </a>
                        </div>
                      )}
                      {p.declineReason && (
                        <div className="text-xs text-muted-foreground mt-1 italic">Party: "{p.declineReason}"</div>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {isOpen && isMyParty ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={async () => {
                              const updated = p.userVote === 1
                                ? await api.retractProposalVote(p.id)
                                : await api.voteOnProposal(p.id, 1);
                              onProposalsChange(proposals.map(x => x.id === p.id ? updated : x));
                            }}
                            title={p.userVote === 1 ? "Retract upvote" : "Upvote"}
                            className="border-none bg-transparent cursor-pointer text-lg p-0"
                            style={{ color: p.userVote === 1 ? SEMANTIC_HEX.positive : "#aaa" }}
                          >▲</button>
                          <span className="font-bold text-base min-w-7 text-center" style={{ color: p.voteScore >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                            {p.voteScore >= 0 ? "+" : ""}{p.voteScore}
                          </span>
                          <button
                            onClick={async () => {
                              const updated = p.userVote === -1
                                ? await api.retractProposalVote(p.id)
                                : await api.voteOnProposal(p.id, -1);
                              onProposalsChange(proposals.map(x => x.id === p.id ? updated : x));
                            }}
                            title={p.userVote === -1 ? "Retract downvote" : "Downvote"}
                            className="border-none bg-transparent cursor-pointer text-lg p-0"
                            style={{ color: p.userVote === -1 ? SEMANTIC_HEX.negative : "#aaa" }}
                          >▼</button>
                        </div>
                      ) : (
                        <div className="font-bold text-base" style={{ color: p.voteScore >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                          {p.voteScore >= 0 ? "+" : ""}{p.voteScore}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">{p.totalVotes} Stimme{p.totalVotes !== 1 ? "n" : ""}</div>
                      {isOpen && daysLeft >= 0 && (
                        <div className="text-xs text-muted-foreground">
                          {daysLeft === 0 ? "Heute geprüft" : `Noch ${daysLeft}T`}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
