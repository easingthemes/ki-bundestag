#!/usr/bin/env bash
# Post-deploy — called from deploy.yml SCRIPT_AFTER
set -euo pipefail

cd /opt/ki-bundestag
npm ci --ignore-scripts=false
npm run migrate
pm2 restart ki-api --update-env
echo "Deploy complete."
