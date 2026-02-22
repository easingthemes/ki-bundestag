import { type MdbVoteSummary, type BundestagSeat } from "../../api";
import { api } from "../../api";
import { SEMANTIC_HEX } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";
import { Card, CardContent } from "@/components/ui/card";
import { ALERT_STYLES } from "@/lib/colors";

interface MdbVoteButtonsProps {
  billId: string;
  userSeat: BundestagSeat | null;
  mdbVotes: MdbVoteSummary | null;
  onVoted: (updated: MdbVoteSummary) => void;
  onError: (msg: string) => void;
}

export function MdbVoteButtons({ billId, userSeat, mdbVotes, onVoted, onError }: MdbVoteButtonsProps) {
  return (
    <div id="mdb-votes" className="mb-6">
      <h2 className="section-title">MdB-Direktstimmen</h2>
      {userSeat && !mdbVotes?.userVote && (
        <div className={ALERT_STYLES.info}>
          This bill is in Third Reading — cast your direct vote as an MdB.
        </div>
      )}
      <Card><CardContent className="p-5">
        {mdbVotes && mdbVotes.summary.total > 0 ? (() => {
          const s = mdbVotes.summary;
          const total = s.total;
          return (
            <div>
              <div className="mb-2">
                <VoteBar yes={s.yes} no={s.no} abstain={s.abstain} total={total} />
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                <strong style={{ color: SEMANTIC_HEX.positive }}>{s.yes} Yes</strong>
                {" / "}
                <strong style={{ color: SEMANTIC_HEX.negative }}>{s.no} No</strong>
                {" / "}
                <strong style={{ color: SEMANTIC_HEX.warning }}>{s.abstain} Abstain</strong>
                <span className="ml-2">({total} total MdB vote{total !== 1 ? "s" : ""})</span>
              </div>
            </div>
          );
        })() : (
          <div className="text-sm text-muted-foreground mb-3">No MdB votes cast yet.</div>
        )}
        {userSeat && (
          <div className="flex gap-2 items-center">
            {(["yes", "no", "abstain"] as const).map(v => (
              <button
                key={v}
                onClick={async () => {
                  try {
                    const result = await api.castMdbVote(billId, v);
                    onVoted({ summary: result.summary, userVote: result.userVote, byParty: mdbVotes?.byParty ?? {} });
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "Failed");
                  }
                }}
                style={{
                  padding: "5px 14px",
                  borderRadius: 4,
                  border: `2px solid ${mdbVotes?.userVote === v ? (v === "yes" ? SEMANTIC_HEX.positive : v === "no" ? SEMANTIC_HEX.negative : SEMANTIC_HEX.warning) : "#ddd"}`,
                  background: mdbVotes?.userVote === v ? (v === "yes" ? "#ecfdf5" : v === "no" ? "#fef2f2" : "#fffbeb") : "white",
                  color: v === "yes" ? SEMANTIC_HEX.positive : v === "no" ? SEMANTIC_HEX.negative : SEMANTIC_HEX.warning,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >{v}</button>
            ))}
            <span className="text-xs text-muted-foreground ml-2">
              {mdbVotes?.userVote ? `Your vote: ${mdbVotes.userVote.toUpperCase()}` : `Seat #${userSeat.seatNumber}`}
            </span>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
