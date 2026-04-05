# TypeScript LSP Plugin for Claude Code

Setup guide for the TypeScript LSP plugin. Evaluated 2026-04-05.

## What It Does

The TypeScript LSP plugin connects Claude Code to the TypeScript Language Server, giving Claude real-time code intelligence:

- **Automatic diagnostics**: type errors, missing imports, syntax issues appear immediately after every edit
- **Code navigation**: jump to definitions, find all references, trace call hierarchies
- **Type information**: hover details, symbol signatures
- **Live updates**: no re-indexing needed, updates on every file change

## Prerequisites

Install the language server binary globally:

```bash
npm install -g typescript-language-server typescript
```

Verify:
```bash
typescript-language-server --version
```

## Installation

In a Claude Code session:

```
/plugin install typescript-lsp@claude-plugins-official
/reload-plugins
```

No further configuration needed. The plugin auto-detects `.ts` and `.tsx` files.

## What Claude Gains

| Capability | Without LSP | With LSP |
|-----------|-------------|----------|
| Type errors | Must run `npm run typecheck` | Immediate after each edit |
| Missing imports | Discovered at build time | Flagged and fixed in same turn |
| Find references | Grep-based (approximate) | Semantic (exact) |
| Go to definition | File search (approximate) | Precise, cross-file |
| Call hierarchy | Not available | Full upstream/downstream tracing |

## Comparison with GitNexus

| Aspect | TypeScript LSP | GitNexus |
|--------|---------------|----------|
| Update model | Live, incremental | Full re-index (~26s) |
| Response time | Milliseconds | Seconds |
| Accuracy | Exact (type-aware) | Approximate (static parse) |
| Scope | TypeScript/JavaScript files | All languages |
| Call chain analysis | Yes (live) | Yes (snapshot) |
| Blast radius | Via find references | Via `impact` command |
| Requires re-run | Never | After every commit |
| Setup | Plugin + binary | `npx gitnexus analyze` |
| Index size | In-memory (managed by server) | 30MB binary file |

**Verdict**: For a TypeScript project like ki-bundestag, the LSP plugin replaces most of what gitnexus offers, with the advantage of being always up-to-date and requiring zero maintenance.

GitNexus retains value for:
- Cross-language projects where LSP coverage is partial
- High-level architecture views (clusters, communities)
- Execution flow tracing (processes) — a concept LSP doesn't have

## Troubleshooting

- **"Executable not found in $PATH"**: Run `npm install -g typescript-language-server typescript`
- **High memory on large projects**: Disable with `/plugin disable typescript-lsp@claude-plugins-official`
- **False positive diagnostics in monorepos**: May report unresolved imports for workspace packages if tsconfig isn't configured — doesn't affect editing
- **Plugin not loading**: Clear cache with `rm -rf ~/.claude/plugins/cache`, restart, reinstall

## References

- [Claude Code Plugin Docs](https://code.claude.com/docs/en/discover-plugins)
- [TypeScript LSP Plugin](https://claude.com/plugins/typescript-lsp)
- [Issue #15235](https://github.com/anthropics/claude-code/issues/15235) — Fixed missing .lsp.json (resolved Feb 2026)
