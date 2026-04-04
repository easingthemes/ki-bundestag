/**
 * Question moderation: deduplication and spam filtering.
 *
 * Two layers of protection:
 * 1. Day-level: deduplicate pending questions (same normalized text + same party)
 *    and filter obvious spam.
 * 2. Party-level: skip questions a party has already answered before.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a question string for comparison.
 * Lower-cases, collapses whitespace, strips leading/trailing whitespace and
 * trailing punctuation so that "Wie bewerten Sie…?" matches
 * "wie  bewerten  sie…".
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?.!]+$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Spam detection (heuristic, no AI call)
// ---------------------------------------------------------------------------

const SPAM_PATTERNS = [
  /^(.)\1{10,}$/,                  // repeated single character
  /^(.{1,5})\1{5,}$/,             // repeated short pattern
  /lorem\s+ipsum/i,               // lorem ipsum filler
  /test\s*test\s*test/i,          // test spam
  /^[^a-zA-ZäöüÄÖÜß]{10,}$/,     // no letters, just symbols/numbers
];

/**
 * Return true if the question looks like spam or low-quality filler.
 */
export function isSpam(question: string): boolean {
  const trimmed = question.trim();
  // Too short to be meaningful (below DB minimum of 5, but double-check)
  if (trimmed.length < 5) return true;
  // All-caps shouting with no substance
  if (trimmed.length > 20 && trimmed === trimmed.toUpperCase() && !/[äöüß]/.test(trimmed)) return true;
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Deduplication within pending questions
// ---------------------------------------------------------------------------

interface PendingQuestion {
  id: string;
  question: string;
  targetPartyId: string;
  createdOnDay: number;
  userId?: string | null;
}

interface DedupeResult {
  /** Questions that should proceed to answering. */
  unique: PendingQuestion[];
  /** IDs of questions marked as duplicates. */
  duplicateIds: string[];
  /** IDs of questions marked as spam. */
  spamIds: string[];
}

/**
 * Deduplicate a list of pending questions.
 *
 * For each (normalised text + targetPartyId) group, keep the question with the
 * highest vote score (ties broken by oldest submission). The rest are marked as
 * duplicates in the DB.
 *
 * Also filters out spam questions.
 */
export function moderateQuestions(
  pending: PendingQuestion[],
  scoreMap: Record<string, number>,
): DedupeResult {
  const spamIds: string[] = [];
  const afterSpamFilter: PendingQuestion[] = [];

  // 1. Spam filter
  for (const q of pending) {
    if (isSpam(q.question)) {
      spamIds.push(q.id);
    } else {
      afterSpamFilter.push(q);
    }
  }

  // 2. Deduplicate within pending (same normalised text + same party)
  const groups = new Map<string, PendingQuestion[]>();
  for (const q of afterSpamFilter) {
    const key = `${q.targetPartyId}::${normalizeQuestion(q.question)}`;
    const group = groups.get(key) ?? [];
    group.push(q);
    groups.set(key, group);
  }

  const unique: PendingQuestion[] = [];
  const duplicateIds: string[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      unique.push(group[0]);
      continue;
    }
    // Keep the one with highest vote score; tie-break by oldest (lowest createdOnDay)
    group.sort((a, b) => {
      const scoreDiff = (scoreMap[b.id] ?? 0) - (scoreMap[a.id] ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.createdOnDay - b.createdOnDay;
    });
    unique.push(group[0]);
    for (let i = 1; i < group.length; i++) {
      duplicateIds.push(group[i].id);
    }
  }

  return { unique, duplicateIds, spamIds };
}

// ---------------------------------------------------------------------------
// Party-level: filter out already-answered questions
// ---------------------------------------------------------------------------

/**
 * Remove questions that a party has already answered (same normalised text).
 * Returns the filtered list and IDs of questions skipped as already-answered.
 */
export function filterAlreadyAnswered(
  pending: PendingQuestion[],
): { filtered: PendingQuestion[]; alreadyAnsweredIds: string[] } {
  if (pending.length === 0) return { filtered: [], alreadyAnsweredIds: [] };

  const db = getDb();

  // Load all answered questions (with a response) — grouped by party
  const answered = db.select({
    question: schema.citizenQuestions.question,
    targetPartyId: schema.citizenQuestions.targetPartyId,
  })
    .from(schema.citizenQuestions)
    .where(eq(schema.citizenQuestions.status, "answered"))
    .all();

  // Build a set of "partyId::normalisedText" for answered questions
  const answeredSet = new Set<string>();
  for (const a of answered) {
    // Only count questions that got a real answer (not expired/duplicate)
    answeredSet.add(`${a.targetPartyId}::${normalizeQuestion(a.question)}`);
  }

  const filtered: PendingQuestion[] = [];
  const alreadyAnsweredIds: string[] = [];

  for (const q of pending) {
    const key = `${q.targetPartyId}::${normalizeQuestion(q.question)}`;
    if (answeredSet.has(key)) {
      alreadyAnsweredIds.push(q.id);
    } else {
      filtered.push(q);
    }
  }

  return { filtered, alreadyAnsweredIds };
}

// ---------------------------------------------------------------------------
// Apply moderation: mark questions in DB
// ---------------------------------------------------------------------------

/**
 * Mark duplicate/spam/already-answered questions in the DB so they don't get
 * sent to the AI for answering.
 */
export function markModeratedQuestions(
  duplicateIds: string[],
  spamIds: string[],
  alreadyAnsweredIds: string[],
  currentDay: number,
): void {
  const db = getDb();

  for (const id of spamIds) {
    db.update(schema.citizenQuestions)
      .set({ status: "answered", response: "Diese Frage wurde als Spam erkannt.", respondedOnDay: currentDay })
      .where(eq(schema.citizenQuestions.id, id))
      .run();
  }

  for (const id of duplicateIds) {
    db.update(schema.citizenQuestions)
      .set({ status: "answered", response: "Diese Frage wurde bereits gestellt.", respondedOnDay: currentDay })
      .where(eq(schema.citizenQuestions.id, id))
      .run();
  }

  for (const id of alreadyAnsweredIds) {
    db.update(schema.citizenQuestions)
      .set({ status: "answered", response: "Diese Frage wurde bereits von der Partei beantwortet.", respondedOnDay: currentDay })
      .where(eq(schema.citizenQuestions.id, id))
      .run();
  }

  const total = duplicateIds.length + spamIds.length + alreadyAnsweredIds.length;
  if (total > 0) {
    logger.info(
      `[questions] Moderation: ${duplicateIds.length} duplicates, ${spamIds.length} spam, ${alreadyAnsweredIds.length} already-answered — ${total} questions removed`,
    );
  }
}
