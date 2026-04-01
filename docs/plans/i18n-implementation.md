# Plan: Centralize UI Strings & Fix Untranslated English

> **Status**: Implemented (all 10 steps complete)

## Goal

The app is **German-only**. Many UI strings are already German, but ~75 strings remain in English (status labels, notification types, ministry names, tooltips, filter labels). Additionally, strings are scattered inline across ~40 components with no central management.

**Objectives:**
1. Centralize all UI strings into organized translation files (one source of truth)
2. Fix all remaining English strings → translate to German
3. Eliminate duplicate/inconsistent label maps (e.g. STATUS_LABELS defined differently in Bills.tsx vs BillDetail.tsx)
4. Use `react-i18next` as a string management tool (single locale: `de`)

## Current Problems

- **~75 English strings** scattered across 15+ files (see inventory below)
- **Duplicate label maps**: `STATUS_LABELS` in Bills.tsx (German) vs BillDetail.tsx (English) — different translations for same keys
- **No central string registry**: Every component defines its own inline constants
- **Hard to audit**: No way to grep for untranslated strings when they're mixed into JSX

---

## English Strings Inventory (by functional group)

### Legislation
| File | String(s) | German |
|------|-----------|--------|
| `BillDetail.tsx:17-27` | STATUS_LABELS: "Third Reading", "Second Reading", "Committee", "First Reading", "Proposed", "Passed", "Rejected", "Debate", "Struck Down" | "3. Lesung", "2. Lesung", "Ausschuss", "1. Lesung", "Eingebracht", "Angenommen", "Abgelehnt", "Debatte", "Verfassungswidrig" |
| `BillDetail.tsx:29-36` | PIPELINE_STAGES: "Proposed", "1st Reading", "Committee", "2nd Reading", "3rd Reading", "Final" | "Eingebracht", "1. Lesung", "Ausschuss", "2. Lesung", "3. Lesung", "Abschluss" |

### Budget
| File | String(s) | German |
|------|-----------|--------|
| `Budget.tsx:12-21` | MINISTRY_LABELS: "Finance", "Labour & Social", "Environment", "Interior", "Defence", "Education", "Health", "Infrastructure" | "Finanzen", "Arbeit & Soziales", "Umwelt", "Inneres", "Verteidigung", "Bildung", "Gesundheit", "Infrastruktur" |
| `Budget.tsx:75-93` | Description text, filter labels "All", "Passed", "Rejected", empty state text | "Alle", "Angenommen", "Abgelehnt", etc. |

### Media & News
| File | String(s) | German |
|------|-----------|--------|
| `Media.tsx:40-44` | BIAS_LABELS: "Left", "Center", "Right" | "Links", "Mitte", "Rechts" |
| `NewsFeed.tsx:11-31` | EVENT_CATEGORIES: "Legislative", "Crises", "Elections", "Statements", "System" | "Gesetzgebung", "Krisen", "Wahlen", "Stellungnahmen", "System" |

### Notifications
| File | String(s) | German |
|------|-----------|--------|
| `Notifications.tsx:20-36` | TYPE_LABELS: "All", "Morning Summary", "Queued", "Ready", "Proposal Accepted/Declined/Expired", "Question Answered", "Bill Outcome", "Vote Needed", "Election", "Election Result", "Crisis", "Budget", "Government" (15 strings) | "Alle", "Morgenbericht", "Warteschlange", "Bereit", "Vorschlag angenommen/abgelehnt/abgelaufen", "Frage beantwortet", "Abstimmungsergebnis", "Abstimmung nötig", "Wahl", "Wahlergebnis", "Krise", "Haushalt", "Regierung" |

### Parliament
| File | String(s) | German |
|------|-----------|--------|
| `Interpellations.tsx:55,61` | "All" (filter) | "Alle" |
| `ConstitutionalCourt.tsx:52-66` | "All", "Decision:", "Struck Down", "Upheld", "challenge(s)" | "Alle", "Entscheidung:", "Abgelehnt", "Bestätigt", "Beschwerde(n)" |

