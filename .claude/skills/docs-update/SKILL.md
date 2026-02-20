---
name: docs-update
description: Update project documentation after implementing a feature
disable-model-invocation: true
---

Update the relevant documentation to reflect the current implementation state:

1. **`docs/PROGRESS.md`** — mark completed features as Done, update in-progress items
2. **`docs/Current_Architecture.md`** — update schema tables, agent actions, simulation flow steps, API endpoints, web pages, and key constants as needed
3. **`.claude/CLAUDE.md`** — update if simulation flow, key patterns, table list, or web pages changed
4. **`/Users/dragan/.claude/projects/-Users-dragan-PROJECTS-PRIVATE-ki-bundestag/memory/MEMORY.md`** — update project memory with any new stable patterns, key file paths, or architectural decisions

Only update sections that actually changed. Do not add speculative or incomplete information.
