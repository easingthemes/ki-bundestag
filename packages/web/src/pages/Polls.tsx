import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Poll } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton, UserActionIcon } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE, ALERT_STYLES } from "@/lib/colors";

const VOTED_KEY = "ki-bundestag-voted-polls";

function getVotedPolls(): Set<string> {
  try {
    const stored = localStorage.getItem(VOTED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markVoted(pollId: string) {
  const voted = getVotedPolls();
  voted.add(pollId);
  localStorage.setItem(VOTED_KEY, JSON.stringify(Array.from(voted)));
}

const BAR_COLORS = ["#004b91", "#28a745", "#dc3545", "#ffc107", "#6f42c1", "#17a2b8"];

export function Polls() {
  const { user } = useUser();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votedPolls, setVotedPolls] = useState<Set<string>>(getVotedPolls);
  const [showClosed, setShowClosed] = useState(false);
  const [closedVisible, setClosedVisible] = useState(5);
  const [voting, setVoting] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getPolls().then(setPolls).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const handleVote = async (pollId: string, option: string) => {
    if (voting || votedPolls.has(pollId)) return;
    setVoting(pollId);
    try {
      const updated = await api.votePoll(pollId, option);
      setPolls(prev => prev.map(p => p.id === pollId ? updated : p));
      markVoted(pollId);
      setVotedPolls(prev => new Set(prev).add(pollId));
    } catch (err) {
      console.error("Vote error:", err);
    } finally {
      setVoting(null);
    }
  };

  const activePolls = polls.filter(p => p.active);
  const closedPolls = polls.filter(p => !p.active);

  const unvotedCount = activePolls.filter(p => !votedPolls.has(p.id)).length;

  return (
    <div>
      <h2 className="section-title">Meinungsumfragen</h2>

      {/* Registration prompt */}
      {!user && activePolls.length > 0 && (
        <div className={`${ALERT_STYLES.info} mb-4`}>
          <Link to="/parties" className="text-primary font-semibold hover:underline">Register and join a party</Link> to participate in the simulation — vote on polls, submit questions, and more.
        </div>
      )}

      {/* Unvoted nudge */}
      {unvotedCount > 0 && (
        <div className={`${ALERT_STYLES.warning} mb-4`}>
          {unvotedCount} active poll{unvotedCount !== 1 ? "s" : ""} awaiting your vote.
        </div>
      )}

      {activePolls.length === 0 && closedPolls.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">Noch keine Umfragen. Starte die Simulation bis Tag 7 für die ersten Umfragen.</p>
      )}

      {/* Active polls */}
      {activePolls.length > 0 && (
        <div className="mb-8">
          <h2 className="section-title">Aktive Umfragen ({activePolls.length})</h2>
          {activePolls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              hasVoted={votedPolls.has(poll.id)}
              isVoting={voting === poll.id}
              onVote={(option) => handleVote(poll.id, option)}
            />
          ))}
        </div>
      )}

      {/* Closed polls */}
      {closedPolls.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="bg-transparent border-none cursor-pointer text-base font-semibold text-muted-foreground p-0"
          >
            {showClosed ? "▾" : "▸"} Vergangene Umfragen ({closedPolls.length})
          </button>
          {showClosed && (
            <div className="mt-3">
              {closedPolls.slice(0, closedVisible).map(poll => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  hasVoted={true}
                  isVoting={false}
                  onVote={() => {}}
                />
              ))}
              <ShowMoreButton
                total={closedPolls.length}
                visible={Math.min(closedVisible, closedPolls.length)}
                increment={5}
                onShowMore={() => setClosedVisible(c => c + 5)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PollCard({
  poll,
  hasVoted,
  isVoting,
  onVote,
}: {
  poll: Poll;
  hasVoted: boolean;
  isVoting: boolean;
  onVote: (option: string) => void;
}) {
  const totalVotes = Object.values(poll.votes).reduce((s, v) => s + v, 0);
  const showResults = hasVoted || !poll.active;

  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-semibold text-[1.05rem]">{poll.question}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Created Day {poll.createdOnDay}
              {poll.expiresOnDay && ` · Expires Day ${poll.expiresOnDay}`}
              {totalVotes > 0 && ` · ${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`}
            </div>
          </div>
          <span className="flex gap-1.5 items-center">
            {poll.active && !hasVoted && <UserActionIcon title="Cast your vote" />}
            <Badge variant="outline" className={poll.active
              ? STATUS_BADGE.active
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-100"
            }>
              {poll.active ? "Active" : "Closed"}
            </Badge>
          </span>
        </div>

        {showResults ? (
          <div>
            {poll.options.map((option, i) => {
              const count = poll.votes[option] || 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const color = BAR_COLORS[i % BAR_COLORS.length];
              const isTop = totalVotes > 0 && count === Math.max(...Object.values(poll.votes));

              return (
                <div key={option} className="h-8 rounded mb-1.5 flex items-center px-3 text-sm relative overflow-hidden bg-muted">
                  <div
                    className="absolute top-0 left-0 h-full rounded opacity-20"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                  <span className="relative z-10" style={{ fontWeight: isTop ? 700 : 400 }}>
                    {option}
                  </span>
                  <span className="relative z-10 ml-auto text-xs text-muted-foreground">
                    {pct}% ({count})
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {poll.options.map(option => (
              <button
                key={option}
                onClick={() => onVote(option)}
                disabled={isVoting}
                className="block w-full py-2.5 px-4 mb-1.5 border border-input rounded-lg bg-card cursor-pointer text-sm text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-60 disabled:cursor-wait"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
