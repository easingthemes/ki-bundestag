import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type CitizenQuestion } from "../../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE } from "@/lib/colors";
import { useUser } from "../../userContext";
import { useDailyLimit } from "@/hooks/useDailyLimit";

interface QuestionFormProps {
  partyId: string;
  partyName: string;
  displayColor: string;
  questions: CitizenQuestion[];
}

export function QuestionForm({ partyId, partyName, displayColor, questions }: QuestionFormProps) {
  const { t } = useTranslation("parties");
  const { user } = useUser();
  const { info: limitInfo, refresh: refreshLimit, isAtLimit } = useDailyLimit("submit_question", user?.id);
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (questionText.trim().length < 5 || isAtLimit) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await api.submitQuestion(questionText.trim(), partyId);
      setQuestionText("");
      setSubmitMsg(t("questionForm.submitted"));
      refreshLimit();
    } catch (e) {
      setSubmitMsg(e instanceof Error ? e.message : t("questionForm.failed"));
    } finally {
      setSubmitting(false);
      setTimeout(() => setSubmitMsg(null), 3000);
    }
  };

  return (
    <div id="ask-question" className="mb-8">
      <h2 className="section-title">{t("questionForm.heading", { party: partyName })}</h2>
      <Card>
        <CardContent className="p-5">
          {isAtLimit ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {t("questionForm.limitReached", { used: limitInfo?.used, limit: limitInfo?.limit })}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  placeholder={t("questionForm.placeholder")}
                  aria-label={t("questionForm.placeholder")}
                  maxLength={500}
                  className="flex-1 px-3 py-2 rounded border border-input text-sm"
                  onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={submitting || questionText.trim().length < 5}
                  className="px-4 py-2 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: displayColor }}
                >
                  {submitting ? t("questionForm.submitting") : t("questionForm.submit")}
                </button>
              </div>
              {limitInfo && limitInfo.remaining <= 2 && limitInfo.remaining > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {limitInfo.remaining === 1 ? t("questionForm.remaining1") : t("questionForm.remainingPlural", { count: limitInfo.remaining })}
                </div>
              )}
            </>
          )}
          {submitMsg && (
            <div role="status" aria-live="polite" className={`text-sm mt-1.5 ${submitMsg.includes("fehlgeschlagen") || submitMsg.includes("limit") ? "text-destructive" : "text-emerald-500"}`}>
              {submitMsg}
            </div>
          )}
        </CardContent>
      </Card>

      {questions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-base font-semibold mb-3">{t("questionForm.recentQuestions", { count: questions.length })}</h3>
          {questions.slice(0, 10).map(q => (
            <Card key={q.id} className="mb-2" style={{ borderLeft: `4px solid ${displayColor}` }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className={q.status === "pending" ? STATUS_BADGE.pending : STATUS_BADGE.answered}>
                    {q.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{t("questionForm.questionDay", { day: q.createdOnDay })}</span>
                </div>
                <p className="text-sm italic mb-1.5">{q.question}</p>
                {q.response && (
                  <div className="bg-muted rounded p-2 px-3 text-sm leading-relaxed">
                    <strong>{partyName}:</strong> {q.response}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
