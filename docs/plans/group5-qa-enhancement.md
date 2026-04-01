# Group 5: Citizen Q&A Enhancement

> Detailed implementation plan
> Parent: docs/plans/abgeordnetenwatch-feature-roadmap.md
> Status: Complete
> Dependency: #031 (API fetching) already done — `fetchCitizenQuestions()` in knowledge-fetch.ts

## Overview

Enhance the citizen Q&A system with topic categorization sourced from real abgeordnetenwatch data, trending topic suggestions, topic-based filtering, AI-generated question suggestions, and a better question submission form. All changes build on existing infrastructure — no new DB connections or AI call patterns needed.

**Critical constraint — Sim time vs real time**: Real citizen questions from abgeordnetenwatch are a **historical snapshot**, not live data. They are fetched once per ~7 real days, but the simulation may advance 30+ sim days in that time. Trending topics must be labeled as "Was Bürger im echten Bundestag fragen" (what citizens ask in the real Bundestag) — a timeless inspiration source, NOT dated current events. Never present real-world question timestamps or imply these questions are happening "now" in simulation time. The AI-generated suggestions (Step 4) should draw primarily from **simulation events** (recent bills, crises, media) with real-world questions as secondary creative inspiration only.

---

## Step 1: Question topics/categories

### 1.1 Add `topic` column to `citizenQuestions` table

**Schema change** in `packages/engine/src/db/schema-sim.ts`:
```typescript
// Add to citizenQuestions table definition (after userId):
topic: text("topic"),  // nullable — null for legacy questions
```

**DDL migration** in `packages/engine/src/db/ddl.ts`:
Add to `SIM_COLUMN_MIGRATIONS` array:
```typescript
{ table: "citizen_questions", column: "topic", sql: "ALTER TABLE citizen_questions ADD COLUMN topic TEXT" },
```

**DDL CREATE TABLE** — add `topic TEXT` column to the `citizen_questions` block in `SIM_TABLE_DDL`.

### 1.2 Define topic list from abgeordnetenwatch Topic entity

Create constant in `packages/engine/src/simulation/questions.ts`:
```typescript
export const QUESTION_TOPICS = [
  "Klimaschutz",
  "Migration",
  "Bildung",
  "Wirtschaft",
  "Soziales",
  "Gesundheit",
  "Innere Sicherheit",
  "Verteidigung",
  "Digitalisierung",
  "Verkehr",
  "Finanzen",
  "Arbeit",
  "Wohnen",
  "Außenpolitik",
  "Landwirtschaft",
  "Justiz",
  "Sonstiges",
] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];
```

These mirror the real abgeordnetenwatch topic labels. The list is static — topics change rarely.

### 1.3 Update types

**`packages/types/src/types/parliament.ts`** — add to `CitizenQuestion`:
```typescript
topic?: string | null;
```

**`packages/web/src/api/types.ts`** — mirror the same addition to local `CitizenQuestion`.

### 1.4 Update API mapper

**`packages/api/src/routes/content.ts`** — in `mapQuestion()`, pass through the topic field:
```typescript
topic: (row as any).topic ?? null,
```

### 1.5 Update POST /api/questions

**`packages/api/src/routes/content.ts`** — accept optional `topic` in request body. Validate against the exported `QUESTION_TOPICS` list. Store in DB insert.

### 1.6 Auto-classify legacy questions

Add a one-time migration helper or let the AI batch answer step tag topics. In `answerQuestionsBatch()`, extend the prompt to also return a `topic` field per answer. Update the DB write to set `topic` on answered questions.

---

## Step 2: Topic suggestions from real citizen questions

### 2.1 Store fetched citizen questions with topic labels

**`packages/engine/src/simulation/knowledge-fetch.ts`** — `fetchCitizenQuestions()` already extracts `q.topic?.label`. Currently this flows into `RawParliamentaryItem.title`. No change needed to the fetch — the data is already in `real_world_knowledge` rows with `source: "abgeordnetenwatch-fragen"` and the topic as the title.

### 2.2 New API endpoint: GET /api/questions/trending-topics

**`packages/api/src/routes/content.ts`** — new route (must be registered before `/:id`):
```typescript
router.get("/api/questions/trending-topics", (req, res) => { ... });
```

Query `real_world_knowledge` where `category = 'headline'` OR source contains `abgeordnetenwatch-fragen` to extract recent real-world question topics. Return:
```typescript
{ topics: Array<{ label: string; sampleQuestion: string; source: "abgeordnetenwatch" }> }
```

Limit to 5-8 items. Cache in memory (refresh every hour or on knowledge fetch).

