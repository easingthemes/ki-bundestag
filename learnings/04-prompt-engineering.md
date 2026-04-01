# Domain 4: Prompt Engineering & Structured Output (20%)

Covers few-shot construction, tool_use JSON schema design, validation-retry loops, and batch vs synchronous decision trees. **This is our strongest domain** — the project has sophisticated dynamic prompts with validation pipelines.

---

## Key Exam Concept: Programmatic Enforcement vs Prompt Guidance

> The single most tested concept is whether a behavior should be enforced **programmatically** (in code) or via **prompt instructions**. The exam rewards programmatic solutions for anything that must be guaranteed.

Our project demonstrates both — and shows why you need both layers.

---

## 1. Dynamic System Prompts with Capability Gating

### Exam concept
System prompts should only include instructions relevant to the current context. Irrelevant instructions waste tokens and can confuse the model.

### Our implementation
`packages/engine/src/agent/prompt.ts` builds system prompts **conditionally** based on party capabilities:

```typescript
// prompt.ts — capabilities determine which rules are included
export interface PartyCapabilities {
  canVote: boolean;       // requires Fraktion (37+ seats)
  canPropose: boolean;    // requires Fraktion
  canAmend: boolean;      // requires Fraktion
  hasFraktion: boolean;   // 37+ seats threshold
  isOpposition: boolean;  // opposition vs coalition
  isCoalitionLeader: boolean;  // chancellor's party
  hasActiveElection: boolean;  // campaign period
}

export function buildSystemPrompt(partyId, capabilities, realPositions): string {
  const rules: string[] = [
    "You must respond with ONLY valid JSON matching the schema below.",
    "You may take 1-3 actions per turn.",
  ];

  // Conditional rules — only included when capability exists
  if (caps.canVote) {
    rules.push('You MUST submit a vote for every bill in "THIRD READING".');
  }
  if (caps.canPropose) {
    rules.push("You may propose at most 1 new bill per turn.");
  }
  if (caps.isOpposition) {
    rules.push("Opposition parties should scrutinize government bills.");
  }
  if (caps.isCoalitionLeader && !caps.hasActiveElection) {
    rules.push("You may call a Vertrauensfrage (confidence vote).");
  }
  // ...
```

### Negative capability instructions (anti-hallucination)
```typescript
  // Explicitly tell the model what it CANNOT do
  const cannotDo: string[] = [];
  if (!caps.canVote) cannotDo.push("vote on bills");
  if (!caps.canPropose) cannotDo.push("propose bills");
  if (!caps.hasFraktion) cannotDo.push("submit motions", "file interpellations");

  if (cannotDo.length > 0) {
    rules.push(`You CANNOT: ${cannotDo.join(", ")}. Do NOT include these in your response.`);
  }
```

**Why this matters for the exam:** The model is less likely to hallucinate unavailable actions when you explicitly list what it cannot do. But this is still **prompt-level guidance** — our code also validates actions programmatically (see section 4).

---

## 2. Dynamic Schema in System Prompt

### Exam concept
Only show the model output formats it's allowed to use. Showing all possible formats increases hallucination of disallowed actions.

### Our implementation
The response schema is built dynamically — action types only appear if the party has the capability:

```typescript
// prompt.ts — schema entries conditional on capabilities
const schemaEntries: string[] = [];

if (caps.canVote) {
  schemaEntries.push('{"type":"vote","billId":"<id>","vote":"yes"|"no"|"abstain","reason":"<brief>"}');
}
if (caps.canPropose) {
  schemaEntries.push('{"type":"propose_bill","title":"<title>","description":"<desc>",...}');
}
if (caps.hasFraktion && caps.isOpposition) {
  schemaEntries.push('{"type":"file_interpellation","interpellationType":"kleine"|"große",...}');
}

// Always available
schemaEntries.push('{"type":"statement","title":"<headline>","statement":"<text>"}');
schemaEntries.push('{"type":"nothing"}');

const schema = `{"actions":[\n${schemaEntries.join(",\n")}\n]}`;
```

An opposition party with a Fraktion sees 8+ action types. A party with no seats sees only `statement` and `nothing`.

