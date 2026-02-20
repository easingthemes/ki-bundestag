import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Referendum } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE, ALERT_STYLES } from "@/lib/colors";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function Referendums() {
  const { user } = useUser();
  const [referendums, setReferendums] = useState<Referendum[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [pastVisible, setPastVisible] = useState(5);

  const refresh = useCallback(() => {
    api.getReferendums(filterStatus || undefined)
      .then(setReferendums).catch(console.error);
  }, [filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);

  const handleVote = async (id: string, option: string) => {
    if (votedIds.has(id)) return;
    try {
      await api.voteReferendum(id, option);
      setVotedIds(prev => new Set(prev).add(id));
      refresh();
    } catch (err) {
      console.error("Vote failed:", err);
    }
  };

  useEffect(() => { setPastVisible(5); }, [filterStatus]);

  const active = referendums.filter(r => r.status === "active");
  const past = referendums.filter(r => r.status !== "active");

  const unvotedActive = active.filter(r => !votedIds.has(r.id));

  return (
    <div>
      <h1>Referendums</h1>

      {/* Registration prompt */}
      {!user && active.length > 0 && (
        <div className={`${ALERT_STYLES.info} mb-4`}>
          <Link to="/parties" className="text-primary font-semibold hover:underline">Register and join a party</Link> to participate — vote on referendums and shape policy.
        </div>
      )}

      {/* Unvoted nudge */}
      {unvotedActive.length > 0 && (
        <div className={`${ALERT_STYLES.warning} mb-4`}>
          {unvotedActive.length} active referendum{unvotedActive.length !== 1 ? "s" : ""} awaiting your vote.
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SELECT_CLS}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="passed">Passed</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {active.length > 0 && (
        <div className="mb-8">
          <h2>Active Referendums</h2>
          {active.map(ref => (
            <ReferendumCard
              key={ref.id}
              referendum={ref}
              hasVoted={votedIds.has(ref.id)}
              onVote={handleVote}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mb-8">
          <h2>Past Referendums</h2>
          {past.slice(0, pastVisible).map(ref => (
            <ReferendumCard
              key={ref.id}
              referendum={ref}
              hasVoted={true}
              onVote={handleVote}
            />
          ))}
          <ShowMoreButton
            total={past.length}
            visible={Math.min(pastVisible, past.length)}
            increment={5}
            onShowMore={() => setPastVisible(c => c + 5)}
          />
        </div>
      )}

      {referendums.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No referendums yet. They are generated automatically every 30 simulation days.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReferendumCard({
  referendum,
  hasVoted,
  onVote,
}: {
  referendum: Referendum;
  hasVoted: boolean;
  onVote: (id: string, option: string) => void;
}) {
  const totalVotes = Object.values(referendum.votes).reduce((s, v) => s + v, 0);
  const showResults = hasVoted || referendum.status !== "active";

  return (
    <Card className="mb-2.5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className={STATUS_BADGE[referendum.status] || ""}>
            {referendum.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{referendum.category}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            Day {referendum.createdOnDay} — Closes Day {referendum.closesOnDay}
          </span>
        </div>

        <div className="font-bold text-[1.05rem] mb-1">{referendum.title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{referendum.description}</p>

        {referendum.status === "active" && !hasVoted ? (
          <div className="flex gap-2 mt-3">
            {referendum.options.map(opt => (
              <button
                key={opt}
                onClick={() => onVote(referendum.id, opt)}
                className="py-2 px-6 border-2 border-primary rounded-full bg-card text-primary font-semibold text-sm cursor-pointer transition-colors hover:bg-primary hover:text-white"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            {referendum.options.map(opt => {
              const count = referendum.votes[opt] || 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isWinner = referendum.result === opt;
              return (
                <div key={opt} className="h-8 rounded mb-1.5 flex items-center px-3 text-sm relative overflow-hidden bg-muted">
                  <div
                    className="absolute top-0 left-0 h-full rounded opacity-20"
                    style={{ width: `${pct}%`, background: isWinner ? "#10b981" : "#71717a" }}
                  />
                  <span className="relative z-10">
                    {opt}: {count} votes ({pct}%)
                    {isWinner && " ✓"}
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground mt-1">
              {totalVotes} total votes {totalVotes < 10 && referendum.status === "active" && `(need ${10 - totalVotes} more for quorum)`}
            </p>
          </div>
        )}

        {showResults && referendum.impact && referendum.status === "passed" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Impact: {Object.entries(referendum.impact)
              .filter(([, v]) => v != null && v !== 0)
              .map(([k, v]) => `${k}: ${(v as number) > 0 ? "+" : ""}${v}`)
              .join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
