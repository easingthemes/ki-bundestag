#!/bin/bash
# Database health check — verifies both DBs exist and have expected data

SIM_DB="data/simulation.db"
USER_DB="data/users.db"

echo "=== Simulation DB ==="
if [ -f "$SIM_DB" ]; then
  echo "exists: true"
  echo "parties: $(sqlite3 "$SIM_DB" "SELECT COUNT(*) FROM parties" 2>/dev/null || echo "ERROR")"
  echo "sim_day: $(sqlite3 "$SIM_DB" "SELECT current_day FROM simulation_meta LIMIT 1" 2>/dev/null || echo "ERROR")"
  echo "events: $(sqlite3 "$SIM_DB" "SELECT COUNT(*) FROM simulation_events" 2>/dev/null || echo "ERROR")"
  echo "preset: $(sqlite3 "$SIM_DB" "SELECT timing_preset FROM simulation_meta LIMIT 1" 2>/dev/null || echo "ERROR")"
else
  echo "exists: false"
fi

echo ""
echo "=== Users DB ==="
if [ -f "$USER_DB" ]; then
  echo "exists: true"
  echo "users: $(sqlite3 "$USER_DB" "SELECT COUNT(*) FROM users" 2>/dev/null || echo "ERROR")"
else
  echo "exists: false"
fi
