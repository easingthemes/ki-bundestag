import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, CitizenQuestion, Party } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";
import { ShowMoreButton, UserActionIcon } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { EmptyState } from "../components/EmptyState";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function Questions() {
  const { t } = useTranslation("parties");
  const { user } = useUser();
  const [questions, setQuestions] = useState<CitizenQuestion[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterParty, setFilterParty] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [pendingVisible, setPendingVisible] = useState(10);
  const [answeredVisible, setAnsweredVisible] = useState(10);

  const refresh = useCallback(() => {
    api.getQuestions(filterParty || undefined, filterStatus || undefined)
      .then(setQuestions).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [filterParty, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);
  useEffect(() => { setPendingVisible(10); setAnsweredVisible(10); }, [filterParty, filterStatus]);

  const getPartyName = (id: string) => parties.find(p => p.id === id)?.name || id;
  const getPartyColor = (id: string) => {
    const c = parties.find(p => p.id === id)?.color;
    return c === "#FFED00" ? "#c4a900" : c || "#888";
  };

  const pending = questions.filter(q => q.status === "pending");
  const answered = questions.filter(q => q.status === "answered");

  async function handleVote(q: CitizenQuestion, vote: 1 | -1) {
    try {
      const updated = q.userVote === vote
        ? await api.retractQuestionVote(q.id)
        : await api.voteOnQuestion(q.id, vote);
      setQuestions(prev => prev.map(x => x.id === q.id ? updated : x));
    } catch (err) {
      console.error(err);
    }
  }

  function renderVoteControls(q: CitizenQuestion) {
    if (!user) {
      return (
        <div className="flex flex-col items-center shrink-0 mr-3 min-w-10">
          <span className="font-bold text-base" style={{ color: q.voteScore >= 0 ? SEMANTIC_HEX.positive : q.voteScore < 0 ? SEMANTIC_HEX.negative : "#888" }}>
            {q.voteScore >= 0 ? "+" : ""}{q.voteScore}
          </span>
          <span className="text-xs text-muted-foreground">{q.totalVotes}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center shrink-0 mr-3 min-w-10">
        <button
          onClick={() => handleVote(q, 1)}
          title={q.userVote === 1 ? t("questions.retractUpvote") : t("questions.upvote")}
          className="border-none bg-transparent cursor-pointer text-lg p-0 leading-none"
          style={{ color: q.userVote === 1 ? SEMANTIC_HEX.positive : "#aaa" }}
        >▲</button>
        <span className="font-bold text-base" style={{ color: q.voteScore > 0 ? SEMANTIC_HEX.positive : q.voteScore < 0 ? SEMANTIC_HEX.negative : "#888" }}>
          {q.voteScore >= 0 ? "+" : ""}{q.voteScore}
        </span>
        <button
          onClick={() => handleVote(q, -1)}
          title={q.userVote === -1 ? t("questions.retractDownvote") : t("questions.downvote")}
          className="border-none bg-transparent cursor-pointer text-lg p-0 leading-none"
          style={{ color: q.userVote === -1 ? SEMANTIC_HEX.negative : "#aaa" }}
        >▼</button>
        <span className="text-xs text-muted-foreground">{q.totalVotes}</span>
      </div>
    );
  }

  function renderQuestionCard(q: CitizenQuestion) {
    return (
      <Card key={q.id} className="mb-2">
        <CardContent className="p-4">
          <div className="flex">
            {q.status === "pending" && renderVoteControls(q)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(q.targetPartyId) }} />
                <span className="font-semibold text-sm">{getPartyName(q.targetPartyId)}</span>
                {user && q.status === "pending" && <UserActionIcon title={t("questions.upvoteOrDownvote")} />}
                <Badge variant="outline" className={cn(
                  q.status === "pending"
                    ? STATUS_BADGE.pending
                    : STATUS_BADGE.answered
                )}>
                  {q.status}
                </Badge>
                {q.status === "answered" && (
                  <span className="text-xs text-muted-foreground" style={{ color: q.voteScore > 0 ? SEMANTIC_HEX.positive : q.voteScore < 0 ? SEMANTIC_HEX.negative : undefined }}>
                    {q.voteScore >= 0 ? "+" : ""}{q.voteScore} ({q.totalVotes})
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {t("questions.questionDay", { day: q.createdOnDay })}
                </span>
              </div>
              <p className="text-sm italic mb-1.5">{q.question}</p>
              {q.response && (
                <div className="bg-muted rounded p-2 px-3 text-sm leading-relaxed">
                  <strong>{getPartyName(q.targetPartyId)}:</strong> {q.response}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const showPending = filterStatus !== "answered";
  const showAnswered = filterStatus !== "pending";

  return (
    <div>
      <h2 className="section-title">{t("questions.heading")}</h2>

      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)} className={SELECT_CLS}>
          <option value="">{t("questions.filterAllParties")}</option>
          {parties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SELECT_CLS}>
          <option value="">{t("questions.filterAllStatus")}</option>
          <option value="pending">{t("questions.filterPending")}</option>
          <option value="answered">{t("questions.filterAnswered")}</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <EmptyState message={t("questions.emptyState")} icon="❓" />
      ) : (
        <>
          {showPending && pending.length > 0 && (
            <div className="mb-6">
              <h2 className="section-title">{t("questions.pendingSection", { count: pending.length })}</h2>
              {pending.slice(0, pendingVisible).map(renderQuestionCard)}
              <ShowMoreButton
                total={pending.length}
                visible={Math.min(pendingVisible, pending.length)}
                increment={10}
                onShowMore={() => setPendingVisible(c => c + 10)}
              />
            </div>
          )}

          {showAnswered && answered.length > 0 && (
            <div>
              <h2 className="section-title">{t("questions.answeredSection", { count: answered.length })}</h2>
              {answered.slice(0, answeredVisible).map(renderQuestionCard)}
              <ShowMoreButton
                total={answered.length}
                visible={Math.min(answeredVisible, answered.length)}
                increment={10}
                onShowMore={() => setAnsweredVisible(c => c + 10)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
