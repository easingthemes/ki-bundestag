# Sim vs Real Bundestag — Gap Analysis

> Compiled 2026-04-19 from [`./sim-events.md`](./sim-events.md) (canonical sim event inventory) and [`./real-events.md`](./real-events.md) (canonical real-Bundestag event inventory). Driven into action items by [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md).
>
> **Goal**: identify every place the simulation diverges from the real Bundestag, so the sim can be a 1:1 interpretation (different speed of time, same event repertoire). Divergence classified as:
>
> - 🟥 **Missing** — real Bundestag event has no sim equivalent
> - 🟧 **Wrong** — event exists in sim but semantics, frequency, or structure diverge
> - 🟨 **Timing** — event exists but lifecycle duration is unrealistic
> - 🟩 **OK** — sim matches real (good)
> - 🟦 **Sim-only extra** — event exists only in sim; evaluate keep/drop

## Headline numbers

| Axis | Real | Sim | Notes |
|---|---|---|---|
| Distinct event categories (procedural steps) | ~90 | 42 emitted (+5 dead) | Sim covers ~47% of real event repertoire |
| Bills per 4-year term | ~500–600 (20. WP: 555) | unbounded; `npm run simulate 1461` easily produces thousands | Overproduces |
| Bill 1st→3rd reading duration | 3–9 months | **1–2 sim days** | **45–270× too fast** |
| Committee phase | 6–12 weeks typical | ~1 day | **~50× too fast** |
| Parliamentary calendar (sitting weeks, recesses) | 20–22 Sitzungswochen/yr, Sommerpause, Weihnachtspause, Haushaltswoche | Not modelled | Events fire every sim day, weekend or not |
| Government-bill fast-track | Gets MORE procedural time (Bundesrat 1. Durchgang: +6–9 weeks) | Gets LESS procedural time (skips 1st reading) | **Semantic reversal** |
| Presidential veto frequency | ~8 in 75 years (~0.02% of bills) | 1–6% per passed bill | **30–300× too frequent** |
| Vertrauensfrage | 5 total since 1949 (~0.07/yr) | Unconstrained AI action | Likely overproduced |
| Konstruktives Misstrauensvotum | 2 attempted, 1 successful since 1949 (~0.03/yr) | Unconstrained AI action | Likely overproduced |
| Kleine Anfragen | ~13,000 per WP (~3,000/yr) | Rate-capped; per-party daily limits | Likely vastly **underproduced** |
| Schriftliche Einzelfragen | ~50,000 per WP (~12,000/yr) | Not modelled | 🟥 entirely missing |
| Term length | 1,461 days | `TERM_DAYS=1461` | 🟩 exactly matches |

---

## 1. Parliamentary calendar structure

The sim has no concept of sitting-vs-non-sitting weeks, recesses, or Haushaltswoche. Everything happens every day. This is the **#1 fidelity gap** because it silently compounds every other event's timing.

| Real concept | Sim equivalent | Status | Impact |
|---|---|---|---|
| Sitzungswochen (20–22/yr) | `SESSION_INTERVAL=5` (unused for events) | 🟥 Missing | Plenum events fire every day; should cluster in ~40% of weeks |
| Nicht-Sitzungswochen (~50% of weeks) | None | 🟥 Missing | No "quiet weeks" in sim |
| Sommerpause (~7–8 weeks, mid-Jul to early-Sep) | None | 🟥 Missing | Bills, votes continue through August |
| Weihnachtspause (~3–4 weeks) | Calendar aware of holidays only | 🟧 Partial | Snapping to workday exists but no block on plenary events |
| Haushaltswoche (concentrated budget week) | `BUDGET_INTERVAL=365` (one day) | 🟨 Timing | Should be a week-long concentrated event |
| Weekday-specific activity (Tue Fraktion, Wed Regierungsbefragung, Thu/Fri plenum) | Not modelled | 🟥 Missing | Events don't respect weekday semantics |
| `isWorkday()`, `snapToNextWorkday()` helpers | Implemented (`calendar.ts`) | 🟩 OK | Infrastructure exists, just not applied to events |