### Shared / Common
| File | String(s) | German |
|------|-----------|--------|
| `shared.tsx:73,82` | "You can participate", "MdB action available" | "Du kannst teilnehmen", "MdB-Aktion verfügbar" |
| `main.tsx:121-316` | aria-labels: "Toggle menu", "User menu", "Save", "Cancel", "Edit name" | "Menü umschalten", "Benutzermenü", "Speichern", "Abbrechen", "Name bearbeiten" |
| `colors.ts:153-158` | DISCIPLINE_LABEL: "Good", "Warning", "Restricted", "Whipped" | "Gut", "Warnung", "Eingeschränkt", "Fraktionszwang" |
| `timing.ts` | PRESET_LABEL values (if English) | German equivalents |

### Tooltips & Interactions
| File | String(s) | German |
|------|-----------|--------|
| `Questions.tsx:68-96` | "Retract upvote/downvote", "Upvote", "Downvote", "Upvote or downvote" | "Zustimmung zurücknehmen", "Zustimmen", "Ablehnen", etc. |
| `Referendums.tsx:129` | "Cast your vote" | "Stimme abgeben" |
| `ProposalForm.tsx:186,200` | "Retract upvote/downvote", "Upvote", "Downvote" | Same as Questions |
| `AskPartyWidget.tsx:46` | "Select party" | "Partei wählen" |
| `ModelConfig.tsx:143` | "Collapse" / "Expand" | "Einklappen" / "Ausklappen" |
| `ActionsReference.tsx:339` | "Collapse" / "Show detail" | "Einklappen" / "Details anzeigen" |
| `MyActivity.tsx:94` | "All" (filter) | "Alle" |

---

## Architecture

**Library**: `react-i18next` (single locale `de`, no language switcher needed)

**File structure** — organized by functional group:
```
packages/web/src/locales/
├── de/
│   ├── common.json          # Nav, buttons, aria-labels, loading, errors, shared labels
│   ├── legislation.json     # Bills, amendments, readings, votes, status labels, pipeline
│   ├── parliament.json      # Motions, interpellations, confidence votes, constitutional court
│   ├── elections.json       # Elections, coalitions, government formation
│   ├── media.json           # News feed, press, outlets, bias labels, event categories
│   ├── budget.json          # Budget page, ministry labels
│   ├── polls.json           # Polls, referendums
│   ├── parties.json         # Party pages, membership, questions, proposals, MdB
│   ├── dashboard.json       # Dashboard widgets, onboarding, quick actions, calendar
│   ├── notifications.json   # Notification types, activity labels
│   └── admin.json           # Admin panels, timing, model config
└── index.ts                 # i18n init (locale: 'de', no detection needed)
```

**Why i18next even for single-language?**
- Central string registry — one place to audit all user-facing text
- Namespace organization — strings grouped by feature area
- Interpolation support — `t('limit.remaining', { count: 3 })` cleaner than template literals
- Future-proof — adding EN later is just adding `en/` folder
- Prevents regression — new strings must be added to JSON files, easy to review in PRs

---

## Implementation Steps

### Step 1: Install dependencies and configure i18next
- `npm install i18next react-i18next` in `packages/web`
- Create `packages/web/src/locales/index.ts` — init i18next with `lng: 'de'`, no detector
- Create empty namespace JSON files in `de/`
- Wrap app with `I18nextProvider` in `main.tsx`
- **No language switcher** — German only

### Step 2: Common namespace — nav, buttons, shared labels
- Extract from: `main.tsx` (nav labels, aria-labels, user menu), `shared.tsx` (tooltips), `colors.ts` (DISCIPLINE_LABEL), `timing.ts` (PRESET_LABEL), `FilterPills.tsx`, `EmptyState.tsx`, `LoadingSkeleton.tsx`
- Fix English: aria-labels in main.tsx, DISCIPLINE_LABEL in colors.ts, default tooltips in shared.tsx
- **~40 strings**

