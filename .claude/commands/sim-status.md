Check simulation status:
1. Run `sqlite3 data/simulation.db "SELECT * FROM simulation_meta LIMIT 1"`
2. Run `sqlite3 data/simulation.db "SELECT COUNT(*) FROM simulation_events"`
3. Run `sqlite3 data/simulation.db "SELECT timing_preset FROM simulation_meta LIMIT 1"`
4. Summarize: current day, total events, timing preset, any active elections or crises