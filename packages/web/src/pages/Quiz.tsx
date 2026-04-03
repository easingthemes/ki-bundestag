import { useState, useEffect, useMemo } from "react";
import { api, type QuizThesis, type QuizResultItem, type QuizPartyPosition } from "../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const CATEGORY_LABELS: Record<string, string> = {
  economy: "Wirtschaft",
  social: "Soziales",
  environment: "Umwelt",
  immigration: "Migration",
  defense: "Verteidigung",
  education: "Bildung",
  healthcare: "Gesundheit",
  infrastructure: "Infrastruktur",
};

const CATEGORY_COLORS: Record<string, string> = {
  economy: "bg-blue-50 text-blue-700 border-blue-200",
  social: "bg-pink-50 text-pink-700 border-pink-200",
  environment: "bg-emerald-50 text-emerald-700 border-emerald-200",
  immigration: "bg-amber-50 text-amber-700 border-amber-200",
  defense: "bg-slate-100 text-slate-700 border-slate-200",
  education: "bg-violet-50 text-violet-700 border-violet-200",
  healthcare: "bg-red-50 text-red-700 border-red-200",
  infrastructure: "bg-orange-50 text-orange-700 border-orange-200",
};

type QuizPhase = "intro" | "questions" | "results";
type Answer = "agree" | "disagree" | "neutral";