### Step 3: Legislation namespace — bills, amendments, votes
- Extract from: `Bills.tsx`, `BillDetail.tsx`, `BillImpactDisplay.tsx`, `SpeechSubmitForm.tsx`, `SpeechDisplay.tsx`, `MdbVoteButtons.tsx`, `VoteBar.tsx`
- Fix English: STATUS_LABELS in BillDetail.tsx (9 strings), PIPELINE_STAGES (6 strings)
- Consolidate duplicate STATUS_LABELS from Bills.tsx + BillDetail.tsx into single translation keys
- **~30 strings**

### Step 4: Parliament namespace — motions, interpellations, court
- Extract from: `Motions.tsx`, `Interpellations.tsx`, `ConfidenceVotes.tsx`, `ConstitutionalCourt.tsx`
- Fix English: "All" filters in Interpellations, "Struck Down"/"Upheld"/"Decision:" in ConstitutionalCourt
- **~20 strings**

### Step 5: Media & news namespace
- Extract from: `Media.tsx`, `NewsFeed.tsx`
- Fix English: BIAS_LABELS (3 strings), EVENT_CATEGORIES labels (5 strings)
- **~15 strings**

### Step 6: Budget namespace
- Extract from: `Budget.tsx`
- Fix English: MINISTRY_LABELS (8 strings), filter labels (3), description text, empty state
- **~15 strings**

### Step 7: Notifications & activity namespace
- Extract from: `Notifications.tsx`, `MyActivity.tsx`, `SimulationLog.tsx`
- Fix English: TYPE_LABELS (15 strings), "All" filter in MyActivity
- **~20 strings**

### Step 8: Parties & citizens namespace
- Extract from: `Parties.tsx`, `PartyDetail.tsx`, `QuestionForm.tsx`, `ProposalForm.tsx`, `SpeechSubmitForm.tsx`, `ApprovalChart.tsx`, `MdbRosterTable.tsx`, `MdbBadge.tsx`
- Fix English: vote tooltips in ProposalForm.tsx, Questions.tsx
- **~40 strings**

### Step 9: Dashboard, calendar, elections, polls, admin namespaces
- Extract from: `Dashboard.tsx`, `OnboardingOverlay.tsx`, `QuickActionsBar.tsx`, `CalendarWidget.tsx`, `Elections.tsx`, `Polls.tsx`, `Referendums.tsx`, `ModelConfig.tsx`, `ActionsReference.tsx`, `AskPartyWidget.tsx`
- Fix English: "Select party", "Collapse"/"Expand", "Cast your vote", vote tooltips
- **~60 strings**

### Step 10: Verify — audit for remaining inline strings
- Grep all `.tsx` files for quoted strings in JSX that aren't translation keys
- Run the app and visually check each page for English text
- Fix any stragglers

---

## Files Changed

| Package | Files | Change |
|---------|-------|--------|
| `web` | `package.json` | Add i18next, react-i18next |
| `web` | 1 new dir `locales/de/` | 11 namespace JSON files |
| `web` | `locales/index.ts` | i18n config (new file) |
| `web` | `main.tsx` | I18nextProvider wrapper + extract nav strings |
| `web` | ~30 components | Replace inline strings with `t()` calls |
| `web` | `lib/colors.ts` | Extract DISCIPLINE_LABEL to translation |
| `web` | `lib/timing.ts` | Extract PRESET_LABEL to translation |

## Out of Scope

- Multi-language support (no EN locale, no language switcher)
- Translating AI-generated content or DB content
- Translating user-generated content
- API-layer changes
- Server-side locale handling
- Legal pages (About, Impressum, Datenschutz) — already fully German, large text blocks, low ROI to extract
