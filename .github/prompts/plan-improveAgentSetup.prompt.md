# Plan: Improve Claude Code & GitHub Copilot Agent Setup

**TL;DR**: Both Claude Code and GitHub Copilot in VS Code share the same `.claude/` setup — 12 skills, 2 hooks, CLAUDE.md, plus a growing agent roster. Copilot additionally has 1 dedicated agent and 1 prompt in `.github/`. The two platforms are more aligned than they appear: most `.claude/` config is already read by Copilot. The plan covers 10 improvements: adopt new features, fix remaining gaps, and eliminate the few remaining duplications.

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

### Area 1: Adopt New Features

**1. Add `.claude/rules/` for modular, path-specific rules** _(serves both platforms)_
Both platforms read `.claude/rules/*.md` files, auto-loaded with optional `paths:` frontmatter for file-glob scoping. CLAUDE.md is a 230-line monolith. Split domain-specific rules out:

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

### Area 2: Fix Gaps & Redundancies

**7. Delete `copilot-instructions.md` — use CLAUDE.md as single source**
`.claude/CLAUDE.md` (230 lines) and `.github/copilot-instructions.md` (130 lines) cover mostly the same content. Both platforms read `CLAUDE.md` natively, making the duplication fully redundant:

- Make `.claude/CLAUDE.md` the single source of truth
- **Delete** `.github/copilot-instructions.md` entirely
- Domain-specific rules move to `.claude/rules/` (item #1)
- The only Copilot-specific config remaining in `.github/` is the Plan agent (`.github/agents/Plan.agent.md`), since agent formats differ between platforms

**8. Activate the `post-impl-remind` hook** _(serves both platforms in VS Code)_
The hook script exists at `.claude/hooks/post-impl-remind.sh` but is wired to an empty `PostToolUse: []` array — it never runs. Add proper hook config:

```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [{ "type": "command", "command": ".claude/hooks/post-impl-remind.sh" }]
  }
]
```

**9. Verify skill name resolution**
The `plan-group-executor` subagent references a skill called `plan-commit`, but the directory is `commit/` (with `name: plan-commit` in frontmatter). Verify Claude Code resolves by `name` not directory. If not, rename the directory to `plan-commit/`.

---

### Area 3: Plan Agent

**10. Verify Plan agent after `copilot-instructions.md` removal**
`.github/agents/Plan.agent.md` must stay in `.github/agents/` since agent formats differ between platforms. After deleting `copilot-instructions.md` (item #7), verify the Plan agent still gets project context via `CLAUDE.md`.

---

### Cross-Platform Compatibility Matrix

| Config Type                | Single Source Location                   | Claude Code | Copilot (VS Code) | Copilot (remote agent) |
| -------------------------- | ---------------------------------------- | ----------- | ----------------- | ---------------------- |
| Project context            | `.claude/CLAUDE.md`                      | ✅          | ✅                | ✅                     |
| Path-scoped rules          | `.claude/rules/*.md`                     | ✅          | ✅                | ✅                     |
| Skills                     | `.claude/skills/*/SKILL.md`              | ✅          | ✅                | ✅                     |
| Hooks                      | `.claude/hooks/` + `settings.local.json` | ✅          | ✅                | ❌ (`.github/hooks/`)  |
| Subagents                  | `.claude/agents/*.md`                    | ✅          | ❌                | ❌                     |
| Copilot agents             | `.github/agents/*.agent.md`              | ❌          | ✅                | ✅                     |
| Prompts                    | `.github/prompts/*.prompt.md`            | ❌          | ✅                | ✅                     |
| Settings (permissions/MCP) | `.claude/settings.local.json`            | ✅          | ❌                | ❌                     |

After implementing items #1 and #7:

- **Claude Code-only**: `.claude/agents/` (subagent format), `.claude/settings.local.json` (permissions/MCP)
- **Copilot-only**: `.github/agents/Plan.agent.md`, `.github/prompts/`
- **Shared** (zero duplication): `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, `.claude/hooks/`

---

### Priority Order

| #   | Item                                             | Impact                                         | Effort  |
| --- | ------------------------------------------------ | ---------------------------------------------- | ------- |
| 1   | Split CLAUDE.md into `.claude/rules/`            | **High** — path-scoping, serves both platforms | Medium  |
| 7   | Delete `copilot-instructions.md` (use CLAUDE.md) | **High** — eliminates duplication entirely     | Low     |
| 8   | Activate post-impl-remind hook                   | Medium — docs stay current, both platforms     | Low     |
| 5   | Add `$schema` to settings                        | Low — DX improvement                           | Trivial |
| 2   | Persistent memory on plan-group-executor         | Medium — smarter refactoring over time         | Low     |
| 3   | Add code-reviewer subagent                       | Medium — isolates review context               | Low     |
| 6   | Clean up screenshots                             | Low — prevents accidental context bloat        | Trivial |
| 4   | Upgrade hook format                              | Low — current format works fine                | Low     |
| 9   | Verify skill name resolution                     | Low — likely already works                     | Trivial |
| 10  | Verify Plan agent after deletion                 | Low — quick check                              | Trivial |

---

### Verification

- After creating `.claude/rules/`: verify rules load in Claude Code (`/memory`); in Copilot, open `packages/engine/` file and ask about imports → confirm path-scoped rules apply
- After deleting `copilot-instructions.md`: verify both platforms still get project context via `CLAUDE.md`
- After activating hooks: edit `packages/engine/src/*.ts`, verify the post-impl reminder fires in both Claude Code and Copilot
- Run `npm run typecheck && npm run build` after any structural changes
- Verify `.claude/skills/` usable from Copilot: invoke a skill like `plan-exe` from Copilot Chat

### Decisions

- **Modular rules vs monolith CLAUDE.md**: Split — 230-line CLAUDE.md is past ideal size
- **`.claude/` as single source**: Rules, skills, hooks all in `.claude/` — no `.github/` duplicates needed
- **`copilot-instructions.md`**: Delete — CLAUDE.md serves both platforms
- **Persistent subagent memory**: `project` scope (shareable via git) rather than `user` scope
- **Screenshots cleanup**: Move out of `.claude/` to prevent context pollution
- **Copilot remote hooks**: Only create `.github/hooks/` if adopting the remote coding agent
