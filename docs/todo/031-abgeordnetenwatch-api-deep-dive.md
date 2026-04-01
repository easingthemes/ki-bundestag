# 031 — Explore abgeordnetenwatch API for deeper integration

**Status**: done
**Area**: Engine / Agent
**Priority**: Low

## Description

The [abgeordnetenwatch.de API](https://www.abgeordnetenwatch.de/api) provides rich, structured data about the German Bundestag that could significantly improve simulation realism. Currently we only fetch recent polls (`/api/v2/polls`). The API offers much more.

## Current Usage

- `packages/engine/src/simulation/knowledge-fetch.ts` fetches `/api/v2/polls` with a parliament period filter
- Used as part of weekly real-world knowledge grounding (alongside tagesschau, WELT RSS, DIP API)
- Results are digested by AI into landscape/party_position/shock/headline categories

## API Endpoints to Investigate

Based on their [API documentation](https://www.abgeordnetenwatch.de/api):

| Endpoint | Potential Use |
|----------|--------------|
| `/api/v2/politicians` | Real MdB names, photos, party affiliations — could seed more realistic Bundestag seats |
| `/api/v2/votes` | Individual politician voting records — ground truth for party discipline modeling |
| `/api/v2/polls` | Already used — Bundestag polls/votes with results |
| `/api/v2/candidacies-mandates` | Current mandate holders — who's actually in parliament |
| `/api/v2/parliament-periods` | Discover correct period IDs dynamically instead of hardcoding |
| `/api/v2/committees` | Real committee names and membership — improve committee simulation |
| `/api/v2/sidejobs` | Politician side jobs — could feed media article generation |
| `/api/v2/questions` | Citizen questions to politicians — model for our citizen questions feature |

## Ideas

1. **Dynamic parliament period discovery**: Query `/api/v2/parliament-periods` to find the current period instead of hardcoding IDs (currently 132/165 with fallback)
2. **Voting pattern grounding**: Use real vote data to calibrate party alignment scores and coalition dynamics
3. **Committee realism**: Map real Bundestag committees to simulation committees
4. **Richer knowledge digest**: Feed more structured parliamentary data into the AI briefing
5. **Politician profiles**: Use real politician data for more realistic MdB seat generation

## Notes

- API has rate limits — respect them (current: 15s timeout, 7-day cooldown between fetches)
- Some endpoints may require authentication or have access restrictions
- The API returned 500 for `parliament_period=132` (20th Bundestag) — we now try 165 (21st) first with fallback
