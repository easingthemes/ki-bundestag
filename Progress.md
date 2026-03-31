# Progress: Centralize UI Strings & Fix Untranslated English

**Plan**: [docs/plans/i18n-implementation.md](docs/plans/i18n-implementation.md)
**Goal**: Centralize all UI strings into translation files, fix ~75 remaining English strings, use react-i18next as single-locale (de) string management.
**Validation**: `npx tsc -p packages/web/tsconfig.json --noEmit`

---

### Step 1: Install dependencies and configure i18next

- **Status**: done
- **Files**: `packages/web/package.json`, `packages/web/src/locales/index.ts`, `packages/web/src/locales/de/*.json` (11 files), `packages/web/src/main.tsx`
- **Result**: Installed i18next + react-i18next, created i18n config with 11 namespaces (de only), imported locales in main.tsx.

### Step 2: Common namespace — nav, buttons, shared labels

- **Status**: done
- **Files**: `main.tsx`, `shared.tsx`, `colors.ts`, `timing.ts`, `locales/de/common.json`
- **Result**: Extracted ~45 strings. Fixed English aria-labels, DISCIPLINE_LABEL, PRESET_LABEL, TERM_DURATION, user menu items.

### Step 3: Legislation namespace — bills, amendments, votes

- **Status**: done
- **Files**: `Bills.tsx`, `BillDetail.tsx`, `VoteBar.tsx`, `SpeechDisplay.tsx`, `MdbVoteButtons.tsx`, `locales/de/legislation.json`
- **Result**: ~80 translation keys. Fixed all English in BillDetail.tsx, consolidated duplicate STATUS_LABELS.

### Step 4: Parliament namespace — motions, interpellations, court

- **Status**: done
- **Files**: `Motions.tsx`, `Interpellations.tsx`, `ConfidenceVotes.tsx`, `ConstitutionalCourt.tsx`, `locales/de/parliament.json`
- **Result**: ~80 strings. Fixed English: "All" filters, "Struck Down"/"Upheld"/"Decision:", confidence vote labels.

### Step 5: Media & news namespace

- **Status**: done
- **Files**: `Media.tsx`, `NewsFeed.tsx`, `locales/de/media.json`
- **Result**: ~25 strings. Fixed BIAS_LABELS and EVENT_CATEGORIES.

### Step 6: Budget namespace

- **Status**: done
- **Files**: `Budget.tsx`, `locales/de/budget.json`
- **Result**: ~35 strings. Fixed MINISTRY_LABELS, filter labels, description text.

### Step 7: Notifications & activity namespace

- **Status**: done
- **Files**: `Notifications.tsx`, `MyActivity.tsx`, `SimulationLog.tsx`, `locales/de/notifications.json`
- **Result**: ~40 strings. Fixed TYPE_LABELS (15 notification types), "All" filter, activity types.

### Step 8: Parties & citizens namespace

- **Status**: done
- **Files**: `Parties.tsx`, `PartyDetail.tsx`, `Questions.tsx`, `QuestionForm.tsx`, `ProposalForm.tsx`, `ApprovalChart.tsx`, `MdbRosterTable.tsx`, `locales/de/parties.json`
- **Result**: Added useTranslation("parties") to 7 files, ~50+ t() replacements. Fixed English vote tooltips in Questions.tsx + ProposalForm.tsx, Fraktion English strings, vote table headers, MdB form, approval chart axes. Typecheck passes.

### Step 9: Dashboard, calendar, elections, polls, admin namespaces

- **Status**: done
- **Files**: `Dashboard.tsx`, `OnboardingOverlay.tsx`, `QuickActionsBar.tsx`, `CalendarWidget.tsx`, `AskPartyWidget.tsx`, `Elections.tsx`, `Polls.tsx`, `Referendums.tsx`, `ModelConfig.tsx`, `ActionsReference.tsx`, `locales/de/{dashboard,elections,polls,admin}.json`
- **Result**: ~150 strings across 5 namespaces. Fixed "Select party", "Collapse"/"Expand", "Cast your vote", election/poll labels.

### Step 10: Verify — audit for remaining inline strings

- **Status**: in-progress
- **Plan**: Grep .tsx files for remaining inline English strings, fix stragglers, final typecheck.
