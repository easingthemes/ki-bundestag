# AI Agent Setup — Developer Guide

This document explains how AI coding agents (Claude Code and GitHub Copilot) are configured in this repository, how the pieces connect, and how to use them effectively.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Shared Config Layer](#shared-config-layer)
- [Rules — Path-Scoped Conventions](#rules--path-scoped-conventions)
- [Skills — Reusable Workflows](#skills--reusable-workflows)
- [Agents — Autonomous Subprocesses](#agents--autonomous-subprocesses)
- [Hooks — Event-Driven Automation](#hooks--event-driven-automation)
- [GitHub Copilot in VS Code](#github-copilot-in-vs-code)
- [Claude Code](#claude-code)
- [How Everything Connects](#how-everything-connects)
- [Memory System](#memory-system)
- [MCP Servers](#mcp-servers)
- [Settings & Permissions](#settings--permissions)
- [Common Workflows](#common-workflows)
- [Tips for Developers](#tips-for-developers)

---

## Overview

This repo uses two AI coding agents that share a unified config layer:

| Agent | Interface | How it runs | Strengths |
|-------|-----------|-------------|-----------|
| **Claude Code** | CLI (`claude`), VS Code extension, or background agent | Local terminal, VS Code panel, or background process | Deep codebase reasoning, multi-file refactoring, autonomous multi-step execution, persistent memory |
| **GitHub Copilot** | Built into VS Code (single extension since Dec 2025) | Local (agent mode), background (autonomous), or cloud (coding agent → PRs) | Inline completions, next-edit suggestions, agent mode with self-healing, cloud-based coding agent for async work |

As of February 2026, both agents read the **same config files** from `.claude/`. VS Code natively detects `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, and `.claude/agents/` — no extra setup needed. The `.github/` directory holds Copilot-specific agents and prompt templates.

---

## Directory Structure

```
.claude/                              ← BOTH agents read this tree
├── CLAUDE.md                         # Project-wide instructions
├── CLAUDE.local.md                   # Personal overrides (gitignored)
├── settings.local.json               # Permissions, hooks, MCP (Claude Code only, gitignored)
├── rules/                            # Path-scoped coding rules (auto-loaded)
│   ├── esm.md                        #   → packages/engine/**, packages/api/**, packages/types/**
│   ├── frontend.md                   #   → packages/web/**
│   ├── database.md                   #   → packages/engine/src/db/**
│   └── simulation.md                 #   → packages/engine/src/simulation/**, packages/engine/src/agent/**
├── skills/                           # Reusable agent workflows (open standard)
│   ├── plan-start/SKILL.md
│   ├── plan-do/SKILL.md
│   ├── plan-exe/SKILL.md
│   ├── plan-fix/SKILL.md
│   ├── plan-commit/SKILL.md
│   ├── plan-done/SKILL.md
│   ├── plan-run-all/SKILL.md
│   ├── review/SKILL.md
│   ├── review-fix/SKILL.md
│   └── docs/SKILL.md                 #   → Look up docs via Context7 MCP
├── commands/                         # Simple slash commands (Claude Code only)
│   ├── fix-types.md                  #   → /fix-types — run typecheck, fix errors
│   ├── explain.md                    #   → /explain — explain a file/code
│   ├── status.md                     #   → /status — git + progress + servers
│   └── sim-status.md                 #   → /sim-status — simulation state from DB
├── agents/                           # Subagent definitions
│   └── plan-group-executor.md
└── hooks/                            # Event-triggered shell scripts (Claude Code only)
    ├── session-start.sh              #   → SessionStart: load branch, progress, changes
    ├── pre-plan-remind.sh            #   → PreToolUse(EnterPlanMode): check architecture docs
    ├── post-write-validate.sh        #   → PostToolUse(Write|Edit): check conventions
    ├── post-impl-remind.sh           #   → SubagentStop: remind to update docs
    ├── stop-validate.sh              #   → Stop: verify typecheck, no scope creep
    └── notification.sh               #   → Notification: macOS desktop alert

~/.claude/commands/                   ← User-global commands (all projects)
├── git-summary.md                    #   → /git-summary — branch, commits, changes
└── deps.md                           #   → /deps — check outdated dependencies

.github/                              ← Copilot-specific
├── agents/                           # Copilot agents (VS Code only)
│   ├── Plan.agent.md                 #   → Planning agent with subagent + handoffs
│   ├── PlanExecutor.agent.md         #   → Executes a plan doc end-to-end (mirrors plan-group-executor)
│   ├── Review.agent.md               #   → Read-only code review agent
│   └── Debug.agent.md                #   → Read-only systematic debugging agent
├── toolsets/                         # Grouped tool presets for agents
│   └── reader.toolset.jsonc          #   → reader (read-only) + builder (full) tool sets
├── prompts/                          # Reusable prompt templates (both agents)
│   └── plan-fullVisualRedesign.prompt.md
└── lsp.json                          # Language server config

.vscode/
├── settings.json                     # Copilot instruction settings (code gen, test gen, commits, PRs)
└── mcp.json                          # MCP servers for VS Code (chrome-devtools, context7)
```

---

## Shared Config Layer

Both Claude Code and GitHub Copilot read the same files. This means you maintain **one set of instructions** that guides both agents.

### What each agent reads

| File / Directory | Claude Code | GitHub Copilot (VS Code) |
|-----------------|-------------|--------------------------|
| `.claude/CLAUDE.md` | Loaded at conversation start | Read as custom instructions |
| `.claude/CLAUDE.local.md` | Personal overrides (gitignored) | Not used |
| `.claude/rules/*.md` | Auto-loaded by `paths:` scope | Auto-loaded by `paths:` scope |
| `.claude/skills/*/SKILL.md` | Invoked via `/name` commands | Loaded on-demand when relevant |
| `.claude/commands/*.md` | Invoked via `/name` commands | Not used |
| `.claude/agents/*.md` | Spawned as subprocesses (Task tool) | Detected as custom agents in chat |
| `.github/agents/*.agent.md` | Not used | Selectable chat agents with handoffs |
| `.github/toolsets/*.jsonc` | Not used | Grouped tool presets for agents |
| `.github/prompts/*.prompt.md` | Can be read as input files | Referenced via `@workspace` |
| `.claude/settings.local.json` | Permissions, hooks, MCP config | Not used |
| `.vscode/settings.json` | Not used | Copilot instruction settings |

### Scope hierarchy for instruction files

```
~/.claude/CLAUDE.md           # User-global (personal preferences)
~/.claude/rules/*.md          # User-global rules
.claude/CLAUDE.md             # Project-level (checked into git)
.claude/CLAUDE.local.md       # Project-level, gitignored (local overrides)
.claude/rules/*.md            # Project-level, path-scoped rules
packages/web/CLAUDE.md        # Directory-level (loaded when working in that dir)
```

---

## Rules — Path-Scoped Conventions

**Directory**: `.claude/rules/`

Rules are markdown files with a `paths:` header that tells agents when to load them. They are **automatically injected** when the agent reads or edits files matching those paths — no manual invocation needed. Both Claude Code and VS Code Copilot support the `paths:` property for scoped loading.

### Example: `esm.md`

```markdown
---
paths:
  - "packages/engine/**"
  - "packages/api/**"
  - "packages/types/**"
---

# ESM Module Rules

Internal imports within engine MUST use `.js` extensions (Node16 ESM requirement):

// Correct
import { runDay } from "./simulation/loop.js";

// Wrong — will fail at runtime
import { runDay } from "./simulation/loop";
```

### Current rules

| File | Scope | What it covers |
|------|-------|----------------|
| `esm.md` | engine, api, types | `.js` extensions, export patterns, naming conventions |
| `frontend.md` | web | Tailwind v4, shadcn/ui, shared components, color maps |
| `database.md` | engine/src/db | Dual-DB architecture, Drizzle query patterns, seed vs migrate |
| `simulation.md` | engine/src/simulation, engine/src/agent | AI call patterns, `runDay()` flow, action validation |

### When to update rules

Update `.claude/rules/` when:
- You add a new shared component or utility (add it to `frontend.md`)
- You change DB schema or add tables (update `database.md`)
- You add a new simulation module or agent action (update `simulation.md`)
- You change import/export conventions (update `esm.md`)

**Do not** put domain-specific details in `CLAUDE.md` — that's for project-wide concerns only.

---

## Skills — Reusable Workflows

**Directory**: `.claude/skills/<name>/SKILL.md`

Skills are reusable agent workflows defined in a folder structure with a `SKILL.md` file. They follow an [open standard](https://agentskills.io) that works across multiple agents — Claude Code invokes them as `/name` slash commands, and VS Code Copilot loads them on-demand when requests match the skill's description.

### Skill directory structure

Simple skills need only `SKILL.md`. Complex skills can include companion files:

```
skill-name/
├── SKILL.md              # Required — frontmatter + instructions
├── references/           # Markdown docs loaded into context on demand
│   ├── checklist.md
│   └── conventions.md
├── examples/             # Working code the agent can study or run
│   └── violations.sh
├── scripts/              # Executable helpers the agent runs via Bash
│   ├── git-check.sh
│   └── db-check.sh
└── assets/               # Templates and static files used in output
    └── report-template.md
```

The SKILL.md instructions reference these files by relative path (e.g., `scripts/git-check.sh`). See `healthcheck/` for a complete example using all four directories.

### Skill anatomy

```markdown
---
name: plan-start
description: Create a structured Progress.md from scratch or a plan document
argument-hint: [from <file-path>]
disable-model-invocation: true
---

You are an AI agent that creates a structured Progress.md...

## Instructions
### 1. Determine the Mode
...
```

**Header fields**:

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Skill identifier (Claude Code: `/name` command) | `plan-start` |
| `description` | Shown in listings; Copilot uses this for matching | `Create a structured Progress.md...` |
| `argument-hint` | Hints at accepted arguments | `[from <file-path>]` |
| `disable-model-invocation` | `true` = only runs when explicitly invoked. `false` = agent can invoke autonomously | `true` or `false` |

### Available skills

**Planning lifecycle** (use in order):

```
/plan-start              → Create Progress.md (simple init)
/plan-start from <file>  → Create Progress.md from a plan document
/plan-do                 → Research codebase, detail each step in Progress.md
/plan-exe                → Implement the next step
/plan-exe all            → Implement all remaining steps automatically
/plan-fix                → Diagnose and fix a blocked step
/plan-commit             → Git commit the current step's changes
/plan-commit feat        → Commit with "feat(...)" prefix instead of "refactor(...)"
/plan-done               → Wrap up: collapse steps, update docs, clean up
```

**Review lifecycle**:

```
/review                  → Review current changes against the plan
/review-fix              → Auto-fix issues found by /review
```

**Orchestration**:

```
/plan-run-all            → Execute all docs/plans/*.md files sequentially
/plan-run-all 03         → Start from group 03 (skip 01-02)
/plan-run-all docs/plans/02-web-shared.md  → Execute a single plan file
```

### Example: Full planning workflow

```
You: /plan-start
  → Agent asks what you want to build
  → Creates Progress.md with 5 pending steps

You: /plan-do
  → Agent reads codebase, finds patterns, writes detailed plan per step
  → Progress.md steps change from "pending" to "planned"

You: /plan-exe all
  → Agent implements step 1, runs typecheck, marks done
  → Automatically proceeds to step 2, 3, 4, 5
  → Each step: implement → validate → mark done

You: /review
  → Agent reviews uncommitted changes against the plan
  → "Ready to commit" or lists issues

You: /plan-commit feat
  → Creates: feat(web): add budget page with ministry allocation bars

You: /plan-done
  → Collapses Progress.md, updates architecture docs, cleans up
```

### Example: From an existing plan document

```
You: /plan-start from docs/plans/02-web-shared.md
  → Agent reads the plan doc
  → Creates Progress.md with steps extracted from the doc
  → Each step has a Ref: pointing back to the source

You: /plan-exe all
  → Implements everything
```

---

## Agents — Autonomous Subprocesses

**Directory**: `.claude/agents/<name>.md`

Agents are autonomous subprocesses spawned via the Task tool. Unlike skills (which run in the main conversation), agents run in isolated contexts with their own tool permissions and model selection.

VS Code detects `.claude/agents/*.md` files and makes them available as custom agents in Copilot Chat as well.

### Example: `plan-group-executor.md`

```markdown
---
name: plan-group-executor
description: Executes a single plan document end-to-end
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
memory: project
permissionMode: acceptEdits
skills:
  - plan-start
  - plan-exe
  - review
  - review-fix
  - plan-commit
---

You are a focused refactoring agent...
```

**Header fields**:

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Agent identifier | `plan-group-executor` |
| `tools` | Which tools the agent can use | `Read, Write, Edit, Bash, Glob, Grep` |
| `model` | Which model to use | `sonnet` (cheaper/faster) or `opus` (smartest) |
| `memory` | `project` persists learnings across sessions | `project` |
| `permissionMode` | How tool permissions are handled | `acceptEdits` (auto-approve file edits) |
| `skills` | Which skills the agent can invoke | List of skill names |

### How agents are invoked

**Claude Code** — agents are spawned by skills or by the model itself:

```
User: /plan-run-all
  → plan-run-all skill reads docs/plans/*.md files
  → For each file, spawns plan-group-executor agent via Task tool
  → Agent runs in isolation: reads plan → creates Progress.md → implements → reviews → commits
  → Returns compact summary to main conversation
  → Main conversation proceeds to next file
```

**Copilot** — agents are selected in chat via the `@` mention or agent picker:

```
User: @PlanExecutor docs/plans/01-api-refactor.md
  → Agent reads the plan document
  → Implements each step, runs typecheck, commits per step
  → Reports summary when done
  → User can click "Review Changes" or "Commit All" handoff buttons
```

### Agent vs skill: when to use which

| Feature | Skill | Agent |
|---------|-------|-------|
| Runs in | Main conversation | Isolated subprocess |
| Context | Shares conversation context | Fresh context per invocation |
| Invoked by | User (`/name`) or model | Model only (via Task tool) |
| Memory | Conversation only | Can persist across sessions (`memory: project`) |
| Best for | Interactive workflows | Autonomous multi-step tasks |

---

## Hooks — Event-Driven Automation

**Directory**: `.claude/hooks/`
**Config**: `.claude/settings.local.json` → `hooks` section

Hooks are shell scripts that fire on specific Claude Code events. They inject reminders, enforce checks, or run validation automatically. Hooks are Claude Code-specific — Copilot does not use them.

### Hook events

| Event | When it fires | Use case |
|-------|--------------|----------|
| `SessionStart` | When a conversation begins | Load project context (branch, progress, changes) |
| `PreToolUse` | Before a tool is called | Remind agent to check docs before planning |
| `PostToolUse` | After a tool completes | Validate output, remind about conventions |
| `SubagentStop` | After a subagent finishes | Remind to update docs after implementation |
| `Stop` | Before the agent finishes | Verify typecheck, no scope creep |
| `Notification` | On notifications | Custom alerting (macOS desktop notification) |

### Hook JSON schemas

Different events use different JSON output formats:

```bash
# PreToolUse / PostToolUse / SessionStart — use hookSpecificOutput:
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "REMINDER: check .claude/rules/ before editing"
  }
}

# Stop — uses top-level decision/reason:
{
  "decision": "approve",
  "reason": "Reminder to verify typecheck passes before finishing."
}

# Notification — minimal (side-effect only):
{}
```

### Current hooks

| Hook | Event | Matcher | Purpose |
|------|-------|---------|---------|
| `session-start.sh` | `SessionStart` | (all) | Loads branch name, Progress.md status, uncommitted file count |
| `pre-plan-remind.sh` | `PreToolUse` | `EnterPlanMode` | Reminds agent to read architecture docs and rules before making a plan |
| `post-write-validate.sh` | `PostToolUse` | `Write\|Edit` | Reminds about ESM `.js` extensions, kebab-case filenames, correct imports |
| `post-impl-remind.sh` | `SubagentStop` | (all) | Reminds agent to update `.claude/rules/`, `CLAUDE.md`, or `docs/Current_Architecture.md` if relevant |
| `stop-validate.sh` | `Stop` | (all) | Reminds to verify typecheck passes, no unintended files, no scope creep |
| `notification.sh` | `Notification` | (all) | Sends macOS desktop notification when agent needs attention |

---

## GitHub Copilot in VS Code

As of February 2026, GitHub Copilot is **built into VS Code** as a single extension (the old separate Copilot and Copilot Chat extensions were merged in December 2025). It operates in three modes:

### Agent mode (local, interactive)

Agent mode is an autonomous peer programmer that runs locally in VS Code. It analyzes your codebase, proposes multi-file edits, runs terminal commands, monitors build/test output, and auto-corrects in a loop until the task is complete.

```
# In Copilot Chat, switch to Agent mode, then:
"Refactor the bills page to use the VoteBar shared component"
  → Copilot reads relevant files
  → Proposes edits across multiple files
  → Runs npm run typecheck
  → Fixes any errors automatically
  → Repeats until clean
```

Agent mode reads `.claude/CLAUDE.md` for project context and `.claude/rules/` for path-scoped conventions, and can invoke skills from `.claude/skills/`.

### Background agents (local, autonomous)

Background agents run on your machine via CLI for unattended tasks with workspace isolation. You can kick off a task and continue working while the agent runs independently.

### Coding agent (cloud, async)

The Copilot coding agent runs on GitHub's cloud infrastructure. Assign a GitHub issue to `@copilot` and it autonomously explores your codebase, implements changes, runs tests, and creates a pull request for review.

```
# On a GitHub issue:
Assign to @copilot
  → Agent analyzes the issue and repository
  → Works in GitHub's cloud environment
  → Creates a PR with the implementation
  → Responds to PR review comments
```

### Multi-agent sessions

VS Code 1.109+ (January 2026) supports running multiple agents simultaneously. The **Agent Sessions** view provides a unified dashboard where you can run Claude and Copilot agents side by side — fire off a cloud coding agent for a well-defined refactor while working interactively in a local agent session.

### Copilot-specific files in this repo

**`.github/agents/`** — Copilot agents (selectable in chat via `@` or agent picker):

| Agent | Purpose | Handoffs |
|-------|---------|----------|
| `Plan.agent.md` | Research + design plans (read-only, uses subagent) | "Start Implementation", "Open in Editor" |
| `PlanExecutor.agent.md` | Execute plan docs end-to-end (mirrors Claude `plan-group-executor`) | "Review Changes", "Commit All" |
| `Review.agent.md` | Analyze code changes (read-only) | — |
| `Debug.agent.md` | Systematic error diagnosis (read-only) | — |

**`.github/toolsets/reader.toolset.jsonc`** — Grouped tool presets:

| Tool set | Tools | Use for |
|----------|-------|---------|
| `reader` | search/codebase, changes, read/problems, search/usages, web/fetch... | Read-only analysis |
| `builder` | All reader tools + edit/editFiles, terminal execution | Implementation |

**`.vscode/settings.json`** — Copilot instruction settings:

| Setting | What it provides |
|---------|-----------------|
| `codeGeneration.instructions` | Points to `.claude/CLAUDE.md` (shared, no duplication) |
| `testGeneration.instructions` | Vitest conventions |
| `commitMessageGeneration.instructions` | Conventional commits style |
| `pullRequestDescriptionGeneration.instructions` | Summary + changes + test plan format |
| `chat.mcp.discovery.enabled` | Auto-discovers MCP servers from Claude config |

**`.github/prompts/`** — Reusable prompt templates. Reference them in either agent:
```
# In Copilot Chat:
@workspace Use the plan in .github/prompts/plan-fullVisualRedesign.prompt.md

# In Claude Code:
/plan-start from .github/prompts/plan-fullVisualRedesign.prompt.md
```

---

## Claude Code

Claude Code is Anthropic's CLI and VS Code extension for AI-assisted development. It provides deep codebase reasoning, persistent memory, and autonomous multi-step execution.

### How to run

```bash
# CLI
claude                          # Interactive session
claude "fix the typecheck errors"  # One-shot task

# VS Code
# Open the Claude Code panel (extension must be installed)
```

### Key capabilities

- **Skills**: Reusable workflows invoked via `/plan-start`, `/review`, `/docs`, etc.
- **Commands**: Simple prompt-based slash commands (`/fix-types`, `/status`, `/explain`)
- **Task tool**: Spawn subagent processes for isolated autonomous work
- **Hooks**: Event-driven shell scripts (6 hooks across all lifecycle events)
- **Memory**: Persistent project memory across conversations
- **MCP**: External tool integrations (Chrome DevTools, Context7)
- **Permissions**: Fine-grained tool allow-lists in `settings.local.json`

### Claude Code reads

| Source | What it provides |
|--------|-----------------|
| `.claude/CLAUDE.md` | Project instructions (always loaded) |
| `.claude/CLAUDE.local.md` | Personal overrides, gitignored |
| `.claude/rules/*.md` | Path-scoped conventions (auto-loaded per `paths:`) |
| `.claude/skills/*/SKILL.md` | Workflow-based slash commands |
| `.claude/commands/*.md` | Simple prompt-based slash commands |
| `.claude/agents/*.md` | Subagent definitions for Task tool |
| `.claude/settings.local.json` | Permissions, hooks, MCP servers |
| `~/.claude/commands/*.md` | User-global commands (all projects) |
| `~/.claude/projects/*/memory/` | Persistent learnings across sessions |

---

## How Everything Connects

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Developer                                 │
│                                                                     │
│   Claude Code (CLI/ext)       VS Code Copilot                      │
│   ┌──────────────────┐        ┌─────────────────────────┐          │
│   │ /plan-start      │        │ Agent mode (local)      │          │
│   │ /plan-exe all    │        │ Background agent        │          │
│   │ /review /status  │        │ Coding agent (cloud→PR) │          │
│   │ Task → subagent  │        │ @Plan @PlanExecutor     │          │
│   └────────┬─────────┘        └───────────┬─────────────┘          │
└────────────┼──────────────────────────────┼────────────────────────┘
             │                              │
             ▼                              ▼
      ┌─────────────────────────────────────────────┐
      │         .claude/CLAUDE.md                   │  ← Both agents read
      │         .claude/rules/*.md                  │  ← Path-scoped rules
      │         .claude/skills/*/SKILL.md           │  ← Shared skills
      │         .claude/agents/*.md                 │  ← Shared agent defs
      └───────────────────┬─────────────────────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
      ┌────────────┐ ┌─────────┐ ┌──────────────┐
      │   Skills   │ │  Hooks  │ │    Agents    │
      │ /plan-*    │ │ start   │ │ executor     │
      │ /review-*  │ │ pre/pos │ │ (subprocess) │
      │ /docs /fix │ │ stop    │ │              │
      └─────┬──────┘ └────┬────┘ └──────┬───────┘
            │              │             │
            │        Inject context      │
            │              │             │
            └──────────────┼─────────────┘
                           ▼
                 ┌───────────────────┐
                 │   Progress.md     │  ← Shared state between skills
                 │   (plan tracker)  │
                 └───────────────────┘
```

### Comparison: same task, different agents

**Claude Code** — interactive, skill-driven:
```
/plan-start from docs/plans/02-web-shared.md
/plan-exe all
/plan-commit refactor
/plan-done
```

**Copilot Agent Mode** — autonomous, conversational:
```
"Implement the plan in docs/plans/02-web-shared.md. Follow the
 conventions in .claude/rules/frontend.md. Run npm run typecheck
 after each step."
```

**Copilot Coding Agent** — cloud, async:
```
# Create a GitHub issue:
"Implement the shared component extraction from docs/plans/02-web-shared.md"
# Assign to @copilot → PR created automatically
```

### Agent config: Claude Code vs Copilot

| Feature | Claude Code (`.claude/agents/*.md`) | Copilot (`.prompt.md` / `.agent.md`) |
|---------|-------------------------------------|--------------------------------------|
| **Format** | Markdown + YAML frontmatter | Markdown + YAML frontmatter |
| **Model selection** | Per-agent (`model: sonnet/opus/haiku`) | Account-level only |
| **Tool scoping** | Per-agent allowlist (`tools: Read, Write...`) | Per-file (`tools: ['search/codebase', 'web/fetch']`) |
| **Permissions** | Per-agent (`permissionMode: acceptEdits`) | Global setting only |
| **Skill composition** | `skills:` array — agent chains workflows | No skill chaining |
| **Persistent memory** | `memory: project` — learns across runs | None |
| **Execution model** | Autonomous subprocess (background, returns summary) | Interactive chat (user watches each step) |
| **Isolation** | Git worktree support | None |
| **Parallelism** | Multiple agents concurrently via Task tool | Single-threaded chat |

**Bottom line**: Claude Code agents are autonomous pipeline stages (composable, parallel, persistent). Copilot agents are enhanced chat presets (interactive, template-driven, stateless).

### Data flow: planning session (Claude Code)

1. User types `/plan-start` in Claude Code
2. **Skill** `plan-start/SKILL.md` is loaded and executed
3. Skill asks what to build, creates `Progress.md`
4. User types `/plan-exe all`
5. **Skill** `plan-exe/SKILL.md` is loaded
6. For each step, the skill implements code, runs `npm run typecheck`
7. **Hook** `pre-plan-remind.sh` fires if the agent enters plan mode (reminding it to check architecture docs)
8. After completion, **hook** `post-impl-remind.sh` fires (reminding to update docs)
9. User types `/plan-commit` to commit the changes

### Data flow: automated execution (Claude Code)

1. User types `/plan-run-all`
2. **Skill** discovers `docs/plans/*.md` files
3. For each file, skill spawns **agent** `plan-group-executor` via Task tool
4. Agent runs in isolation with its own context:
   - Uses **skill** `plan-start` to create Progress.md
   - Uses **skill** `plan-exe` to implement each step
   - Uses **skill** `review` + `review-fix` to validate
   - Uses **skill** `plan-commit` to commit
5. Agent returns compact summary to main conversation
6. Skill proceeds to next plan file

---

## Memory System

Claude Code has a persistent memory system that survives across conversations:

**Location**: `~/.claude/projects/<project-hash>/memory/`

- `MEMORY.md` is always loaded into context (keep it under 200 lines)
- Additional topic files (e.g., `debugging.md`, `patterns.md`) for detailed notes
- The `plan-group-executor` agent uses `memory: project` to learn across runs

**What goes into memory**:
- Stable patterns confirmed across multiple sessions
- Key architectural decisions and file paths
- User preferences for workflow and tools
- Solutions to recurring problems

**What doesn't go into memory**:
- Session-specific context (current task, in-progress work)
- Speculative conclusions from reading a single file
- Anything that duplicates CLAUDE.md instructions

---

## MCP Servers

MCP (Model Context Protocol) servers extend agents with external tool capabilities. Both Claude Code and VS Code Copilot support MCP — VS Code can discover and install MCP servers from the GitHub MCP Registry.

**Claude Code config**: `.claude/settings.local.json`

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["chrome-devtools"]
}
```

**Current MCP servers**:
- **chrome-devtools** — Control Chrome browser: take screenshots, click elements, fill forms, evaluate JavaScript, run performance traces. Used for visual testing and debugging.

**Usage in CLAUDE.md**:
```
When using chrome-devtools MCP to take screenshots, always save to docs/screenshots/<name>.png
```

---

## Settings & Permissions

**File**: `.claude/settings.local.json` (Claude Code only)

### Permission allow-list

Pre-approved tool calls so the agent doesn't prompt for every command:

```json
{
  "permissions": {
    "allow": [
      "Bash(git log:*)",          // Git read commands
      "Bash(npm:*)",              // Package management
      "Bash(npx:*)",              // One-off executables
      "mcp__ide__getDiagnostics", // VS Code diagnostics
      "WebSearch",                // Web searches
      "WebFetch(domain:docs.anthropic.com)",  // Specific domains
      ...
    ]
  }
}
```

**Pattern**: `"Bash(<command>:*)"` allows a command with any arguments. `"WebFetch(domain:<host>)"` allows fetching from a specific domain.

### Schema validation

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json"
}
```

Adding the `$schema` field enables autocomplete and validation in VS Code for `settings.local.json`.

---

## Common Workflows

### Start a new feature from scratch

```
/plan-start
> "Add a notifications page with read/unread filtering"
→ Creates Progress.md with 4-5 steps

/plan-do
→ Researches codebase, finds patterns, details each step

/plan-exe all
→ Implements all steps with validation

/plan-done
→ Wraps up, updates docs
```

### Execute an existing plan document

```
/plan-start from docs/plans/03-engine-loop.md
/plan-exe all
/plan-done
```

### Fix a blocked step

```
/plan-exe
→ Step 3 fails typecheck, marked "blocked"

/plan-fix
→ Diagnoses the issue, updates the plan

/plan-exe
→ Continues from the fixed step
```

### Review before committing

```
# After implementing a step:
/review
→ "Ready to commit" or lists issues

# If issues:
/review-fix
→ Auto-fixes, re-runs review

/plan-commit
```

### Run all plan groups end-to-end

```
/plan-run-all              # Auto-detects progress, runs remaining groups
/plan-run-all 03           # Skip groups 01-02, start from 03
/plan-run-all docs/plans/05-engine-db.md  # Run a single group
```

### Delegate to Copilot coding agent

```
# On GitHub, create an issue:
Title: "Extract VoteBar shared component from inline vote bars"
Body: "See docs/plans/02-web-shared.md step 1. Follow .claude/rules/frontend.md conventions."

# Assign to @copilot → auto-creates PR
```

---

## Tips for Developers

### Writing effective CLAUDE.md

- Keep it under 100 lines — it loads into every conversation for both agents
- Focus on: architecture overview, critical warnings, available commands
- Move domain details to `.claude/rules/` with proper path scoping
- Include "don't do X" warnings for known pitfalls (they prevent repeat mistakes)

### Writing effective rules

- Use `paths:` header to scope rules to relevant directories (works in both agents)
- Include code examples (positive and negative) — agents learn from examples
- Keep rules factual, not aspirational — describe what the code *does*, not what it *should* do
- Update rules when you change conventions — stale rules cause more harm than no rules

### Writing effective skills

- One skill = one workflow. Don't combine unrelated workflows.
- Include clear step-by-step instructions — agents follow them literally
- Add `argument-hint` so users know what arguments are accepted
- Set `disable-model-invocation: true` for skills that should only run when explicitly called
- Set `disable-model-invocation: false` for skills that the agent can invoke autonomously
- Skills work across both Claude Code (`/name`) and VS Code Copilot (on-demand loading)

### Writing effective hooks

- Keep hooks lightweight — they run on every matching event
- Use `matcher` to narrow scope (e.g., `"EnterPlanMode"` instead of all `PreToolUse`)
- Different events need different JSON schemas: `PreToolUse`/`PostToolUse` use `hookSpecificOutput`, `Stop` uses top-level `decision`/`reason`
- Hooks inject reminders, not commands — the agent decides what to do with the context
- Test hooks by triggering the event and checking the agent's response
- Hooks are Claude Code-only — Copilot doesn't support them

### Writing effective agents

- Give agents a focused, single responsibility
- **Claude Code**: Use `model: sonnet` for cost-effective work, `model: opus` for complex reasoning; set `memory: project` for persistent learning; list required `skills:` explicitly
- **Copilot**: Use namespaced tool names (`search/codebase`, not `codebase`); add `handoffs:` for multi-step workflows; agents in `.github/agents/` appear in the chat agent picker
- Agents in `.claude/agents/` are visible to both Claude Code and VS Code Copilot
- Keep Claude and Copilot executor agents in sync — they should follow the same workflow (Progress.md → implement → validate → commit per step)

### GitHub Copilot tips

- Put agents in `.github/agents/` — chat modes were renamed to agents in VS Code 2026
- Use `@PlanExecutor` for plan execution — it mirrors the Claude Code `plan-group-executor` workflow
- Use `@Plan` for research and planning, `@Review` for read-only review, `@Debug` for diagnosis
- Tool names use namespaced format: `search/codebase`, `web/fetch`, `read/problems`, `edit/editFiles`, `search/usages`
- Define tool sets in `.github/toolsets/` to group tools for reuse across agents
- Use `.github/prompts/` for reusable task descriptions (both agents can read these)
- Copilot agent mode reads `.claude/CLAUDE.md` and `.claude/rules/` — keep them relevant to both agents
- Configure `codeGeneration.instructions`, `testGeneration.instructions`, etc. in `.vscode/settings.json`
- Use the coding agent for well-defined, background-friendly tasks (it creates PRs, not direct edits)
- The Agent Sessions view lets you run multiple agents (Claude + Copilot) in parallel

### General best practices

- **Commit often**: Use `/plan-commit` after each step, not at the end of a feature
- **Review before committing**: `/review` catches scope creep and missing changes
- **Update docs after features**: `/plan-done` handles this automatically
- **Use `Progress.md` as single source of truth**: All skills read/write this file
- **Don't fight the agent**: If it keeps doing something wrong, update the rules rather than repeating corrections
- **Check memory**: After a long session, the agent may have saved useful patterns to memory — review and prune periodically
- **Choose the right agent for the job**: Claude Code for deep multi-step work, Copilot agent mode for quick autonomous fixes, Copilot coding agent for async background work

---

## References

- [GitHub Copilot in VS Code](https://code.visualstudio.com/docs/copilot/overview)
- [VS Code Multi-Agent Development (Feb 2026)](https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development)
- [Copilot Custom Instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Copilot Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [Copilot Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Copilot Coding Agent](https://code.visualstudio.com/docs/copilot/copilot-coding-agent)
- [Claude Code Documentation](https://code.claude.com/docs/en/vs-code)
- [Agent Skills Open Standard](https://agentskills.io)