---

## 3. Few-Shot Examples

### Exam concept
Few-shot examples anchor the model's output format. One good example is worth paragraphs of description.

### Our implementation
A compact example in the system prompt:

```typescript
const example = `EXAMPLE (2 votes + 1 statement):
{"actions":[{"type":"vote","billId":"bill-abc","vote":"yes","reason":"Aligns with our social policy goals"},{"type":"vote","billId":"bill-xyz","vote":"no","reason":"Unacceptable fiscal impact"},{"type":"statement","title":"Party responds to crisis","statement":"We call for immediate action."}]}`;
```

**Key decisions:**
- **One example, not many** — tokens are precious in a multi-agent system
- **Example shows the most common pattern** (votes + statement)
- **Compact format** (single line JSON) to model the expected output style
- **Realistic content** so the model mimics the register

---

## 4. Validation-Retry Loops (Programmatic Enforcement)

### Exam concept
Never trust AI output — always validate programmatically. The exam rewards multi-pass validation with typed fallbacks over blind trust.

### Our implementation — 4-layer defense:

**Layer 1: Anthropic Structured Output (schema-level guarantee)**
```typescript
// batch-client.ts — Anthropic guarantees valid JSON matching schema
if (req.outputSchema) {
  return {
    custom_id: req.customId,
    params: {
      ...baseParams,
      output_config: {
        format: { type: "json_schema", schema: req.outputSchema },
      },
    },
  };
}
```

**Layer 2: JSON Sanitization (fixing common AI quirks)**
```typescript
// ai-json.ts — fix malformed JSON before parsing
export function stripLeadingPlusInJsonNumbers(input: string): string {
  // AI often writes "+0.5" instead of "0.5" in JSON
  // This parser-aware function strips leading + only in value positions
  // (not inside strings, not in keys)
}

export function stripTrailingCommasInJson(input: string): string {
  // AI sometimes writes {"a": 1, "b": 2,} — invalid JSON
}

export function extractJson(raw: string): string {
  // Strip markdown code fences: ```json ... ```
  // Some models wrap output in fences despite instructions
}
```

**Layer 3: Parse with Fallback Sanitization**
```typescript
// action-parser.ts — multi-pass parsing
export function parseAgentResponse(raw: string): AgentResponse {
  const jsonStr = extractJson(raw);
  try {
    return JSON.parse(jsonStr);
  } catch {
    // First parse failed — try sanitized version
    let sanitized = stripLeadingPlusInJsonNumbers(jsonStr);
    sanitized = stripTrailingCommasInJson(sanitized);
    return JSON.parse(sanitized);  // throws if still invalid
  }
}
```

**Layer 4: Semantic Validation (game rules enforcement)**
```typescript
// action-parser.ts — validateActions() enforces game rules
export function validateActions(actions, votableBills, partyId, ...): AgentAction[] {
  const validated: AgentAction[] = [];
  let proposalCount = 0, amendmentCount = 0, statementCount = 0;

  for (const action of actions) {
    // Must vote on all third-reading bills
    if (action.type === "vote") {
      if (!votableBills.find(b => b.id === action.billId)) continue; // invalid ID
      if (!["yes", "no", "abstain"].includes(action.vote)) continue; // invalid vote
    }
    // Max 1 proposal per turn
    if (action.type === "propose_bill") {
      if (++proposalCount > 1) continue;
      if (!VALID_CATEGORIES.includes(action.category)) continue;
    }
    // ... more rules
    validated.push(action);
  }
  return validated; // only valid actions survive
}
```

### Retry on Parse Failure
```typescript
// party-agent.ts — retry sequentially if batch parse fails
if (result.structuredOutput) {
  // Anthropic structured output — guaranteed valid, parse directly
  parsed = JSON.parse(result.text);
} else {
  try {
    parsed = parseAgentResponse(result.text);
  } catch {
    // Retry with a fresh sequential call
    console.warn(`[Agent] ${partyId}: PARSE_FAIL from batch, retrying...`);
    const retryResult = await callAI({ system, prompt, maxTokens: 1024, partyId });
    parsed = parseAgentResponse(retryResult.text);  // second chance
  }
}
```