### 2.3 Trending topics sidebar on Questions page

**`packages/web/src/pages/Questions.tsx`** — add a sidebar/card section:
- Title: "Was Bürger im echten Bundestag fragen" (i18n key `questions.trendingTopics`)
- Subtitle (muted): "Themen von abgeordnetenwatch.de — zur Inspiration"
- Show 5 topic pills with sample question text from abgeordnetenwatch
- Clicking a topic pre-fills the question form with that topic selected
- **No timestamps shown** — topics are presented as timeless themes, not dated events

**New API endpoint** in `packages/web/src/api/endpoints.ts`:
```typescript
export const getTrendingTopics = () => fetchJson<TrendingTopic[]>("/questions/trending-topics");
```

**New type** in `packages/web/src/api/types.ts`:
```typescript
export interface TrendingTopic {
  label: string;
  sampleQuestion: string;
  source: string;
}
```

---

## Step 3: Topic filter on Questions page

### 3.1 Add topic filter to GET /api/questions

**`packages/api/src/routes/content.ts`** — accept `topic` query parameter:
```typescript
const topicFilter = req.query.topic as string | undefined;
if (topicFilter) rows = rows.filter((q: any) => q.topic === topicFilter);
```

### 3.2 Topic filter dropdown on Questions page

**`packages/web/src/pages/Questions.tsx`** — add third `<select>` in the filter bar:
```tsx
<select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} className={SELECT_CLS}>
  <option value="">Alle Themen</option>
  {QUESTION_TOPICS.map(t => (
    <option key={t} value={t}>{t}</option>
  ))}
</select>
```

Add `filterTopic` state, pass to `api.getQuestions()`.

**`packages/web/src/api/endpoints.ts`** — extend `getQuestions` to accept optional `topic` param.

### 3.3 Topic distribution chart

**`packages/web/src/pages/Questions.tsx`** — add a small horizontal bar chart below the filters showing question counts per topic. Use inline CSS bars (no chart library needed):
```tsx
<div className="mb-6">
  <h3>Themenverteilung</h3>
  {topicCounts.map(({ topic, count, pct }) => (
    <div key={topic} className="flex items-center gap-2 mb-1">
      <span className="text-xs w-28 truncate">{topic}</span>
      <div className="flex-1 bg-muted rounded h-4">
        <div className="bg-primary rounded h-4" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8">{count}</span>
    </div>
  ))}
</div>
```

Compute `topicCounts` client-side from the loaded questions array.

### 3.4 Show topic badge on question cards

**`packages/web/src/pages/Questions.tsx`** — in `renderQuestionCard()`, after the status badge:
```tsx
{q.topic && (
  <Badge variant="outline" className="text-xs">
    {q.topic}
  </Badge>
)}
```

---

## Step 4: Suggested questions feature

### 4.1 New batch prompt for question suggestions

**`packages/engine/src/agent/group-prompts.ts`** — new function:
```typescript
export function buildQuestionSuggestionPrompt(
  topics: string[],
  recentSimEvents: string[],    // PRIMARY: recent simulation events (bills, crises, media)
  realQuestions: string[],       // SECONDARY: real-world inspiration only
): BatchRequest
```

System prompt instructs AI to generate 5 suggested citizen questions in German, based **primarily on recent simulation events** (bills introduced, crises, media articles) with real abgeordnetenwatch questions as secondary creative inspiration for question style and framing. Returns JSON: `{ suggestions: Array<{ question: string; topic: string; targetPartyId: string }> }`.

**Important**: The prompt must NOT reference real-world dates or events. It should say "Basierend auf der aktuellen Simulationslage..." (Based on the current simulation situation).

### 4.2 Generate suggestions during simulation

**`packages/engine/src/simulation/questions.ts`** — new function `generateQuestionSuggestions(currentDay)`:
- Run once per 3 simulation days (check `currentDay % 3 === 0`)
- Pull recent headlines from `real_world_knowledge` + fetched citizen questions
- Submit via `submitBatch()` in the user-driven batch group
- Store results in new table or reuse `citizen_questions` with a `suggested` status

### 4.3 New DB field or table for suggestions

Option A (simpler): Add `status: "suggested"` as a third status value.
Option B (cleaner): New table `question_suggestions` in `schema-sim.ts`:
```typescript
export const questionSuggestions = sqliteTable("question_suggestions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  topic: text("topic"),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  createdOnDay: integer("created_on_day").notNull(),
  usedByUserId: text("used_by_user_id"),  // set when a user adopts this suggestion
});
```

