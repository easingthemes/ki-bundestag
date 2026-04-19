# Real Bundestag Events — Canonical Inventory

> Generated 2026-04-19 from authoritative sources (bundestag.de, Geschäftsordnung des Deutschen Bundestages (GO-BT), Grundgesetz (GG), Bundeswahlgesetz (BWahlG), Bundesverfassungsgerichtsgesetz (BVerfGG), PUAG, Wikipedia). For the sim-vs-reality fidelity audit. Complements `docs/research/bundestag-reference.md` (which covers bodies and abstract action categories).

## Legend

Each event: **Name (Deutsch)** · *English gloss* · **Trigger** · **Typical timing / duration** · **Actor** · **Source**.

Symbols: `§` = GO-BT paragraph, `Art.` = Grundgesetz article, `Anl.` = Anlage (Annex) to GO-BT, `(⚠ verify)` = fact I was not able to fully confirm from primary source.

---

## 1. Parliamentary calendar structure

The Bundestag year runs in **Sitzungswochen** (sitting weeks) and **sitzungsfreie Wochen** (non-sitting / constituency weeks), fixed annually by the Ältestenrat (Council of Elders) and published as the Sitzungskalender.

- **Sitzungswochen per year**: typically **~20–22** (2026: 21 sitting weeks; Art. 39 Abs. 3 GG guarantees the Bundestag convenes at own initiative). First 2026 week: 12–16 January. Last: 14–18 December.
- **Non-sitzungswochen**: roughly **every other week**, plus recess blocks.
- **Sommerpause** (summer recess): no sitting weeks in August, typically ~7–8 weeks (mid-July to early September). Often broken by a single "Aktuelle Stunde" if a crisis demands.
- **Weihnachtspause** (Christmas recess): ~3–4 weeks (mid-December to mid-January).
- **Haushaltswoche** (budget week): 1 week in Sept (1st reading) + 1 week late-Nov/early-Dec (2nd/3rd reading + Bereinigungssitzung). During Haushaltswoche: no Regierungsbefragung, no Fragestunde, no Aktuelle Stunde, committees paused.

### Typical Sitzungswoche pattern

| Day | Morning | Afternoon |
|---|---|---|
| **Monday** | Non-sitting; travel day, party / Landesgruppen internal | — |
| **Tuesday** | Fraktionsvorstand + Arbeitsgruppen (AGs) | Fraktionssitzung (caucus meeting), each Fraktion separately |
| **Wednesday** | Ausschüsse (committees) meet in parallel | Plenum: **Regierungsbefragung** (~35 min) → **Fragestunde** (≤45 min) → optional Aktuelle Stunde |
| **Thursday** | Plenum: debates, readings, major legislation (primetime ~9:00–~late evening) | Plenum continues |
| **Friday** | Plenum: remaining agenda (often less contentious items, Anträge) | Usually ends ~14:00–16:00 |