**Fix priority: CRITICAL.** Without this, bill pipeline timing fixes have nowhere to sit.

---

## 2. Legislative cycle (bill lifecycle)

Most of the simulation's value lives here. Many granular gaps.

### 2.1 Initiative routes (Einbringung)

| Route | Real timing | Sim | Status |
|---|---|---|---|
| Regierungsvorlage | Through Bundesrat 1. Durchgang first (+6–9 weeks) | `isGovernmentBill` → fast-track skipping 1st reading | 🟧 **Inverted semantics** |
| Gesetzentwurf aus der Mitte (Fraktionsantrag, ≥5% MdB) | Direct, no Bundesrat pre-pass | Normal party-agent `propose_bill` | 🟩 OK (though sim doesn't require 5% quorum check) |
| Bundesratsinitiative | Through Bundesregierung (+3 months Stellungnahme) | Not modelled | 🟥 Missing |
| Member proposal (Abgeordnetenantrag) | Requires 5% MdB backing | `member_proposal_accepted` (sim caucus mechanic) | 🟦 Sim-only flavour; real equivalent needs 5% signatories |

### 2.2 Reading stages

| Real stage | Real duration | Sim event | Sim duration | Status |
|---|---|---|---|---|
| **1. Lesung** (often waived, sometimes brief Aussprache) | 1 day | `bill_first_reading` always emitted | 1 day | 🟧 Always emits; should skip most bills |
| **Ausschussphase** (federführender + mitberatende Ausschüsse, Anhörungen, Beschlussempfehlung) | **6–12 weeks typical** | `bill_committee` (single event) | ~1 day | 🟨 **50× too fast**; no Anhörung, no Berichterstatter, no Einzelpläne |
| **Öffentliche Anhörung** (public hearing) | Days–weeks | None | — | 🟥 Missing |
| **Beschlussempfehlung** (committee report) | Written doc | Implicit in `bill_committee_rejected` (40% rate) | — | 🟨 Conflates recommendation with advancement; real committees recommend in 80%+ of cases |
| **2. Lesung** — Aussprache (Berliner-Stunde) + Einzelabstimmung over amendments | Same day | `bill_second_reading` + `amendment_voted` | 1 day | 🟧 No Berliner-Stunde speaking-time model; amendments tallied en bloc |
| **3. Lesung** — optional short Aussprache, Schlussabstimmung | Usually same day as 2nd | `bill_third_reading` | 1 day | 🟧 No Erklärung zur Abstimmung, no restricted-amendment rule |

### 2.3 After the Bundestag

| Real step | Real duration | Sim | Status |
|---|---|---|---|
| Bundesrat 2. Durchgang (Zustimmungsgesetz / Einspruchsgesetz distinction) | 3–6 weeks | Not modelled | 🟥 **Missing entirely** |
| Vermittlungsausschuss | 2–8 weeks if invoked | Not modelled | 🟥 Missing |
| Ausfertigung by Bundeskanzler + ressortverantwortlicher Minister | Days | Not modelled | 🟥 Missing |
| Unterzeichnung by Bundespräsident | Days–weeks | `presidential_veto` (1–6% random) | 🟧 Frequency wildly wrong (real: ~0.02%/bill) |
| Verkündung im BGBl. | Immediate | Not modelled | 🟥 Missing |
| Inkrafttreten (default +14 days) | ~2 weeks | `bill_passed` applies impact immediately | 🟨 Timing |

### 2.4 Special bill types

| Real | Sim | Status |
|---|---|---|
| Constitutional amendment (2/3 majority of all MdB, Art. 79 Abs. 2 GG) | No special path | 🟥 Missing |
| Eilgesetze (fast-track, pandemic-style) | No opt-in urgency | 🟥 Missing |
| Bill rejection types (`bill_committee_rejected`, `bill_rejected` on final vote, `struck_down` by BVerfG) | All three exist | 🟩 OK |

### 2.5 Total bill-lifecycle timing comparison

```
Real (ordinary bill, Einbringung → Verkündung):
  |----Einbringung----|--1. Lesung--|-------Ausschuss (6–12 wks)-------|-2./3. Lesung-|--Bundesrat (3–6 wks)--|-Ausfert.-|-BGBl+14d-|
   day 0              day ~7         day ~49–105                        day ~56–112    day ~77–154            day ~91–168 day ~105–182

Sim (default):
  |-propose-|-1st read-|-committee-|-2nd read-|-3rd read (vote)-|
   day 0    day 1     day 2       day 3      day 4
```

**Sim compresses ~5 months of real process into ~4 sim days.**

---

## 3. Debate formats

Sim has 2 debate-like events. Real has 13 distinct formats.

| Real format | Sim equivalent | Status |
|---|---|---|
| Aussprache (general debate) | `mdb_speech` + `statement` | 🟧 Partial; no speaking-time allocation, no Fraktion turn order |
| Berliner Stunde (proportional speaking time) | Not modelled | 🟥 Missing |
| Kurzintervention (≤2 min rebuttal) | Not modelled | 🟥 Missing |
| Zwischenfrage (interruption question) | Not modelled | 🟥 Missing |
| Zwischenbemerkung (interruption remark) | Not modelled | 🟥 Missing |
| Zwischenruf (heckling) | Not modelled | 🟥 Missing |
| **Aktuelle Stunde** (current-affairs hour, 2–4/month) | Not modelled | 🟥 **High-impact miss** |
| Regierungserklärung (government statement, 5–8/yr) | Not modelled | 🟥 Missing |
| **Regierungsbefragung** (every Sitzungsmittwoch, ~35 min) | Not modelled | 🟥 Weekly event entirely missing |
| Fragestunde (≤45 min every Sitzungswoche) | Not modelled | 🟥 Missing |
| Erklärung zur Abstimmung | Not modelled | 🟥 Missing |
| Geschäftsordnungsantrag (procedural motion) | Not modelled | 🟥 Missing |
| Persönliche Erklärung | Not modelled | 🟥 Missing |
| Ordnungsruf / Sitzungsausschluss | Not modelled | 🟥 Missing |

**Relevant to the parked debate brainstorm (todo 041):** our earlier Option B (sequential Berliner-Stunde exchange) exists in real Bundestag as the standard 2nd-reading format. Option C (parallel openings + rebuttal) has no real-world counterpart — it's a simulation convenience.

---

## 4. Oversight events

The sim's oversight coverage is thin relative to the real Bundestag's sprawling oversight system.

| Real event | Volume (per WP) | Sim | Status |
|---|---|---|---|
| Kleine Anfrage (§104 GO-BT, 14-day reply) | ~13,000 | `interpellation_filed` / `_answered` / `_expired` (but rate-capped: max 2 answers/day) | 🟨 **Massively underproduced** (real: ~9 per day!) |
| Große Anfrage (scheduled for plenary debate) | 30–60 | Conflated with Kleine Anfrage as `type: "kleine"` or `"große"` | 🟧 Exists but lacks plenary-debate mechanic |
| **Schriftliche Einzelfrage** (4/month/MdB, 1-week deadline) | **~50,000** | Not modelled | 🟥 **#1 volume miss** |
| Mündliche Frage (Fragestunde, 2/week/MdB) | ~2,000–3,000 | Not modelled | 🟥 Missing |
| Dringlichkeitsfrage (urgent) | Few/yr | Not modelled | 🟥 Missing |
| Petition (Art. 17 GG) | ~50,000 | Not modelled | 🟥 Missing (Bürgerfragen are a sim-only proxy; functionally different) |
| Öffentliche Petition (e-petition, 30,000 quorum) | 20–40 w/ quorum | Not modelled | 🟥 Missing |
| **Untersuchungsausschuss** (25% MdB, 1–4 years!) | 2–6 active | Not modelled | 🟥 **Structurally important miss** |
| Enquete-Kommission (25% MdB, policy-foresight) | 1–3 | Not modelled | 🟥 Missing |
| Wehrbeauftragter Jahresbericht | 1/yr | Not modelled | 🟥 Missing |
| Parlamentarisches Kontrollgremium (intel oversight) | Standing | Not modelled | 🟥 Missing |
| Ausschussanhörung (public hearing) | ~500–800 | Not modelled | 🟥 Missing |
| Zitierrecht (summon ministers) | Ad hoc | Not modelled | 🟥 Missing |
| Motion / Resolution (Antrag / Entschließung) | Numerous | `motion_submitted` / `_passed` / `_rejected` (same-day tally, no committee phase) | 🟧 Exists but skips committee referral |

---

## 5. Election cycle

Macro-cycle correct; micro-stages mostly missing.

| Real event | Timing | Sim | Status |
|---|---|---|---|
| Wahlperiode length | 4 years = 1,461 days | `TERM_DAYS=1461` | 🟩 Exact |
| Festsetzung Wahltermin (Bundespräsident) | 46–48 months into WP | Not modelled; sim just fires on `nextElectionDay` | 🟧 No Bundespräsident role |
| Kandidatenaufstellung (Landeslisten, Wahlkreisversammlungen) | ≥29 weeks pre-election | Not modelled | 🟥 Missing |
| Zulassung der Wahlvorschläge (69th / 58th day pre-election) | Week 10/8 pre-election | Not modelled | 🟥 Missing |
| Wahlkampf | ~6–12 weeks | `ELECTION_CAMPAIGN_DAYS=21` | 🟨 **~3× too short** |
| Briefwahl (postal vote, from ~4 weeks out) | 4 weeks | Not modelled | 🟥 Missing |
| Wahltag | Sunday | `snapToNextSunday()` applied | 🟩 OK |
| Wahlabend (18:00 exit poll → overnight count) | Hours | Compressed into `election_result` | 🟨 No intermediate stages |
| Vorläufiges Ergebnis | ~06:00 Monday morning | Same-day `election_result` | 🟧 No "preliminary" stage |
| Endgültiges Ergebnis (Bundeswahlausschuss) | 2–4 weeks post-election | Not modelled | 🟥 Missing |
| **Konstituierende Sitzung** (≤30 days post-election) | ≤30 days | Not modelled | 🟥 **Missing — formal start of new WP** |
| Präsidentenwahl (Bundestagspräsident) | Constituent session | Not modelled | 🟥 Missing |
| Fraktionsbildung (≥5% or 3 MdB from same party) | Constituent session | `fraktion_formed` / `_dissolved` auto-applied | 🟩 OK (though timing not tied to konstituierende Sitzung) |
| Ältestenrat-Konstituierung | First days | Not modelled | 🟥 Missing |
| Ausschussbildung | Week 2–4 | Not modelled | 🟥 Missing (committees are implicit in `bill_committee` event) |
| 2023 Wahlrecht reform (630 seats, no Überhang/Ausgleichsmandate) | Post-2023 | `TOTAL_SEATS=735` (old rule) | 🟧 **Outdated seat total** |

---

## 6. Government formation

| Real phase | Timing | Sim | Status |
|---|---|---|---|
| Sondierungen (exploratory talks) | Days 1–21 post-election | Not modelled | 🟥 Missing |
| Koalitionsverhandlungen | 4–12 weeks | `negotiation_round` × N in a few sim days | 🟨 **~10–30× too fast** |
| Koalitionsvertrag (signed + party ratification) | ~End of negotiations | `negotiation_complete` (AI synthesis) | 🟧 No party-congress ratification |
| Kanzlerwahl — 1. Wahlgang (absolute majority) | Post-coalition | Not modelled (formation is coalition-only) | 🟥 **No Kanzler election vote** |
| Kanzlerwahl — 2. Phase (14 days, any candidate) | If 1. fails | Not modelled | 🟥 Missing |
| Kanzlerwahl — 3. Phase (relative majority + dissolution option) | If 2. fails | Not modelled | 🟥 Missing |
| Ministerernennung (Kanzler proposes → Bundespräsident) | Post-Kanzlerwahl | `formCabinet()` directly | 🟧 Skips Bundespräsident role |
| Amtseid (oath of office) | After ernennung | Not modelled | 🟥 Missing |
| Erste Regierungserklärung | Weeks 1–4 post-Amtsantritt | Not modelled | 🟥 Missing |
| Parlamentarische Staatssekretäre | Per ministry | Not modelled | 🟥 Missing |

---

## 7. Confidence / oversight against government

Sim has the mechanisms but the rate is wildly out.

| Real event | Historical frequency | Sim | Status |
|---|---|---|---|
| Vertrauensfrage (Art. 68 GG, 48h waiting, Kanzlermehrheit) | **5 total since 1949** (~0.07/yr) | `call_vertrauensfrage` AI action, no rate limit beyond "1/turn + coalition leader" | 🟧 **Likely overproduced** |
| Konstruktives Misstrauensvotum (Art. 67 GG, 25% MdB, 48h, named successor) | **2 attempted, 1 successful since 1949** (~0.03/yr) | `file_misstrauensvotum` AI action, opposition-only, 1/turn | 🟧 Likely overproduced; no 25% quorum check; no 48h waiting period |
| Missbilligungsantrag gegen Minister (political only, no legal effect) | Dozens per WP | Not modelled | 🟥 Missing |
| "Unechte" Vertrauensfrage (Chancellor links substantive vote to confidence) | 3–4 historical | Not modelled | 🟥 Missing |

---

## 8. Budget cycle

Macro-cycle OK (annual); internal phase timing is absent.

| Real phase | Timing | Sim | Status |
|---|---|---|---|
| Eckwertebeschluss | March | Not modelled | 🟥 Missing |
| Ressortverhandlungen | March–June | Not modelled | 🟥 Missing |
| Kabinettsbeschluss Haushaltsentwurf | End June | Not modelled | 🟥 Missing |
| Zuleitung Bundesrat + Bundestag | Simultan (Art. 110 Abs. 3) | `budget_proposed` injected only | 🟧 Only from admin injection |
| 1. Durchgang Bundesrat | ~6 weeks parallel | Not modelled | 🟥 Missing |
| 1. Lesung Bundestag (Haushaltswoche Sept) | 1 week | Not modelled | 🟥 Missing |
| Haushaltsausschuss Beratung | Sept–Nov | Not modelled | 🟥 Missing |
| Berichterstattergespräche | Throughout | Not modelled | 🟥 Missing |
| **Bereinigungssitzung** (marathon ~16h in mid-Nov) | 1 day | Not modelled | 🟥 **Iconic miss** |
| 2./3. Lesung Haushaltswoche (late Nov/early Dec) | Tue–Fri | `budget_passed` / `budget_rejected` (same day) | 🟨 1 day vs 4 days |
| 2. Durchgang Bundesrat | Mid-Dec | Not modelled | 🟥 Missing |
| Ausfertigung + Verkündung | Late Dec / early Jan | Not modelled | 🟥 Missing |
| **Nachtragshaushalt** (supplementary budget) | ~0.5/yr | Not modelled | 🟥 Missing |
| **Vorläufige Haushaltsführung** (Art. 111 GG: only necessary expenditures) | Rare | `provisionalBudget=true` + GDP drag (non-narrow) | 🟧 Rules looser than real Art. 111 (which forbids new spending) |
| Schuldenbremse-Aussetzung (Art. 115 GG, 2/3 majority + repayment plan) | Rare | Not modelled | 🟥 Missing |
| BVerfG-Streichung eines Haushaltsgesetzes | Rare (2023) | Via general `constitutional_challenge` path | 🟩 Covered generically |

---

## 9. Constitutional & judicial events (BVerfG)

Sim has 1 of 11 BVerfG procedure types.

| Real procedure | Standing | Sim | Status |
|---|---|---|---|
| Verfassungsbeschwerde (citizen) | Any person | Not modelled | 🟥 Missing |
| Abstrakte Normenkontrolle | Bundesregierung, Landesregierung, **25% MdB** | `constitutional_challenge_filed` (any Fraktion, no 25% quorum) | 🟧 Wrong quorum; no state-government path |
| Konkrete Normenkontrolle | Any court | Not modelled | 🟥 Missing |
| Organstreitverfahren | Fraktion, MdB | Not modelled | 🟥 Missing |
| Bund-Länder-Streit | Federal vs state governments | Not modelled | 🟥 Missing |
| Einstweilige Anordnung (interim) | Any applicant | Not modelled | 🟥 Missing |
| Parteiverbot | Regierung / Bundestag / Bundesrat | Not modelled | 🟥 Missing |
| Finanzierungsausschluss | Same | Not modelled | 🟥 Missing |
| Wahlprüfungsbeschwerde | Voter | Not modelled | 🟥 Missing (sim has `invalidate_election` injection but no voter-driven path) |
| Präsidentenanklage | Bundestag/Bundesrat 2/3 | Not modelled | 🟥 Missing |
| Richteranklage | Bundestag | Not modelled | 🟥 Missing |
| BVerfG strike-down rate | Rare | 30% per challenge | 🟧 Too frequent |

---

## 10. Other formal events

| Real event | Frequency | Sim | Status |
|---|---|---|---|
| **Bundesversammlung** (Bundespräsident election, every 5 years) | 1/5yr | Not modelled | 🟥 **Missing — 5-year cycle entirely absent** |
| Eidesleistung (Kanzler, Minister, Bundespräsident) | Post-ernennung | Not modelled | 🟥 Missing |
| Verteidigungsfall (Art. 115a, 2/3 majority) | Never | Not modelled | 🟥 Missing |
| Bundeswehr-Auslandseinsatz (Parlamentsbeteiligungsgesetz) | Multiple/yr | Not modelled | 🟥 Missing |
| Gedenkstunden (Holocaust, Tag der Einheit, 17. Juni) | ~4/yr | Not modelled | 🟥 Missing |
| Konstituierende Sitzung new WP | 1 per term | Not modelled | 🟥 Missing |
| Aufhebung der Immunität | Multiple/term | Not modelled | 🟥 Missing |
| Sitzungsausschluss / Ordnungsruf | Ad hoc | Not modelled | 🟥 Missing |
| Ordnungsgeld | Ad hoc | Not modelled | 🟥 Missing |
| Abgeordneten-Gedenken (moment of silence) | As needed | Not modelled | 🟥 Missing |
| State visit address | Ad hoc | Not modelled | 🟥 Missing |

---

## 11. Sim-only extras (evaluate keep/drop)

| Sim event | Real equivalent | Keep? |
|---|---|---|
| `economy_update` (daily drift) | None — real Bundestag doesn't emit economic reports as parliamentary events | 🟦 **Keep** as sim-metric stream; relabel as "economy" not "Bundestag event" |
| `crisis_start` / `crisis_end` (8% daily roll) | Real crises trigger Aktuelle Stunden, Regierungserklärungen, emergency legislation | 🟦 **Keep as driver**, but route into Aktuelle Stunde + Regierungserklärung events |
| `sidejob_scandal` | Real scandals trigger Untersuchungsausschüsse, Missbilligungsanträge, media outrage | 🟦 **Keep as driver**; real consequence would be investigations or Rücktritt |
| `statement` (daily party press release) | Parties do issue press releases, but not structured as Bundestag events | 🟧 **Demote**: not a Bundestag event; move to a `media_articles`-style surface |
| `campaign_statement` / `election_campaign` | Parties DO campaign; this maps onto real Wahlkampf | 🟩 Keep, just extend campaign duration (§5) |
| `member_proposal_accepted` / `_declined` | Sim caucus mechanic; real would be a Fraktionsantrag (≥5% MdB) | 🟦 **Keep**, but require 5% signatories in real-fidelity mode |
| `weekly_report` / `monthly_report` | No real equivalent (real Bundestag doesn't emit periodic reports) | 🟦 Keep as sim summary; label as sim-meta, not Bundestag event |
| `mdb_speech` (user/bot speeches at 2nd/3rd reading) | Real MdB speeches during Aussprache | 🟩 Keep, refine with Berliner Stunde allocation |
| `provisional_budget_started` | Real Art. 111 GG (but narrower rules) | 🟧 Tighten semantics to match Art. 111 |

---

## 12. Dead code / ghost event types

Defined in `SimulationEventType` / `IMPORTANT_EVENTS` but never emitted:

- `bill_debate` — referenced only in NewsFeed filter. **Candidate to populate in debates feature (todo 041).**
- `election_voting` — sim uses `election_result` instead on voting day. Either wire up or remove.
- `referendum` — referendum resolutions piggy-back on `day_start`. Either give referendums their own type or remove declaration.
- `poll` — polls do not emit sim events. Either emit or remove declaration.
- `media` — media stored in its own table. Either emit or remove declaration.

Plus 2 runtime-emitted types (`member_proposal_accepted`, `member_proposal_declined`) that are **not in the declared `SimulationEventType` union** — type-safety drift.

---

## 13. Prioritised remediation plan

Ranked by impact on 1:1 fidelity and research usefulness.

### P0 — Foundational (blocks everything else)

1. **Parliamentary calendar** — Sitzungswochen/Nicht-Sitzungswochen, Sommerpause, Weihnachtspause, Haushaltswoche, weekday semantics. Every existing event must route through `isSessionDay(day)` before firing.
2. **Bill pipeline timing** — committee phase 6–12 weeks, Bundesrat phase 3–6 weeks, Ausfertigung/Verkündung +2–6 weeks. Introduce `bill.stageEntryDay` + per-stage minimum duration.
3. **Konstituierende Sitzung** — formal start of new WP. Block plenary events between election day and konstituierende Sitzung (≤30 days).

### P1 — Major missing events

4. **Bundesrat phase** (Zustimmungsgesetz vs Einspruchsgesetz) + Vermittlungsausschuss. Without this, ~35–40% of bills skip a real legal step.
5. **Kanzlerwahl** (3-phase, Art. 63 GG) — currently government forms instantly after coalition agreement.
6. **Regierungsbefragung** (every Sitzungsmittwoch) + **Fragestunde** (every Sitzungswoche) — weekly cadence.
7. **Aktuelle Stunde** — reactive debate (2–4/month). Natural hook for existing crisis system.
8. **Schriftliche Einzelfrage** — #1 volume event missing (~50,000/WP).
9. **Petitions system** (citizen + öffentliche Petition with 30,000 quorum). Real replacement for sim's "Bürgerfragen".

### P2 — Refine existing (fix wrong semantics/rates)

10. **Presidential veto rate** — drop from 1–6% to ~0.02% per bill; require actual constitutional/formal rationale.
11. **Vertrauensfrage / Misstrauensvotum rarity** — rate-limit to ~0.05/yr each, gate behind structural conditions (failed vote, coalition crisis).
12. **Government-bill fast-track** — REVERSE: government bills should get MORE procedural time (Bundesrat 1. Durchgang), not less.
13. **Seat total 735 → 630** per 2023 Wahlrecht reform; remove Überhang/Ausgleichsmandate logic.
14. **Campaign duration** from 21 days → 42–84 days.
15. **Coalition negotiation duration** from ~3 sim days → 4–12 sim weeks.
16. **Erste Lesung "Überweisung ohne Aussprache"** — skip `bill_first_reading` debate for 60–70% of bills.

### P3 — Structural additions

17. **Untersuchungsausschuss** (25% MdB, 1–4 year duration, court-like powers).
18. **Enquete-Kommission** (25% MdB, 2–4 year duration).
19. **Anhörung** (committee public hearings) — hang off committee phase.
20. **Debate formats**: Kurzintervention, Zwischenfrage, Erklärung zur Abstimmung, Ordnungsruf.
21. **Amtseid**, **Regierungserklärung** after government formation.
22. **Nachtragshaushalt**, **Schuldenbremse-Aussetzung** (Art. 115 GG).

### P4 — Ceremonial / completeness

23. **Bundesversammlung** (Bundespräsident election, 5-year cycle).
24. **Gedenkstunden** (Holocaust-Gedenken, Tag der Einheit, 17. Juni).
25. **Wehrbeauftragter Jahresbericht**, **PKGr**.
26. **Aufhebung der Immunität**, **Sitzungsausschluss**, **Ordnungsruf**.

### Housekeeping

27. **Remove or emit** `bill_debate`, `election_voting`, `referendum`, `poll`, `media` ghost types.
28. **Add** `member_proposal_accepted`/`_declined` to `SimulationEventType` declared union.

---

## 14. Summary table — the brutal count

| Category | Real event count | Sim emits | Sim missing | Sim wrong/wrong-frequency | Sim extras |
|---|---|---|---|---|---|
| Calendar structure | 8 | 1 | 7 | 0 | 0 |
| Legislative cycle | 18 | 12 | 6 | 4 | 0 |
| Debate formats | 13 | 2 | 11 | 1 | 0 |
| Oversight | 14 | 3 | 11 | 2 | 1 (Bürgerfragen) |
| Election cycle | 17 | 5 | 12 | 2 | 0 |
| Government formation | 10 | 3 | 7 | 1 | 0 |
| Confidence/oversight | 4 | 2 | 2 | 2 | 0 |
| Budget cycle | 14 | 4 | 10 | 2 | 0 |
| BVerfG | 11 | 1 | 10 | 1 | 0 |
| Other formal | 11 | 0 | 11 | 0 | 0 |
| Sim-only system | 0 | 6 | 0 | 0 | 6 (economy, crises, sidejobs, statements, reports, discipline) |
| **Total** | **~120** | **42** (+~6 extras = 48) | **~87** | **~15** | **~6** |

**Coverage: ~35–40% of real event repertoire.** Most of what is modelled is **compressed beyond recognition** (5 months of committee work → 1 day).

The sim is currently a **rich but sparse cartoon** of the Bundestag. The skeleton (bills, elections, coalitions, constitutional court) is recognisable; the muscle (calendar structure, oversight volume, debate formats, post-Bundestag legislative steps) is absent.

---

## Next step

If 1:1 fidelity is the standard, the P0 block (calendar + bill timing + konstituierende Sitzung) must land before anything else meaningful can be added. Each subsequent priority group is its own spec + implementation cycle.

The actionable roadmap lives in [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md), which is the starting point for the next brainstorm session.

---

## Related docs

- [`./sim-events.md`](./sim-events.md) — canonical inventory of every event the sim currently emits (42 types + dead code + action types)
- [`./real-events.md`](./real-events.md) — canonical inventory of every procedural event in the real Bundestag (~90 types, with GO-BT/GG citations)
- [`./bundestag-reference.md`](./bundestag-reference.md) — structural reference (bodies and abstract action categories); this gap analysis complements it
- [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) — todo item that drives the gaps into prioritised implementation cycles
- [`../todo/041-debate-visibility.md`](../todo/041-debate-visibility.md) — debates feature, Phase 2 blocked on fidelity work in 043
