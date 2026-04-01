# Study Gap: MCP (Model Context Protocol)

MCP is tested in **Domain 2 (18% weight)** and is the main gap in our exam preparation. This file outlines what to study and how our existing patterns transfer.

---

## What is MCP?

MCP (Model Context Protocol) is an open standard for connecting AI models to external data sources and tools. It defines three primitives:

| Primitive | Purpose | Analogy in Our App |
|---|---|---|
| **Tools** | Functions the model can call | Our action types (vote, propose_bill, etc.) |
| **Resources** | Data the model can read | Our context sections (bills, events, economy) |
| **Prompts** | Reusable prompt templates | Our `buildSystemPrompt()` / `buildUserPrompt()` |

---

## What We Already Know (Transferable)

### From Structured Output Schema → Tool Input Schema

Our `AGENT_RESPONSE_SCHEMA` in `party-agent.ts` uses the same JSON Schema format as tool definitions:

```typescript
// What we built (structured output schema):
const AGENT_RESPONSE_SCHEMA = {
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
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

// What MCP tool_use looks like (same JSON Schema format):
const castVoteTool = {
  name: "cast_vote",
  description: "Vote on a bill currently in third reading",
  input_schema: {
    type: "object",
    properties: {
      billId: {
        type: "string",
        description: "The bill ID to vote on (from VALID BILL IDs list)",
      },
      vote: {
        type: "string",
        enum: ["yes", "no", "abstain"],
        description: "Your party's vote",
      },
      reason: {
        type: "string",
        description: "Brief justification for the vote (in German)",
      },
    },
    required: ["billId", "vote", "reason"],
  },
};
```

**Key difference:** With tool_use, the model explicitly "calls" a tool. With structured output, the model returns a blob matching a schema. Tool_use gives the model more agency in deciding *which* tools to use.

### From Error Categories → Tool Error Responses

Our `detectLimitError()` categorizes errors. MCP tools need structured error responses:

```typescript
// Our error categories (client.ts):
type LimitResult =
  | { type: "hard"; provider: Provider; until: string }
  | { type: "transient"; provider: Provider }
  | { type: "none" };

// MCP tool error response format:
{
  type: "tool_result",
  tool_use_id: "call_abc123",
  is_error: true,
  content: "Bill ID 'bill-xyz' not found. Valid IDs: bill-abc, bill-def"
}
```

### From Action Validation → Tool Result Processing

Our `validateActions()` post-validates AI decisions. In a tool_use architecture, you'd validate tool inputs before execution and return structured errors:

```typescript
// Our pattern (post-validation):
const actions = parseAgentResponse(text);
const validated = validateActions(actions, votableBills, ...);
// Invalid actions silently dropped

// MCP pattern (pre-validation):
function handleCastVote(input: { billId: string; vote: string }) {
  if (!validBillIds.includes(input.billId)) {
    return { is_error: true, content: `Invalid bill ID: ${input.billId}` };
  }
  if (!["yes", "no", "abstain"].includes(input.vote)) {
    return { is_error: true, content: `Invalid vote: ${input.vote}` };
  }
  // Execute the vote
  return { content: `Vote recorded: ${input.vote} on ${input.billId}` };
}
```

---

## What We Need to Study

### 1. MCP Server Configuration

```json
// claude_desktop_config.json — how to configure an MCP server
{
  "mcpServers": {
    "parliament-data": {
      "command": "node",
      "args": ["./mcp-server/index.js"],
      "env": {
        "DATABASE_PATH": "./data/simulation.db"
      }
    }
  }
}
```

**Key concepts:**
- Transport types: **stdio** (local process) vs **HTTP/SSE** (remote server)
- Server lifecycle management
- Environment variable passing

### 2. Tool Description Best Practices

The exam tests how tool descriptions affect model behavior:

```typescript
// BAD: Vague description — model doesn't know when to use it
{ name: "query", description: "Query the database" }

// GOOD: Specific description with context
{
  name: "get_bill_details",
  description: "Retrieve full details of a specific bill including its impact assessment, amendment history, and committee recommendation. Use when you need detailed information about a bill before voting.",
}
```

**Rules:**
- Descriptions should explain **when** to use the tool, not just **what** it does
- Include parameter constraints in descriptions, not just in schema
- Use `enum` for constrained values (vote types, categories)
- Mark optional parameters clearly

### 3. The Four Tool Error Categories

The exam specifically tests these four error types:

| Error Type | When | Response |
|---|---|---|
| **Invalid input** | Bad parameters | `"Bill ID must be a valid UUID"` |
| **Execution failure** | Tool ran but failed | `"Database connection timeout"` |
| **Permission denied** | Not authorized | `"Opposition parties cannot call Vertrauensfrage"` |
| **Not found** | Resource doesn't exist | `"No bill with ID 'bill-xyz' exists"` |

### 4. Resources vs Tools

```
Resources: READ-ONLY data the model can access
  - Current bill list
  - National economy state
  - Party approval ratings

Tools: ACTIONS the model can take
  - Cast a vote
  - Propose a bill
  - Issue a statement
```

In our app, we pass everything as prompt context. With MCP, the model could selectively read resources it needs.

### 5. MCP Prompts (Reusable Templates)

MCP Prompts are like our `buildSystemPrompt()` — reusable templates that configure the model's behavior:

```typescript
// MCP Prompt definition
{
  name: "party-agent",
  description: "Configure Claude as a political party agent",
  arguments: [
    { name: "partyId", description: "Which party to act as", required: true },
    { name: "context", description: "Current simulation state", required: true },
  ],
}
```

---

## Hypothetical: KI-Bundestag as MCP

If we rebuilt the party agent using MCP tool_use instead of structured output:

```typescript
// Instead of one big JSON response, the model would call tools:
const tools = [
  { name: "cast_vote", description: "Vote on a third-reading bill", input_schema: { ... } },
  { name: "propose_bill", description: "Propose new legislation", input_schema: { ... } },
  { name: "issue_statement", description: "Make a public statement", input_schema: { ... } },
  { name: "propose_amendment", description: "Amend a second-reading bill", input_schema: { ... } },
  { name: "file_interpellation", description: "Question a minister (opposition only)", input_schema: { ... } },
  { name: "get_bill_details", description: "Read full bill text before voting", input_schema: { ... } },
  { name: "get_recent_events", description: "Check recent parliament events", input_schema: { ... } },
];

// The model would then:
// 1. Call get_bill_details("bill-abc") to read the bill
// 2. Call cast_vote({ billId: "bill-abc", vote: "yes", reason: "..." })
// 3. Call issue_statement({ title: "...", statement: "..." })
```

**Tradeoff:** Tool_use gives the model more flexibility (it can read data on demand) but is harder to batch (each tool call is a round trip). Our structured output approach is better for batch efficiency.

---

## Study Resources

1. **Anthropic Academy: Introduction to MCP** (free on Skilljar)
2. **Anthropic Academy: MCP Advanced** (Python server implementation)
3. **MCP specification**: modelcontextprotocol.io
4. **Claude Code docs**: How Claude Code uses MCP internally
5. **Practice**: Build a simple MCP server that exposes simulation data as resources
