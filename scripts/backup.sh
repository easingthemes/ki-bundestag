#!/usr/bin/env bash
# Pre-deploy database backup — called from deploy.yml SCRIPT_BEFORE
set -euo pipefail

cd /opt/ki-bundestag
BACKUP_DIR="/opt/backups/ki-bundestag/pre-deploy"
mkdir -p "$BACKUP_DIR"

for db in data/*.db; do
  [ -f "$db" ] || continue
  name=$(basename "$db")
  sqlite3 "$db" ".backup '$BACKUP_DIR/$name'" 2>/dev/null || true
done

echo "Backup complete."
