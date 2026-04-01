/**
 * Real-world knowledge grounding for the simulation.
 *
 * Fetches news (tagesschau API + WELT RSS) and party data (abgeordnetenwatch,
 * Bundestag DIP API) weekly, digests via AI into four categories:
 *   - landscape: timeless political themes (always in briefing)
 *   - party_position: per-party real-world stances (merged into profiles)
 *   - shock: major global disruptions (persist until resolved)
 *   - headline: specific dated items (one sim day only)
 *
 * @see docs/plans/real-world-knowledge-grounding.md
 */

import { getDb, getSqlite, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import type { Provider } from "../agent/model-config.js";
import { buildVotingPatternDigest, storeVotingPatternBaseline } from "./voting-analysis.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FETCH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TAGESSCHAU_URL = "https://www.tagesschau.de/api2u/news/?ressort=inland";
const WELT_RSS_URL = "https://www.welt.de/feeds/section/politik.rss";
const AW_BASE = "https://www.abgeordnetenwatch.de/api/v2";
// Fallback parliament period IDs if dynamic discovery fails
const FALLBACK_PERIOD_IDS = [165, 132]; // 21st (2025–), 20th (2021–2025)
const DIP_API_URL = "https://search.dip.bundestag.de/api/v1/vorgang?f.vorgangstyp=Gesetzgebung&rows=10&sort=datum&desc=true";
const DIP_API_KEY = "OSOegLs.PR2lwJ1dwCeje9vTj7FPOt3hvpYKtwKkhw";

const PARTY_IDS = ["spd", "cdu", "gruene", "fdp", "afd", "linke"] as const;

// Module-level cache for the current parliament period ID
let cachedPeriodId: number | null = null;

const USER_AGENT = "KI-Bundestag/1.0 (simulation; github.com/easingthemes/ki-bundestag)";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}, timeoutMs = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`  [Knowledge] Fetch ${url} returned ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`  [Knowledge] Fetch ${url} failed: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source fetchers
// ---------------------------------------------------------------------------

interface RawNewsItem {
  source: string;
  title: string;
  summary: string;
}

async function fetchTagesschauNews(): Promise<RawNewsItem[]> {
  const text = await fetchWithTimeout(TAGESSCHAU_URL);
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const news = (data.news ?? []) as Array<{ title?: string; firstSentence?: string }>;
    return news.slice(0, 15).map(item => ({
      source: "tagesschau",
      title: item.title ?? "",
      summary: item.firstSentence ?? "",
    })).filter(n => n.title);
  } catch {
    console.warn("  [Knowledge] Failed to parse tagesschau JSON");
    return [];
  }
}

async function fetchWeltRSS(): Promise<RawNewsItem[]> {
  const text = await fetchWithTimeout(WELT_RSS_URL);
  if (!text) return [];
  try {
    const items: RawNewsItem[] = [];
    // Simple XML extraction — no dependency needed
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/;
    const descRegex = /<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/;
    let match;
    while ((match = itemRegex.exec(text)) !== null && items.length < 15) {
      const block = match[1];
      const titleMatch = titleRegex.exec(block);
      const descMatch = descRegex.exec(block);
      const title = titleMatch?.[1] ?? titleMatch?.[2] ?? "";
      const desc = descMatch?.[1] ?? descMatch?.[2] ?? "";
      if (title) items.push({ source: "WELT", title, summary: desc });
    }
    return items;
  } catch {
    console.warn("  [Knowledge] Failed to parse WELT RSS");
    return [];
  }
}

interface RawParliamentaryItem {
  source: string;
  title: string;
  detail: string;
}

/**
 * Discover the current Bundestag parliament period ID dynamically.
 * Caches the result — period IDs change only every 4 years.
 */
