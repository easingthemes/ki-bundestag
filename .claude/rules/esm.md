---
paths:
  - "packages/engine/**"
  - "packages/api/**"
  - "packages/types/**"
  - "tsconfig*.json"
---

# ESM Module Rules

All packages use `"type": "module"`. Base tsconfig: `module: Node16`, `moduleResolution: Node16`, target `ES2022`.

Internal imports within engine MUST use `.js` extensions (Node16 ESM requirement):

```typescript
// Correct
import { runDay } from "./simulation/loop.js";
import { getDb } from "../db/connection.js";

// Wrong — will fail at runtime
import { runDay } from "./simulation/loop";
```

Both `types` and `engine` point `"import"` and `"default"` exports to `./src/index.ts` (not `dist/`). This ensures `tsx` always loads source files. If `"default"` ever points to `dist/`, tsx may load stale compiled code — this previously caused a DB path resolution bug.

Naming conventions: kebab-case files (`action-parser.ts`), camelCase functions, PascalCase types/components, SCREAMING_SNAKE_CASE constants.
