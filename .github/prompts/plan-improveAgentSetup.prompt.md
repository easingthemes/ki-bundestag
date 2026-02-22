# Plan: Improve Claude Code & GitHub Copilot Agent Setup

**TL;DR**: Your `.claude/` setup is sophisticated — 12 skills, 1 subagent, 2 hooks, detailed CLAUDE.md — well beyond what most projects have. Your `.github/` Copilot setup is more nascent (1 agent, 1 prompt, 1 instruction file). Based on current docs from both platforms, there are significant opportunities to adopt new features (modular rules, persistent subagent memory, path-specific instructions) and eliminate gaps/redundancies. The plan covers 10 improvements grouped into 4 areas (4 originally-planned items eliminated as redundant thanks to cross-compatibility).

> **Key cross-compatibility insight**: GitHub Copilot in VS Code can read from `.claude/` directories. By default both `.github/` and `.claude/` folders are used, with the option to configure additional sources in VS Code settings. This covers:
>
> - **Skills**: `.claude/skills/` and `.github/skills/` equally (per [GitHub docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills))
> - **Rules**: `.claude/rules/` files with `paths:` frontmatter for path-scoping
> - **Hooks**: `.claude/hooks/` + `settings.local.json` hook config — Copilot in VS Code uses these directly
> - **CLAUDE.md**: Read as project context
> - **Agents**: `.claude/agents/` subagent files are Claude Code-specific (Copilot agents use `.github/agents/*.agent.md`)
> - **Settings**: `.claude/settings.local.json` permissions/MCP config — Claude Code-specific
>
> This means `.claude/rules/`, `.claude/skills/`, and `.claude/hooks/` all serve **both platforms** in VS Code — no need to duplicate them into `.github/`. The only platform-specific files are agents (different formats) and Claude settings (permissions/MCP).

---

### Area 1: Claude Code — Adopt New Features

**1. Add `.claude/rules/` for modular, path-specific rules** _(serves both Claude Code AND Copilot)_
Claude Code and GitHub Copilot both read `.claude/rules/*.md` files that are auto-loaded, with optional `paths:` frontmatter for file-glob scoping. Your CLAUDE.md is a 230-line monolith. Split domain-specific rules out:

- `.claude/rules/esm.md` — ESM import patterns, `.js` extension rules (scoped to `packages/engine/**/*.ts`)
- `.claude/rules/frontend.md` — Tailwind v4, shadcn/ui, party colors patterns (scoped to `packages/web/**/*.{ts,tsx}`)
- `.claude/rules/database.md` — Drizzle query patterns, dual-DB rules, migration vs seed (scoped to `packages/engine/src/db/**`)
- `.claude/rules/simulation.md` — Agent actions, `runDay()` flow, AI call patterns (scoped to `packages/engine/src/simulation/**,packages/engine/src/agent/**`)
- Keep CLAUDE.md as a concise overview (~80 lines): project summary, commands, architecture, critical warnings only

> **Cross-platform benefit**: These rules files are read by both Claude Code and Copilot in VS Code. No need to create separate `.github/instructions/*.instructions.md` files — `.claude/rules/` serves both platforms with a single set of files.

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
Your `.claude/CLAUDE.md` (230 lines) and `.github/copilot-instructions.md` (130 lines) cover mostly the same content. Copilot reads `CLAUDE.md` files natively — both from `.claude/CLAUDE.md` and from the repo root. This makes the duplication fully redundant:

