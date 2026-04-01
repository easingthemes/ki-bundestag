# MCP Across Projects — Full Experience

MCP experience spans **building** two production MCP servers, **configuring** 6+ third-party servers, and **choosing** structured output over tool_use for the batch-optimized KI-Bundestag simulation.

---

## Three Levels of MCP Experience

### Level 1: MCP Server Builder

**aem-mcp-server** — Full-featured MCP server for Adobe Experience Manager
- 57 tools across 6 categories (content, components, assets, fragments, workflows, replication)
- 4 MCP resource types (`aem://{instance}/components`, `/sites`, `/templates`, `/workflow-models`)
- Dual transport: stdio (npx zero-install) + Streamable HTTP (shared team server)
- Multi-instance support with named parameters
- Tool annotations: `group`, `readOnly`, `complexity` for agent tool selection
- Response verbosity control: summary/standard/full (analogous to KI-Bundestag's context depth)
- Actionable errors with `suggestion` and `alternatives` fields
- Two auth modes: Basic (self-hosted) + OAuth S2S (AEMaaCS)

**moltbook-http-mcp** — HTTP MCP server for a social platform
- HTTP + stdio dual transport with auto-detection
- Multi-tenant auth chain: Bearer → X-Api-Key → Query param → Env var
- Optional JWT enforcement for POST requests
- TLS/HTTPS support
- Clean transport/business logic separation

### Level 2: MCP Consumer/Configurator

**dx-aem-flow** — Claude Code plugin platform with 6 MCP servers
- Per-plugin `.mcp.json` distribution (auto-registers on install)
- Three transport types: stdio, HTTP, Docker
- Plugin-scoped namespacing: `mcp__plugin_<name>_<server>__<tool>`
- Multi-MCP orchestration: AEM + Chrome DevTools chained in workflows
- Environment variable parameterization for secrets

### Level 3: Deliberate Non-Use (Architectural Decision)

**KI-Bundestag** — Chose structured output over MCP/tool_use
- Batch API requires single-response patterns (not tool round-trips)
- 50% cost savings from batch API incompatible with tool_use
- All action types known at compile time — no dynamic discovery needed
- 6 agents per day × fast simulation = can't afford per-tool latency

---

## Patterns That Transfer Across Projects

### Tool Description Quality

From aem-mcp-server: tool descriptions that guide agent selection:
```typescript
// BAD — agent doesn't know when to use it
{ name: "query", description: "Query the database" }

// GOOD — explains WHEN and includes constraints
{
  name: "searchPages",
  description: "Search for AEM pages by path, title, or content. Use for finding specific pages when you know partial information. Returns max 20 results. For browsing page structure, use getPageTree instead.",
  annotations: { group: "content", readOnly: true, complexity: "low" },
}
```

### Resource URI Design

From aem-mcp-server — custom URI scheme for read-only discovery:
```
aem://{instance}/components    — component catalog
aem://{instance}/sites         — site roots and language structure
aem://{instance}/templates     — available page templates
aem://{instance}/workflow-models — workflow models
```

Same pattern could apply to KI-Bundestag if we built a dev MCP server:
```
bundestag://parties            — party list with approval, seats, coalition role
bundestag://bills/pending      — active bills in pipeline
bundestag://economy            — current national economic state
bundestag://events/day/{n}     — events for a specific simulation day
```

### Error Response Design

**aem-mcp-server** — actionable errors:
```json
{
  "is_error": true,
  "content": "Page not found at /content/site/missing",
  "suggestion": "Check the path — did you mean /content/site/en/home?",
  "alternatives": ["searchPages", "getPageTree"]
}
```

**ki-bundestag** — typed error categories:
```typescript
type LimitResult =
  | { type: "hard"; provider; until }    // circuit breaker
  | { type: "transient"; provider }      // retry with backoff
  | { type: "none" };                    // not an API error
```

Both map to the exam's four error categories: invalid input, execution failure, permission denied, not found.

### Transport Selection

| When | Transport | Example |
|---|---|---|
| Single developer, local IDE | **stdio** | aem-mcp-server default, Claude Code integration |
| Shared team server | **HTTP** | moltbook-http-mcp, Figma MCP on port 3845 |
| Isolated/sandboxed execution | **Docker** | axe-mcp-server accessibility testing |

---

## Why MCP Doesn't Fit KI-Bundestag Simulation Agents

### The Real-Time vs Simulation-Time Problem

```
Day 1 (sim) → MCP calls abgeordnetenwatch API → gets April 2026 data
Day 2 (sim, 5 seconds later) → same call → same April 2026 data
Day 300 (sim, 10 minutes later) → same call → still April 2026 data
```

Simulation time moves at ~30 days/minute. Real-world APIs return today's data regardless of simulation day. MCP tools giving agents live API access would break temporal consistency.

### The Batch Efficiency Problem

```
Current architecture (structured output):
  6 agents × 1 batch call = 1 API submission → 50% cost discount

MCP tool_use architecture:
  6 agents × N tool calls each × round-trip per tool = 6N API calls → full price
```

tool_use converts each action into a conversational round-trip (tool_use → tool_result → continue). Our batch API approach packs everything into a single prompt/response cycle.

### What We Do Instead

`knowledge-fetch.ts` is the right architecture — **batch-and-cache**:
1. Fetch real-world data every 7 real days (respects API rate limits)
2. AI digests into 4 categories (landscape, party_position, shock, headline)
3. Store in DB with generation tracking
4. Inject as prompt context when building agent prompts

This gives agents real-world grounding without the temporal or cost problems of live MCP calls.

### Where MCP Would Make Sense for This Project

A **developer-facing MCP server** for Claude Code workflow (not simulation agents):

```json
// .mcp.json — for development/debugging only
{
  "mcpServers": {
    "ki-bundestag": {
      "command": "npx",
      "args": ["tsx", "packages/engine/src/mcp-server.ts"],
      "env": { "DATABASE_PATH": "./data/simulation.db" }
    }
  }
}
```

- **Tools**: `run_simulation_day`, `query_events`, `get_cost_breakdown`
- **Resources**: `bundestag://parties`, `bundestag://bills/pending`, `bundestag://economy`
- No time conflict — developer queries sim state, not agents querying live APIs

---

## Exam-Relevant Takeaways

1. **When to use MCP vs structured output** — MCP for dynamic tool discovery and interactive agents; structured output for known schemas and batch efficiency
2. **Transport selection** — stdio for local/single-client, HTTP for shared/remote, Docker for sandboxed
3. **Tool annotations** (`readOnly`, `group`, `complexity`) help agents choose tools wisely
4. **Actionable errors** with `suggestion` and `alternatives` enable agent self-correction
5. **Resource URIs** provide read-only discovery separate from action tools
6. **Namespacing** prevents tool collisions in multi-plugin/multi-server setups
7. **Auth patterns** — fallback chains (Bearer → header → param → env) handle diverse deployment modes
8. **Not every system needs MCP** — batch-optimized pipelines with known schemas are better served by structured output
