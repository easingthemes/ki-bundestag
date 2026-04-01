# CCA Exam Preparation — Learnings from KI-Bundestag

This folder documents what was learned building **KI-Bundestag** (an AI-powered German parliament simulation), mapped to the **Claude Certified Architect (CCA) Foundations** exam domains.

## Exam Overview

The CCA Foundations exam is a **60-question proctored exam** across 5 domains, anchored to 6 production scenarios. It tests **systems design judgment** — not API trivia. Over half the exam (47%) focuses on agentic architecture and Claude Code configuration.

| Domain | Weight | Coverage | File |
|---|---|---|---|
| Agentic Architecture & Orchestration | 27% | Excellent | [01-agentic-architecture.md](./01-agentic-architecture.md) |
| Tool Design & MCP Integration | 18% | Partial (gap) | [02-tool-design-mcp.md](./02-tool-design-mcp.md) |
| Claude Code Configuration & Workflows | 20% | Strong | [03-claude-code-config.md](./03-claude-code-config.md) |
| Prompt Engineering & Structured Output | 20% | Excellent | [04-prompt-engineering.md](./04-prompt-engineering.md) |
| Context Management & Reliability | 15% | Excellent | [05-context-reliability.md](./05-context-reliability.md) |

## Additional Cross-Cutting Learnings

| Topic | File |
|---|---|
| Batch Processing & Cost Optimization | [06-batch-processing-costs.md](./06-batch-processing-costs.md) |
| Multi-Provider Architecture | [07-multi-provider.md](./07-multi-provider.md) |
| Study Gap: MCP Deep Dive | [08-study-gap-mcp.md](./08-study-gap-mcp.md) |

## Estimated Exam Readiness

```
Domain 1 (Agentic Architecture)     ████████████████████░  ~95%
Domain 2 (Tool Design & MCP)        ██████████░░░░░░░░░░░  ~50%
Domain 3 (Claude Code Config)       ████████████████░░░░░  ~80%
Domain 4 (Prompt Engineering)       ████████████████████░  ~95%
Domain 5 (Context & Reliability)    ████████████████████░  ~95%
──────────────────────────────────────────────────────────
Overall weighted estimate                               ~83%
```

## Key Exam Insight

> The single most tested concept across the entire exam is **programmatic enforcement vs. prompt-based guidance**. When a system behavior needs to be guaranteed, the exam consistently rewards the programmatic solution over the "add it to the prompt" solution.

This project demonstrates exactly this principle — action validation in `action-parser.ts` programmatically enforces game rules rather than relying on the prompt alone.