async function getCurrentParliamentPeriodId(): Promise<number> {
  if (cachedPeriodId) return cachedPeriodId;

  const text = await fetchWithTimeout(
    `${AW_BASE}/parliament-periods?parliament=5&type=legislature&sort_by=id&sort_order=desc&range_end=1`,
  );
  if (text) {
    try {
      const data = JSON.parse(text);
      const periods = data.data as Array<{ id?: number }> | undefined;
      if (periods?.[0]?.id) {
        cachedPeriodId = periods[0].id;
        console.log(`  [Knowledge] Discovered parliament period ID: ${cachedPeriodId}`);
        return cachedPeriodId;
      }
    } catch {
      console.warn("  [Knowledge] Failed to parse parliament-periods response");
    }
  }

  // Fallback: try known IDs sequentially
  for (const id of FALLBACK_PERIOD_IDS) {
    const probe = await fetchWithTimeout(`${AW_BASE}/polls?parliament_period=${id}&range_end=1`);
    if (probe) {
      try {
        const probeData = JSON.parse(probe);
        if (probeData.data?.length > 0) {
          cachedPeriodId = id;
          console.log(`  [Knowledge] Using fallback parliament period ID: ${id}`);
          return id;
        }
      } catch { /* try next */ }
    }
  }

  cachedPeriodId = FALLBACK_PERIOD_IDS[0];
  return cachedPeriodId;
}

interface PollFetchResult {
  items: RawParliamentaryItem[];
  breakdowns: string[];
}

async function fetchAbgeordnetenwatchPolls(): Promise<PollFetchResult> {
  const periodId = await getCurrentParliamentPeriodId();
  const text = await fetchWithTimeout(
    `${AW_BASE}/polls?sort_by=field_poll_date&sort_order=desc&range_end=10&parliament_period=${periodId}`,
  );
  if (!text) return { items: [], breakdowns: [] };
  try {
    const data = JSON.parse(text);
    const polls = (data.data ?? []) as Array<{
      id?: number;
      label?: string;
      field_intro?: string;
      field_poll_date?: string;
    }>;
    // Fetch per-party vote breakdowns for up to 3 recent polls
    const enrichedPolls = polls.slice(0, 10).map(p => ({
      source: "abgeordnetenwatch",
      title: p.label ?? "",
      detail: p.field_intro ?? "",
      pollId: p.id,
    })).filter(p => p.title);

    // Enrich top 3 polls with voting breakdowns (parallel, best-effort)
    const toEnrich = enrichedPolls.slice(0, 3).filter(p => p.pollId);
    const breakdowns = await Promise.all(
      toEnrich.map(p => fetchPollVoteBreakdown(p.pollId!)),
    );
    const rawBreakdowns: string[] = [];
    for (let i = 0; i < toEnrich.length; i++) {
      if (breakdowns[i]) {
        toEnrich[i].detail = `${toEnrich[i].detail}\nAbstimmung: ${breakdowns[i]}`;
        rawBreakdowns.push(breakdowns[i]!);
      }
    }

    return {
      items: enrichedPolls.map(({ pollId: _pollId, ...rest }) => rest),
      breakdowns: rawBreakdowns,
    };
  } catch {
    console.warn("  [Knowledge] Failed to parse abgeordnetenwatch polls JSON");
    return { items: [], breakdowns: [] };
  }
}

/**
 * Fetch individual votes for a poll and aggregate by party/Fraktion.
 * Returns a summary string like "SPD: 180 Ja, 0 Nein; CDU: 0 Ja, 196 Nein; ..."
 */
async function fetchPollVoteBreakdown(pollId: number): Promise<string | null> {
  const text = await fetchWithTimeout(
    `${AW_BASE}/votes?poll=${pollId}&range_end=800`,
  );
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    const votes = (data.data ?? []) as Array<{
      vote?: string;
      mandate?: {
        label?: string;
        fraction_membership?: Array<{
          fraction?: { label?: string; short_name?: string };
        }>;
      };
    }>;

    // Aggregate by fraction
    const byFraction: Record<string, { yes: number; no: number; abstain: number; noShow: number }> = {};
    for (const v of votes) {
      const fractionName = v.mandate?.fraction_membership?.[0]?.fraction?.short_name
        ?? v.mandate?.fraction_membership?.[0]?.fraction?.label
        ?? "Unbekannt";
      if (!byFraction[fractionName]) {
        byFraction[fractionName] = { yes: 0, no: 0, abstain: 0, noShow: 0 };
      }
      const tally = byFraction[fractionName];
      switch (v.vote) {
        case "yes": tally.yes++; break;
        case "no": tally.no++; break;
        case "abstain": tally.abstain++; break;
        case "no_show": tally.noShow++; break;
      }
    }

    return Object.entries(byFraction)
      .map(([name, t]) => `${name}: ${t.yes} Ja, ${t.no} Nein, ${t.abstain} Enthaltung`)
      .join("; ");
  } catch {
    return null;
  }
}

