# Domain 2: Tool Design & MCP Integration (18%)

Covers tool interface design, structured error responses, MCP server configuration, and Claude's built-in tools. Experience spans **three projects**: KI-Bundestag (structured output + error handling), aem-mcp-server (57-tool MCP server), and moltbook-http-mcp (HTTP MCP server).

---

## MCP Experience Across Projects

| Project | Role | Scale | Transports |
|---|---|---|---|
| **aem-mcp-server** | Built from scratch | 57 tools, 4 resource types | stdio + HTTP |
| **moltbook-http-mcp** | Built from scratch | 20+ tools, auth chain | HTTP + stdio |
| **dx-aem-flow** | Consumer/configurator | 6 MCP servers, 3 plugins | stdio + HTTP + Docker |
| **ki-bundestag** | Structured output schemas | JSON Schema, error categories | N/A (batch API) |

---

## 1. Building MCP Servers (aem-mcp-server)

### What the exam tests
Creating MCP servers with tools, resources, and prompts. Understanding transport types, tool annotations, and error handling.

### What we built
A full-featured MCP server for Adobe Experience Manager with 57 tools and 4 resource types:

**Tools organized by category:**
- Content & Pages — CRUD, search (QueryBuilder, fulltext, fuzzy), structure analysis
- Components — update, scan, add, convert, bulk-manage, Experience Fragments
- Assets — asset management and operations
- Fragments — Content Fragments + Experience Fragments with variation management
- Workflows — start, advance, delegate stages; model discovery
- Replication — publish/unpublish content

**Resources (read-only discovery):**
```
aem://{instance}/components  — component catalog with names, resourceTypes, titles
aem://{instance}/sites       — site roots and language structure
aem://{instance}/templates   — available page templates with paths and titles
aem://{instance}/workflow-models — workflow models with IDs and descriptions
```

**Dual transport support:**
- **stdio** (recommended) — spawned via `npx`, zero-install, single-client IDE usage
- **Streamable HTTP** — persistent server mode for shared team access, port 8502

**Tool annotations** — each tool tagged with metadata for intelligent agent selection:
- `group`: functional category (content, components, assets, etc.)
- `readOnly`: whether the tool modifies state
- `complexity`: helps agents choose the right tool

**Actionable error handling** — error responses include:
- `suggestion`: what the agent should try instead
- `alternatives`: related tools that might work

**Multi-instance support** — connect to multiple AEM instances simultaneously with named parameters.

### Key learning
- Tool descriptions must explain **when** to use the tool, not just what it does
- `readOnly` annotations prevent agents from accidentally modifying state during exploration
- Response verbosity control (summary/standard/full) keeps context manageable — analogous to KI-Bundestag's context depth system

---

## 2. HTTP MCP with Auth (moltbook-http-mcp)

### What the exam tests
HTTP transport, authentication patterns, multi-tenant design.

### What we built
An MCP server for a social network with HTTP and stdio transports:

**Multi-tenant authentication chain:**
```
Bearer token → X-Api-Key header → Query param → Environment variable
```

- Optional JWT enforcement for POST requests in HTTP mode
- Per-request API key submission for multi-tenant scenarios
- TLS/HTTPS support with certificate configuration

