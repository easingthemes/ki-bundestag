# Plan: Improve Claude Code & GitHub Copilot Agent Setup

**TL;DR**: Your `.claude/` setup is sophisticated — 11 skills, 1 subagent, 2 hooks, detailed CLAUDE.md — well beyond what most projects have. Your `.github/` Copilot setup is more nascent (1 agent, 1 prompt, 1 instruction file). Based on current docs from both platforms, there are significant opportunities to adopt new features (modular rules, persistent subagent memory, path-specific instructions, Copilot skills) and eliminate gaps/redundancies. The plan covers 14 improvements grouped into 4 areas.

---

### Area 1: Claude Code — Adopt New Features

**1. Add `.claude/rules/` for modular, path-specific rules**
Claude Code now supports `.claude/rules/*.md` files that are auto-loaded, with optional `paths:` frontmatter for file-glob scoping. Your CLAUDE.md is a 230-line monolith. Split domain-specific rules out:

- `.claude/rules/esm.md` — ESM import patterns, `.js` extension rules (scoped to `packages/engine/**/*.ts`)
- `.claude/rules/frontend.md` — Tailwind v4, shadcn/ui, party colors patterns (scoped to `packages/web/**/*.{ts,tsx}`)
- `.claude/rules/database.md` — Drizzle query patterns, dual-DB rules, migration vs seed (scoped to `packages/engine/src/db/**`)
- `.claude/rules/simulation.md` — Agent actions, `runDay()` flow, AI call patterns (scoped to `packages/engine/src/simulation/**,packages/engine/src/agent/**`)
- Keep CLAUDE.md as a concise overview (~80 lines): project summary, commands, architecture, critical warnings only

**2. Enable persistent memory on the `plan-group-executor` subagent**
The subagent docs show a powerful `memory: project` field. Your `plan-group-executor` repeatedly needs to discover codebase patterns. Adding `memory: project` lets it accumulate knowledge about your refactoring patterns across sessions. Add to frontmatter:

```yaml
memory: project
```

Also add a memory instruction in the markdown body: "Update your agent memory as you discover codepaths, patterns, and conventions."

**3. Add a `code-reviewer` subagent with persistent memory**
Your `review` skill runs in the main context. A dedicated read-only subagent isolates review output from the main conversation and builds up knowledge:

- `.claude/agents/code-reviewer.md` — `tools: Read, Grep, Glob, Bash`, `model: sonnet`, `memory: project`
- Can chain with existing `review-fix` skill

**4. Upgrade hooks to use the new JSON format**
Your current hooks use the Claude Code format (`settings.local.json` → `hooks.PreToolUse`). The `post-impl-remind.sh` hook is in `PostToolUse: []` (empty — disabled). Either:

- Wire it properly with a matcher for `Edit|Write`
- Or leverage the new `SubagentStop` event to run doc-update reminders after subagent completions

**5. Add `$schema` to settings files**
Add `"$schema": "https://json.schemastore.org/claude-code-settings.json"` to `.claude/settings.local.json` for autocomplete and validation in VS Code.

**6. Clean up screenshots folder**
The `.claude/screenshots/` folder has 16 PNG files and a 3386-line text snapshot. These consume context when agents explore the directory. Either:

- Move to a `docs/screenshots/` folder outside `.claude/`
- Or add them to a `.claudeignore` / permission deny rule to prevent accidental context pollution

---

### Area 2: Claude Code — Fix Gaps & Redundancies

**7. CLAUDE.md vs copilot-instructions.md duplication**
Your `.claude/CLAUDE.md` (230 lines) and `.github/copilot-instructions.md` (130 lines) cover mostly the same content. Since Copilot now reads `CLAUDE.md` files natively (per GitHub docs: "you can use a single CLAUDE.md file stored in the root of the repository"), consider:

- Make `.claude/CLAUDE.md` the single source of truth
- Trim `.github/copilot-instructions.md` to only Copilot-specific deviations (if any)
- Or use `@` import syntax in CLAUDE.md to reference the copilot instructions file

**8. Activate the `post-impl-remind` hook**
The hook script exists at `.claude/hooks/post-impl-remind.sh` but is wired to an empty `PostToolUse: []` array — it never runs. Add proper hook config:

```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [{ "type": "command", "command": ".claude/hooks/post-impl-remind.sh" }]
  }
]
```

**9. Skills reference non-existent `plan-commit` name**
The `plan-group-executor` subagent references a skill called `plan-commit`, but the actual skill file is named `commit` (at `.claude/skills/commit/SKILL.md` with `name: plan-commit`). This works because the skill name in frontmatter is `plan-commit`, but the directory name is `commit` — verify Claude Code resolves by `name` not directory. If not, rename the directory to `plan-commit/`.

---

### Area 3: GitHub Copilot — Expand Setup

