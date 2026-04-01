import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, CitizenQuestion, Party, TrendingTopic, QuestionSuggestion } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";
import { ShowMoreButton, UserActionIcon } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { EmptyState } from "../components/EmptyState";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const QUESTION_TOPICS = [
  "Klimaschutz", "Migration", "Bildung", "Wirtschaft", "Soziales",
  "Gesundheit", "Innere Sicherheit", "Verteidigung", "Digitalisierung",
  "Verkehr", "Finanzen", "Arbeit", "Wohnen", "Außenpolitik",
  "Landwirtschaft", "Justiz", "Sonstiges",
];

export function Questions() {
  const { t } = useTranslation("parties");
  const { user } = useUser();
  const [questions, setQuestions] = useState<CitizenQuestion[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterParty, setFilterParty] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterTopic, setFilterTopic] = useState<string>("");
  const [pendingVisible, setPendingVisible] = useState(10);
  const [answeredVisible, setAnsweredVisible] = useState(10);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [suggestions, setSuggestions] = useState<QuestionSuggestion[]>([]);

  // Form state
  const [formQuestion, setFormQuestion] = useState("");
  const [formParty, setFormParty] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const refresh = useCallback(() => {
    api.getQuestions(filterParty || undefined, filterStatus || undefined, filterTopic || undefined)
      .then(setQuestions).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [filterParty, filterStatus, filterTopic]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);
  useEffect(() => { setPendingVisible(10); setAnsweredVisible(10); }, [filterParty, filterStatus, filterTopic]);

  // Load trending topics and suggestions
  useEffect(() => {
    api.getTrendingTopics().then(setTrendingTopics).catch(() => {});
    api.getQuestionSuggestions().then(setSuggestions).catch(() => {});
  }, []);

  const getPartyName = (id: string) => parties.find(p => p.id === id)?.name || id;
  const getPartyColor = (id: string) => {
    const c = parties.find(p => p.id === id)?.color;
    return c === "#FFED00" ? "#c4a900" : c || "#888";
  };

  const pending = questions.filter(q => q.status === "pending");
  const answered = questions.filter(q => q.status === "answered");

  // Topic distribution
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      const t = q.topic || "Sonstiges";
      counts[t] = (counts[t] || 0) + 1;
    }
    const total = questions.length || 1;
    return Object.entries(counts)
      .map(([topic, count]) => ({ topic, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [questions]);

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

  async function handleSubmitQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!formQuestion.trim() || !formParty || formSubmitting) return;

    setFormSubmitting(true);
    setFormMessage(null);
    try {
      await api.submitQuestion(formQuestion, formParty, formTopic || undefined);
      setFormMessage({ type: "success", text: t("questions.formSubmitted") });
      setFormQuestion("");
      setFormTopic("");
      setShowPreview(false);
      refresh();
    } catch {
      setFormMessage({ type: "error", text: t("questions.formFailed") });
    } finally {
      setFormSubmitting(false);
    }
  }

  function prefillFromSuggestion(s: QuestionSuggestion) {
    setFormQuestion(s.question);
    setFormParty(s.targetPartyId);
    setFormTopic(s.topic || "");
    setShowPreview(false);
    api.useQuestionSuggestion(s.id).catch(() => {});
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
  }

  function prefillTopic(topicLabel: string) {
    // Find matching QUESTION_TOPICS entry
    const match = QUESTION_TOPICS.find(t =>
      topicLabel.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(topicLabel.toLowerCase())
    );
    if (match) setFormTopic(match);
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
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
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
                {q.topic && (
                  <Badge variant="outline" className="text-xs">
                    {q.topic}
                  </Badge>
                )}
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
  const formValid = formQuestion.trim().length >= 10 && formQuestion.trim().length <= 500 && formParty;

  return (
    <div className="flex gap-6 flex-col lg:flex-row">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <h2 className="section-title">{t("questions.heading")}</h2>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
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
          <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} className={SELECT_CLS}>
            <option value="">{t("questions.filterAllTopics")}</option>
            {QUESTION_TOPICS.map(topic => (
              <option key={topic} value={topic}>{topic}</option>
            ))}
          </select>
        </div>

        {/* Topic distribution */}
        {topicCounts.length > 0 && !filterTopic && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-2">{t("questions.topicDistribution")}</h3>
              {topicCounts.slice(0, 8).map(({ topic, count, pct }) => (
                <div key={topic} className="flex items-center gap-2 mb-1">
                  <span className="text-xs w-28 truncate">{topic}</span>
                  <div className="flex-1 bg-muted rounded h-3">
                    <div className="bg-primary rounded h-3 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Suggested questions */}
        {suggestions.length > 0 && user && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">{t("questions.suggestedSection")}</h3>
              <div className="space-y-2">
                {suggestions.map(s => (
                  <div key={s.id} className="flex items-start gap-3 p-2 rounded bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(s.targetPartyId) }} />
                        <span className="text-xs font-medium">{getPartyName(s.targetPartyId)}</span>
                        {s.topic && <Badge variant="outline" className="text-xs">{s.topic}</Badge>}
                      </div>
                      <p className="text-sm italic">{s.question}</p>
                    </div>
                    <button
                      onClick={() => prefillFromSuggestion(s)}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    >
                      {t("questions.suggestedUse")}
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Question submission form */}
        {user && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">{t("questions.formHeading")}</h3>
              {showPreview ? (
                <div className="mb-3">
                  <Card className="mb-2">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        {formParty && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(formParty) }} />}
                        <span className="font-semibold text-sm">{formParty ? getPartyName(formParty) : "—"}</span>
                        <Badge variant="outline" className={STATUS_BADGE.pending}>pending</Badge>
                        {formTopic && <Badge variant="outline" className="text-xs">{formTopic}</Badge>}
                      </div>
                      <p className="text-sm italic">{formQuestion}</p>
                    </CardContent>
                  </Card>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPreview(false)} className="text-xs px-3 py-1.5 rounded border border-input hover:bg-muted">
                      {t("questions.formEdit")}
                    </button>
                    <button
                      onClick={handleSubmitQuestion}
                      disabled={!formValid || formSubmitting}
                      className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {formSubmitting ? t("questions.formSubmitting") : t("questions.formSubmit")}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setShowPreview(true); }} className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <select value={formTopic} onChange={e => setFormTopic(e.target.value)} className={SELECT_CLS}>
                      <option value="">{t("questions.formTopicPlaceholder")}</option>
                      {QUESTION_TOPICS.map(topic => (
                        <option key={topic} value={topic}>{topic}</option>
                      ))}
                    </select>
                    <select value={formParty} onChange={e => setFormParty(e.target.value)} className={SELECT_CLS} required>
                      <option value="">{t("questions.formParty")}</option>
                      {parties.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <textarea
                      value={formQuestion}
                      onChange={e => setFormQuestion(e.target.value)}
                      placeholder={t("questions.formQuestion")}
                      className="w-full min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-y"
                      maxLength={500}
                    />
                    <p className={cn(
                      "text-xs mt-1",
                      formQuestion.length > 500 || (formQuestion.length > 0 && formQuestion.length < 10) ? "text-red-500" : "text-muted-foreground",
                    )}>
                      {t("questions.formCharCount", { current: formQuestion.length, max: 500 })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!formValid}
                      className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {t("questions.formPreview")}
                    </button>
                  </div>
                </form>
              )}
              {formMessage && (
                <p className={cn("text-xs mt-2", formMessage.type === "success" ? "text-green-600" : "text-red-500")}>
                  {formMessage.text}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Question list */}
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

      {/* Sidebar — trending topics */}
      {trendingTopics.length > 0 && (
        <div className="lg:w-72 shrink-0">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-1">{t("questions.trendingTopics")}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t("questions.trendingSubtitle")}</p>
              <div className="space-y-2">
                {trendingTopics.slice(0, 5).map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => prefillTopic(topic.label)}
                    className="w-full text-left p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <span className="text-xs font-medium block truncate">{topic.label}</span>
                    <span className="text-xs text-muted-foreground line-clamp-2">{topic.sampleQuestion}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
