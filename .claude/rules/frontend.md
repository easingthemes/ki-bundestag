---
paths:
  - "packages/web/**"
---

# Frontend Rules (Tailwind v4 + shadcn/ui)

**Tailwind v4**: `@import "tailwindcss"` + `@theme inline` block in `src/styles.css` (not v3 directives like `@tailwind base`).

**shadcn/ui**: 15 components in `src/components/ui/` (card, badge, button, sheet, skeleton, etc.). Config in `components.json`.

**`@` path alias**: `@/components/ui/card` etc. — configured in both `vite.config.ts` and `tsconfig.json`.

**`cn()` utility**: `clsx` + `tailwind-merge` from `src/lib/utils.ts` — used for conditional class merging.

**Party colors**: Always inline `style={{ backgroundColor: party.color }}` — dynamic values can't be Tailwind classes.

**Global headings**: `h1`/`h2`/`h3` styled globally in `styles.css` (foreground color, semibold, tight tracking — no uppercase).

## Shared Modules

- **`src/lib/colors.ts`**: 22 shared semantic color maps. All pages import from here — no per-page color constants. Includes: `STATUS_BADGE`, `VOTE_COLORS`, `VOTE_HEX`, `MOOD_BADGE`, `ALERT_STYLES`, `SEMANTIC_HEX`, `MDB_BADGE`, `DISCIPLINE_BADGE`, etc.
- **`src/components/shared.tsx`**: App-level wrappers (Button with variant mapping, SkeletonCard, SkeletonTitle, ShowMoreButton)
- **`src/components/VoteBar.tsx`**: Shared vote bar component (`yes/no/abstain/total/height/showCounts` props)
- **`src/components/FilterPills.tsx`**: Generic `FilterPills<T>` component (`options/value/onChange` props)
- **`src/hooks/useApiData.ts`**: Generic `useApiData<T>(fetcher, options)` hook returning `{ data, loading, refresh }`
- **`src/components/MdbBadge.tsx`**: `MdbBadge` + `DisciplineBadge` components for MdB seat UI

## Common Patterns

- Cards: `<Card><CardContent className="p-5">...</CardContent></Card>`
- Badges: `<Badge variant="outline" className={STATUS_BADGE[status]}>`
- Filter pills: Use `<FilterPills>` component (not inline cn() pill buttons)
- Vote bars: Use `<VoteBar>` component (not inline flex divs)
- Alert banners: `ALERT_STYLES.info` (blue), `ALERT_STYLES.warning` (amber)
- Inline dynamic colors: `SEMANTIC_HEX.positive`/`.negative`/`.neutral`/`.warning` for `style={{ }}`
