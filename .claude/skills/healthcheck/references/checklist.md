# Health Check — Full Checklist

## Build & Types
- `npm run typecheck` must exit 0
- Zero TypeScript errors across all 4 packages

## Git Status
- No untracked files in packages/ (data/ and node_modules/ are OK)
- No merge conflicts
- Branch should be up to date with remote

## Database
- `data/simulation.db` must exist
- `data/users.db` must exist
- `simulation_meta` table must have exactly 1 row
- `parties` table must have 6 rows

## Dev Servers
- Port 3001 (API) — optional, only flag if user expects it running
- Port 5173 (web) — optional, same

## Conventions
- No `.ts` import extensions in engine/ (must be `.js`)
- No uppercase filenames in packages/ (must be kebab-case)
- No `dist/` references in package.json exports
