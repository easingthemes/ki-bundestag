# Convention Spot-Checks

## ESM Import Extensions
Engine and API packages must use `.js` extensions on internal imports.
- Correct: `import { runDay } from "./simulation/loop.js"`
- Wrong: `import { runDay } from "./simulation/loop"`
- Wrong: `import { runDay } from "./simulation/loop.ts"`

## File Naming
- All source files: kebab-case (e.g., `model-config.ts`, `ai-json.ts`)
- Exception: `CLAUDE.md`, `SKILL.md`, `Progress.md` (uppercase by convention)

## Package Exports
Both `types` and `engine` must point exports to `./src/index.ts`, never `./dist/`.
If `"default"` points to `dist/`, tsx loads stale compiled code.