### Key learning
The exam asks: "How do you ensure the model outputs valid data?" The answer is **defense in depth**:
1. Schema-level enforcement (structured output)
2. Syntactic sanitization (fix common JSON errors)
3. Multi-pass parsing (try raw, then sanitized)
4. Semantic validation (enforce business rules in code)
5. Typed fallback (abstain-all if everything fails)

---

## 5. Batch vs Synchronous Decision Tree

### Exam concept
When should you use batch API vs synchronous calls? The exam tests cost/latency tradeoffs.

### Our decision framework

```
Is latency critical (user waiting)?
  YES → Use synchronous callAI()
  NO  → Is the provider Anthropic?
          YES → Use submitBatch() (50% cost savings)
          NO  → Use sequential callAI() (xAI has no batch API)
```

```typescript
// batch-client.ts — multi-provider submission
export async function submitBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  // Split by provider
  const anthropicReqs = requests.filter(r => resolveModel(r).provider === "anthropic");
  const xaiReqs = requests.filter(r => resolveModel(r).provider === "xai");

  // Anthropic: true batch API (50% discount, higher latency)
  const anthropicResults = await submitAnthropicBatch(anthropicReqs);

  // xAI: sequential fallback (no batch API available)
  const xaiResults = await submitXaiBatch(xaiReqs);

  return [...anthropicResults, ...xaiResults];
}
```

---

## 6. Party Personality Injection

### Exam concept
System prompts can include persona instructions to shape behavior. The exam tests appropriate persona depth.

### Our implementation
Each party gets a unique profile injected into the system prompt:

```typescript
// party-profiles.ts — per-party character profiles
const PROFILES: Record<string, string> = {
  spd: `You are the SPD (Social Democrats).
Ideology: Center-left, social democracy, workers' rights.
Strategy: Protect welfare state, push for minimum wage increases, social housing.
Red lines: No cuts to pensions or healthcare. No coalitions with AfD.
Relationships: Natural partner with Grüne. Wary of FDP on economic policy.`,

  afd: `You are the AfD (Alternative for Germany).
Ideology: Right-wing populist, eurosceptic, immigration-critical.
Strategy: Opposition by default. Challenge consensus on migration and EU policy.
Red lines: No compromise on immigration restrictions.`,
  // ... 4 more parties
};
```

Plus real-world knowledge overlay when available:
```typescript
export function getPartyProfile(partyId: string, realPositions?: string): string {
  const base = PROFILES[partyId] ?? "";
  if (realPositions) {
    return `${base}\n\nCURRENT REAL-WORLD POSITIONS:\n${realPositions}`;
  }
  return base;
}
```

---

## 7. Prompt Formatting Best Practices

### Patterns we use that the exam tests:

| Practice | Our Example |
|---|---|
| **Numbered rules** | `1. You must respond with ONLY valid JSON...` |
| **SCREAMING CAPS for critical sections** | `THIRD READING — MANDATORY VOTES` |
| **Explicit valid value lists** | `VALID BILL IDs FOR VOTING: bill-abc, bill-xyz` |
| **Negative instructions** | `Do NOT wrap JSON in code fences` |
| **Format enforcement at end** | `REMINDER: Your entire response must be a single JSON object` |
| **German language constraint** | `ALL text content MUST be written in German` |
| **Impact bounds** | `budget: -1 to +1 billion, unemployment: -0.1 to +0.1%` |

---

## Summary: What This Domain Tests

| Concept | Exam Weight | Our Experience |
|---|---|---|
| Dynamic/conditional prompts | High | Capability-gated rules + schema |
| JSON schema design | High | AGENT_RESPONSE_SCHEMA with required/optional |
| Validation-retry loops | High | 4-layer defense: schema → sanitize → parse → validate |
| Few-shot examples | Medium | Compact single example in system prompt |
| Batch vs sync decisions | Medium | Provider-aware routing |
| Negative instructions | Medium | Explicit "You CANNOT" lists |
| Persona injection | Low | Per-party profiles with real-world overlay |