/**
 * Fetch real Bundestag committee names for the current period.
 */
export async function fetchCommitteeNames(): Promise<string[]> {
  const periodId = await getCurrentParliamentPeriodId();
  const text = await fetchWithTimeout(
    `${AW_BASE}/committees?parliament_period=${periodId}&range_end=50`,
  );
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const committees = (data.data ?? []) as Array<{ label?: string }>;
    return committees.map(c => c.label ?? "").filter(Boolean);
  } catch {
    console.warn("  [Knowledge] Failed to parse committees JSON");
    return [];
  }
}

/**
 * Fetch recent citizen questions from abgeordnetenwatch.
 * Returns question topics as inspiration for simulation citizen questions.
 */
async function fetchCitizenQuestions(): Promise<RawParliamentaryItem[]> {
  const periodId = await getCurrentParliamentPeriodId();
  const text = await fetchWithTimeout(
    `${AW_BASE}/questions?parliament_period=${periodId}&sort_by=created&sort_order=desc&range_end=10`,
  );
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const questions = (data.data ?? []) as Array<{
      body?: string;
      topic?: { label?: string };
      politician?: { label?: string; party?: { short_name?: string } };
    }>;
    return questions.slice(0, 10).map(q => ({
      source: "abgeordnetenwatch-fragen",
      title: q.topic?.label ?? "Bürgerfrage",
      detail: (q.body ?? "").slice(0, 200) + (q.politician?.party?.short_name ? ` (an ${q.politician.party.short_name})` : ""),
    })).filter(q => q.detail.length > 10);
  } catch {
    console.warn("  [Knowledge] Failed to parse citizen questions JSON");
    return [];
  }
}

/**
 * Fetch recent politician side jobs for media scandal inspiration.
 */
async function fetchSidejobs(): Promise<RawParliamentaryItem[]> {
  const text = await fetchWithTimeout(
    `${AW_BASE}/sidejobs?sort_by=created&sort_order=desc&range_end=10`,
  );
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const jobs = (data.data ?? []) as Array<{
      label?: string;
      income_level?: string;
      sidejob_organization?: { label?: string };
      mandates?: Array<{
        politician?: { label?: string; party?: { short_name?: string } };
      }>;
    }>;
    return jobs.slice(0, 5).map(j => {
      const politician = j.mandates?.[0]?.politician;
      const who = politician ? `${politician.label} (${politician.party?.short_name ?? "?"})` : "Unbekannt";
      return {
        source: "abgeordnetenwatch-nebentätigkeit",
        title: `Nebentätigkeit: ${who}`,
        detail: `${j.label ?? ""} bei ${j.sidejob_organization?.label ?? "?"}, Einkommensstufe: ${j.income_level ?? "?"}`,
      };
    }).filter(j => j.detail.length > 10);
  } catch {
    console.warn("  [Knowledge] Failed to parse sidejobs JSON");
    return [];
  }
}

