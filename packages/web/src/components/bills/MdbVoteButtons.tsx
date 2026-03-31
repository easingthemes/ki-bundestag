import { type MdbVoteSummary, type BundestagSeat } from "../../api";
import { api } from "../../api";
import { SEMANTIC_HEX } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";
import { Card, CardContent } from "@/components/ui/card";
import { ALERT_STYLES } from "@/lib/colors";
import { useTranslation } from "react-i18next";

interface MdbVoteButtonsProps {
  billId: string;
  userSeat: BundestagSeat | null;
  mdbVotes: MdbVoteSummary | null;
  onVoted: (updated: MdbVoteSummary) => void;
  onError: (msg: string) => void;
}

export function MdbVoteButtons({ billId, userSeat, mdbVotes, onVoted, onError }: MdbVoteButtonsProps) {
  const { t } = useTranslation("legislation");
  const VOTE_LABELS: Record<string, string> = { yes: t("mdbVotes.yes"), no: t("mdbVotes.no"), abstain: t("mdbVotes.abstain") };
  return (
    <div id="mdb-votes" className="mb-6">
      <h2 className="section-title">{t("mdbVotes.title")}</h2>
      {userSeat && !mdbVotes?.userVote && (
        <div className={ALERT_STYLES.info}>
          {t("mdbVotes.promptVote")}
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
                <strong style={{ color: SEMANTIC_HEX.positive }}>{s.yes} {t("mdbVotes.yes")}</strong>
                {" / "}
                <strong style={{ color: SEMANTIC_HEX.negative }}>{s.no} {t("mdbVotes.no")}</strong>
                {" / "}
                <strong style={{ color: SEMANTIC_HEX.warning }}>{s.abstain} {t("mdbVotes.abstain")}</strong>
                <span className="ml-2">{t("mdbVotes.totalVotes", { count: total })}</span>
              </div>
            </div>
          );
        })() : (
          <div className="text-sm text-muted-foreground mb-3">{t("mdbVotes.noVotes")}</div>
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
                    onError(e instanceof Error ? e.message : "Fehlgeschlagen");
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
              >{VOTE_LABELS[v]}</button>
            ))}
            <span className="text-xs text-muted-foreground ml-2">
              {mdbVotes?.userVote ? t("mdbVotes.yourVote", { vote: VOTE_LABELS[mdbVotes.userVote]?.toUpperCase() }) : t("mdbVotes.seatNumber", { number: userSeat.seatNumber })}
            </span>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
