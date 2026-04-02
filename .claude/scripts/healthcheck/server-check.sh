#!/bin/bash
# Check if dev servers are listening on their expected ports

echo "=== API server (port 3001) ==="
lsof -i :3001 -sTCP:LISTEN 2>/dev/null | head -3 || echo "Not running"

echo "---"

echo "=== Web server (port 5173) ==="
lsof -i :5173 -sTCP:LISTEN 2>/dev/null | head -3 || echo "Not running"
