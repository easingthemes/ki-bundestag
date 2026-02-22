# Plan: Full Visual Redesign — KI Bundestag Web

### Direction (updated 2026-02-22)

The redesign is in progress. The implementation settled on a **professional light-mode political media aesthetic** (Tagesschau.de + Politico.eu hybrid) rather than dark-mode-first. This was a deliberate practical choice — the existing Tailwind token system, shadcn/ui components, and Inter font all work well in light mode without the overhead of a full dark-mode token rework.

**Active reference sites:**

- [tagesschau.de](https://www.tagesschau.de) — primary: uppercase section dividers, authoritative clean layout, data-forward cards
- [politico.eu](https://www.politico.eu) — editorial grid, strong type hierarchy, categorized content lanes
- [bundestag.de](https://www.bundestag.de) — institutional gravity, structured factual content
- [ourworldindata.org](https://ourworldindata.org) — clean data viz, sparklines, trust-building charts
- [ft.com/markets](https://www.ft.com/markets) — stat panels with sparklines, financial data tables

---

### I. Current Design State (What's Done)

#### ✅ Design system (`styles.css`, `index.html`)

- Light-mode tokens: `#f7f8fa` bg, `#ffffff` card, `#003d7a` primary, `#e2e5ea` border
- `.section-title` — uppercase blue bordered label (Tagesschau style), used across all pages
- `.stat-value` / `.stat-label` — large tabular stat readouts for dashboard numbers
- Inter weights 400–800, font-smoothing, heading scale (h1: 1.75rem / h2: 1.15rem / h3: 0.95rem)

#### ✅ Navigation (`main.tsx`)

- Dark `bg-primary` top bar with dropdown groups, SimStatus pill, NotificationBell, UserMenu
- Dropdown panels: dark `bg-[#0d1b2e]` matching nav (fixed from jarring white mismatch)
- Mobile: shadcn Sheet drawer, light bg, overflow-safe scrolling

#### ✅ Layout shell (`components/PageShell.tsx`)

- Single/two-column layout wrapper with `sidebar` prop (main `1fr` + aside `340px`)
- `fullWidth` mode, optional `title`/`subtitle` header

#### ✅ Components built

| Component                     | File                       | Notes                                                   |
| ----------------------------- | -------------------------- | ------------------------------------------------------- |
| `Hemicycle`                   | `components/Hemicycle.tsx` | Dot-based SVG, spectrum-ordered, sm/md/lg sizes, legend |
| `PartyCard` / `PartyCardGrid` | `components/PartyCard.tsx` | Color block icon, approval bar, compactmode             |

#### ✅ Pages redesigned

| Page                   | What changed                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dashboard              | 2-col `PageShell`, Hemicycle widget, economy stats, media section, coalition/party rail, all widgets preserved |
| Elections              | Dot hemicycle full-width, horizontal coalition bars, coalition calculator                                      |
| Parties                | `PartyCard` grid (3-col), vote alignment matrix kept                                                           |
| PartyDetail            | Color-block party header, section-title throughout                                                             |
| All 20 remaining pages | `.section-title` headers + German labels applied uniformly                                                     |

---

### II. What Was Dropped (vs. Original Plan)

| Item                                    | Reason removed                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dark-mode-first palette                 | Implementation chose light mode — practical, consistent with shadcn defaults                       |
| Left sidebar navigation                 | Top nav works well with grouped dropdowns; sidebar adds layout complexity for unclear gain         |
| DM Serif Display + JetBrains Mono fonts | Not implemented; Inter alone is sufficient; serif display would require widespread h1/h2 overrides |
| Mobile bottom tab bar                   | Mobile Sheet drawer is adequate; bottom tab bar needs a separate layout rework                     |

---

### III. Component Library — Still To Build

All go in `packages/web/src/components/`.

#### Data Visualization

| Component           | Description                                                                                                                                                                                              | Reference                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `EconomyPanel`      | 4 stat cards side by side, each with a tiny 30-day SVG sparkline (path, no library). Extract from Dashboard inline stat block.                                                                           | [ft.com/markets](https://www.ft.com/markets) |
| `VoteRiver`         | Stacked vote bar (yes/no/abstain) with per-party breakdown on hover. Animated `transition: width 600ms`. Replaces all current bare `<div className="flex h-5 rounded overflow-hidden">` vote bar clones. | —                                            |
| `ApprovalSparkline` | Small inline SVG 30-day trend line for party cards and detail pages. Reuses party history data already fetched.                                                                                          | —                                            |
| `SeatBar`           | Full-width horizontal stacked seat bar with color blocks, party labels below, hover tooltip. Used on Parties page top + Dashboard coalition section.                                                     | —                                            |

#### Teaser / Feed Components

| Component        | Description                                                                                                                                                                                                          | Reference                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `StoryCard`      | Editorial card: `.section-title`-style category chip + bold headline + 2-line excerpt + day badge. Sizes: `hero` (full-width, larger headline) / `standard` / `compact`. Used in Media, News, Dashboard bill events. | [spiegel.de](https://www.spiegel.de) teasers |
| `BreakingBanner` | Full-width amber/red strip with icon + message + dismiss `×`. Shown when: active crisis / active confidence vote / budget provisional / snap election. Lives in Dashboard above hero.                                | [bbc.co.uk/news](https://www.bbc.co.uk/news) |
| `EventRow`       | Dense single-line event: colored left border by event type, icon, text, day badge. Replaces ad-hoc list items in NewsFeed and SimulationLog.                                                                         | —                                            |

#### Interactive

| Component       | Description                                                                                                                                                              | Reference                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `NewsCarousel`  | CSS snap-scroll horizontal carousel of `StoryCard`s. Arrow buttons + keyboard nav. Used on Dashboard "Aus der Presse" section.                                           | [spiegel.de](https://www.spiegel.de) front page |
| `BillPipeline`  | Read-only Kanban: 5 columns (Eingereicht → 1. Lesung → Ausschuss → 2./3. Lesung → Gesetz), bill cards per stage. Toggle switch: Kanban / Liste. Primary Bills page view. | [linear.app](https://linear.app)                |
| `TimelineRiver` | Vertical centered timeline, alternating left/right cards, bold day-separator markers. For SimulationLog and election negotiation history.                                | —                                               |

#### Engagement

| Component        | Description                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PollCard`       | Prominent poll card: question, animated percentage bars (CSS transition), Vote button (auth-gated), result bar with party breakdown. Replaces inline poll rendering in Polls page and Dashboard sidebar. |
| `ReferendumCard` | Full-bleed card: question headline, impact preview pills, large Yes/No/Abstain buttons.                                                                                                                  |

---

### IV. Page-by-Page — Still Outstanding

#### Dashboard (`/`)

Currently: 2-col shell, Hemicycle, economy stats, media card list, party cards, sidebar widgets. Good bones.

**Remaining improvements:**

- Add `BreakingBanner` (crisis / confidence vote / provisional budget alert strip)
- Replace economy inline block → `EconomyPanel` with sparklines
- Replace media list → `NewsCarousel` of `StoryCard`s
- Replace bare vote bars everywhere → `VoteRiver`
- Add `SeatBar` above party carousel section

#### Bills (`/bills`)

**Remaining:**

- Add `BillPipeline` kanban as primary view (toggle: Kanban / Liste)
- Bill list items → `StoryCard` compact or `EventRow`
- BillDetail: add 5-step reading stage progress bar at top (Eingereicht → Gesetz, current step highlighted)
- BillDetail: `VoteRiver` for vote breakdown (replaces bare color div)

#### Elections (`/elections`)

**Remaining:**

- Coalition negotiation rounds → **chat-log layout**: party avatar + round number header + argument text per message, timestamped by day
- Add seat history bar chart (simple SVG bars, seat delta per election)

#### News Feed (`/news`)

**Remaining:**

- Breaking ticker strip at top (top 3 most recent events, auto-rotating or static)
- Day separators → bold `section-title`-style date dividers
- Event items → `EventRow` component
- Filter pills → horizontal scroll strip (currently static row)

#### Media (`/media`)

**Remaining:**

- 3 outlet columns side by side (Tagesspiegel / Volksstimme / WiWo) with outlet bias badge (left/center/right)
- Current article → `StoryCard` hero size; archive → `StoryCard` compact
- Outlet header: colored top border matching existing `OUTLET_STYLE` colors

#### Budget (`/budget`)

**Remaining:**

- Top `StatCard` row: total budget value, passed/provisional status, next cycle countdown
- Ministry allocations: horizontal bar chart per ministry with delta vs prior cycle
- Vote section: `VoteRiver` per party

#### Questions (`/questions`)

**Remaining:**

- Split layout: **Pending** (upvote arrows, sorted by votes) | **Answered** (with response excerpt collapsed)
- Answered items: party color left-border + party avatar initial block

#### Login (`/login`)

**Remaining:**

- Full-page centered layout with subtle Bundesadler SVG watermark (low-opacity bg element)
- Single input + CTA only — remove extraneous chrome

#### Admin (`/admin`)

**Remaining:**

- Speed preset selector: visual tile cards with icons + description (not text-only list)
- Model config: proper data `<table>` with provider name + model label columns

---

### V. Typography — Remaining Opportunity

Current state: Inter only, all weights, `section-title` pattern used consistently.

**Optional next step** (not critical): Add **[DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display)** exclusively for H1 page titles only — not for section headings. This gives editorial gravitas without widespread disruption. Only 2 lines to add:

```html
<!-- index.html — add to existing Google Fonts link -->
family=DM+Serif+Display&
```

```css
/* styles.css */
h1 {
  font-family: "DM Serif Display", Georgia, serif;
  font-weight: 400;
}
```

---

### VI. Animation & Motion

| Pattern            | Implementation                                                    | Status                            |
| ------------------ | ----------------------------------------------------------------- | --------------------------------- |
| Vote bars          | CSS `transition: width 600ms ease` on mount                       | ⬜ When `VoteRiver` built         |
| Approval sparkline | SVG `stroke-dashoffset` on mount                                  | ⬜ When `ApprovalSparkline` built |
| Carousel           | CSS `scroll-behavior: smooth` + `scroll-snap-type: x mandatory`   | ⬜ When `NewsCarousel` built      |
| Stat counters      | `requestAnimationFrame` countup on visibility                     | ⬜ Optional polish                |
| Breaking banner    | `slide-in-from-top` (already available via `tailwindcss-animate`) | ⬜ When `BreakingBanner` built    |
| Page enter         | `fadeInUp` on `<main>` content — one global CSS rule              | ⬜ Low priority                   |

---

### VII. Next Implementation Steps

**Phase A — Shared components (do first, unblocks all pages)**

1. Build `VoteRiver` — replaces every bare vote-bar `<div>` in Bills, BillDetail, Budget, Elections, ConfidenceVotes, Motions
2. Build `EventRow` — replaces ad-hoc list items in NewsFeed, SimulationLog
3. Build `StoryCard` (standard + compact) — used by Media, Dashboard, News
4. Build `SeatBar` — used by Parties top + Dashboard coalition section
5. Build `EconomyPanel` with sparklines — extract from Dashboard, reuse on Dashboard

**Phase B — High-impact pages**

6. Bills: `BillPipeline` kanban + reading stage progress bar in BillDetail
7. Media: 3-column outlet layout using `StoryCard`
8. News Feed: `EventRow` list + day dividers + ticker strip
9. Dashboard: wire up `BreakingBanner`, `NewsCarousel`, `EconomyPanel`, `SeatBar`

**Phase C — Remaining pages**

10. Elections: chat-log coalition rounds
11. Budget: `StatCard` row + `VoteRiver`
12. Questions: split pending/answered layout
13. Login: centered layout + Bundesadler watermark
14. Admin: preset tile cards

**Phase D — Polish**

15. H1 serif font (DM Serif Display) — optional, low-risk
16. Page enter animation (single `@keyframes fadeInUp` rule)
17. Mobile responsiveness pass on all new components
18. Empty-state and error-state patterns for all pages

---

### Design Decisions (current)

- **Light mode confirmed**: shadcn defaults, token system, and Inter all work well; avoids rework of 20+ pages of color logic
- **Top nav confirmed**: grouped dropdowns handle 24 pages cleanly; sidebar adds layout complexity
- **No chart library**: SVG sparklines + existing Hemicycle cover all needs; avoid 100KB+ bundle cost
- **`section-title` as design anchor**: the uppercase blue bordered label is the single strongest visual consistency signal — extend to all new components
- **`VoteRiver` is highest priority**: bare vote-bar `<div>` clones appear 15+ times across the codebase; a single reusable component eliminates all of them

---

### Verification Checklist

- [ ] `npm run typecheck` — no TypeScript regressions after each phase
- [ ] `npm run dev:web` — visually verify at 1440px, 1024px, 375px after each page
- [ ] All new components accept `className` prop for overrides
- [ ] `VoteRiver` / `SeatBar` are accessible (aria-label on color blocks)
- [ ] `BillPipeline` kanban toggle persists in `localStorage` (user preference)
- [ ] `NewsCarousel` keyboard-navigable (arrow keys, focus management)
- [ ] `BreakingBanner` dismiss persists per-day (don't re-show same alert same day)
