# Plan: i18n (Internationalization) Implementation

> **Status**: Planning

## Goal

Add full internationalization support to KI Bundestag, covering three layers:
1. **App labels** — All hardcoded UI strings in the React frontend
2. **User-generated content** — Questions, proposals, speeches, applications
3. **Model-generated content** — AI-produced bills, media articles, summaries, poll questions, etc.

The app is currently a mix of hardcoded German UI (navigation, forms, errors) and English (admin labels, notification types). AI content is mandated German via system prompts. There is **no i18n infrastructure** today.

## Current State

- **~300+ hardcoded strings** in the frontend, predominantly German
- **No i18n library** installed (no react-i18next, react-intl, etc.)
- **AI prompts explicitly require German** output (`"ALL text content...MUST be written in German"`)
- **User content** has no language tagging or translation pipeline
- **API layer** returns DB content as-is, no language negotiation
- **Inconsistent language mixing**: German nav + English notification types + English budget labels

---

## Architecture Decision

**Library**: `react-i18next` + `i18next` (most popular, well-supported, lazy loading, namespace support)

**Translation file structure**: JSON files organized by language and namespace (matching functional groups):

```
packages/web/src/locales/
├── de/
│   ├── common.json          # Shared: nav, buttons, errors, loading states
│   ├── legislation.json     # Bills, amendments, readings, votes
│   ├── parliament.json      # Motions, interpellations, confidence votes, court
│   ├── elections.json       # Elections, coalitions, government
│   ├── media.json           # News, press, outlets, bias labels
│   ├── polls.json           # Polls, referendums, voting
│   ├── parties.json         # Party pages, profiles, membership
│   ├── citizens.json        # Questions, proposals, speeches, MdB
│   ├── dashboard.json       # Dashboard widgets, onboarding, quick actions
│   ├── admin.json           # Admin panels, timing, model config
│   ├── calendar.json        # Calendar, months, event types
│   ├── notifications.json   # Notification types, messages
│   └── legal.json           # About, Impressum, Datenschutz (large text blocks)
├── en/
│   └── (same structure)
└── index.ts                 # i18n init config
```

**Language detection**: Browser `navigator.language` → localStorage override → fallback `de`

**Content translation strategy** (3 tiers):

| Tier | Content Type | Strategy |
|------|-------------|----------|
| **1. Static UI** | Nav, buttons, labels, errors, status maps | Translation JSON files, `useTranslation()` hook |
| **2. Model-generated** | Bills, media, summaries, polls, etc. | Dual-language generation in AI prompts OR on-demand translation via API |
| **3. User-generated** | Questions, proposals, speeches | Display as-is (original language) with optional translate button |

---

## Implementation Steps (grouped by functionality)

### Phase 1: Foundation & Infrastructure