**Key patterns:**
- Clean separation between transport layers and business logic
- Auto-detection of stdio mode (when stdin isn't a TTY)
- Works across Cursor, VS Code, WebStorm, and any MCP-compatible client

### Key learning
- HTTP transport is for shared/remote servers; stdio for local IDE subprocess spawning
- Auth chain fallbacks make the server flexible across deployment modes
- The exam tests knowing **when** to use HTTP vs stdio — HTTP for team servers, stdio for per-developer

---

## 3. MCP Consumer Configuration (dx-aem-flow)

### What the exam tests
Configuring MCP servers in Claude Code settings, namespacing, multi-MCP orchestration.

### What we built
6 MCP servers configured across 3 plugins:

```json
// plugins/dx-core/.mcp.json — Figma + accessibility
{
  "mcpServers": {
    "figma": { "type": "http", "url": "http://127.0.0.1:3845/mcp" },
    "axe-mcp-server": {
      "type": "docker",
      "image": "dequesystems/axe-mcp-server:latest",
      "env": { "AXE_API_KEY": "${AXE_API_KEY}" }
    }
  }
}

// plugins/dx-aem/.mcp.json — AEM + Chrome DevTools
{
  "mcpServers": {
    "AEM": { "command": "npx", "args": ["-y", "aem-mcp-server", "-t", "stdio"] },
    "chrome-devtools-mcp": { "command": "npx", "args": ["chrome-devtools-mcp@latest"] }
  }
}
```

**Critical naming convention for plugin-scoped MCP:**
```
mcp__plugin_<plugin-name>_<server-name>__<tool-name>

Examples:
  mcp__plugin_dx-aem_AEM__getNodeContent
  mcp__plugin_dx-core_figma__get_file
  mcp__plugin_dx-core_axe-mcp-server__run_audit
```

**Multi-MCP orchestration:**
The `aem-fe-verifier` agent chains two MCP servers:
1. AEM MCP to create demo pages and add components
2. Chrome DevTools MCP to navigate, take screenshots, verify rendering vs Figma

### Key learning
- **Exact namespacing is required** — using shorthand (`mcp__figma__`) causes "tool not found" failures because subagents resolve by exact name
- **Per-plugin `.mcp.json`** distributes server config with the plugin — installing a plugin auto-registers its MCP servers
- **Three transport types** used in practice: stdio (AEM, Chrome), HTTP (Figma), Docker (axe)
- **Environment variables** parameterize connections, keeping secrets out of config

---

## 4. JSON Schema Design (ki-bundestag)

### What the exam tests
Designing schemas with correct use of `required`, `additionalProperties`, `enum`, and nullable fields.

### What we built in this project
The `AGENT_RESPONSE_SCHEMA` in `party-agent.ts` — same JSON Schema format as `tool_use` input schemas:

```typescript
const AGENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          billId: { type: "string" },
          vote: { type: "string" },
          impact: {
            type: "object",
            properties: { budget: { type: "number" }, /* ... */ },
            additionalProperties: false,
          },
        },
        required: ["type"],              // only 'type' is universally required
        additionalProperties: false,     // prevent hallucinated fields
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};
```

**Why we chose structured output over tool_use for KI-Bundestag:**
- Agents return **multiple actions** per turn (batch-friendly single response)
- All action types known at compile time — no dynamic tool discovery needed
- Batch API structured output gives guaranteed valid JSON at 50% cost discount
- tool_use would serialize actions into round-trips, breaking the batch model

---

## 5. Structured Error Categories (ki-bundestag)

### What the exam tests
The four error categories for tool responses.

### What we built
A typed discriminated union for error detection:

```typescript
// client.ts — typed error categories
type LimitResult =
  | { type: "hard"; provider: Provider; until: string }  // spending cap → circuit breaker
  | { type: "transient"; provider: Provider }             // 429/network → retry with backoff
  | { type: "none" };                                     // not a limit error

// Mapped to exam's four categories:
// 1. Invalid input    → action-parser.ts validates IDs, categories, vote values
// 2. Execution failure → detectLimitError() catches API/network errors
// 3. Permission denied → validateActions() checks capabilities (Fraktion, opposition)
// 4. Not found         → bill ID validation against votableBills list
```

In aem-mcp-server, error responses include `suggestion` and `alternatives` fields — the exam's concept of **actionable error responses** that help agents self-correct.

---

## Summary: Full Domain Coverage

| Concept | Exam Weight | Experience Source |
|---|---|---|
| MCP server creation | High | aem-mcp-server (57 tools), moltbook-http-mcp |
| MCP resources | High | aem-mcp-server (4 resource types) |
| Transport types (stdio/HTTP/Docker) | High | All three used across projects |
| MCP configuration & namespacing | High | dx-aem-flow (6 servers, 3 plugins) |
| Tool annotations (readOnly, group) | Medium | aem-mcp-server |
| JSON Schema for tools | Medium | ki-bundestag AGENT_RESPONSE_SCHEMA |
| Structured error responses | Medium | Both: ki-bundestag errors + AEM actionable errors |
| Multi-MCP orchestration | Medium | dx-aem-flow AEM→Chrome DevTools chain |
| Auth patterns for MCP | Low | moltbook-http-mcp (JWT, multi-tenant) |
| tool_use vs structured output tradeoff | Low | ki-bundestag (chose structured for batch) |

### Remaining minor gap
The only sub-topic not directly practiced is **MCP Prompts** (reusable prompt templates exposed via MCP). Our `buildSystemPrompt()` in ki-bundestag is conceptually the same pattern, but we haven't exposed prompts through an MCP server's ListPrompts handler.
