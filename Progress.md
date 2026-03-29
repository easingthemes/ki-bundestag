# Progress

## Goal
Fix React hook dependency warnings in packages/web/src/hooks/useApiData.ts by replacing eslint-disable comments with a proper useRef-based pattern.

Ref: docs/todo/020-react-hook-deps.md (inline task)

---

## Steps

### Step 1: Fix useApiData.ts hook dependency warnings

- **Status**: in-progress
- **Files**: packages/web/src/hooks/useApiData.ts
- **Plan**: Use a fetcherRef pattern so the effect doesn't depend on fetcher identity. Remove both eslint-disable comments. Keep the deps array option for triggering re-fetch on external dependency changes.

---

**Goal**: Replace external service dependencies (ui-avatars.com, picsum.photos) with local CSS-based alternatives.

**Ref**: User instructions in conversation

---

### Step 1: Replace ui-avatars.com in Elections.tsx with InitialAvatar component

- **Status**: done
- **Files**: packages/web/src/pages/Elections.tsx
- **Result**: Removed avatarUrl function, added InitialAvatar component using fixColor + Tailwind classes; typecheck clean

### Step 2: Replace picsum.photos in Media.tsx with CSS gradient backgrounds

- **Status**: done
- **Files**: packages/web/src/pages/Media.tsx
- **Result**: Added hashCode + ArticleBanner components generating deterministic category-colored CSS gradients; typecheck clean
