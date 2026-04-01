# Domain 2: Tool Design & MCP Integration (18%)

Covers tool interface design, structured error responses, MCP server configuration, and Claude's built-in tools. **This is our weakest domain** — the project uses structured output schemas but not `tool_use` or MCP patterns.

---

## What We Built (Partial Coverage)

### 1. JSON Schema Design for Structured Output

While not `tool_use`, our structured output schema demonstrates the same JSON Schema design skills:

```typescript
// party-agent.ts — AGENT_RESPONSE_SCHEMA
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
          reason: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          impact: {
            type: "object",
            properties: {
              budget: { type: "number" },
              unemployment: { type: "number" },
              inflation: { type: "number" },
              gdpGrowth: { type: "number" },
              publicSentiment: { type: "number" },
            },
            additionalProperties: false,
          },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};
```

**Exam-relevant patterns used:**
- `required` vs optional fields — only `type` is required, everything else is action-dependent
- `additionalProperties: false` — prevents model from adding hallucinated fields
- Nested object schemas with their own constraints
- Provider-conditional usage (Anthropic gets schema, xAI doesn't):

```typescript
// party-agent.ts:174 — only Anthropic supports structured output
outputSchema: isAnthropic ? AGENT_RESPONSE_SCHEMA : undefined,
```

---

### 2. Structured Error Categories

Our error handling categorizes errors into typed responses — similar to how tool_use error responses should be structured:

```typescript
// client.ts — typed error detection
type LimitResult =
  | { type: "hard"; provider: Provider; until: string }  // permanent block
  | { type: "transient"; provider: Provider }             // retry-worthy
  | { type: "none" };                                     // not an API error

export function detectLimitError(err: unknown): LimitResult {
  // Hard limit: spending cap reached
  if (limitMatch) return { type: "hard", provider, until };
  // Transient: rate limit (429) or network error
  if (status === 429) return { type: "transient", provider };
  if (isNetworkError(err)) return { type: "transient", provider };
  return { type: "none" };
}
```

**The exam tests four error categories for tool responses:**
1. **Invalid input** — bad parameters (we validate via `action-parser.ts`)
2. **Execution failure** — tool ran but failed (we handle with fallbacks)
3. **Permission denied** — not authorized (we check capabilities)
4. **Not found** — resource doesn't exist (we validate bill IDs)

---

### 3. Selection-Style Batch Prompts (Proto-Tools)

Our `group-prompts.ts` builders are conceptually similar to tool interfaces — structured input/output contracts:

```typescript
// group-prompts.ts — structured batch prompt with defined I/O
export function buildApplicationSelectPrompt(
  party: PartyContext,
  applications: ApplicationItem[],
  openSeats: number,
  currentDay: number,
): BatchRequest {
  return {
    customId: `app-select-${party.id}-day${currentDay}`,
    system: `You are the party leadership of ${party.name}...`,
    prompt: `Select the top ${selectCount} applicants...`,
    maxTokens: 512,
    roleKey: "daily",
    outputSchema: APPLICATION_SELECT_SCHEMA,  // structured output
  };
}
```

---

## What We Didn't Build (Study Gaps)

### MCP (Model Context Protocol)

MCP is a protocol for connecting Claude to external data sources and tools. It defines three primitives:
- **Tools**: Functions Claude can call (like API endpoints)
- **Resources**: Data Claude can read (like file contents)
- **Prompts**: Reusable prompt templates

We use Claude Code's MCP capabilities (Context7, chrome-devtools) but **didn't implement our own MCP server**.

### tool_use API Pattern

The Anthropic API has a native `tool_use` feature where you define tools Claude can call:

```typescript
// What we COULD have built instead of prompt-based JSON:
const tools = [{
  name: "cast_vote",
  description: "Vote on a bill in third reading",
  input_schema: {
    type: "object",
    properties: {
      billId: { type: "string", description: "The bill ID to vote on" },
      vote: { type: "string", enum: ["yes", "no", "abstain"] },
      reason: { type: "string", description: "Brief justification" },
    },
    required: ["billId", "vote", "reason"],
  },
}, {
  name: "propose_bill",
  description: "Propose a new bill",
  input_schema: { ... },
}];
```

**Why we chose structured output over tool_use:**
- Our agents need to return multiple actions per turn (tool_use returns one tool call at a time by default)
- Batch API structured output gives guaranteed valid JSON
- All action types are known at compile time — no dynamic tool discovery needed

### Exam-Relevant MCP Topics to Study

1. **MCP server configuration** in `claude_desktop_config.json`
2. **Tool description best practices** — how descriptions affect tool selection
3. **MCP transport types** — stdio vs HTTP
4. **Resource URI patterns** — `file://`, `db://`, custom schemes
5. **Error response format** in tool results

---

## What Transfers from Our Experience

| Our Pattern | Exam Equivalent |
|---|---|
| `AGENT_RESPONSE_SCHEMA` with required/optional | `tool_use` input_schema design |
| `detectLimitError()` typed categories | Tool error response categories |
| `validateActions()` post-validation | Tool result validation |
| `additionalProperties: false` | Preventing hallucinated tool parameters |
| Provider-conditional schemas | Tool availability per model |

---

## Study Plan for This Domain

1. **Take the Anthropic Academy MCP course** (free on Skilljar)
2. Build a small MCP server that exposes simulation data as resources
3. Practice converting our structured output schema to `tool_use` definitions
4. Study the 4 error categories and when to use each
5. Understand `claude_desktop_config.json` MCP server configuration