**10. Add path-specific `.github/instructions/` files**
Copilot now supports `NAME.instructions.md` files with `applyTo` frontmatter. Create:

- `.github/instructions/engine.instructions.md` — `applyTo: "packages/engine/**/*.ts"` — ESM `.js` imports, Drizzle patterns, agent action validation
- `.github/instructions/web.instructions.md` — `applyTo: "packages/web/**/*.{ts,tsx}"` — Tailwind v4, shadcn/ui, `cn()` utility, shared color maps, party colors as inline styles
- `.github/instructions/api.instructions.md` — `applyTo: "packages/api/**/*.ts"` — Express patterns, response shapes

**11. Add Copilot skills in `.github/skills/`**
Copilot now supports Agent Skills (compatible with `.claude/skills/` too). Since Copilot reads both `.github/skills/` and `.claude/skills/`, your existing Claude skills may already be compatible. However, your skills use Claude-specific frontmatter (`disable-model-invocation`, custom fields). Create lightweight Copilot-native skills:

- `.github/skills/simulate/SKILL.md` — How to run simulations, seed, migrate; troubleshoot common issues
- `.github/skills/db-schema/SKILL.md` — Database schema reference, which tables are in which DB, common queries

**12. Add Copilot hooks in `.github/hooks/`**
Copilot coding agent supports hooks with a `hooks.json` configuration. Port the equivalent of your Claude hooks:

- `preToolUse` to enforce ESM import patterns on edits to engine files
- `postToolUse` to remind about doc updates

**13. Expand the Plan agent**
Your `.github/agents/Plan.agent.md` is solid but lacks some features from the latest spec:

- Consider adding `metadata` for tracking
- The Copilot `custom-agents-configuration` reference shows you can add `mcp-servers` at the organization level — not applicable here but worth noting for future

---

### Area 4: Cross-Platform Alignment

**14. Create a shared instructions source**
Both Claude and Copilot read instructions from multiple locations. To avoid maintaining two parallel instruction sets:

- Keep `.claude/CLAUDE.md` as the canonical project context
- In `.github/copilot-instructions.md`, either duplicate key sections or (once Copilot fully supports CLAUDE.md) trim it to a pointer
- Use `.claude/rules/` for path-specific rules (Claude) and `.github/instructions/` for path-specific rules (Copilot) — these currently can't share a single format
- Document in a README or CONTRIBUTING which file is the source of truth for what

---

### Priority Order

| #   | Item                                            | Impact                                        | Effort  |
| --- | ----------------------------------------------- | --------------------------------------------- | ------- |
| 1   | Split CLAUDE.md into modular `.claude/rules/`   | High — reduces noise, enables path-scoping    | Medium  |
| 7   | Deduplicate CLAUDE.md / copilot-instructions.md | High — single source of truth                 | Low     |
| 8   | Activate post-impl-remind hook                  | Medium — docs stay current                    | Low     |
| 10  | Add Copilot path-specific instructions          | High — better Copilot output for each package | Medium  |
| 5   | Add `$schema` to settings                       | Low — DX improvement                          | Trivial |
| 2   | Persistent memory on plan-group-executor        | Medium — smarter refactoring over time        | Low     |
| 3   | Add code-reviewer subagent                      | Medium — isolates review context              | Low     |
| 6   | Clean up screenshots                            | Low — prevents accidental context bloat       | Trivial |
| 11  | Add Copilot skills                              | Medium — better task-specific guidance        | Medium  |
| 12  | Add Copilot hooks                               | Medium — parity with Claude hooks             | Medium  |
| 4   | Upgrade hook format                             | Low — current format works fine               | Low     |
| 9   | Verify skill name resolution                    | Low — likely already works                    | Trivial |
| 13  | Expand Plan agent                               | Low — already functional                      | Low     |
| 14  | Shared instructions source                      | Medium — long-term maintenance                | Medium  |

---

### Verification

- After restructuring CLAUDE.md into modular rules: `claude` session → `/memory` → verify all rules load
- After adding Copilot instructions: open a file in `packages/engine/`, start Copilot Chat, ask about import patterns → verify path-specific instructions apply
- After fixing hooks: make an edit to `packages/engine/src/*.ts`, verify the post-impl reminder fires
- Run `npm run typecheck && npm run build` after any structural changes

### Decisions

- **Modular rules vs monolith CLAUDE.md**: Split. The 230-line CLAUDE.md has grown past the ideal "concise overview" size
- **Shared source of truth vs platform-specific files**: Maintain both but with CLAUDE.md as primary, Copilot instructions as a subset
- **Persistent subagent memory**: Use `project` scope (shareable via git) rather than `user` scope (personal only)
- **Screenshots cleanup**: Move out of `.claude/` to prevent accidental context pollution