- Make `.claude/CLAUDE.md` the single source of truth (Copilot reads it automatically)
- **Delete** `.github/copilot-instructions.md` entirely (or reduce to a 1-line pointer: "See `.claude/CLAUDE.md`")
- Domain-specific rules move to `.claude/rules/` (item #1), which Copilot also reads
- The only Copilot-specific config that stays in `.github/` is the Plan agent (`.github/agents/Plan.agent.md`), since `.claude/agents/` files are Claude Code-specific and NOT read by Copilot

**8. Activate the `post-impl-remind` hook** _(serves both Claude Code AND Copilot in VS Code)_
The hook script exists at `.claude/hooks/post-impl-remind.sh` but is wired to an empty `PostToolUse: []` array — it never runs. Add proper hook config:

```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [{ "type": "command", "command": ".claude/hooks/post-impl-remind.sh" }]
  }
]
```

> **Cross-platform benefit**: Since Copilot in VS Code reads `.claude/hooks/` configuration, this hook will fire for both Claude Code and Copilot sessions.

**9. Skills reference non-existent `plan-commit` name**
The `plan-group-executor` subagent references a skill called `plan-commit`, but the actual skill file is named `commit` (at `.claude/skills/commit/SKILL.md` with `name: plan-commit`). This works because the skill name in frontmatter is `plan-commit`, but the directory name is `commit` — verify Claude Code resolves by `name` not directory. If not, rename the directory to `plan-commit/`.

---

### Area 3: GitHub Copilot — Leverage Cross-Compatibility

**10. ~~Add path-specific `.github/instructions/` files~~ → Already handled by `.claude/rules/` (item #1)**
~~Copilot now supports `NAME.instructions.md` files with `applyTo` frontmatter.~~

**REMOVED**: Since Copilot reads `.claude/rules/` files with `paths:` frontmatter, the path-specific rules created in item #1 automatically serve Copilot too. Creating separate `.github/instructions/` files would be pure duplication. The `.claude/rules/` approach is the single-source solution for both platforms.

**11. ~~Add Copilot skills in `.github/skills/`~~ → Existing `.claude/skills/` already serve Copilot**
~~Since Copilot reads both `.github/skills/` and `.claude/skills/`~~, your existing 12 skills in `.claude/skills/` are already available to Copilot. The frontmatter fields used (`name`, `description`, `disable-model-invocation`) are lightweight — `disable-model-invocation` is Claude-specific but Copilot simply ignores unknown frontmatter fields. No new skills needed in `.github/skills/`.

> **Optional future enhancement**: If you want Copilot-only skills (e.g., skills that use Copilot-specific tools not available in Claude Code), place them in `.github/skills/`. But for this project, the `.claude/skills/` directory is the right single source.

**12. ~~Add Copilot hooks in `.github/hooks/`~~ → `.claude/hooks/` already serves Copilot in VS Code**

**REMOVED**: Copilot in VS Code reads `.claude/hooks/` and the hook config in `settings.local.json` directly. The existing `pre-plan-remind.sh` hook and the `post-impl-remind.sh` hook (once activated per item #8) will work for both platforms. No separate `.github/hooks/hooks.json` needed for VS Code usage.

> **Exception**: If using the Copilot **coding agent** (remote PR automation), it uses `.github/hooks/hooks.json` — a different format. Only create that if you adopt the remote coding agent.

**13. Expand the Plan agent**
Your `.github/agents/Plan.agent.md` is solid. This is one of the few files that must stay in `.github/agents/` since Copilot does NOT read `.claude/agents/` — the subagent format is Claude Code-specific. Consider:

- Adding `metadata` for tracking
- The Plan agent already references `.github/copilot-instructions.md` via the Copilot instructions system — once you delete that file (item #7), verify the Plan agent still gets project context via `CLAUDE.md`

---

### Area 4: Cross-Platform Alignment

**14. ~~Create a shared instructions source~~ → Already achieved via `.claude/` cross-compatibility**

With the discovery that Copilot reads `.claude/CLAUDE.md`, `.claude/rules/`, and `.claude/skills/` natively, the cross-platform alignment is much simpler than originally planned:

| Config Type                | Single Source Location                   | Read by Claude Code | Read by Copilot (VS Code) | Read by Copilot (remote coding agent) |
| -------------------------- | ---------------------------------------- | ------------------- | ------------------------- | ------------------------------------- |
| Project context            | `.claude/CLAUDE.md`                      | ✅                  | ✅                        | ✅                                    |
| Path-scoped rules          | `.claude/rules/*.md`                     | ✅                  | ✅                        | ✅                                    |
| Skills                     | `.claude/skills/*/SKILL.md`              | ✅                  | ✅                        | ✅                                    |
| Hooks                      | `.claude/hooks/` + `settings.local.json` | ✅                  | ✅                        | ❌ (uses `.github/hooks/`)            |
| Subagents                  | `.claude/agents/*.md`                    | ✅                  | ❌                        | ❌                                    |
| Copilot agents             | `.github/agents/*.agent.md`              | ❌                  | ✅                        | ✅                                    |
| Prompts                    | `.github/prompts/*.prompt.md`            | ❌                  | ✅                        | ✅                                    |
| Settings (permissions/MCP) | `.claude/settings.local.json`            | ✅                  | ❌                        | ❌                                    |

**Action**: After implementing items #1 and #7, the only platform-specific files remaining are:

- **Claude Code-only**: `.claude/agents/` (subagent format), `.claude/settings.local.json` (permissions/MCP)
- **Copilot-only**: `.github/agents/Plan.agent.md` (agent format), `.github/prompts/`
- **Shared in VS Code** (zero duplication): `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, `.claude/hooks/`

No additional "shared instructions source" work is needed — the `.claude/` directory IS the shared source.

---

### Priority Order

| #   | Item                                                    | Impact                                         | Effort  |
| --- | ------------------------------------------------------- | ---------------------------------------------- | ------- |
| 1   | Split CLAUDE.md into `.claude/rules/`                   | **High** — path-scoping, serves both platforms | Medium  |
| 7   | Delete `copilot-instructions.md` (use CLAUDE.md)        | **High** — eliminates duplication entirely     | Low     |
| 8   | Activate post-impl-remind hook                          | Medium — docs stay current                     | Low     |
| 5   | Add `$schema` to settings                               | Low — DX improvement                           | Trivial |
| 2   | Persistent memory on plan-group-executor                | Medium — smarter refactoring over time         | Low     |
| 3   | Add code-reviewer subagent                              | Medium — isolates review context               | Low     |
| 6   | Clean up screenshots                                    | Low — prevents accidental context bloat        | Trivial |
| 4   | Upgrade hook format                                     | Low — current format works fine                | Low     |
| 9   | Verify skill name resolution                            | Low — likely already works                     | Trivial |
| 13  | Verify Plan agent after copilot-instructions.md removal | Low — quick check                              | Trivial |

**Removed items** (4 items eliminated due to `.claude/` cross-compatibility):

- ~~#10 (Copilot path-specific instructions)~~ — `.claude/rules/` serves both platforms; no `.github/instructions/` needed
- ~~#11 (Copilot skills)~~ — `.claude/skills/` already read by Copilot; no `.github/skills/` needed
- ~~#12 (Copilot hooks)~~ — `.claude/hooks/` already read by Copilot in VS Code; no `.github/hooks/` needed
- ~~#14 (Shared instructions source)~~ — cross-compatibility via `.claude/` makes this automatic

---

### Verification

- After restructuring CLAUDE.md into modular rules: `claude` session → `/memory` → verify all rules load
- After creating `.claude/rules/`: open a file in `packages/engine/`, start Copilot Chat, ask about import patterns → verify path-specific rules are applied (Copilot reads `.claude/rules/` directly)
- After deleting `copilot-instructions.md`: verify Copilot still gets project context via `.claude/CLAUDE.md`
- After fixing hooks: make an edit to `packages/engine/src/*.ts`, verify the post-impl reminder fires
- Run `npm run typecheck && npm run build` after any structural changes
- Verify existing `.claude/skills/` are usable from Copilot: invoke a skill like `plan-exe` from Copilot Chat

### Decisions

- **Modular rules vs monolith CLAUDE.md**: Split. The 230-line CLAUDE.md has grown past the ideal "concise overview" size
- **`.claude/rules/` vs `.github/instructions/`**: Use `.claude/rules/` only — Copilot reads both, so no duplication needed
- **`.claude/skills/` vs `.github/skills/`**: Use `.claude/skills/` only — Copilot reads both, existing 12 skills are sufficient
- **Shared source of truth**: `.claude/CLAUDE.md` + `.claude/rules/` + `.claude/skills/` serve both platforms; delete `.github/copilot-instructions.md`
- **Persistent subagent memory**: Use `project` scope (shareable via git) rather than `user` scope (personal only)
- **Screenshots cleanup**: Move out of `.claude/` to prevent accidental context pollution
- **Copilot hooks**: `.claude/hooks/` works for Copilot in VS Code; only create `.github/hooks/` if adopting the remote coding agent