#### Step 1.1: Install i18n dependencies and configure
- Install `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- Create `packages/web/src/locales/index.ts` with i18n init
- Wrap app root with `I18nextProvider` in `main.tsx`
- Add language switcher component (DE/EN toggle in header)
- Create empty namespace JSON files for `de/` and `en/`

#### Step 1.2: Extract shared/common strings
- **File**: `common.json`
- **Source files**: `main.tsx`, `shared.tsx`, `EmptyState.tsx`, `LoadingSkeleton.tsx`, `FilterPills.tsx`
- **Strings**: Navigation labels (~20), button text (Save, Cancel, Submit, etc.), loading states ("Lade..."), generic errors, search placeholders, user menu items
- **Constant maps**: `DISCIPLINE_LABEL` in `colors.ts`, `PRESET_LABEL` in `timing.ts`

### Phase 2: Page-by-Page UI Extraction (by functional group)

#### Step 2.1: Legislation namespace
- **File**: `legislation.json`
- **Source files**: `Bills.tsx`, `BillDetail.tsx`, `BillImpactDisplay.tsx`, `SpeechDisplay.tsx`, `MdbVoteButtons.tsx`, `VoteBar.tsx`
- **Strings**: `STATUS_LABELS` (2 different maps — German in Bills.tsx, English in BillDetail.tsx → unify), reading stage labels, vote labels (Ja/Nein/Enthaltung), bill search placeholder, category/party/status filter labels, impact field names, amendment labels
- **Note**: BillDetail.tsx and Bills.tsx have DUPLICATE but inconsistent STATUS_LABELS — consolidate into one shared translation key

#### Step 2.2: Parliament namespace
- **File**: `parliament.json`
- **Source files**: `Motions.tsx`, `Interpellations.tsx`, `ConfidenceVotes.tsx`, `ConstitutionalCourt.tsx`
- **Strings**: Page headings, status labels, motion types (Antrag/Entschließung), interpellation types (kleine/große Anfrage), vote outcome labels, court decision labels

#### Step 2.3: Elections namespace
- **File**: `elections.json`
- **Source files**: `Elections.tsx`, `CoalitionCalculator.tsx`, `VoteBarChart.tsx`, `CoalitionChips.tsx`
- **Strings**: Page headings, coalition calculator labels, government formation labels, vote percentage labels, election result headings

#### Step 2.4: Media namespace
- **File**: `media.json`
- **Source files**: `Media.tsx`, `NewsFeed.tsx`
- **Strings**: Page headings ("Medien", "Titelseiten von heute", "Archiv"), `BIAS_LABELS` (Left/Center/Right), outlet filter labels, category labels

#### Step 2.5: Polls namespace
- **File**: `polls.json`
- **Source files**: `Polls.tsx`, `Referendums.tsx`
- **Strings**: Page headings, vote buttons, result labels, category labels, referendum status labels

#### Step 2.6: Parties & citizens namespace
- **File**: `parties.json` + `citizens.json`
- **Source files**: `Parties.tsx`, `PartyDetail.tsx`, `QuestionForm.tsx`, `ProposalForm.tsx`, `SpeechSubmitForm.tsx`, `ApprovalChart.tsx`, `PartyBillsList.tsx`, `MdbRosterTable.tsx`, `MdbBadge.tsx`
- **Strings**: Party page headings, join modal text, form labels/placeholders/validation messages, daily limit messages, question/proposal/speech submission UI, MdB roster labels, approval chart labels
- **Note**: This is the largest group — many form validation messages and interactive prompts

#### Step 2.7: Dashboard namespace
- **File**: `dashboard.json`
- **Source files**: `Dashboard.tsx`, `OnboardingOverlay.tsx`, `QuickActionsBar.tsx`, `MyImpactCard.tsx`, `CatchupCard.tsx`, `CalendarWidget.tsx`
- **Strings**: Welcome messages, onboarding steps, quick action labels, impact card labels, catchup summary labels
- **Calendar**: `MONTH_NAMES` (12), `EVENT_LABEL` (~22 event types) → move to `calendar.json`

#### Step 2.8: Notifications & admin namespace
- **File**: `notifications.json` + `admin.json`
- **Source files**: `Notifications.tsx`, `MyActivity.tsx`, `SimulationLog.tsx`, `SimulationInfo.tsx`, `ActionsReference.tsx`, `ModelConfig.tsx`
- **Strings**: `TYPE_LABELS` (~15 notification types), activity labels, log entry labels, admin panel labels

#### Step 2.9: Legal/content pages
- **File**: `legal.json`
- **Source files**: `About.tsx`, `Impressum.tsx`, `Datenschutz.tsx`
- **Strings**: Large blocks of narrative German text (100+ lines each)
- **Strategy**: Store as markdown strings in translation files, render with a markdown component or use `Trans` component for rich text

### Phase 3: Model-Generated Content (AI layer)

#### Step 3.1: Add language parameter to AI prompts
- **Affected files**: `packages/engine/src/agent/prompt.ts`, `simulation/media.ts`, `simulation/summary.ts`, `simulation/polls.ts`, `simulation/referendums.ts`, `simulation/questions.ts`, `simulation/interpellations.ts`, `simulation/internal-proposals.ts`, `simulation/speeches.ts`, `simulation/discipline.ts`, `agent/group-prompts.ts`
- **Change**: Replace hardcoded `"MUST be written in German"` with a configurable language parameter
- **New config**: `CONTENT_LANGUAGE` env var or simulation setting (default: `"de"`)
- **Prompt template update**: `"ALL text content...MUST be written in ${language === 'de' ? 'German' : 'English'}"`
- **Mood labels** in `summary.ts`: Make the 7 mood options language-aware (currently hardcoded German)

#### Step 3.2: Dual-language content generation (optional, higher cost)
- **Strategy A (recommended)**: Generate content in ONE language (based on simulation config), translate on-demand via lightweight API call when user requests other language
- **Strategy B (expensive)**: Generate content in both languages simultaneously (doubles AI cost)
- **Strategy C (cheapest)**: Generate in German only, add client-side "Translate" button that calls a translation API
- **Recommendation**: Start with Strategy A (single language generation), add Strategy C as enhancement

#### Step 3.3: API language negotiation
- **Affected files**: `packages/api/src/` middleware and routes
- **Change**: Accept `Accept-Language` header or `?lang=de|en` query parameter
- **Behavior**: For static enums (categories, statuses), return translated values; for AI content, return as stored (original language)
- **New middleware**: Language detection middleware that sets `req.locale`
- **Enum translations**: Minister portfolios, bill categories, crisis types, event types — add server-side translation maps

#### Step 3.4: Translate existing DB content (migration)
- **Approach**: NOT recommended for initial release — too much content, too expensive
- **Future**: Could add a `translations` table with `(entity_type, entity_id, field, locale, text)` for cached translations
- **On-demand**: When user requests English for a German article, translate via API, cache in translations table

### Phase 4: User-Generated Content

#### Step 4.1: Language tagging for user content
- **Schema change**: Add `language` column to `citizenQuestions`, `internalProposals`, `mdbApplications`, `mdbSpeeches` tables
- **Detection**: Auto-detect language on submission (lightweight, e.g., `franc` library or simple heuristic)
- **Storage**: Store original text + detected language code

#### Step 4.2: Client-side translate button
- **UI change**: Add "Translate" button next to user-generated content (questions, proposals, speeches)
- **API**: New endpoint `POST /api/translate` that accepts text + target locale, returns translated text
- **Caching**: Cache translations client-side (React Query) and optionally server-side
- **Cost control**: Rate-limit translation requests per user

#### Step 4.3: AI responses in user's language
- **Change**: When answering citizen questions, detect the question's language and respond in kind
- **Affected files**: `simulation/questions.ts`, `agent/group-prompts.ts`
- **Prompt update**: `"Answer in the same language as the question"`

---

## Functional Group Summary

| Group | UI Strings | AI Content | User Content | Priority |
|-------|-----------|------------|--------------|----------|
| **Common/Nav** | ~40 strings | — | — | P0 |
| **Legislation** | ~30 strings | Bill titles, descriptions, vote reasons | Speeches, amendments | P0 |
| **Parliament** | ~20 strings | Motions, interpellations, court rulings | — | P1 |
| **Elections** | ~15 strings | Coalition summaries | — | P1 |
| **Media/News** | ~15 strings | Headlines, articles, summaries | — | P1 |
| **Polls** | ~10 strings | Poll questions, referendum text | Poll/referendum votes (no text) | P2 |
| **Parties/Citizens** | ~40 strings | Question responses, proposal decisions | Questions, proposals, applications | P0 |
| **Dashboard** | ~30 strings | Daily narrative summary | — | P1 |
| **Calendar** | ~35 strings | — | — | P1 |
| **Notifications** | ~20 strings | Notification messages | — | P2 |
| **Admin** | ~15 strings | — | — | P2 |
| **Legal pages** | ~300+ words | — | — | P2 |

---

## Key Risks & Decisions

1. **AI cost**: Dual-language generation doubles Haiku costs (~$0.06→$0.12/day). On-demand translation is cheaper but adds latency.
2. **Content consistency**: AI-generated German bills debated in German parliament should stay German — translating them breaks immersion. Consider: translate only the UI chrome, keep simulation content in German with optional translate button.
3. **Mixed-language UGC**: Users may submit in any language. AI responses currently forced to German. Need policy: respond in question's language? Always German? Configurable?
4. **SEO/URL structure**: Current routes are language-neutral (`/bills`, `/parties`). Could add `/de/bills`, `/en/bills` prefix — but probably overkill for this app.
5. **RTL languages**: Not in scope. Only DE and EN for v1.
6. **Date/number formatting**: German uses `DD.MM.YYYY` and `1.000,00` vs English `MM/DD/YYYY` and `1,000.00`. Use `Intl.DateTimeFormat` and `Intl.NumberFormat`.

---

## Files Changed (estimated)

| Package | Files | Type of Change |
|---------|-------|---------------|
| `web` | ~40 components | Extract strings to `useTranslation()` |
| `web` | 1 new dir (`locales/`) | Translation JSON files (2 languages × 13 namespaces) |
| `web` | `main.tsx` | i18n provider, language switcher |
| `web` | `package.json` | New deps: i18next, react-i18next, i18next-browser-languagedetector |
| `engine` | ~10 prompt files | Parameterize language in system prompts |
| `engine` | 4 schema files | Add `language` column to UGC tables |
| `api` | ~5 route files | Language middleware, enum translations |
| `api` | 1 new route | Translation endpoint |

---

## Out of Scope (v1)

- More than 2 languages (DE + EN only)
- Translating historical DB content (too expensive)
- RTL language support
- URL-based locale routing (`/de/`, `/en/`)
- Server-side rendering with locale
- Translating AI system prompts themselves (they stay English internally)
- Per-user language preference stored in DB (use localStorage for now)
