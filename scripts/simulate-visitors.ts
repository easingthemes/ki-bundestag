/**
 * simulate-visitors.ts — Launch 5 simulated website visitors in Chrome
 *
 * Usage: npm run simulate:visitors [iterations]  (default: 3)
 *
 * Each visitor gets an isolated browser context (separate session),
 * registers as a user, joins a party, and performs random actions:
 * asking questions, voting on polls/referendums, submitting proposals,
 * voting on proposals, signaling bills, and general browsing.
 *
 * Requires: npm run dev:api + npm run dev:web running first.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ─── Constants ──────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:3001/api";
const WEB_BASE = "http://localhost:5173";
const ITERATIONS = parseInt(process.argv[2] || "3", 10);
const MIN_ITERATION_MS = 60_000; // 1 minute minimum per iteration
const ACTION_DELAY_MIN = 5_000;
const ACTION_DELAY_MAX = 15_000;
const STAGGER_MAX = 10_000;

const PARTY_IDS = ["spd", "cdu", "gruene", "fdp", "afd", "linke"] as const;

const CATEGORIES: string[] = [
  "economy", "social", "environment", "immigration",
  "defense", "education", "healthcare", "infrastructure",
];

const GERMAN_NAMES = [
  "Hans Müller", "Petra Schmidt", "Klaus Fischer", "Monika Weber",
  "Jürgen Becker", "Sabine Hoffmann", "Wolfgang Schäfer", "Ingrid Koch",
  "Dieter Richter", "Helga Braun",
];

const SAMPLE_QUESTIONS = [
  "Wie stehen Sie zur aktuellen Wirtschaftspolitik?",
  "Was planen Sie gegen den Klimawandel zu unternehmen?",
  "Welche Maßnahmen ergreifen Sie für bezahlbaren Wohnraum?",
  "Wie wollen Sie die Bildung in Deutschland verbessern?",
  "Was ist Ihre Position zur Migrationspolitik?",
  "Wie stehen Sie zur Digitalisierung der Verwaltung?",
  "Welche Pläne haben Sie für die Gesundheitsversorgung?",
  "Wie wollen Sie die Rente langfristig sichern?",
  "Was tun Sie für den ländlichen Raum?",
  "Wie fördern Sie kleine und mittlere Unternehmen?",
  "Was ist Ihre Haltung zur europäischen Integration?",
  "Wie stärken Sie die innere Sicherheit?",
  "Welche Infrastrukturprojekte priorisieren Sie?",
  "Wie unterstützen Sie Familien mit Kindern?",
  "Was planen Sie im Bereich erneuerbare Energien?",
];

const PROPOSAL_TITLES = [
  "Förderung erneuerbarer Energien in Kommunen",
  "Digitalpakt für Schulen erweitern",
  "Mindestlohn schrittweise erhöhen",
  "Bürokratieabbau für Kleinunternehmen",
  "Investitionsprogramm für den ÖPNV",
  "Steuerliche Entlastung für Familien",
  "Fachkräfteeinwanderung erleichtern",
  "Mietpreisbremse verschärfen",
  "Forschungsförderung verdoppeln",
  "Breitbandausbau beschleunigen",
];

const PROPOSAL_DESCRIPTIONS = [
  "Ein umfassendes Programm zur Stärkung der lokalen Energiewende mit Fokus auf Bürgerbeteiligung und kommunale Investitionen.",
  "Erweiterung des bestehenden Digitalpakts um moderne Lehrmittel, Fortbildung für Lehrkräfte und flächendeckendes WLAN.",
  "Stufenweise Anhebung des Mindestlohns gekoppelt an die Inflationsrate zum Schutz der Kaufkraft.",
  "Vereinfachung von Genehmigungsverfahren und Reduzierung der Berichtspflichten für Unternehmen mit unter 50 Mitarbeitern.",
  "Milliardenprogramm für Schienenausbau, Elektrobusse und bessere Taktung im ländlichen Raum.",
  "Erhöhung des Kinderfreibetrags und Einführung eines Familienbonus für Geringverdiener.",
  "Beschleunigung der Visaverfahren und Anerkennung ausländischer Berufsabschlüsse.",
  "Verschärfung der Mietpreisbremse mit effektiven Sanktionsmöglichkeiten bei Verstößen.",
  "Verdopplung der Ausgaben für Grundlagenforschung bis 2030 mit Schwerpunkt auf Zukunftstechnologien.",
  "Garantie für Glasfaseranschluss in allen Gemeinden bis 2028 durch öffentliche Förderung.",
];

const BROWSE_PAGES = [
  "/", "/parties", "/bills", "/elections", "/budget",
  "/news", "/polls", "/media", "/questions", "/motions",
  "/interpellations", "/confidence-votes", "/constitutional-court",
  "/referendums", "/log",
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface VisitorState {
  id: number;
  name: string;
  partyId: string;
  token: string | null;
  context: BrowserContext;
  page: Page;
  votedPolls: Set<string>;
  votedReferendums: Set<string>;
  registered: boolean;
  proposalSubmitted: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randomDelay(minMs: number = ACTION_DELAY_MIN, maxMs: number = ACTION_DELAY_MAX): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise(resolve => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function log(visitor: VisitorState, action: string, detail: string): void {
  const name = visitor.name.padEnd(18);
  const act = action.padEnd(10);
  console.log(`[${timestamp()}] Visitor ${visitor.id} (${name}) | ${act} | ${detail}`);
}

async function apiFetch<T = unknown>(
  method: string,
  path: string,
  token: string | null,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-User-Token"] = token;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}) as T);
  return { ok: res.ok, status: res.status, data: data as T };
}

async function navigateSafe(page: Page, path: string): Promise<void> {
  try {
    await page.goto(`${WEB_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  } catch {
    // Navigation timeout is non-fatal
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionRegister(v: VisitorState): Promise<void> {
  if (v.registered) return;

  // Try login first (in case user already exists)
  const loginRes = await apiFetch<{ id: string }>("POST", "/users/login", null, {
    displayName: v.name,
  });

  if (loginRes.ok) {
    v.token = loginRes.data.id;
    log(v, "LOGIN", `Logged in as "${v.name}"`);
  } else {
    // Register new user (without party)
    const regRes = await apiFetch<{ id: string }>("POST", "/users/register", null, {
      displayName: v.name,
    });

    if (!regRes.ok) {
      log(v, "REGISTER", `FAIL - ${JSON.stringify(regRes.data)}`);
      return;
    }
    v.token = regRes.data.id;
    log(v, "REGISTER", `Registered as "${v.name}"`);
  }

  // Join party separately
  const joinRes = await apiFetch("POST", `/users/me/join/${v.partyId}`, v.token, {});
  if (!joinRes.ok) {
    log(v, "JOIN", `FAIL - ${JSON.stringify(joinRes.data)}`);
  } else {
    log(v, "JOIN", `Joined ${v.partyId}`);
  }

  v.registered = true;

  // Set token in browser localStorage so UI reflects membership
  await v.page.evaluate((token: string) => {
    localStorage.setItem("ki-bundestag-token", token);
  }, v.token);

  await navigateSafe(v.page, "/parties");
}

async function actionAskQuestion(v: VisitorState): Promise<void> {
  const targetParty = pick(PARTY_IDS);
  const question = pick(SAMPLE_QUESTIONS);

  const res = await apiFetch("POST", "/questions", v.token, {
    question,
    targetPartyId: targetParty,
  });

  if (!res.ok) {
    log(v, "QUESTION", `SKIP - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  await navigateSafe(v.page, `/parties/${targetParty}`);
  log(v, "QUESTION", `Asked "${question.slice(0, 40)}..." to ${targetParty}`);
}

async function actionVotePoll(v: VisitorState): Promise<void> {
  const pollsRes = await apiFetch<Array<{ id: string; options: string[]; active: boolean }>>(
    "GET", "/polls?active=true", null,
  );

  if (!pollsRes.ok || !Array.isArray(pollsRes.data)) {
    log(v, "POLL", "SKIP - could not fetch polls");
    return;
  }

  const unvoted = pollsRes.data.filter(p => p.active && !v.votedPolls.has(p.id));
  if (unvoted.length === 0) {
    log(v, "POLL", "SKIP - no unvoted active polls");
    return;
  }

  const poll = pick(unvoted);
  const option = pick(poll.options);

  const res = await apiFetch("POST", `/polls/${poll.id}/vote`, null, { option });
  if (!res.ok) {
    log(v, "POLL", `FAIL - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  v.votedPolls.add(poll.id);
  await navigateSafe(v.page, "/polls");
  log(v, "POLL", `Voted "${option}" on poll ${poll.id.slice(0, 8)}`);
}

async function actionVoteReferendum(v: VisitorState): Promise<void> {
  const refsRes = await apiFetch<Array<{ id: string; title: string; options: string[]; status: string }>>(
    "GET", "/referendums?status=active", null,
  );

  if (!refsRes.ok || !Array.isArray(refsRes.data)) {
    log(v, "REFERENDUM", "SKIP - could not fetch referendums");
    return;
  }

  const unvoted = refsRes.data.filter(r => r.status === "active" && !v.votedReferendums.has(r.id));
  if (unvoted.length === 0) {
    log(v, "REFERENDUM", "SKIP - no unvoted active referendums");
    return;
  }

  const ref = pick(unvoted);
  const option = pick(ref.options);

  const res = await apiFetch("POST", `/referendums/${ref.id}/vote`, null, { option });
  if (!res.ok) {
    log(v, "REFERENDUM", `FAIL - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  v.votedReferendums.add(ref.id);
  await navigateSafe(v.page, "/referendums");
  log(v, "REFERENDUM", `Voted "${option}" on "${ref.title.slice(0, 35)}..."`);
}

async function actionSubmitProposal(v: VisitorState): Promise<void> {
  if (!v.token) {
    log(v, "PROPOSAL", "SKIP - not registered");
    return;
  }
  if (v.proposalSubmitted) {
    log(v, "PROPOSAL", "SKIP - already submitted one");
    return;
  }

  const idx = Math.floor(Math.random() * PROPOSAL_TITLES.length);
  const title = PROPOSAL_TITLES[idx];
  const description = PROPOSAL_DESCRIPTIONS[idx];
  const category = pick(CATEGORIES);

  const res = await apiFetch("POST", `/parties/${v.partyId}/proposals`, v.token, {
    title,
    description,
    category,
    rationale: `Als Parteimitglied halte ich diesen Vorschlag für wichtig für die Zukunft unseres Landes.`,
  });

  if (!res.ok) {
    log(v, "PROPOSAL", `SKIP - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  v.proposalSubmitted = true;
  await navigateSafe(v.page, `/parties/${v.partyId}`);
  log(v, "PROPOSAL", `Submitted "${title.slice(0, 40)}..." to ${v.partyId}`);
}

async function actionVoteProposal(v: VisitorState): Promise<void> {
  if (!v.token) {
    log(v, "VOTE PROP", "SKIP - not registered");
    return;
  }

  const propsRes = await apiFetch<Array<{ id: string; title: string; proposedBy: string }>>(
    "GET", `/parties/${v.partyId}/proposals?status=open`, v.token,
  );

  if (!propsRes.ok || !Array.isArray(propsRes.data)) {
    log(v, "VOTE PROP", "SKIP - could not fetch proposals");
    return;
  }

  // Don't vote on own proposals
  const votable = propsRes.data.filter(p => p.proposedBy !== v.token);
  if (votable.length === 0) {
    log(v, "VOTE PROP", "SKIP - no open proposals to vote on");
    return;
  }

  const proposal = pick(votable);
  const vote = Math.random() > 0.3 ? 1 : -1; // 70% upvote bias

  const res = await apiFetch("POST", `/proposals/${proposal.id}/vote`, v.token, { vote });
  if (!res.ok) {
    log(v, "VOTE PROP", `FAIL - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  await navigateSafe(v.page, `/parties/${v.partyId}`);
  log(v, "VOTE PROP", `${vote === 1 ? "▲ Upvoted" : "▼ Downvoted"} "${proposal.title.slice(0, 35)}..."`);
}

async function actionSignalBill(v: VisitorState): Promise<void> {
  if (!v.token) {
    log(v, "SIGNAL", "SKIP - not registered");
    return;
  }

  // Fetch bills in 2nd or 3rd reading
  const [res2, res3] = await Promise.all([
    apiFetch<Array<{ id: string; title: string }>>("GET", "/bills?status=second_reading", null),
    apiFetch<Array<{ id: string; title: string }>>("GET", "/bills?status=third_reading", null),
  ]);

  const bills = [
    ...(Array.isArray(res2.data) ? res2.data : []),
    ...(Array.isArray(res3.data) ? res3.data : []),
  ];

  if (bills.length === 0) {
    log(v, "SIGNAL", "SKIP - no bills in 2nd/3rd reading");
    return;
  }

  const bill = pick(bills);
  const signal = Math.random() > 0.4 ? "yes" : "no"; // 60% yes bias

  const res = await apiFetch("POST", `/bills/${bill.id}/signal`, v.token, { signal });
  if (!res.ok) {
    log(v, "SIGNAL", `FAIL - ${(res.data as { error?: string }).error || res.status}`);
    return;
  }

  await navigateSafe(v.page, `/bills`);
  log(v, "SIGNAL", `${signal.toUpperCase()} on "${bill.title.slice(0, 40)}..."`);
}

async function actionBrowse(v: VisitorState): Promise<void> {
  const page = pick(BROWSE_PAGES);
  await navigateSafe(v.page, page);
  log(v, "BROWSE", `Viewing ${page}`);
}

// ─── Action Registry ────────────────────────────────────────────────────────

type ActionFn = (v: VisitorState) => Promise<void>;

const ALL_ACTIONS: { name: string; fn: ActionFn; requiresAuth: boolean }[] = [
  { name: "question", fn: actionAskQuestion, requiresAuth: false },
  { name: "poll", fn: actionVotePoll, requiresAuth: false },
  { name: "referendum", fn: actionVoteReferendum, requiresAuth: false },
  { name: "proposal", fn: actionSubmitProposal, requiresAuth: true },
  { name: "voteProposal", fn: actionVoteProposal, requiresAuth: true },
  { name: "signal", fn: actionSignalBill, requiresAuth: true },
  { name: "browse", fn: actionBrowse, requiresAuth: false },
];

// ─── Iteration Logic ────────────────────────────────────────────────────────

async function runVisitorIteration(v: VisitorState, iteration: number): Promise<void> {
  const iterStart = Date.now();

  // Stagger start
  await randomDelay(0, STAGGER_MAX);

  // First iteration: always register
  if (iteration === 0) {
    await actionRegister(v);
    await randomDelay();
  }

  // Pick random subset of actions (2 to 5)
  const available = ALL_ACTIONS.filter(a => !a.requiresAuth || v.registered);
  const selected = pickN(available, 2, 5);

  for (const action of selected) {
    try {
      await action.fn(v);
    } catch (err) {
      log(v, "ERROR", `${action.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await randomDelay();
  }

  // If iteration took less than minimum, fill with browsing
  const elapsed = Date.now() - iterStart;
  if (elapsed < MIN_ITERATION_MS) {
    const remaining = MIN_ITERATION_MS - elapsed;
    const browseCount = Math.ceil(remaining / 10_000); // ~10s per browse
    for (let i = 0; i < browseCount; i++) {
      await actionBrowse(v);
      await randomDelay(3_000, 8_000);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Pre-flight health check
  console.log("\n🔍 Checking servers...\n");
  try {
    const health = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`API returned ${health.status}`);
  } catch {
    console.error("❌ API server not responding at http://localhost:3001");
    console.error("   Run: npm run dev:api");
    process.exit(1);
  }

  try {
    const web = await fetch(WEB_BASE, { signal: AbortSignal.timeout(3000) });
    if (!web.ok) throw new Error(`Web returned ${web.status}`);
  } catch {
    console.error("❌ Web server not responding at http://localhost:5173");
    console.error("   Run: npm run dev:web");
    process.exit(1);
  }

  console.log("✅ Both servers running\n");

  // Launch browser
  console.log(`🚀 Launching Chrome with 5 visitors for ${ITERATIONS} iteration(s)...\n`);
  const browser: Browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1280,900"],
  });

  // Create 5 visitor contexts
  const visitors: VisitorState[] = [];
  const shuffledNames = [...GERMAN_NAMES].sort(() => Math.random() - 0.5);

  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    // Navigate to home first so localStorage domain is set
    await navigateSafe(page, "/");

    visitors.push({
      id: i + 1,
      name: shuffledNames[i],
      partyId: PARTY_IDS[i % PARTY_IDS.length],
      token: null,
      context,
      page,
      votedPolls: new Set(),
      votedReferendums: new Set(),
      registered: false,
      proposalSubmitted: false,
    });
  }

  console.log("👥 Visitors:");
  for (const v of visitors) {
    console.log(`   ${v.id}. ${v.name} → ${v.partyId}`);
  }
  console.log("");

  // SIGINT handler for clean shutdown
  let shuttingDown = false;
  process.on("SIGINT", async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n\n🛑 Shutting down browser...");
    await browser.close();
    process.exit(0);
  });

  // Run iterations
  for (let iter = 0; iter < ITERATIONS; iter++) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ITERATION ${iter + 1} of ${ITERATIONS}`);
    console.log(`${"═".repeat(70)}\n`);

    await Promise.all(visitors.map(v => runVisitorIteration(v, iter)));

    if (iter < ITERATIONS - 1) {
      console.log(`\n⏳ Pausing 5s before next iteration...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log("  ✅ All iterations complete! Closing browser...");
  console.log(`${"═".repeat(70)}\n`);

  await browser.close();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