Sources: [bundestag.de/sitzungskalender 2026](https://www.bundestag.de/parlament/plenum/sitzungskalender/bt2026-1084980), [bundestag.de Sitzungswoche glossary](https://www.bundestag.de/services/glossar/glossar/S/sitzungswochen-247330).

---

## 2. Legislative cycle (Gesetzgebungsverfahren)

Every step from initiative to Verkündung. Legal basis: **Art. 76–82 GG**, **§§ 75–86 GO-BT**.

### 2.1 Initiative routes (Einbringung) — Art. 76 GG

| Route | Triggered by | Path before Bundestag | Typical delay |
|---|---|---|---|
| **Regierungsvorlage** | Bundesregierung (Cabinet resolution) | First to Bundesrat for **1. Durchgang** (6 weeks, 9 for complex/constitutional) → Gegenäußerung by govt → then Bundestag | +6–9 weeks front-loaded |
| **Gesetzentwurf aus der Mitte des Bundestages** (Fraktionsantrag) | A Fraktion or ≥5% of MdB (§ 76 Abs. 1 GO-BT) | Directly tabled; skips Bundesrat 1. Durchgang (used for urgent govt bills laundered via coalition Fraktionen) | None |
| **Bundesratsinitiative** | Majority of Bundesrat | To Bundesregierung for **3-month Stellungnahme** → Bundestag | +3 months |
| **Volksbegehren** | — | Not applicable at federal level (no direct-democracy GG route) | n/a |

### 2.2 Erste Lesung — § 79 GO-BT

- **Trigger**: automatic after Einbringung; scheduled by Ältestenrat.
- **Aussprache (debate)**: only if arranged by Ältestenrat or demanded by Fraktion / 5% MdB. Otherwise bill moves silently to committee.
- **Outcome**: **Überweisung** to federführender Ausschuss + mitberatende Ausschüsse.
- **Duration**: typically same day (single Plenum slot, 30–60 min debate).

### 2.3 Ausschussphase (committee phase) — §§ 54–74 GO-BT

- **Federführender Ausschuss** (lead committee) steers; **mitberatende Ausschüsse** (co-advisory) submit opinions. 21. WP: 24 standing committees.
- **Berichterstatter** (rapporteurs) from each Fraktion draft positions.
- **Öffentliche Anhörung** (public hearing, § 70 GO-BT): experts and interest groups invited; for contentious bills. Not mandatory.
- **Beschlussempfehlung und Bericht** (recommendation & report, § 66 GO-BT): lead committee delivers written recommendation to Plenum.
- **Duration**: **6–12 weeks** typical for ordinary bills; complex bills (pension, tax, asylum) 3–6 months; fast-track / government urgency 1–2 weeks.

### 2.4 Zweite Lesung — §§ 81–82 GO-BT

- **Aussprache**: default yes. Speaking time per **Berliner Stunde** key (see §3).
- **Änderungsanträge** (amendments): any MdB may table, must be in writing. Voted seriatim.
- **Einzelabstimmung**: by paragraph if requested; else en bloc.
- **Outcome**: bill passes to 3rd reading (usually immediately) or is rejected.
- **Duration**: typically same day as 3. Lesung.

### 2.5 Dritte Lesung — §§ 84–86 GO-BT

- **Aussprache**: only on Fraktion / 5% demand.
- **Amendments**: only from Fraktion / 5% of MdB, only touching 2nd-reading changes.
- **Schlussabstimmung** (final vote): normally Handzeichen / Aufstehen-und-Sitzenbleiben; **Namentliche Abstimmung** (§ 52 GO-BT) if Fraktion or 5% demand it.
- For **constitutional amendments** (Art. 79 Abs. 2 GG): **2/3 majority of all MdB required** (Kanzlermehrheit +).

### 2.6 Bundesrat phase — Art. 77 GG

- Bill forwarded to Bundesrat after Bundestag passage (Art. 77 Abs. 1).
- **Zustimmungsgesetz** (consent-required; explicitly listed in GG, ~35–40% of bills): Bundesrat must approve; rejection kills the bill.
- **Einspruchsgesetz** (objection-only, remainder): Bundesrat may file Einspruch; overridable by Bundestag (simple majority → simple override; 2/3 Bundesrat → 2/3 Bundestag + majority of all MdB).
- **Vermittlungsausschuss** (mediation committee, Art. 77 Abs. 2; 16+16 members): called on dissent. Can be called by Bundesrat within **3 weeks** of receipt. No constitutional deadline for its deliberations.
- **Duration**: Bundesrat 1st pass ~3–6 weeks; mediation 2–8 weeks if invoked.

### 2.7 Ausfertigung und Verkündung — Art. 82 GG

- **Gegenzeichnung** by Bundeskanzler + ressortverantwortlicher Minister.
- **Unterzeichnung durch den Bundespräsidenten** (Federal President signature): formelle + (umstritten) materielle Prüfungskompetenz. Can refuse on formal/constitutional grounds (historically ~8× in 75 years).
- **Verkündung im Bundesgesetzblatt** (promulgation in Federal Law Gazette, Teil I).
- **Inkrafttreten**: per specified date; default = **14 days after Verkündung**.
- **Duration Ausfertigung→Verkündung**: typically 2–6 weeks.

### 2.8 Total timeline

- **Ordinary bill**: **3–9 months** Einbringung → Verkündung.
- **Fast-track (Eilgesetz)**: 1–4 weeks possible (e.g. pandemic Infektionsschutzgesetz amendments).
- **Constitutional amendment**: 6–18 months (two 2/3 majorities + political negotiation).

Sources: [bundestag.de Weg der Gesetzgebung](https://www.bundestag.de/parlament/aufgaben/gesetzgebung_neu/gesetzgebung/weg-255468), [bundesrat.de Verfahren](https://www.bundesrat.de/DE/aufgaben/gesetzgebung/verfahren/verfahren.html), [Art. 76–82 GG](https://www.gesetze-im-internet.de/gg/).

---

## 3. Debate formats

Regulated mostly in **§§ 27–35 GO-BT** and internal Ältestenrat agreements.

| Format | Deutsch | Trigger | Duration | Source |
|---|---|---|---|---|
| **General debate** | Aussprache | Default for most readings / government statements | Total time allocated per **Berliner Stunde** key (scaled to Fraktion size); current 21. WP allocation: CDU/CSU 20′, AfD 14′, SPD 12′, Grüne 8′, Linke 6′ per "hour" | § 35 GO-BT |
| **Short intervention** | Kurzintervention | After another MdB's speech; Präsident grants | ≤2 min (then original speaker gets response right) | § 27a Abs. 2 GO-BT |
| **Interruption question** | Zwischenfrage | During another MdB's speech, with speaker's consent | 1 sentence; speaker keeps floor | § 27 Abs. 2 GO-BT |
| **Interruption remark** | Zwischenbemerkung | Like Zwischenfrage but statement not question | 1 sentence | § 27a Abs. 1 GO-BT |
| **Heckling** | Zwischenruf | Spontaneous; recorded in Protokoll if intelligible | 1 line | Custom; no formal § |
| **Current-affairs hour** | Aktuelle Stunde | Ältestenrat agreement, or Fraktion/5% request, or unsatisfactory Regierungsbefragung answer | ≤60 min; speeches ≤5 min each | § 106 GO-BT + **Anl. 5** |
| **Government statement** | Regierungserklärung | Bundeskanzler / Minister initiative; cannot be compelled by Bundestag | 30–90 min statement + multi-day Aussprache | § 3 GOBReg; GO-BT custom |
| **Government questioning** | Regierungsbefragung | Every sitting Wednesday | ~35 min; 1-min Qs, 1-min As, follow-ups permitted | § 106 GO-BT + **Anl. 7** |
| **Question hour** | Fragestunde | Every sitting week | ≤45 min | **Anl. 4** GO-BT |
| **Declaration on vote** | Erklärung zur Abstimmung | Individual MdB before/after namentliche Abstimmung | ≤5 min, written preferred | § 31 GO-BT |
| **Procedural motion** | Geschäftsordnungsantrag | Any MdB during session | 1 speaker for / 1 against, ≤5 min | § 29 GO-BT |
| **Personal statement** | Persönliche Erklärung | Attacked MdB responds | ≤5 min, after agenda item | § 30 GO-BT |
| **Order call** | Ordnungsruf / Ruf zur Sache | President enforces order | Immediate; escalates to Wortentzug / Sitzungsausschluss up to 30 sessions | §§ 36–39 GO-BT |

Sources: [§ 106 GO-BT](https://www.buzer.de/gesetz/3966/a55080.htm), [bundestag.de Berliner Stunde](https://www.bundestag.de/services/glossar/glossar/B/berliner-stunde-854942), [mitmischen Redezeit](https://www.mitmischen.de/wissen/lexikon/r/redezeit).

---

## 4. Oversight events

### 4.1 Parliamentary questions

| Event | Actor | Trigger | Govt response deadline | Source |
|---|---|---|---|---|
| **Kleine Anfrage** *(minor interpellation, written)* | Fraktion or 5% MdB | Any time | **14 days** (extendable) | § 75 Abs. 3 + **§ 104 GO-BT** |
| **Große Anfrage** *(major interpellation)* | Fraktion or 5% MdB | Any time | No fixed deadline; scheduled for plenary debate | **§§ 100–103 GO-BT** |
| **Schriftliche Einzelfrage** *(written individual question)* | Any MdB | Up to **4/month/MdB** | **1 week** from receipt in Kanzleramt | **Anl. 4 Nr. 12–14 GO-BT** |
| **Mündliche Frage** *(oral question)* | Any MdB | ≤2/Sitzungswoche/MdB; deadline Fri 10:00 (Präs) / 12:00 (Regierung) | Oral at Fragestunde; ≤2 follow-ups | **Anl. 4 GO-BT** |
| **Dringlichkeitsfrage** *(urgent question)* | Any MdB | Submitted by Mon 12:00 for same Sitzungswoche | Fragestunde same week | **Anl. 4 Nr. 10 GO-BT** |

### 4.2 Committee-driven oversight

| Event | Trigger | Notes | Source |
|---|---|---|---|
| **Ausschussanhörung** *(committee hearing)* | Committee decision | Experts + interest groups; public or non-public | § 70 GO-BT |
| **Akteneinsichtsrecht** *(right to inspect files)* | Committee | Government must produce files with narrow exceptions | Art. 43 Abs. 1 GG |
| **Zitierrecht** *(right to summon ministers)* | Any committee | Minister must appear in person | Art. 43 Abs. 1 GG |
| **Petitionsausschuss: Petition** | Any person | Any citizen; Art. 17 GG guarantees right | Art. 17 GG; § 108 GO-BT |
| **Öffentliche Petition** *(public e-petition)* | Petent via epetitionen.bundestag.de | Mitzeichnungsfrist **6 weeks**, quorum **30,000** signatures → public committee hearing (since 1.7.2024) | Petitionsausschuss Verfahrensgrundsätze |
| **Untersuchungsausschuss** *(investigation committee)* | **25% of MdB** (qualified minority) | Mandatory establishment; powers ≈ court (summon, oath, seize); typically 1–4 years duration | **Art. 44 GG + PUAG (2001)** |
| **Enquete-Kommission** *(inquiry commission)* | **25% of MdB** | Policy-foresight commission with MdB + external experts; 2–4 years typical | **§ 56 GO-BT** |
| **Wehrbeauftragter Bericht** *(Armed Forces Commissioner annual report)* | Automatic | Annual report on Bundeswehr; plenary debate | Art. 45b GG |
| **Parlamentarisches Kontrollgremium** *(intel oversight panel)* | Standing body | Oversees BND, BfV, MAD; classified sessions | Art. 45d GG; PKGrG |

Sources: [§ 104 GO-BT](https://www.buzer.de/104_GO-BT.htm), [Anl. 4 GO-BT](https://www.buzer.de/Anlage_4_GO-BT.htm), [Wikipedia Untersuchungsausschuss](https://de.wikipedia.org/wiki/Untersuchungsausschuss), [PUAG](https://www.gesetze-im-internet.de/puag/), [Petitionsquorum](https://www.bundestag.de/dokumente/textarchiv/2024/kw26-pa-petitionen-quorum-1010108).

---

## 5. Election cycle (Bundestagswahl)

Legal basis: **Art. 38, 39 GG + BWahlG**.

| Event | Timing | Actor | Source |
|---|---|---|---|
| **Wahlperiode** *(term length)* | 4 years from konstituierende Sitzung | — | Art. 39 Abs. 1 GG |
| **Festsetzung des Wahltermins** | By Bundespräsident on Bundesregierung proposal | Between **46 and 48 months** after start of Wahlperiode (normal case) | § 16 BWahlG |
| **Vorgezogene Neuwahl** *(snap election)* | Within **60 days** of Bundestag dissolution | Art. 68 GG (post-Vertrauensfrage) or Art. 63 Abs. 4 (post-failed Kanzlerwahl) | Art. 39 Abs. 1 GG |
| **Kandidatenaufstellung** *(candidate nomination)* | Parties hold Landeslisten-Parteitage + Wahlkreis-Versammlungen; ≥29 weeks pre-election (abridgeable by § 52 BWahlG Abs. 3 for snap elections) | Parties | §§ 18, 21, 27 BWahlG |
| **Zulassung der Wahlvorschläge** | **69th day** pre-election (Bundeswahlausschuss); **58th day** (Landeswahlausschüsse) | Wahlausschüsse | §§ 26, 28 BWahlG |
| **Wahlkampf** | Final ~6–12 weeks | Parties, candidates | — |
| **Briefwahl** *(postal vote)* | From ~4 weeks pre-election | Voters | BWO |
| **Wahltag** *(election day)* | Sunday | Voters | Art. 39 GG, tradition |
| **Wahlabend** *(election night)* | 18:00 exit poll → overnight count | ARD/ZDF, Bundeswahlleiterin | — |
| **Vorläufiges Ergebnis** | ~03:00–06:00 Monday | Bundeswahlleiterin | § 37 BWahlG |
| **Endgültiges Ergebnis** | ~2–4 weeks post-election | Bundeswahlausschuss | § 42 BWahlG |
| **Konstituierende Sitzung** *(constituent session)* | **≤30 days** post-election (Art. 39 Abs. 2 GG) | Ends old Wahlperiode, starts new | Art. 39 GG |
| **Präsidentenwahl** *(speaker election)* | Constituent session | Largest Fraktion's candidate by convention | § 2 GO-BT |
| **Fraktionsbildung** | Constituent session / first weeks | ≥5% MdB or 3 MdB from single party | § 10 GO-BT |
| **Ältestenrat-Konstituierung** | First days | President + Vice Presidents + 23 more | § 6 GO-BT |
| **Ausschussbildung** | Typically week 2–4 post-constitution | Plenum resolution; Fraktionen negotiate chairs | § 54 GO-BT |
| **Überhang-/Ausgleichsmandate** | After 2023 reform: **eliminated**; 630-seat cap, 2nd-vote-pure | Regelmandate via Zweitstimmendeckung | BWahlG 2023 reform |

Sources: [bundeswahlleiterin.de](https://www.bundeswahlleiterin.de/), [Art. 39 GG](https://www.gesetze-im-internet.de/gg/art_39.html), [konstituierende Sitzung](https://www.bundestag.de/services/glossar/glossar/K/konst_sitz-245634).

---

## 6. Government formation

Legal basis: **Art. 62–66 GG**.

### 6.1 Kanzlerwahl — Art. 63 GG (3 phases)

| Phase | Trigger | Required majority | Outcome | Timing |
|---|---|---|---|---|
| **1. Wahlgang** | Bundespräsident proposes candidate; vote **without debate, secret** | **Kanzlermehrheit** (absolute majority of all MdB, currently ≥316 of 630) | Election → Ernennung mandatory | Usually 1–8 weeks post-election; 2021: 3 weeks; 2025: 2 weeks |
| **2. Phase** | If 1st fails: Bundestag has **14 days** to self-nominate; unlimited Wahlgänge | Kanzlermehrheit | Election → Ernennung mandatory | Historically never used |
| **3. Phase** | After 14 days without success: **"unverzüglich"** new Wahlgang | Relative majority | Bundespräsident chooses: Ernennung OR Bundestagsauflösung | Historically never reached |

### 6.2 Post-election cabinet formation

| Event | Timing | Actor | Source |
|---|---|---|---|
| **Sondierungen** *(exploratory talks)* | Days 1–21 post-election | Party leaderships | Convention |
| **Koalitionsverhandlungen** *(coalition negotiations)* | Weeks 2–12 post-election; typically **4–12 weeks** | Party negotiating teams | Convention |
| **Koalitionsvertrag** *(coalition agreement)* | Signed end of negotiations; ratified by party congresses / member ballots | Parties | No legal force |
| **Ministerernennung** | After Kanzlerwahl; Kanzler proposes → Bundespräsident ernennt | Art. 64 Abs. 1 GG |
| **Amtseid** *(oath of office)* | Kanzler + ministers sworn in before Bundestag | Art. 56 + 64 Abs. 2 GG |
| **Erste Regierungserklärung** | Usually weeks 1–4 after Amtsantritt; multi-day Aussprache | Bundeskanzler | Convention |
| **Ressortzuschnitt** *(ministerial portfolios)* | Determined in coalition agreement | Kanzler | Art. 65 GG (Organisationsgewalt) |
| **Parlamentarische Staatssekretäre** | Appointed per Ministry | ParlStG | |

Sources: [Art. 63 GG](https://www.gesetze-im-internet.de/gg/art_63.html), [bundeskanzler.de](https://www.bundeskanzler.de/).

---

## 7. Government oversight & confidence

| Event | Deutsch | Legal basis | Trigger | Majority / rules | Outcome if triggered | Historical count |
|---|---|---|---|---|---|---|
| **Vote of confidence** | Vertrauensfrage | **Art. 68 GG** | **Bundeskanzler** files motion; earliest vote 48h later | Kanzlermehrheit (absolute majority of all MdB) | If lost: Kanzler may request Bundespräsident dissolve Bundestag within 21 days (→ snap election within 60 days) unless a new Kanzler is elected | 5 (Brandt 1972, Schmidt 1982, Kohl 1982, Schröder 2001/2005, Scholz 2024) |
| **Constructive vote of no confidence** | Konstruktives Misstrauensvotum | **Art. 67 GG** | **25% of MdB** table motion with named successor; **48h waiting period** | Kanzlermehrheit for successor | Immediate Chancellor replacement | 2 attempted, 1 successful (Barzel v. Brandt 1972 failed; Kohl v. Schmidt 1982 succeeded) |
| **Motion of censure against minister** | Missbilligungsantrag / Misstrauensantrag | Custom (no GG basis) | Fraktion / 5% MdB | Simple majority | **Political only** — no legal effect; minister may remain | Dozens; no successful removal |
| **"Unechte" Vertrauensfrage** | Linked vote | Art. 68 GG via jurisprudence | Chancellor links substantive vote to confidence | Kanzlermehrheit | Same as Vertrauensfrage, often used strategically to force dissolution | Brandt 1972, Kohl 1982, Schröder 2005 |

Sources: [Art. 67 GG](https://www.gesetze-im-internet.de/gg/art_67.html), [Art. 68 GG](https://dejure.org/gesetze/GG/68.html), [Wikipedia Vertrauensfrage](https://de.wikipedia.org/wiki/Vertrauensfrage).

---

## 8. Budget cycle (Haushaltsverfahren)

Annual cycle. Legal basis: **Art. 110–115 GG + BHO**. Calendar below assumes a typical year.

| Phase | Deutsch | Timing | Actor | Notes |
|---|---|---|---|---|
| **Eckwertebeschluss** *(key figures)* | März (ca. mid-March) | Bundeskabinett | BMF-drafted frame for ministry ceilings |
| **Ressortverhandlungen** *(ministry negotiations)* | März–Juni | BMF ↔ ministries | Bilateral on each Einzelplan |
| **Kabinettsbeschluss Haushaltsentwurf** | Ende Juni / Anfang Juli | Bundesregierung | Draft bill + Finanzplan (5-year) |
| **Zuleitung an Bundesrat + Bundestag** | Simultan (Art. 110 Abs. 3 GG) | Bundesregierung | Exception to Art. 76 Abs. 2 |
| **1. Durchgang Bundesrat** | ~6 Wochen parallel | Bundesrat | Stellungnahme |
| **1. Lesung Bundestag** | 1. Sitzungswoche September | Plenum | Multi-day Generaldebatte + Einzelpläne; Kanzleretat (Einzelplan 04) = day 2 afternoon Generalaussprache (~4h) |
| **Beratung im Haushaltsausschuss** | Sept–Nov | Haushaltsausschuss (~50 MdB) | Berichterstattergespräche per Einzelplan |
| **Bereinigungssitzung** *(reconciliation session)* | 2nd week Nov (Thursday afternoon → Friday morning) | Haushaltsausschuss | Marathon ~16h session; Allgemeine Finanzverwaltung + Bundesschuld last |
| **2. und 3. Lesung Bundestag (Haushaltswoche)** | Late Nov / early Dec (4 days, Tue–Fri) | Plenum | Einzelplan-by-Einzelplan debates (~1.5h each); Mi: 4h Kanzleretat Generalaussprache; Namentliche Abstimmung on Gesamtplan Friday |
| **2. Durchgang Bundesrat** | Mitte Dezember | Bundesrat | Zustimmungsgesetz (Einspruch überwindbar) |
| **Ausfertigung + Verkündung** | Late Dec / early Jan | Bundespräsident → BGBl | Typically in force 1 Jan |

### Budget exceptions / failures

| Event | Deutsch | Trigger | Rule | Source |
|---|---|---|---|---|
| **Supplementary budget** | Nachtragshaushalt | In-year needs | Same procedure as Haushalt; typically 1–2× per term | BHO § 33 |
| **Provisional budget management** | Vorläufige Haushaltsführung | No budget in force by 1 Jan | Art. 111 GG permits only necessary expenditures (maintaining institutions, legal obligations, continuing approved works); no new spending | **Art. 111 GG** |
| **Debt brake suspension** | Aussetzung Schuldenbremse | Natural disaster / exceptional emergency | 2/3 Bundestag + repayment plan | **Art. 115 GG** |
| **BVerfG-Streichung** | Court void of budget law | Constitutional challenge | E.g. 2. Nachtragshaushaltsgesetz 2021 struck 15.11.2023 | BVerfGG |

Sources: [bundestag.de Haushaltswoche 2024](https://www.bundestag.de/dokumente/textarchiv/2023/kw32-erklaerstueck-haushaltswoche-957590), [Art. 111 GG](https://www.gesetze-im-internet.de/gg/art_111.html).

---

## 9. Constitutional & judicial events (Bundesverfassungsgericht)

Legal basis: **Art. 93, 94, 100 GG + BVerfGG**. Court: 16 judges in 2 Senats (8 each), Karlsruhe.

| Procedure | Deutsch | Standing | Trigger | Timing | Source |
|---|---|---|---|---|---|
| **Constitutional complaint** | Verfassungsbeschwerde | Any person violated in Grundrechte after exhausting ordinary remedies | 1 month post-final ruling | ~96% of caseload; decided 6 months–5 years | Art. 93 Abs. 1 Nr. 4a GG; § 90 BVerfGG |
| **Abstract norm control** | Abstrakte Normenkontrolle | Bundesregierung, Landesregierung, **25% MdB** (recently lowered from 1/3) | Any time after law promulgated | 1–3 years typical | Art. 93 Abs. 1 Nr. 2 GG; § 76 BVerfGG |
| **Concrete norm control** | Konkrete Normenkontrolle | Any court if it deems law unconstitutional | Pending case | 1–3 years | Art. 100 Abs. 1 GG |
| **Organ dispute** | Organstreitverfahren | Supreme federal organs / parts (Fraktion, MdB) | Rights dispute under GG | 6 months–2 years | Art. 93 Abs. 1 Nr. 1 GG |
| **Federation-States dispute** | Bund-Länder-Streit | Bundesregierung vs Landesregierung (and v.v.) | Competence dispute | 1–2 years | Art. 93 Abs. 1 Nr. 3 GG |
| **Interim injunction** | Einstweilige Anordnung | Any applicant in any procedure | Urgent constitutional matter | Days–weeks | § 32 BVerfGG |
| **Party ban** | Parteiverbot | Bundesregierung / Bundestag / Bundesrat | Demonstrable anti-constitutional aims | Years | Art. 21 Abs. 2 GG |
| **Party financing exclusion** | Finanzierungsausschluss | Same as Parteiverbot | Lower bar than ban | — | Art. 21 Abs. 3 GG (2017) |
| **Election review complaint** | Wahlprüfungsbeschwerde | Any voter after Bundestag Wahlprüfung | Post-election | ~1 year | Art. 41 GG |
| **Impeachment Bundespräsident** | Präsidentenanklage | Bundestag or Bundesrat (2/3) | Willful GG violation | Never used | Art. 61 GG |
| **Judges impeachment** | Richteranklage | Bundestag | Against federal judge | Never used | Art. 98 Abs. 2 GG |

Sources: [bundesverfassungsgericht.de Verfahrensarten](https://www.bundesverfassungsgericht.de/DE/DasBundesverfassungsgericht/Verfahrensarten/verfahrensarten_node.html).

---

## 10. Other formal events

| Event | Deutsch | Trigger / timing | Actor | Source |
|---|---|---|---|---|
| **Federal President election** | Bundesversammlung | Every 5 years (≤30 days before term end) | = all MdB + equal # state delegates | **Art. 54 GG** |
| **President oath** | Eidesleistung Bundespräsident | After election | Before Bundestag + Bundesrat joint session | Art. 56 GG |
| **Chancellor + Minister oath** | Eidesleistung Kanzler / Minister | After Ernennung | Before Bundestag | Art. 56 + 64 Abs. 2 GG |
| **State of defence declaration** | Verteidigungsfall | 2/3 of MdB (+ maj. of all MdB) + Bundesrat consent | Bundestag + Bundesrat, or Joint Committee | **Art. 115a GG** |
| **Bundeswehr deployment** | Auslandseinsatz | Simple majority; per AWG 2005 | Plenum | Parlamentsbeteiligungsgesetz |
| **Parliamentary holidays / ceremonies** | — | 3. Oktober (Tag der Deutschen Einheit), 27. Januar (Holocaust-Gedenken), 17. Juni (Berliner Aufstand), 8. Mai (Kriegsende) | Plenum special sessions | Custom |
| **Gedenkstunde für die Opfer des Nationalsozialismus** | Solemn hour | 27. Januar annually since 1996 | Plenum | Bundestagsbeschluss |
| **Opening of new legislative period** | Eröffnung neue Wahlperiode | Alterspräsident*in or Präsidentin opens konstituierende Sitzung | Präsidentin | § 1 GO-BT |
| **President's farewell** | Verabschiedung Bundestagspräsident | End of Wahlperiode | Plenum | Custom |
| **Sternmarsch / Festakte** | State visits, address by foreign leader | Ad-hoc | Plenum or special sitting | Custom |
| **Abgeordneten-Gedenken** | Moment of silence for deceased member | As needed | Präsidentin at session start | § 22 GO-BT |
| **Ehrenvoller Empfang** | Ceremonial reception | Visiting heads of state | Plenum | Custom |
| **Suspension of immunity** | Aufhebung der Immunität | Prosecutor's request | Plenum (Geschäftsordnungsausschuss prep) | Art. 46 GG; Anl. 6 GO-BT |
| **Indemnität** | MdB civil/criminal immunity | For statements in plenum | — | Art. 46 Abs. 1 GG |
| **Sitzungsausschluss** | MP exclusion from sittings | Serious disorder | President up to 30 sittings | § 38 GO-BT |
| **Ordnungsgeld** | Fine | Disorder / unexcused absence | Präsidium | § 37 GO-BT; AbgG |

Sources: [Art. 54 GG](https://www.gesetze-im-internet.de/gg/art_54.html), [bundestag.de Bundesversammlung](https://www.bundestag.de/bundesversammlung).

---

## 11. Frequency summary (based on 19. & 20. Wahlperiode data)

| Event | Per sitting month | Per year | Per 4-year Wahlperiode |
|---|---|---|---|
| **Sitzungswochen** | ~2 | ~20–22 | ~80–88 |
| **Plenarsitzungen** | ~6–8 | ~60–70 | ~240–260 |
| **Gesetzesbeschlüsse** | ~10–15 | ~100–150 | **~500–600** (20. WP: 555) |
| **Namentliche Abstimmungen** | ~5–10 | ~50–100 | ~300–400 |
| **Kleine Anfragen** | ~100–200 | ~1500–3000 | **~10,000–15,000** (20. WP: >13,000) |
| **Große Anfragen** | <1 | ~5–15 | ~30–60 |
| **Schriftliche Fragen** | ~1000 | ~12,000 | **~50,000** |
| **Mündliche Fragen (Fragestunde)** | ~50–100 | ~500–800 | ~2000–3000 |
| **Aktuelle Stunden** | ~2–4 | ~20–40 | ~100–150 |
| **Regierungsbefragungen** | ~2 (every Sitzungsmittwoch) | ~20 | ~80 |
| **Regierungserklärungen** | ~0.5 | ~5–8 | ~25–35 |
| **Ausschuss-Anhörungen** | ~10–20 | ~100–200 | ~500–800 |
| **Petitionen (eingereicht)** | ~1200 | ~13,000–15,000 | ~50,000–60,000 |
| **Öffentliche E-Petitionen mit Quorum** | ~0.3–1 | ~5–12 | ~20–40 |
| **Untersuchungsausschüsse** | — | 0–2 new | **2–6 active** across term |
| **Enquete-Kommissionen** | — | 0–1 new | 1–3 |
| **Vertrauensfragen** | — | rare | **0–1 per term**, ~5 total since 1949 |
| **Misstrauensvoten** | — | rare | **0–1 per term**, 2 total since 1949 |
| **BVerfG-Organstreitverfahren (von Bundestagsorganen)** | — | ~3–10 | ~15–40 |
| **Gesetze vor BVerfG geprüft (abstrakte NK)** | — | ~2–5 new | ~10–20 |
| **Haushaltsentwürfe** | — | 1 + ~0.5 Nachtragshaushalt | ~4 + 1–3 Nachträge |
| **Bundespräsidentenwahl** | — | 0 (every 5 years) | ~1 |
| **Bundestagswahl (constitutive cycle)** | — | 0 (every 4 years) | **1** |

Numbers for 20. WP (2021–2025) from Parlamentsstatistik / Datenhandbuch. 21. WP started 25.3.2025; projections scaled.

---

## Source directory

**Primary law:**
- [Grundgesetz (GG)](https://www.gesetze-im-internet.de/gg/)
- [Geschäftsordnung des Deutschen Bundestages (GO-BT)](https://www.bundestag.de/parlament/aufgaben/rechtsgrundlagen/go_btg)
- [Bundeswahlgesetz (BWahlG)](https://www.gesetze-im-internet.de/bwahlg/)
- [Bundesverfassungsgerichtsgesetz (BVerfGG)](https://www.gesetze-im-internet.de/bverfgg/)
- [Untersuchungsausschussgesetz (PUAG)](https://www.gesetze-im-internet.de/puag/)
- [Bundeshaushaltsordnung (BHO)](https://www.gesetze-im-internet.de/bho/)

**Bundestag reference:**
- [Sitzungskalender 2026](https://www.bundestag.de/parlament/plenum/sitzungskalender/bt2026-1084980)
- [Weg der Gesetzgebung](https://www.bundestag.de/parlament/aufgaben/gesetzgebung_neu/gesetzgebung/weg-255468)
- [Datenhandbuch (DHB)](https://www.bundestag.de/dokumente/parlamentsarchiv/datenhandbuch) — statistics per Wahlperiode
- [Berliner Stunde](https://www.bundestag.de/services/glossar/glossar/B/berliner-stunde-854942)
- [Parlamentsbegriffe A–Z](https://www.bundestag.de/services/glossar)

**Buzer GO-BT paragraph index:**
- [§ 104 GO-BT Kleine Anfragen](https://www.buzer.de/104_GO-BT.htm)
- [§ 106 GO-BT Aktuelle Stunde / Regierungsbefragung](https://www.buzer.de/gesetz/3966/a55080.htm)
- [Anl. 4 GO-BT Fragestunde](https://www.buzer.de/Anlage_4_GO-BT.htm)

**Bundesrat:**
- [Ablauf des Gesetzgebungsverfahrens](https://www.bundesrat.de/DE/aufgaben/gesetzgebung/verfahren/verfahren.html)
- [Vermittlungsausschuss](https://www.vermittlungsausschuss.de/)

**Bundesverfassungsgericht:**
- [Verfahrensarten Übersicht](https://www.bundesverfassungsgericht.de/DE/DasBundesverfassungsgericht/Verfahrensarten/verfahrensarten_node.html)

**Wahl:**
- [Bundeswahlleiterin](https://www.bundeswahlleiterin.de/)