export function Quiz() {
  usePageMeta(ROUTE_SEO["/quiz"] ?? { title: "Quiz" });
  const [phase, setPhase] = useState<QuizPhase>("intro");
  const [theses, setTheses] = useState<QuizThesis[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [results, setResults] = useState<QuizResultItem[]>([]);
  const [positions, setPositions] = useState<QuizPartyPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    api.getQuizTheses().then(t => { setTheses(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const currentThesis = theses[currentIndex];
  const progress = theses.length > 0 ? ((currentIndex + 1) / theses.length) * 100 : 0;

  const handleAnswer = (answer: Answer) => {
    if (!currentThesis) return;
    setAnswers(prev => ({ ...prev, [currentThesis.id]: answer }));
    if (currentIndex < theses.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      submitResults({ ...answers, [currentThesis.id]: answer });
    }
  };

  const handleSkip = () => {
    if (currentIndex < theses.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      submitResults(answers);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const submitResults = async (finalAnswers: Record<string, Answer>) => {
    setSubmitting(true);
    try {
      const [res, pos] = await Promise.all([
        api.submitQuizAnswers(finalAnswers),
        api.getQuizPartyPositions(),
      ]);
      setResults(res.results);
      setPositions(pos);
      setPhase("results");
    } catch {
      // show results phase even on error
      setPhase("results");
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setPhase("intro");
    setCurrentIndex(0);
    setAnswers({});
    setResults([]);
    setShowComparison(false);
  };

  if (loading) {
    return (
      <div>
        <h2>Welche Partei passt zu dir?</h2>
        <div className="text-muted-foreground">Lade Fragen...</div>
      </div>
    );
  }

  if (theses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-5">
            <div className="text-4xl">🗳️</div>
            <h2 className="text-xl font-semibold">Welche Partei passt zu dir?</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Aktuell sind keine Quizfragen verfügbar. Bitte versuche es später erneut,
              wenn die Simulation weitere Tage durchlaufen hat.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {phase === "intro" && <QuizIntro onStart={() => setPhase("questions")} thesisCount={theses.length} />}
      {phase === "questions" && currentThesis && (
        <ThesisCard
          thesis={currentThesis}
          index={currentIndex}
          total={theses.length}
          progress={progress}
          currentAnswer={answers[currentThesis.id]}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
          onBack={handleBack}
          canGoBack={currentIndex > 0}
          submitting={submitting}
        />
      )}
      {phase === "results" && (
        <QuizResults
          results={results}
          answers={answers}
          theses={theses}
          positions={positions}
          showComparison={showComparison}
          onToggleComparison={() => setShowComparison(v => !v)}
          onRestart={restart}
        />
      )}
    </div>
  );
}

function QuizIntro({ onStart, thesisCount }: { onStart: () => void; thesisCount: number }) {
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-5">
        <div className="text-4xl">🗳️</div>
        <h2 className="text-xl font-semibold">Welche Partei passt zu dir?</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Beantworte {thesisCount} Thesen zu aktuellen politischen Themen und finde heraus,
          welche Partei im simulierten Bundestag am besten zu deinen Positionen passt.
        </p>
        <p className="text-xs text-muted-foreground">
          Die Parteipositionen basieren auf dem Abstimmungsverhalten in der Simulation und koennen
          von der realen Politik abweichen.
        </p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Quiz starten
        </button>
      </CardContent>
    </Card>
  );
}

function ThesisCard({
  thesis,
  index,
  total,
  progress,
  currentAnswer,
  onAnswer,
  onSkip,
  onBack,
  canGoBack,
  submitting,
}: {
  thesis: QuizThesis;
  index: number;
  total: number;
  progress: number;
  currentAnswer?: Answer;
  onAnswer: (a: Answer) => void;
  onSkip: () => void;
  onBack: () => void;
  canGoBack: boolean;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">
          Frage {index + 1} von {total}
        </span>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <Badge variant="outline" className={CATEGORY_COLORS[thesis.category] ?? ""}>
            {CATEGORY_LABELS[thesis.category] ?? thesis.category}
          </Badge>

          <p className="text-lg font-medium leading-relaxed">{thesis.text}</p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => onAnswer("agree")}
              disabled={submitting}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-left transition-all border",
                currentAnswer === "agree"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-card border-border hover:bg-emerald-50/50 hover:border-emerald-200"
              )}
            >
              Stimme zu
            </button>
            <button
              onClick={() => onAnswer("neutral")}
              disabled={submitting}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-left transition-all border",
                currentAnswer === "neutral"
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-card border-border hover:bg-amber-50/50 hover:border-amber-200"
              )}
            >
              Neutral
            </button>
            <button
              onClick={() => onAnswer("disagree")}
              disabled={submitting}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-left transition-all border",
                currentAnswer === "disagree"
                  ? "bg-red-50 border-red-300 text-red-800"
                  : "bg-card border-border hover:bg-red-50/50 hover:border-red-200"
              )}
            >
              Stimme nicht zu
            </button>
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={onBack}
              disabled={!canGoBack || submitting}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Zurueck
            </button>
            <button
              onClick={onSkip}
              disabled={submitting}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Ueberspringen
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuizResults({
  results,
  answers,
  theses,
  positions,
  showComparison,
  onToggleComparison,
  onRestart,
}: {
  results: QuizResultItem[];
  answers: Record<string, Answer>;
  theses: QuizThesis[];
  positions: QuizPartyPosition[];
  showComparison: boolean;
  onToggleComparison: () => void;
  onRestart: () => void;
}) {
  const maxPercent = results.length > 0 ? Math.max(...results.map(r => r.matchPercent)) : 100;

  // Group positions by thesis for comparison
  const positionMap = useMemo(() => {
    const map = new Map<string, Map<string, QuizPartyPosition>>();
    for (const p of positions) {
      if (!map.has(p.thesisId)) map.set(p.thesisId, new Map());
      map.get(p.thesisId)!.set(p.partyId, p);
    }
    return map;
  }, [positions]);

  const answeredTheses = theses.filter(t => answers[t.id]);

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <h2 className="text-xl font-semibold">Keine Ergebnisse</h2>
          <p className="text-muted-foreground">Es konnten keine Ergebnisse berechnet werden. Bitte versuche es erneut.</p>
          <button onClick={onRestart} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors">
            Erneut starten
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Dein Ergebnis</h2>
        <p className="text-sm text-muted-foreground">
          Basierend auf {Object.keys(answers).length} beantworteten Thesen
        </p>
      </div>

      {/* Match bars */}
      <Card>
        <CardContent className="p-5 space-y-3">
          {results.map(r => (
            <div key={r.partyId} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{r.partyName}</span>
                <span className="text-sm font-semibold tabular-nums">{r.matchPercent}%</span>
              </div>
              <div className="h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${maxPercent > 0 ? (r.matchPercent / maxPercent) * 100 : 0}%`,
                    backgroundColor: r.color === "#000000" ? "#1a1a1a" : r.color,
                    minWidth: r.matchPercent > 0 ? "2rem" : "0",
                  }}
                />
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{r.agreements} Uebereinstimmungen</span>
                <span>{r.disagreements} Abweichungen</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Category breakdown for top match */}
      {results[0] && Object.keys(results[0].categoryBreakdown).length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">
              Kategorien — {results[0].partyName}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(results[0].categoryBreakdown).map(([cat, pct]) => (
                <div key={cat} className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", CATEGORY_COLORS[cat])}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </Badge>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: results[0].color === "#000000" ? "#1a1a1a" : results[0].color,
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Thesis comparison toggle */}
      <div className="text-center">
        <button
          onClick={onToggleComparison}
          className="text-sm text-primary hover:underline"
        >
          {showComparison ? "Vergleich ausblenden" : "Detailvergleich anzeigen"}
        </button>
      </div>

      {/* Per-thesis comparison */}
      {showComparison && (
        <div className="space-y-3">
          {answeredTheses.map(thesis => {
            const userAnswer = answers[thesis.id];
            const thesisPositions = positionMap.get(thesis.id);
            return (
              <Card key={thesis.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", CATEGORY_COLORS[thesis.category])}>
                      {CATEGORY_LABELS[thesis.category] ?? thesis.category}
                    </Badge>
                    <p className="text-sm font-medium">{thesis.text}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Deine Antwort:</span>
                    <AnswerBadge answer={userAnswer} />
                  </div>
                  {thesisPositions && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
                      {results.map(r => {
                        const pp = thesisPositions.get(r.partyId);
                        if (!pp) return null;
                        const isMatch = pp.position === userAnswer && userAnswer !== "neutral";
                        return (
                          <div
                            key={r.partyId}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                              isMatch ? "bg-emerald-50" : "bg-muted/50"
                            )}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: r.color === "#000000" ? "#1a1a1a" : r.color }}
                            />
                            <span className="font-medium truncate">{r.partyName}</span>
                            <AnswerBadge answer={pp.position} small />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Restart */}
      <div className="text-center pb-4">
        <button
          onClick={onRestart}
          className="px-5 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Quiz wiederholen
        </button>
      </div>
    </div>
  );
}

function AnswerBadge({ answer, small }: { answer: string; small?: boolean }) {
  const labels: Record<string, string> = { agree: "Ja", disagree: "Nein", neutral: "Neutral" };
  const colors: Record<string, string> = {
    agree: "bg-emerald-100 text-emerald-700",
    disagree: "bg-red-100 text-red-700",
    neutral: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded font-medium",
      small ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5",
      colors[answer] ?? "bg-muted text-muted-foreground",
    )}>
      {labels[answer] ?? answer}
    </span>
  );
}
