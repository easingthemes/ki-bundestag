import { useState } from "react";
import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";

const MODEL_CONFIG = [
  {
    key: "SPD",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_SPD",
    usedFor: "SPD party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 70, auth: 40) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for SPD minister responses to interpellations.",
  },
  {
    key: "CDU",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_CDU",
    usedFor: "CDU party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 30, auth: 60) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for CDU minister responses to interpellations.",
  },
  {
    key: "Grüne",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_GRUENE",
    usedFor: "Grüne party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 65, auth: 25) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for Grüne minister responses to interpellations.",
  },
  {
    key: "FDP",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_FDP",
    usedFor: "FDP party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 35, auth: 20) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for FDP minister responses to interpellations.",
  },
  {
    key: "AfD",
    model: "xai:grok-3-mini",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_AFD",
    usedFor: "AfD party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 10, auth: 80) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Using xAI grok-3-mini ($0.30/$0.50 per 1M tokens) for cost savings. Falls back to auto-abstain on all bills if API call fails. Also used for AfD minister responses to interpellations.",
  },
  {
    key: "Linke",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_LINKE",
    usedFor: "Linke party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 85, auth: 35) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for Linke minister responses to interpellations.",
  },
  {
    key: "Coalition Negotiation",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 1024,
    envVar: "MODEL_NEGOTIATION",
    usedFor: "Coalition negotiation — 3 rounds post-election (per-party calls)",
    systemPrompt: "Negotiation-specific system prompt: form a viable coalition, be strategic",
    userContext: "Party info, election results, previous round positions from all parties, ideology scores",
    notes: "1 call per party per round × 3 rounds. Normal party agents skipped during negotiation days. Uses per-party models based on PARTY_MODELS.",
  },
  {
    key: "Coalition Synthesis",
    model: "anthropic:claude-sonnet-4-5-20250929",
    maxTokens: 4096,
    envVar: "MODEL_SYNTHESIS",
    usedFor: "Coalition agreement synthesis after all 3 negotiation rounds",
    systemPrompt: "Synthesize a realistic German coalition agreement",
    userContext: "All 3 rounds of all party positions and concessions, election seat counts",
    notes: "1 call total after round 3. Must produce ≥2 parties with ≥368 seats. Falls back to algorithmic formGovernment() on failure.",
  },
  {
    key: "System (daily)",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_DAILY",
    usedFor: "Citizen Q&A, media articles, polls, referendum topics, daily narrative summaries",
    systemPrompt: "Various system prompts for non-party AI calls",
    userContext: "Contextual (varies by use case: pending questions, recent events, active crises, etc.)",
    notes: "Fallback model for system-wide AI calls not tied to a specific party.",
  },
];

export function ModelConfig() {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  const toggleModel = (key: string) =>
    setExpandedModels(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="mb-8">
      <h2 className="section-title">KI-Modell-Konfiguration</h2>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[500px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Key</th>
                <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Model</th>
                <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Tokens</th>
                <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Env Override</th>
                <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Used For</th>
                <th className="w-8 bg-muted/50 border-b-2 border-border"></th>
              </tr>
            </thead>
            <tbody>
              {MODEL_CONFIG.map(m => (
                <Fragment key={m.key}>
                  <tr className={expandedModels.has(m.key) ? "bg-muted/50" : ""}>
                    <td className="px-3 py-2 border-b border-border align-middle"><code>{m.key}</code></td>
                    <td className="px-3 py-2 border-b border-border align-middle text-xs font-mono">{m.model}</td>
                    <td className="px-3 py-2 border-b border-border align-middle text-right">{m.maxTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 border-b border-border align-middle"><code className="text-xs">{m.envVar}</code></td>
                    <td className="px-3 py-2 border-b border-border align-middle text-sm text-muted-foreground">{m.usedFor}</td>
                    <td className="px-3 py-2 border-b border-border align-middle">
                      <button
                        className="bg-transparent border-none cursor-pointer text-xs text-muted-foreground px-1 py-0.5 rounded hover:bg-accent hover:text-foreground"
                        onClick={() => toggleModel(m.key)}
                        title={expandedModels.has(m.key) ? "Collapse" : "Expand"}
                      >
                        {expandedModels.has(m.key) ? "▲" : "▼"}
                      </button>
                    </td>
                  </tr>
                  {expandedModels.has(m.key) && (
                    <tr>
                      <td colSpan={6} className="bg-muted/30 p-0">
                        <div className="px-4 py-3 border-l-[3px] border-l-primary/30">
                          <div className="flex gap-3 mb-1.5 text-sm leading-relaxed">
                            <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">System prompt</span>
                            <span>{m.systemPrompt}</span>
                          </div>
                          <div className="flex gap-3 mb-1.5 text-sm leading-relaxed">
                            <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">User context</span>
                            <span>{m.userContext}</span>
                          </div>
                          <div className="flex gap-3 text-sm leading-relaxed">
                            <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">Notes</span>
                            <span>{m.notes}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
