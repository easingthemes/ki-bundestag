Run a quick database query against the simulation:
1. Accept the user's question about simulation state
2. Translate it into appropriate SQL queries against `data/simulation.db` or `data/users.db`
3. Run via `sqlite3 -header -column <db-path> "<query>"`
4. Format and explain the results

Common tables: parties, bills, simulation_events, simulation_meta, elections, crises, polls, government, media_articles, budgets, national_state, fraktionen, motions, interpellations, confidence_votes, constitutional_challenges, referendums (simulation.db); users, internal_proposals, notifications, mdbApplications (users.db)