# Hosting Plan — KI Bundestag

## App Profile

| Aspect | Detail |
|--------|--------|
| **Frontend** | Static SPA (React 19 + Vite) — ~2 MB built assets |
| **Backend** | Express REST API (Node.js, single-threaded) |
| **Database** | 2 x SQLite files (`simulation.db`, `users.db`) — WAL mode |
| **Background job** | `simulate:auto` — continuous loop making AI calls |
| **External APIs** | Anthropic (Claude Haiku/Sonnet), XAI (Grok) |
| **Auth** | Token-based, no OAuth/session store |
| **File uploads** | None |
| **Resource usage** | CPU-light, I/O-bound; ~512 MB RAM sufficient |

## Recommendation: Single VPS (Hetzner Cloud)

A single small VPS is the best fit because:

1. **SQLite needs local disk** — rules out serverless and most PaaS
2. **The simulation runner is a long-lived process** — rules out function-as-a-service
3. **Traffic is low** — no need for horizontal scaling
4. **Simplicity** — one machine, one deploy, one backup target

### Suggested Spec

| Provider | Plan | vCPU | RAM | Disk | Monthly Cost |
|----------|------|------|-----|------|-------------|
| **Hetzner Cloud** | CX22 | 2 | 4 GB | 40 GB | ~€4.35 |
| DigitalOcean | Basic | 2 | 2 GB | 50 GB | $12 |
| Fly.io | shared-cpu-2x | 2 | 1 GB | 3 GB vol | ~$10 |

**Hetzner CX22 is the clear winner** — cheapest, EU-based (good for a German parliament app), and more than enough resources.

### Production Architecture (Single VPS)

```
┌─────────────────────────────────────────────┐
│  Hetzner CX22 (Ubuntu 24.04)               │
│                                              │
│  ┌──────────┐    ┌─────────────────────┐    │
│  │  Caddy    │───▶│  Express API (:3001) │    │
│  │  (:443)   │    │  (PM2 managed)       │    │
│  │           │    └─────────────────────┘    │
│  │  /api/*   │──▶  proxy to :3001            │
│  │  /*       │──▶  static files (web/dist)   │
│  └──────────┘                                │
│                                              │
│  ┌─────────────────────┐  ┌──────────────┐  │
│  │  simulate:auto      │  │  SQLite DBs  │  │
│  │  (PM2 managed)      │  │  data/*.db   │  │
│  └─────────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────┘
```

**Caddy** handles HTTPS (auto Let's Encrypt), reverse proxy, and static file serving. **PM2** manages the API server and simulation runner as separate processes with auto-restart.

---

## Setup Steps

### 1. Server Provisioning

```bash
# On Hetzner Cloud console: create CX22, Ubuntu 24.04, SSH key
# DNS: point ki-bundestag.de (or subdomain) → server IP

ssh root@<server-ip>
apt update && apt upgrade -y
apt install -y caddy sqlite3

# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

### 2. App Deployment

```bash
# Clone and build
git clone https://github.com/easingthemes/ki-bundestag.git /opt/ki-bundestag
cd /opt/ki-bundestag
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, XAI_API_KEY

npm install
npm run build
npm run migrate   # initialize DB schema
npm run seed      # seed initial data (first deploy only)
```

### 3. Process Management (PM2)

```bash
# Start API server
pm2 start packages/api/dist/index.js --name ki-api \
  --env production \
  --max-memory-restart 500M

# Start simulation runner (optional — only if auto-sim desired)
pm2 start node --name ki-sim -- \
  --import tsx packages/engine/src/runner-auto.ts

# Save and enable on boot
pm2 save
pm2 startup
```

### 4. Reverse Proxy (Caddy)

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
ki-bundestag.de {
    # API reverse proxy
    handle /api/* {
        reverse_proxy localhost:3001
    }

    # SPA static files with fallback
    handle {
        root * /opt/ki-bundestag/packages/web/dist
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
EOF

systemctl reload caddy
```

### 5. Backups

```bash
# Daily SQLite backup via cron (safe hot backup with .backup command)
cat > /opt/ki-bundestag/backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/backups/ki-bundestag/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"
sqlite3 /opt/ki-bundestag/data/simulation.db ".backup '$BACKUP_DIR/simulation.db'"
sqlite3 /opt/ki-bundestag/data/users.db ".backup '$BACKUP_DIR/users.db'"
# Keep last 14 days
find /opt/backups/ki-bundestag -maxdepth 1 -mtime +14 -exec rm -rf {} +
SCRIPT
chmod +x /opt/ki-bundestag/backup.sh

# Run daily at 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/ki-bundestag/backup.sh") | crontab -
```

### 6. Deployment Updates

```bash
# Simple pull-and-restart deploy script
cat > /opt/ki-bundestag/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e
cd /opt/ki-bundestag
git pull origin main
npm install
npm run build
npm run migrate
pm2 restart ki-api
# Optionally restart sim: pm2 restart ki-sim
SCRIPT
chmod +x /opt/ki-bundestag/deploy.sh
```

---

## Alternative Options Considered

### Option B: Split Hosting (Cloudflare Pages + Fly.io)

| Component | Host | Cost |
|-----------|------|------|
| Frontend | Cloudflare Pages (free tier) | $0 |
| API | Fly.io (shared-cpu-2x, 1 GB vol) | ~$10/mo |
| Simulation | Same Fly.io machine | included |

**Pros:** CDN for frontend, managed TLS, easy deploys.
**Cons:** Fly.io volumes are single-region and limited; SQLite on Fly requires LiteFS for replication; more complex setup; more expensive than Hetzner.

### Option C: Railway

| Component | Host | Cost |
|-----------|------|------|
| Frontend | Railway (static) or Vercel | $0-5 |
| API + Sim | Railway | ~$5-20/mo (usage-based) |

**Pros:** Easy GitHub integration, auto-deploys.
**Cons:** SQLite on Railway requires persistent volume (available but less mature); usage-based pricing unpredictable with continuous simulation runner.

### Option D: Docker on VPS

Same as Option A but containerized. Would add a `Dockerfile` and `docker-compose.yml`. Worth doing later for reproducibility, but adds complexity for no immediate benefit given the simple architecture.

---

## Cost Summary

| Item | Monthly Cost |
|------|-------------|
| Hetzner CX22 | €4.35 (~$5) |
| Domain (.de) | ~€1/mo amortized |
| AI API (Anthropic) — active auto-sim | $60-80 |
| AI API (XAI) — AfD agent | ~$5-10 |
| **Total (with active sim)** | **~$75-100/mo** |
| **Total (manual sim only)** | **~$6-10/mo** |

The AI API costs dominate. The hosting itself is negligible.

---

## Security Checklist

- [ ] SSH key-only auth (disable password login)
- [ ] UFW firewall: allow 22, 80, 443 only
- [ ] `.env` file permissions: `chmod 600`
- [ ] Caddy auto-TLS (HTTPS enforced)
- [ ] PM2 runs as non-root user
- [ ] SQLite DB files not web-accessible
- [ ] Regular apt security updates (unattended-upgrades)
- [ ] API rate limiting (Express middleware — add if public)

## Monitoring (Optional)

- **PM2 built-in**: `pm2 monit` for process health
- **Uptime Kuma** (self-hosted): HTTP health checks on the same VPS
- **Caddy access logs**: `/var/log/caddy/` for traffic analysis
- **SQLite DB size**: Monitor with cron alert if > 1 GB
