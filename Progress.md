# Progress: Centralize UI Strings & Fix Untranslated English

**Plan**: [docs/plans/i18n-implementation.md](docs/plans/i18n-implementation.md)
**Goal**: Centralize all UI strings into translation files, fix ~75 remaining English strings, use react-i18next as single-locale (de) string management.
**Validation**: `npm run typecheck` from monorepo root.

---

### Step 1: Install dependencies and configure i18next

- **Status**: done
- **Files**: `packages/web/package.json`, `packages/web/src/locales/index.ts`, `packages/web/src/locales/de/*.json` (11 files), `packages/web/src/main.tsx`
- **Result**: Installed i18next + react-i18next, created i18n config with 11 namespaces (de only), 11 empty JSON files, imported locales in main.tsx. Web typecheck passes.

### Step 2: Common namespace — nav, buttons, shared labels

- **Status**: done
- **Files**: `main.tsx`, `shared.tsx`, `colors.ts`, `timing.ts`, `locales/de/common.json`
- **Result**: Extracted ~45 strings (nav, aria-labels, user menu, footer, day indicator, discipline labels, preset labels). Fixed English: "Toggle menu", "User menu", "Save", "Cancel", "Edit name", "My Party/Questions/Activity", "Logout", DISCIPLINE_LABEL, PRESET_LABEL, TERM_DURATION.

### Step 3: Legislation namespace — bills, amendments, votes

- **Status**: done
- **Files**: `Bills.tsx`, `BillDetail.tsx`, `VoteBar.tsx`, `SpeechDisplay.tsx`, `MdbVoteButtons.tsx`, `locales/de/legislation.json`
- **Result**: Created legislation.json with ~80 translation keys. Fixed all English in BillDetail.tsx (STATUS_LABELS, PIPELINE_STAGES, badges, signals, votes, challenge, veto). Consolidated duplicate STATUS_LABELS. Updated VoteBar, SpeechDisplay, MdbVoteButtons.

### Step 4: Parliament namespace — motions, interpellations, court

- **Status**: in-progress
- **Plan**: Extract ~20 strings from Motions.tsx, Interpellations.tsx, ConfidenceVotes.tsx, ConstitutionalCourt.tsx. Fix English "All" filters, "Struck Down"/"Upheld"/"Decision:".

### Step 5: Media & news namespace

- **Status**: done
- **Files**: `Media.tsx`, `NewsFeed.tsx`, `locales/de/media.json`
- **Result**: Media.tsx and NewsFeed.tsx already use useTranslation("media") with t() calls. media.json has all strings including bias labels (left/center/right) and newsfeed categories (legislative/crises/elections/statements/system).

### Step 6: Budget namespace

- **Status**: in-progress
- **Plan**: Extract ~15 strings from Budget.tsx. Fix English MINISTRY_LABELS (8), filter labels (3), description text, empty state.

### Step 7: Notifications & activity namespace

- **Status**: done
- **Files**: `locales/de/notifications.json`, `Notifications.tsx`, `MyActivity.tsx`
- **Result**: Fixed hardcoded "Day N" using t("day")/t("activity.day"). Added activityTypes and outcomes maps to notifications.json. Replaced item.type.replace(/_/g," ") and item.outcome with t() calls. SimulationLog.tsx was already fully translated. Typecheck passes (Budget.tsx error is pre-existing from Step 6).

### Step 8: Parties & citizens namespace

- **Status**: in-progress
- **Plan**: Extract ~40 strings from Parties.tsx, PartyDetail.tsx, QuestionForm.tsx, ProposalForm.tsx, SpeechSubmitForm.tsx, ApprovalChart.tsx, MdbRosterTable.tsx, MdbBadge.tsx. Fix English vote tooltips.

### Step 9: Dashboard, calendar, elections, polls, admin namespaces

- **Status**: in-progress
- **Plan**: Extract ~60 strings from Dashboard.tsx, OnboardingOverlay.tsx, QuickActionsBar.tsx, CalendarWidget.tsx, Elections.tsx, Polls.tsx, Referendums.tsx, ModelConfig.tsx, ActionsReference.tsx, AskPartyWidget.tsx. Fix English tooltips.

### Step 10: Verify — audit for remaining inline strings

- **Status**: pending
- **Plan**: Grep .tsx files for remaining inline English strings, fix stragglers, final typecheck.
