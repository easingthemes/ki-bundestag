# GitNexus Evaluation

Evaluated [GitNexus](https://github.com/abhigyanpatwari/GitNexus) v1.5.3 as a code intelligence tool for this project. Date: 2026-04-05.

## What It Does

GitNexus is a CLI tool that parses your codebase, builds a knowledge graph (nodes + edges + execution flows), and exposes it via an MCP server or CLI commands. It uses Tree-sitter for parsing and LadybugDB for the graph.

## Indexing Results

```
Files:       279
Nodes:       1,985
Edges:       5,110
Communities: 116
Processes:   155
Index time:  ~26 seconds
Index size:  ~30 MB (.gitnexus/lbug binary)
```

### Node Types Discovered

| Type | Count |
|------|-------|
| Function | 806 |
| File | 279 |
| Section | 278 |
| Interface | 220 |
| Process | 155 |
| Route | 113 |
| Community | 66 |
| Folder | 37 |
| Method | 16 |
| Class | 8 |
| Property | 7 |

## CLI Commands Tested

### `gitnexus context "runDay"`

360-degree view of the core simulation function. Correctly identified:

- **Callers**: `main()` in runner.ts and runner-auto.ts
- **Callees**: 29 functions across voting, veto, summaries, speeches, sidejobs, seats, referendums, questions, polls, opinion, negotiations, motions
- **Processes**: 5 execution flows

### `gitnexus impact "runDay" --direction upstream`

Blast radius for upstream dependents:

- Risk: **LOW** (only 2 direct callers)
- 2 direct dependents (d=1): runner.ts:main, runner-auto.ts:main
- 2 modules affected: Simulation, Agent

### `gitnexus impact "runDay" --direction downstream`

Downstream dependency analysis:

- Risk: **CRITICAL**
- 239 impacted symbols
- 51 processes affected
- 7 modules affected
- Top affected areas: bot-question-pool, negotiations, discipline, internal-proposals, questions, party-agent, polls

### `gitnexus context "tallyVotes" --content`

Full source code retrieval with caller/callee mapping. Correctly found:
- Incoming: voting.test.ts (test file)
- Outgoing: session-store.ts:set
- Returned full function body (~95 lines)

### `gitnexus query "coalition negotiation"`

Semantic flow search. **Returned empty results.** Likely requires embeddings (`--embeddings` flag) or a fresh index to work.

### `gitnexus cypher` (raw graph queries)

Direct graph queries work. Example counting all node types:
```
MATCH (n) RETURN DISTINCT labels(n) AS type, count(*) AS count ORDER BY count DESC
```

## What It Generates in Your Repo

| File | Purpose | Project-specific? |
|------|---------|-------------------|
| `.gitnexus/lbug` (30MB) | Binary knowledge graph | Yes (gitignored) |
| `.gitnexus/meta.json` | Index metadata | Yes (gitignored) |
| `CLAUDE.md` (~100 lines) | Prescriptive gitnexus usage rules | No - generic boilerplate |
| `AGENTS.md` (~100 lines) | Same content as CLAUDE.md | No - generic boilerplate |
| `.claude/skills/gitnexus/` (6 folders) | Skill templates | No - generic boilerplate |

## Issues Found

### 1. Generic files committed to repo

The generated CLAUDE.md, AGENTS.md, and skills are identical across every repo. They contain generic examples ("validateUser", "payment processing") with no project-specific content. These add ~100 lines to the system prompt per session.

Related GitHub issues:
- [#656](https://github.com/abhigyanpatwari/GitNexus/issues/656) — Request to skip skill generation
- No issue yet for skipping CLAUDE.md/AGENTS.md generation (use `--skip-agents-md` flag)

### 2. No incremental indexing

Every `npx gitnexus analyze` does a full re-index (~26s for our 279-file repo). There is no differential/incremental mode. The PostToolUse hook that auto-reindexes after every commit would be prohibitive on larger codebases.

### 3. Semantic query not working

`gitnexus query` returned empty results for all tested queries. May require the `--embeddings` flag during analysis (which adds an external API dependency).

### 4. Should be a Claude Code plugin

GitNexus dumps generic files into user repos instead of distributing as a proper [Claude Code plugin](https://code.claude.com/docs/en/plugins). The skills, hooks, and MCP config should be bundled as an installable plugin (`/plugin install gitnexus`), with only the `.gitnexus/` index stored locally.

## Verdict

**Useful for occasional exploration, not as a live development tool.**

Good for:
- Onboarding to an unfamiliar codebase
- Pre-refactor blast radius analysis (`impact` command)
- Understanding call chains (`context` command)
- Raw graph queries (`cypher` command)

Not suitable for:
- Continuous development workflow (stale after every commit)
- Large codebases (full re-index on every change)
- Semantic search (query command doesn't work without embeddings)

### Better alternative for this project

The `typescript-lsp` Claude Code plugin provides live, incremental, type-aware code intelligence without re-indexing. Install via:
```
/plugin install typescript-lsp@claude-plugins-official
```

This gives Claude the same call chain and reference information that gitnexus provides, but updated in real-time with zero maintenance.
