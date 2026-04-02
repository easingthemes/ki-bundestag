/**
 * Shared AI JSON extraction, sanitization, and typed validation.
 *
 * All callAI sites that expect JSON should use `parseAIJson()` instead of
 * ad-hoc code-fence stripping + JSON.parse.  The `parseAgentResponse()`
 * in action-parser.ts keeps its own throw-on-failure semantics but imports
 * the sanitizers from here.
 *
 * Also provides `logAICall()` for structured console observability.
 */

// ---------------------------------------------------------------------------
// JSON sanitizers (moved from action-parser.ts)
// ---------------------------------------------------------------------------

/** Strip leading `+` before numbers in JSON value positions. */
export function stripLeadingPlusInJsonNumbers(input: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === "+") {
      let j = result.length - 1;
      while (j >= 0 && /\s/.test(result[j])) j--;
      const prev = j >= 0 ? result[j] : "";
      const next = i + 1 < input.length ? input[i + 1] : "";

      const afterJsonValueStart = prev === ":" || prev === "," || prev === "[";
      const beforeNumber = /[0-9.]/.test(next);

      if (afterJsonValueStart && beforeNumber) {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/** Strip trailing commas before `}` or `]` in JSON. */
export function stripTrailingCommasInJson(input: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      const next = j < input.length ? input[j] : "";
      if (next === "}" || next === "]") {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

// ---------------------------------------------------------------------------
// JSON extraction + safe parse
// ---------------------------------------------------------------------------

/** Strip markdown code fences, find outermost JSON object/array, and trim whitespace. */
export function extractJson(raw: string): string {
  let str = raw.trim();

  // 1. Try code-fence extraction first
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. If it already starts with { or [, return as-is
  if (str.startsWith("{") || str.startsWith("[")) return str;

  // 3. Fallback: find first { or [ and match to last } or ]
  const objStart = str.indexOf("{");
  const arrStart = str.indexOf("[");
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start !== -1) {
    const closer = str[start] === "{" ? "}" : "]";
    const end = str.lastIndexOf(closer);
    if (end > start) return str.slice(start, end + 1);
  }

  return str;
}

/**
 * Extract JSON from an AI response, sanitize common LLM quirks
 * (leading +, trailing commas), and parse.  Returns `null` on failure.
 */
export function safeParseJson<T = unknown>(raw: string): T | null {
  const jsonStr = extractJson(raw);
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Try sanitized version
    let sanitized = stripLeadingPlusInJsonNumbers(jsonStr);
    sanitized = stripTrailingCommasInJson(sanitized);
    if (sanitized === jsonStr) return null;
    try {
      return JSON.parse(sanitized) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Parse an AI JSON response with a typed validator.
 *
 * 1. Extract JSON (strip code fences)
 * 2. Safe-parse with sanitization
 * 3. Run `validator` — returns typed result or `null`
 * 4. On any failure: `console.warn` with `label` and return `null`
 */
export function parseAIJson<T>(
  raw: string,
  validator: (value: unknown) => T | null,
  label: string,
): T | null {
  const parsed = safeParseJson(raw);
  if (parsed === null) {
    const preview = raw.slice(0, 200).replace(/\n/g, "\\n");
    console.warn(`  [${label}] Failed to parse AI JSON response: "${preview}"`);
    return null;
  }

  const result = validator(parsed);
  if (result === null) {
    console.warn(`  [${label}] AI response failed schema validation`);
    return null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Console observability
// ---------------------------------------------------------------------------

/**
 * Log a structured `[AI]` line for every callAI invocation.
 *
 * Fallback policies per module:
 *   party-agent      → deterministic: abstain all votable bills
 *   negotiations     → deterministic: "Open to negotiations" + all partners
 *   synthesis        → skip → algorithmic: null → findBestCoalition()
 *   media            → skip: no articles that day
 *   polls            → skip: no context poll that week
 *   referendums      → skip: no referendum
 *   summary          → skip: null — no narrative
 *   internal-proposals → deterministic: decline with default reason
 *   seats            → deterministic: reject with default reasoning
 *   discipline       → deterministic: default German reason strings
 *   speeches         → deterministic: 0 (neutral impact)
 *   questions        → skip: question stays pending
 *   interpellations  → skip: interpellation stays pending
 */
export function logAICall(opts: {
  task: string;
  model?: string;
  provider?: string;
  latencyMs: number;
  parseOk: boolean;
  validationOk: boolean;
  fallback?: string;
}): void {
  const status = !opts.parseOk
    ? "PARSE_FAIL"
    : !opts.validationOk
      ? "VALIDATION_FAIL"
      : "OK";
  const fb = opts.fallback ? ` fallback=${opts.fallback}` : "";
  console.log(
    `  [AI] ${opts.task} | ${opts.provider ?? "?"}/${opts.model ?? "?"} | ${opts.latencyMs}ms | ${status}${fb}`,
  );
}
