# Plan: Full Visual Redesign — KI Bundestag Web

### TL;DR

This is a full redesign — no constraint to preserve the current visual language. The goal is to transform the app from a utilitarian data dashboard into an **editorial news + civic engagement platform** that feels authoritative, modern, and alive. The new design adopts a **dark-mode-first editorial aesthetic** inspired by modern political/news media sites (Politico, The Atlantic, Der Spiegel), using a refined navy + gold + white palette, a stronger typographic hierarchy with a serif display font, a persistent left-sidebar navigation on desktop, a homepage that feels like a live newspaper front page, and a rich component library that goes beyond cards — carousels, stat counters, reading-list teasers, hemicycle widgets, and timeline rivers.

---

### I. Aesthetic Direction

**Reference sites:**

- [politico.com](https://www.politico.com) — editorial grid, strong typography, dark nav header, categorized content lanes
- [spiegel.de](https://www.spiegel.de) — German editorial standard, teaser cards, color-coded sections, serif headlines
- [bundestag.de](https://www.bundestag.de) — institutional authority, Bundesadler, structured factual layout
- [pudding.cool](https://pudding.cool) — data-driven storytelling, beautiful scrollytelling layouts
- [ft.com](https://www.ft.com) — elegant serif + sans hierarchy, pink/salmon accent, financial data tables
- [ourworldindata.org](https://ourworldindata.org) — clean data viz, readable charts, trust-building design
- [nytimes.com/section/politics](https://www.nytimes.com/section/politics) — front-page newspaper metaphor, story tiers, bylines

**Core aesthetic decisions:**

| Dimension     | Old                        | New                                              |
| ------------- | -------------------------- | ------------------------------------------------ |
| Mode          | Light background (#f5f5f5) | Dark-mode first (can offer toggle)               |
| Primary bg    | `#f5f5f5`                  | `#0d0d14` (near-black blue-black)                |
| Card bg       | `#ffffff`                  | `#161625` + glass micro-shimmer border           |
| Primary       | `#004b91` (flat blue)      | `#3b82f6` (electric blue, more vibrant on dark)  |
| Accent        | `#ffd700` (raw gold)       | `#f4c542` (warm muted gold, more editorial)      |
| Danger        | `#dc3545`                  | `#f87171` (softer red on dark)                   |
| Positive      | `#10b981`                  | `#34d399` (emerald, brighter on dark)            |
| Nav bg        | `#1a1a2e` (dark navy)      | `#07070f` (pure near-black)                      |
| Body font     | Inter (sans)               | Inter (keep)                                     |
| Display font  | Inter (same)               | **DM Serif Display** — serif for H1/H2 headlines |
| Border radius | 4–12 px                    | 8–16 px (softer, more modern)                    |
| Shadows       | none                       | Subtle glow shadows on accent elements           |

---

### II. Navigation Redesign

**Current:** Sticky top bar, hover-grouped dropdowns, mobile sheet.

**New: Dual-rail navigation**

**Desktop (1280px+):**

- Persistent **left sidebar** (220px wide, `bg-[#07070f]`, sticky full-height)
- Top row: Bundesadler SVG logo + "KI Bundestag" wordmark + simulation day badge
- Navigation sections with iconography (Lucide icons, 18px):
  - Simulation → Dashboard, Log, Admin
  - Parlament → Gesetze, Anträge, Anfragen, Vertrauensvoten, Verfassungsgericht, Haushalt
  - Politik → Parteien, Wahlen, Umfragen, Volksabstimmungen
  - Öffentlichkeit → Nachrichten, Presse, Bürgerfragen
  - Ich → Benachrichtigungen, Meine Aktivität, Anmelden
- Bottom of sidebar: sim status pill (Day N, green pulse dot), cost summary link
- Active state: gold left border `#f4c542` + slightly lighter bg row

**Mobile (< 1024px):**

- Top bar collapses sidebar into bottom tab bar (5 primary tabs: Home, Parlament, Parteien, Nachrichten, Ich) + hamburger → full overlay drawer

Reference: [linear.app](https://linear.app) sidebar style, [vercel.com/dashboard](https://vercel.com/dashboard) nav hierarchy

---

### III. New Component Library

All new components go in `packages/web/src/components/`. Each is a standalone TSX file.

#### Layout Primitives

| Component       | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| `PageLayout`    | Wraps all pages — sidebar slot + main slot, handles responsive collapse |
| `PageHeader`    | Serif H1 + subtitle + optional right-side action slot                   |
| `SectionHeader` | `H2` with decorative gold left-border rule + optional "See all" link    |
| `TwoColumnGrid` | 2/3 + 1/3 grid for dashboard-style pages                                |
| `StatCard`      | Large number + label + delta arrow (e.g., "42.3% Zustimmung ↑ 1.2")     |

#### Teaser Components

| Component        | Description                                                                                                             | Reference                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `HeroTeaser`     | Full-width banner: serif headline, mood badge, sim day, CTA button, faint Bundesadler watermark bg                      | [politico.com](https://www.politico.com) above-the-fold banner |
| `StoryCard`      | Image-free editorial card: category chip + serif headline + 2-line excerpt + timestamp; 3 sizes (hero/standard/compact) | [spiegel.de](https://www.spiegel.de) teaser cards              |
| `BreakingBanner` | Full-width amber/red urgent strip: icon + message + dismiss. Used for confidence votes, constitutional crises           | [bbc.co.uk/news](https://www.bbc.co.uk/news) breaking news bar |
| `PartyChip`      | Colored dot + party abbreviation + approval % delta — inline embeddable in any teaser                                   | —                                                              |
| `EventRow`       | Dense 1-line event: colored left border, icon, event text, day badge — for news feed and log                            | —                                                              |

#### Data Visualization Components

| Component       | Description                                                                                                        | Reference                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `ApprovalGauge` | Semi-circle gauge (SVG), 0–100, color-coded zones, animated on mount                                               | [observablehq.com/@d3/gauge](https://observablehq.com/@d3/gauge) |
| `SeatBar`       | Horizontal stacked bar — Bundestag seats by party with color + hover tooltip — replaces current simple bar         | —                                                                |
| `PartySpider`   | Radar/spider chart for party ideology axes (economy/social/environment/etc.)                                       | [ourworldindata.org](https://ourworldindata.org) charts          |
| `EconomyPanel`  | 4 stat cards in a row, each with a sparkline (tiny 30-day trend line using SVG path)                               | [ft.com markets](https://www.ft.com/markets) data panel          |
| `VoteRiver`     | Animated flowing vote bar (yes/no/abstain) with party breakdown on hover                                           | —                                                                |
| `TimelineRiver` | Vertical centered timeline with alternating left/right cards, day markers — for SimulationLog and election history | —                                                                |

#### Interactive / Carousel Components

| Component          | Description                                                                                                               | Reference                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `NewsCarousel`     | Horizontal scroll carousel of `StoryCard`s (snap scrolling, arrow buttons, keyboard nav). Used on Dashboard media section | [spiegel.de](https://www.spiegel.de) front page carousels |
| `PartyCarousel`    | Horizontal 6-party card strip with approval bars, scrollable on mobile                                                    | —                                                         |
| `BillPipeline`     | Horizontal Kanban-style pipeline visualization: 5 columns (Proposed → 3rd Reading → Law), bill cards per stage            | [linear.app](https://linear.app) issue board              |
| `CoalitionBuilder` | Interactive party checkbox grid → seat counter → majority arc — refactor existing into reusable component                 | —                                                         |
| `HemicycleChart`   | SVG hemicycle (already exists), extract into standalone component with animation on data change                           | —                                                         |
| `CountUp`          | Animated number counter for stat reveals on scroll                                                                        | —                                                         |
| `MoodBadge`        | Pill with emoji + label + color per sim mood, used across Dashboard and media                                             | —                                                         |
| `DayBadge`         | "Tag N" pill with clock icon — standardized across all pages                                                              | —                                                         |

#### Form / Engagement Components

| Component          | Description                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AskPartyWidget`   | Full redesign: party selector with color avatars, textarea with char counter, disabled state when not logged in, inline response display |
| `PollCard`         | Prominent poll with bar results showing live %, vote button with auth guard                                                              |
| `ReferendumCard`   | Full-bleed referendum card: question in serif H2, impact preview, Yes/No large buttons                                                   |
| `NotificationItem` | Notification row with unread dot, type icon, collapsible body                                                                            |

---

### IV. Page-by-Page Redesign Plan

#### 1. Dashboard (`/`)

Replace current 2-col card dump with a **newspaper front page**.

- Full-width `HeroTeaser` at top: today's narrative summary in serif, mood badge, sim day, coalition chip strip
- `BreakingBanner` shown when: crisis active / confidence vote pending / budget overdue
- **Section: "Parlament heute"** — `SectionHeader` + 3-col `StoryCard` grid (latest 3 bill events)
- **Section: "Wirtschaft"** — `EconomyPanel` (4 stats + sparklines)
- **Section: "Aus der Presse"** — `NewsCarousel` of today's media articles
- **Section: "Parteien"** — `SeatBar` hemicycle mini + `PartyCarousel` of approval snapshots
- **Section: "Aktuell im Bundestag"** — `BillPipeline` mini (compact, 5 columns, top 2 bills per stage)
- Right rail (1/3): Chancellor card, Active crisis card, Top poll, Ask a Party widget, upcoming calendar
- Remove all skeleton filler — replace with shimmer loading states per section

#### 2. Parties (`/parties`)

- Top: `SeatBar` full-width + coalition/opposition breakdown
- **Party grid**: 3-col cards with gradient header using party color, approval gauge, seat count, recent action summary — replaces flat text cards
- **Vote Alignment Matrix**: interactive heatmap with hover tooltip — keep but style with proper table design
- Add: **Ideology Spider comparison** — select 2 parties → overlay radar chart

#### 3. Bills (`/bills`)

- **Kanban columns** (`BillPipeline`) as primary view (toggle: Kanban / List)
- List view: compact `EventRow` style per bill with status badge, proposer chip, read link
- Bill Detail: add a **reading stage timeline** at top (5 steps, current highlighted), MdB vote section with `VoteRiver`

#### 4. Elections (`/elections`)

- Top: live `HemicycleChart` (full width, animated)
- Coalition negotiation: **chat-log style** — each round as a message thread, party avatars, timestamped
- `CoalitionBuilder` moved to sidebar of Elections page (always visible)
- Add: **Seat history chart** — bar chart showing seat shifts across elections

#### 5. News Feed (`/news`)

- Redesign as a **live ticker** split view: breaking ticker strip at top + `TimelineRiver` below
- Day separators become bold date dividers like a newspaper
- Filter pills become a horizontal scrollable category strip

#### 6. Media (`/media`)

- **Newspaper broadsheet layout**: 3 outlet columns side by side (outlet badge + bias indicator)
- Each article is a `StoryCard` — tallest/most recent gets hero treatment
- Add: outlet bias indicator (left/center/right) as colored badge

#### 7. Budget (`/budget`)

- Top: `StatCard` row — total budget, passed/provisional status, next cycle countdown
- Ministry allocations: **horizontal bar chart** per ministry with change delta vs prior cycle
- Vote section: `VoteRiver` per party

#### 8. Constitutional Court (`/constitutional-court`)

- Each challenge: `StoryCard` variant with court-styled serif heading, status badge, collapsible arguments
- Add: **ruling timeline** showing all decisions chronologically

#### 9. Questions (`/questions`)

- Split into **two feed columns**: Pending (with upvote arrows) | Answered (with AI response excerpt)
- Each answered question: party color left-border, avatar, response collapsed by default

#### 10. Login (`/login`)

- Full-page centered layout with Bundesadler watermark
- Large serif headline: "Willkommen im KI-Bundestag"
- Single input + CTA, subtle particle/flag animation in background

#### 11. Admin (`/admin`)

- **Dark sidebar sub-navigation** for admin sections
- Speed preset selector: visual cards with icons (not just text) showing mode description
- Model config table: styled data table with provider logos

---

### V. Typography Scale

New type system using **two fonts**:

| Role                           | Font             | Weight | Size                      |
| ------------------------------ | ---------------- | ------ | ------------------------- |
| H1 display                     | DM Serif Display | 400    | 2.5–3.5rem                |
| H2 section                     | DM Serif Display | 400    | 1.875rem                  |
| H3 card                        | Inter            | 600    | 1.125rem                  |
| Body                           | Inter            | 400    | 0.9375rem                 |
| Caption/label                  | Inter            | 500    | 0.75rem uppercase tracked |
| Monospace (day counter, stats) | JetBrains Mono   | 400    | varies                    |

Load DM Serif Display + JetBrains Mono via Google Fonts in `packages/web/index.html`. Update `@theme inline` in `packages/web/src/styles.css` with `--font-display` and `--font-mono` tokens.

---

### VI. Animation & Motion

| Pattern            | Implementation                                              |
| ------------------ | ----------------------------------------------------------- |
| Page enter         | `@keyframes fadeInUp` 200ms, opacity 0→1 + translateY 8px→0 |
| Stat counters      | `CountUp` via `requestAnimationFrame`, 600ms ease-out       |
| Vote bars          | CSS `transition: width 600ms ease` on mount                 |
| Approval gauge     | SVG `stroke-dashoffset` animated on mount                   |
| Carousel           | CSS `scroll-behavior: smooth` + snap points                 |
| Skeleton → content | Cross-fade via opacity transition                           |
| Breaking banner    | Slide-down from top, 300ms                                  |

No heavy animation libraries needed — pure CSS + minimal vanilla JS.

---

### VII. Implementation Steps

1. **Install new Google Fonts** — add DM Serif Display + JetBrains Mono to `packages/web/index.html`
2. **Update design tokens** in `packages/web/src/styles.css` — full dark-mode palette + new font variables + expanded radius/shadow tokens
3. **Update `packages/web/src/lib/colors.ts`** — remap all semantic hex values to dark-mode equivalents, add new badge classes
4. **Build `PageLayout` + `PageHeader` + `SectionHeader`** — new layout primitives replacing current `mx-auto max-w-[1280px]` pattern
5. **Redesign `packages/web/src/main.tsx`** — replace top nav with left sidebar + mobile bottom tabs; extract `SimStatus` + `UserMenu` into sidebar footer
6. **Build teaser components** — `HeroTeaser`, `StoryCard`, `BreakingBanner`, `EventRow`
7. **Build data viz components** — `StatCard`, `EconomyPanel` with sparklines, `VoteRiver`, `ApprovalGauge`
8. **Build carousel + interactive** — `NewsCarousel`, `BillPipeline` kanban, `CoalitionBuilder` refactor
9. **Redesign Dashboard** — newspaper layout using new components, section by section
10. **Redesign Parties + PartyDetail** — gradient cards, spider chart, alignment matrix upgrade
11. **Redesign Bills + BillDetail** — kanban view toggle, reading timeline, vote river
12. **Redesign Elections** — chat-log coalition rounds, full-width hemicycle
13. **Redesign remaining pages** — News, Media, Budget, Court, Questions, Login, Admin (in priority order)
14. **Polish pass** — animations, mobile responsiveness, loading states, error states, empty states

---

### Design Decisions

- **Dark-mode-first over light**: the subject matter (politics, news, data) suits a dark editorial aesthetic; gold accent reads better on dark than light
- **Left sidebar over top nav**: 24 pages cannot be organized in a single top bar without crowding; sidebar groups naturally, scales better, and matches modern app conventions
- **DM Serif Display over Playfair Display**: lower contrast in thin strokes, better legibility at large sizes on dark backgrounds
- **CSS + SVG over a chart library** (e.g., recharts): existing codebase has no chart library; lightweight SVG sparklines + gauge are achievable without adding 100KB+ dependencies; complex charts (hemicycle) already exist as custom SVG

---

### Verification Checklist

- [ ] `npm run typecheck` — no TypeScript regressions
- [ ] `npm run dev:web` — visually verify each page in browser at 1440px, 1024px, 375px (iPhone)
- [ ] Dark-mode contrast ratios (WCAG AA minimum 4.5:1) for all text/bg combinations
- [ ] Sidebar collapse → mobile bottom tab bar at 1023px breakpoint
- [ ] Carousel keyboard navigation (arrow keys, tab focus)
- [ ] All `VOTE_COLORS`, `STATUS_BADGE`, `MOOD_BADGE` etc. readable on dark card backgrounds after `colors.ts` update