Recommend Option B to keep suggested vs real questions cleanly separated.

### 4.4 API endpoint: GET /api/questions/suggestions

**`packages/api/src/routes/content.ts`**:
```typescript
router.get("/api/questions/suggestions", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.questionSuggestions)
    .where(isNull(schema.questionSuggestions.usedByUserId))
    .all();
  res.json(rows.slice(0, 5));
});
```

### 4.5 "Vorgeschlagene Fragen" section on Questions page

**`packages/web/src/pages/Questions.tsx`** — new section above the question form:
- Title: "Vorgeschlagene Fragen" (i18n: `questions.suggestedSection`)
- Show 3-5 suggestion cards with topic badge and target party
- Each card has a "Diese Frage stellen" button that pre-fills the form
- When submitted, mark the suggestion as used (`usedByUserId`)

**`packages/web/src/api/endpoints.ts`**:
```typescript
export const getQuestionSuggestions = () => fetchJson<QuestionSuggestion[]>("/questions/suggestions");
```

**`packages/web/src/api/types.ts`**:
```typescript
export interface QuestionSuggestion {
  id: string;
  question: string;
  topic: string | null;
  targetPartyId: string;
  createdOnDay: number;
}
```

---

## Step 5: Question quality improvements

### 5.1 Better question form with topic selector

**`packages/web/src/pages/Questions.tsx`** — replace the current inline form (if present, or add new):
- Topic selector dropdown (required): all `QUESTION_TOPICS` values
- Target party selector (existing)
- Question textarea with placeholder: "Ihre Frage an die Partei..."
- Character counter showing current/max (500 chars, min from `LIMITS.QUESTION_MIN`)
- Submit button disabled until topic + party + min chars met

### 5.2 Character guidance

Show guidance text below the textarea:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  {t("questions.charGuidance", { min: 10, max: 500, current: question.length })}
</p>
```

Color the counter: green when valid range, red when over 500 or under min.

### 5.3 Preview before submit

Add a preview toggle/step:
- "Vorschau" button shows the question as it will appear (using `renderQuestionCard` layout)
- Confirm with "Frage absenden" or go back to edit
- Prevents accidental submissions and lets users see how their question looks

### 5.4 Pass topic to POST /api/questions

Update the `submitQuestion` endpoint call to include topic:
```typescript
export const submitQuestion = (question: string, targetPartyId: string, topic?: string) =>
  postJson<CitizenQuestion>("/questions", { question, targetPartyId, topic });
```

---

## Validation

### Typecheck
```bash
npm run typecheck
```
Must pass with new `topic` field on `CitizenQuestion` in both `types` and `web` packages.

### Migration safety
```bash
npm run migrate
```
New `topic` column must be added without data loss. Existing questions get `topic = NULL`.

### API tests
- GET /api/questions with `?topic=Klimaschutz` returns only matching questions
- GET /api/questions/trending-topics returns array with `label` and `sampleQuestion`
- GET /api/questions/suggestions returns unused suggestions
- POST /api/questions with `topic` field stores it; without `topic` stores null

### Frontend checks
- Topic filter dropdown appears and filters correctly
- Topic badge renders on question cards
- Trending topics sidebar loads and clicking pre-fills form
- Suggested questions section renders and "Diese Frage stellen" pre-fills form
- Character counter updates in real-time, submit disabled when invalid
- Preview mode shows question card layout before submission

### Files changed summary

| File | Change |
|------|--------|
| `packages/engine/src/db/schema-sim.ts` | Add `topic` column to `citizenQuestions`, add `questionSuggestions` table |
| `packages/engine/src/db/ddl.ts` | Migration for `topic` column, DDL for `questionSuggestions` |
| `packages/engine/src/simulation/questions.ts` | `QUESTION_TOPICS` constant, `generateQuestionSuggestions()` |
| `packages/engine/src/agent/group-prompts.ts` | `buildQuestionSuggestionPrompt()` |
| `packages/types/src/types/parliament.ts` | `topic` on `CitizenQuestion` |
| `packages/api/src/routes/content.ts` | Topic filter, `/trending-topics`, `/suggestions` endpoints, topic in POST |
| `packages/web/src/api/types.ts` | `topic` on `CitizenQuestion`, `TrendingTopic`, `QuestionSuggestion` |
| `packages/web/src/api/endpoints.ts` | `getTrendingTopics()`, `getQuestionSuggestions()`, topic param on `getQuestions` |
| `packages/web/src/pages/Questions.tsx` | Topic filter, topic badge, trending sidebar, suggestions section, improved form |