async function fetchDIPBills(): Promise<RawParliamentaryItem[]> {
  const text = await fetchWithTimeout(
    DIP_API_URL,
    { "Authorization": `ApiKey ${DIP_API_KEY}` },
  );
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const docs = (data.documents ?? []) as Array<{
      titel?: string;
      abstract?: string;
      initiative?: string[];
    }>;
    return docs.slice(0, 10).map(d => ({
      source: "Bundestag DIP",
      title: d.titel ?? "",
      detail: d.abstract ?? (d.initiative ?? []).join("; "),
    })).filter(d => d.title);
  } catch {
    console.warn("  [Knowledge] Failed to parse DIP API JSON");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch orchestration
// ---------------------------------------------------------------------------

export interface RawKnowledgeData {
  newsItems: RawNewsItem[];
  parliamentaryItems: RawParliamentaryItem[];
  /** Raw vote breakdown strings from abgeordnetenwatch polls (for voting pattern baseline) */
  pollBreakdowns: string[];
}

/**
 * Check if we should fetch new knowledge.
 * Returns true if no knowledge exists or the latest fetch is older than 7 real days.
 */
export function shouldFetchKnowledge(): boolean {
  const db = getDb();
  const latest = db.select({ fetchedAt: schema.realWorldKnowledge.fetchedAt })
    .from(schema.realWorldKnowledge)
    .orderBy(desc(schema.realWorldKnowledge.fetchedAt))
    .limit(1)
    .all();

  if (latest.length === 0) return true;

  const lastFetch = new Date(latest[0].fetchedAt).getTime();
  return Date.now() - lastFetch > FETCH_COOLDOWN_MS;
}

/**
 * Get the next generation number.
 */
function getNextGeneration(): number {
  const db = getDb();
  const latest = db.select({ generation: schema.realWorldKnowledge.generation })
    .from(schema.realWorldKnowledge)
    .orderBy(desc(schema.realWorldKnowledge.generation))
    .limit(1)
    .all();
  return (latest[0]?.generation ?? 0) + 1;
}

/**
 * Fetch all raw data from external sources.
 * Each source is independent — failures are logged but don't block others.
 */
export async function fetchAllSources(currentDay?: number): Promise<RawKnowledgeData> {
  console.log("  [Knowledge] Fetching real-world data...");

  const [tagesschau, welt, pollResult, bills, questions, sidejobs, committees] = await Promise.all([
    fetchTagesschauNews(),
    fetchWeltRSS(),
    fetchAbgeordnetenwatchPolls(),
    fetchDIPBills(),
    fetchCitizenQuestions(),
    fetchSidejobs(),
    fetchCommitteeNames(),
  ]);

  // Store committee names for use by bill-pipeline
  if (committees.length > 0) {
    storeCommitteeNames(committees);
  }

  // Store voting pattern baseline (frozen at first capture, never overwritten)
  if (pollResult.breakdowns.length > 0) {
    const digest = buildVotingPatternDigest(pollResult.breakdowns, currentDay ?? 0);
    if (digest) {
      const stored = storeVotingPatternBaseline(digest);
      if (stored) {
        console.log(`  [Knowledge] Stored voting pattern baseline (${digest.pollCount} polls, day ${digest.capturedOnDay})`);
      }
    }
  }

  console.log(`  [Knowledge] Fetched: ${tagesschau.length} tagesschau, ${welt.length} WELT, ${pollResult.items.length} abgeordnetenwatch polls (with vote breakdowns), ${bills.length} DIP bills, ${questions.length} citizen questions, ${sidejobs.length} sidejobs, ${committees.length} committees`);

  return {
    newsItems: [...tagesschau, ...welt],
    parliamentaryItems: [...pollResult.items, ...bills, ...questions, ...sidejobs],
    pollBreakdowns: pollResult.breakdowns,
  };
}

// ---------------------------------------------------------------------------
// AI Digest
// ---------------------------------------------------------------------------

const DIGEST_SYSTEM_PROMPT = `You are a German political analyst preparing background knowledge for a parliamentary simulation. Your task is to classify and summarize raw political data into structured categories. Write ALL text in German.

CRITICAL: The simulation has its OWN government, coalition, and opposition — which may differ from the real German government. You must:
- NEVER frame anything as "the government does X" or "the coalition agreed on Y"
- ALWAYS attribute positions to PARTIES BY NAME, not to "Regierung" or "Opposition"
- Present each party's stance INDEPENDENTLY of whether they are in government or opposition
- Strip all references to who is currently governing — the simulation decides that itself
- Example: Instead of "Die Regierung plant ein Klimapaket" write "SPD und Grüne fordern ein Klimapaket"

CATEGORIES:
1. "landscape": Timeless political themes that shape German politics (energy, migration, fiscal policy, security, etc.). Strip all specific dates, names, and government references — keep only structural themes and policy debates. 3-5 sentences.
2. "party_positions": For each of the 6 parties (SPD, CDU/CSU, Grüne, FDP, AfD, Die Linke), extract their current real-world policy priorities and ideological positions. Describe what each party WANTS and BELIEVES, not what they do as government/opposition. 2-3 sentences per party.
3. "shocks": Major global/national disruptions (wars, pandemics, trade wars, financial crises, constitutional crises). Only include truly major events that reshape the entire political landscape. Frame as external pressures on Germany, not as government responses. Include ONLY currently active shocks. If a previously listed shock has been resolved, include its ID in "shocks_resolved".
4. "headlines": 3-5 specific current political topics that could inspire parliamentary debate. Frame as open policy questions, not as government actions. Keep them as topic prompts, not dated news.

FORMAT (respond with ONLY valid JSON):
{
  "landscape": "<3-5 Sätze über die grundlegenden politischen Themen in Deutschland>",
  "party_positions": {
    "spd": "<2-3 Sätze: Was will die SPD? Wofür steht sie?>",
    "cdu": "<2-3 Sätze: Was will die CDU/CSU? Wofür steht sie?>",
    "gruene": "<2-3 Sätze: Was wollen die Grünen? Wofür stehen sie?>",
    "fdp": "<2-3 Sätze: Was will die FDP? Wofür steht sie?>",
    "afd": "<2-3 Sätze: Was will die AfD? Wofür steht sie?>",
    "linke": "<2-3 Sätze: Was will Die Linke? Wofür steht sie?>"
  },
  "shocks": [
    { "theme": "<kurze Beschreibung als externer Faktor>", "status": "ongoing|new" }
  ],
  "shocks_resolved": [],
  "headlines": ["<Politikfrage 1>", "<Politikfrage 2>", "<Politikfrage 3>"]
}`;

/**
 * Build a batch request for knowledge digestion.
 */
export function buildKnowledgeDigestRequest(
  raw: RawKnowledgeData,
  activeShocks: string[],
): BatchRequest {
  const newsSection = raw.newsItems.length > 0
    ? `NEWS (tagesschau + WELT):\n${raw.newsItems.map(n => `  [${n.source}] ${n.title} — ${n.summary}`).join("\n")}`
    : "NEWS: No news data available.";

  const parlSection = raw.parliamentaryItems.length > 0
    ? `PARLIAMENTARY DATA (Bundestag + abgeordnetenwatch):\n${raw.parliamentaryItems.map(p => `  [${p.source}] ${p.title} — ${p.detail}`).join("\n")}`
    : "PARLIAMENTARY DATA: No parliamentary data available.";

  const shockSection = activeShocks.length > 0
    ? `CURRENTLY ACTIVE SHOCKS (include only if still active, resolve if no longer relevant):\n${activeShocks.map(s => `  - ${s}`).join("\n")}`
    : "NO PREVIOUSLY ACTIVE SHOCKS.";

  return {
    customId: `knowledge-digest`,
    system: DIGEST_SYSTEM_PROMPT,
    prompt: `Analyze the following data and produce the structured summary:\n\n${newsSection}\n\n${parlSection}\n\n${shockSection}`,
    maxTokens: 1536,
    roleKey: "daily",
  };
}

interface DigestResult {
  landscape: string;
  party_positions: Record<string, string>;
  shocks: Array<{ theme: string; status: string }>;
  shocks_resolved: string[];
  headlines: string[];
}

/**
 * Process the digest result and store knowledge rows in DB.
 */
export function processKnowledgeDigestResult(
  result: BatchResult | undefined,
): boolean {
  if (!result?.text) {
    logAICall({
      task: "knowledge-digest",
      model: result?.model ?? "unknown",
      provider: (result?.provider ?? "anthropic") as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return false;
  }

  const parsed = parseAIJson<DigestResult>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.landscape !== "string") return null;
      if (typeof o.party_positions !== "object" || !o.party_positions) return null;
      if (!Array.isArray(o.headlines)) return null;
      return {
        landscape: o.landscape,
        party_positions: o.party_positions as Record<string, string>,
        shocks: Array.isArray(o.shocks) ? o.shocks as DigestResult["shocks"] : [],
        shocks_resolved: Array.isArray(o.shocks_resolved) ? o.shocks_resolved as string[] : [],
        headlines: o.headlines as string[],
      };
    },
    "KnowledgeDigest",
  );

  if (!parsed) {
    logAICall({
      task: "knowledge-digest",
      model: result.model,
      provider: result.provider as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return false;
  }

  logAICall({
    task: "knowledge-digest",
    model: result.model,
    provider: result.provider as Provider,
    latencyMs: 0,
    parseOk: true,
    validationOk: true,
  });

  const db = getDb();
  const generation = getNextGeneration();
  const fetchedAt = new Date().toISOString();
  const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  // Deactivate previous landscape/party_position/headline rows
  getSqlite().prepare(
    "UPDATE real_world_knowledge SET active = 0 WHERE category IN ('landscape', 'party_position', 'headline') AND active = 1",
  ).run();

  // Store landscape
  db.insert(schema.realWorldKnowledge).values({
    id: genId(),
    generation,
    category: "landscape",
    partyId: null,
    digest: parsed.landscape,
    sourceUrls: null,
    fetchedAt,
    simDayFirstUsed: null,
    active: true,
  }).run();

  // Store party positions
  for (const partyId of PARTY_IDS) {
    const pos = parsed.party_positions[partyId];
    if (pos) {
      db.insert(schema.realWorldKnowledge).values({
        id: genId(),
        generation,
        category: "party_position",
        partyId,
        digest: pos,
        sourceUrls: null,
        fetchedAt,
        simDayFirstUsed: null,
        active: true,
      }).run();
    }
  }

  // Store new shocks
  for (const shock of parsed.shocks) {
    if (shock.status === "new") {
      db.insert(schema.realWorldKnowledge).values({
        id: genId(),
        generation,
        category: "shock",
        partyId: null,
        digest: shock.theme,
        sourceUrls: null,
        fetchedAt,
        simDayFirstUsed: null,
        active: true,
      }).run();
    }
  }

  // Resolve old shocks
  if (parsed.shocks_resolved.length > 0) {
    // Match by digest text (shocks_resolved contains theme strings)
    for (const resolved of parsed.shocks_resolved) {
      getSqlite().prepare(
        "UPDATE real_world_knowledge SET active = 0 WHERE category = 'shock' AND active = 1 AND digest = ?",
      ).run(resolved);
    }
  }

  // Store headlines
  for (const headline of parsed.headlines) {
    db.insert(schema.realWorldKnowledge).values({
      id: genId(),
      generation,
      category: "headline",
      partyId: null,
      digest: headline,
      sourceUrls: null,
      fetchedAt,
      simDayFirstUsed: null,
      active: true,
    }).run();
  }

  console.log(`  [Knowledge] Stored generation ${generation}: landscape, ${Object.keys(parsed.party_positions).length} party positions, ${parsed.shocks.filter(s => s.status === "new").length} new shocks, ${parsed.headlines.length} headlines`);
  return true;
}

// ---------------------------------------------------------------------------
// Query functions (used by loop.ts / prompt.ts)
// ---------------------------------------------------------------------------

/**
 * Get the active political landscape digest (timeless themes).
 * Returns null if knowledge grounding is not available.
 */
export function getActiveLandscape(): string | null {
  const db = getDb();
  const row = db.select({ digest: schema.realWorldKnowledge.digest })
    .from(schema.realWorldKnowledge)
    .where(and(
      eq(schema.realWorldKnowledge.category, "landscape"),
      eq(schema.realWorldKnowledge.active, true),
    ))
    .orderBy(desc(schema.realWorldKnowledge.generation))
    .limit(1)
    .all();
  return row[0]?.digest ?? null;
}

/**
 * Get active party position digest for a specific party.
 */
export function getPartyPositions(partyId: string): string | null {
  const db = getDb();
  const row = db.select({ digest: schema.realWorldKnowledge.digest })
    .from(schema.realWorldKnowledge)
    .where(and(
      eq(schema.realWorldKnowledge.category, "party_position"),
      eq(schema.realWorldKnowledge.partyId, partyId),
      eq(schema.realWorldKnowledge.active, true),
    ))
    .orderBy(desc(schema.realWorldKnowledge.generation))
    .limit(1)
    .all();
  return row[0]?.digest ?? null;
}

/**
 * Get all active structural shocks.
 */
export function getActiveShocks(): string[] {
  const db = getDb();
  const rows = db.select({ digest: schema.realWorldKnowledge.digest })
    .from(schema.realWorldKnowledge)
    .where(and(
      eq(schema.realWorldKnowledge.category, "shock"),
      eq(schema.realWorldKnowledge.active, true),
    ))
    .all() as Array<{ digest: string }>;
  return rows.map(r => r.digest);
}

/**
 * Get headline inspiration for the current sim day.
 * Headlines are consumed once — sim_day_first_used is set and they're deactivated.
 * Returns null if already consumed.
 */
export function getHeadlineInspiration(currentDay: number): string[] | null {
  const sqlite = getSqlite();

  // Find active headlines that haven't been used yet
  const rows = sqlite.prepare(
    "SELECT id, digest FROM real_world_knowledge WHERE category = 'headline' AND active = 1 AND sim_day_first_used IS NULL",
  ).all() as Array<{ id: string; digest: string }>;

  if (rows.length === 0) return null;

  // Mark them as used and deactivate
  const stmt = sqlite.prepare(
    "UPDATE real_world_knowledge SET sim_day_first_used = ?, active = 0 WHERE id = ?",
  );
  for (const row of rows) {
    stmt.run(currentDay, row.id);
  }

  return rows.map(r => r.digest);
}

/**
 * Store real Bundestag committee names in the knowledge DB.
 * Replaces previous committee entries.
 */
function storeCommitteeNames(names: string[]): void {
  const sqlite = getSqlite();
  const db = getDb();
  const generation = getNextGeneration();
  const fetchedAt = new Date().toISOString();
  const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  // Deactivate previous committee rows
  sqlite.prepare(
    "UPDATE real_world_knowledge SET active = 0 WHERE category = 'committee' AND active = 1",
  ).run();

  for (const name of names) {
    db.insert(schema.realWorldKnowledge).values({
      id: genId(),
      generation,
      category: "committee",
      partyId: null,
      digest: name,
      sourceUrls: null,
      fetchedAt,
      simDayFirstUsed: null,
      active: true,
    }).run();
  }

  console.log(`  [Knowledge] Stored ${names.length} real committee names`);
}

/**
 * Get stored real committee names from abgeordnetenwatch.
 * Returns empty array if none stored — callers should fall back to hardcoded list.
 */
export function getStoredCommitteeNames(): string[] {
  const db = getDb();
  const rows = db.select({ digest: schema.realWorldKnowledge.digest })
    .from(schema.realWorldKnowledge)
    .where(and(
      eq(schema.realWorldKnowledge.category, "committee"),
      eq(schema.realWorldKnowledge.active, true),
    ))
    .all() as Array<{ digest: string }>;
  return rows.map(r => r.digest);
}

// ---------------------------------------------------------------------------
// Combined context builder (used by loop.ts)
// ---------------------------------------------------------------------------

/**
 * Build the combined real-world context string for agent prompts.
 */
export function buildRealWorldContext(currentDay: number): string | null {
  const parts: string[] = [];

  const landscape = getActiveLandscape();
  if (landscape) {
    parts.push(`POLITISCHE LAGE IN DEUTSCHLAND:\n${landscape}`);
  }

  const shocks = getActiveShocks();
  if (shocks.length > 0) {
    parts.push(`WICHTIGE GLOBALE FAKTOREN:\n${shocks.map(s => `- ${s}`).join("\n")}`);
  }

  const headlines = getHeadlineInspiration(currentDay);
  if (headlines && headlines.length > 0) {
    parts.push(`AKTUELLE POLITISCHE THEMEN (als kreative Inspiration, nicht wörtliche Ereignisse):\n${headlines.map(h => `- ${h}`).join("\n")}`);
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}
