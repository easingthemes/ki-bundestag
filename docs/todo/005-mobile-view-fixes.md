# 005 — Mobile View Broken on Some Pages

**Status:** done
**Severity:** high
**Area:** Web

## Problem

Several pages have layout issues on mobile devices. Need to identify and fix specific breakpoints.

## Known Issues

- Need to screenshot all pages on mobile viewport and identify specific problems
- Tables likely overflow on small screens
- Charts (Highcharts) may not resize properly
- Dashboard grid layout may stack poorly
- PartyDetail has complex multi-column layout

## Investigation Steps

1. Use Chrome DevTools to screenshot each page at 375px width
2. Document specific issues per page
3. Fix responsive breakpoints, table scrolling, chart sizing

## Pages to Check (21 total)

Dashboard, Parties, PartyDetail, Bills, BillDetail, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, Notifications, SimulationLog, Login, About
