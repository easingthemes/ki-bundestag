#!/usr/bin/env bash
# Post-deploy — called from deploy.yml SCRIPT_AFTER
set -euo pipefail

cd /opt/ki-bundestag
npm ci --ignore-scripts=false
npm run migrate
pm2 restart ki-api --update-env

# ki-bot: persistent bot activity loop (runner-bot.ts). Start on first deploy, restart on subsequent ones.
if pm2 describe ki-bot >/dev/null 2>&1; then
  pm2 restart ki-bot --update-env
else
  pm2 start npx --name ki-bot -- tsx scripts/runner-bot.ts
fi
# ki-simulate: long-running simulation loop (runner-auto.ts), started via the
# Simulation workflow. Must be restarted on deploy — tsx loads source at process
# start, so without a restart it keeps running pre-deploy code indefinitely.
if pm2 describe ki-simulate >/dev/null 2>&1; then
  pm2 restart ki-simulate --update-env
fi
pm2 save

echo "Deploy complete."
