/**
 * Quiz match calculation — compares user answers against party positions.
 * Scoring: agree-agree=2, disagree-disagree=2, neutral-neutral=1,
 *          agree/disagree-neutral=1, agree-disagree=0.
 */

export type QuizAnswer = "agree" | "disagree" | "neutral";

export interface QuizResult {
  partyId: string;
  matchPercent: number;
  categoryBreakdown: Record<string, number>;
  agreements: number;
  disagreements: number;
}

function scoreMatch(user: QuizAnswer, party: QuizAnswer): number {
  if (user === party) return user === "neutral" ? 1 : 2;
  if (user === "neutral" || party === "neutral") return 1;
  return 0; // agree vs disagree
}

export function calculateMatch(
  userAnswers: Map<string, QuizAnswer>,
  partyPositions: Map<string, QuizAnswer>,
): { matchPercent: number; agreements: number; disagreements: number } {
  let totalScore = 0;
  let maxScore = 0;
  let agreements = 0;
  let disagreements = 0;

  for (const [thesisId, userAnswer] of userAnswers) {
    const partyAnswer = partyPositions.get(thesisId);
    if (!partyAnswer) continue;

    maxScore += 2;
    totalScore += scoreMatch(userAnswer, partyAnswer);

    if (userAnswer === partyAnswer && userAnswer !== "neutral") agreements++;
    if (
      (userAnswer === "agree" && partyAnswer === "disagree") ||
      (userAnswer === "disagree" && partyAnswer === "agree")
    ) disagreements++;
  }

  const matchPercent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  return { matchPercent, agreements, disagreements };
}

export function calculateAllMatches(
  userAnswers: Record<string, QuizAnswer>,
  allPartyPositions: Array<{ partyId: string; thesisId: string; position: QuizAnswer }>,
  thesisCategories: Map<string, string>,
): QuizResult[] {
  const userMap = new Map(Object.entries(userAnswers));

  // Group positions by party
  const byParty = new Map<string, Map<string, QuizAnswer>>();
  for (const pp of allPartyPositions) {
    if (!byParty.has(pp.partyId)) byParty.set(pp.partyId, new Map());
    byParty.get(pp.partyId)!.set(pp.thesisId, pp.position);
  }

  const results: QuizResult[] = [];

  for (const [partyId, positions] of byParty) {
    const { matchPercent, agreements, disagreements } = calculateMatch(userMap, positions);

    // Category breakdown
    const catScores = new Map<string, { score: number; max: number }>();
    for (const [thesisId, userAnswer] of userMap) {
      const partyAnswer = positions.get(thesisId);
      if (!partyAnswer) continue;
      const cat = thesisCategories.get(thesisId) ?? "other";
      if (!catScores.has(cat)) catScores.set(cat, { score: 0, max: 0 });
      const cs = catScores.get(cat)!;
      cs.max += 2;
      cs.score += scoreMatch(userAnswer, partyAnswer);
    }

    const categoryBreakdown: Record<string, number> = {};
    for (const [cat, { score, max }] of catScores) {
      categoryBreakdown[cat] = max > 0 ? Math.round((score / max) * 100) : 0;
    }

    results.push({ partyId, matchPercent, categoryBreakdown, agreements, disagreements });
  }

  // Sort by match percentage descending
  results.sort((a, b) => b.matchPercent - a.matchPercent);
  return results;
}
