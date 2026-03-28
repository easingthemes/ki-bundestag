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

## Platform Comparison

| | **Hetzner VPS** | **Vercel + Fly.io** | **Railway** | **Render** | **AWS Lightsail** | **Cloudflare Pages + VPS** |
|---|---|---|---|---|---|---|
| **Architecture** | All-in-one VPS | Frontend on Vercel, API on Fly.io | All-in-one PaaS | All-in-one PaaS | All-in-one VPS | Frontend CDN + API on VPS |
| **Frontend hosting** | Caddy static files | Vercel Edge CDN (free) | Built-in static | Built-in static | Caddy/nginx static | Cloudflare CDN (free) |
| **API hosting** | PM2 + Caddy reverse proxy | Fly.io Machine | Railway container | Render Web Service | PM2 + Caddy | PM2 + Caddy |
| **SQLite support** | Native local disk | Fly Volumes (LiteFS needed for HA) | Persistent volume (beta) | Persistent disk (on paid) | Native local disk | Native local disk |
| **Background jobs** | PM2 process | Fly Machine (always-on) | Worker service | Background worker ($) | PM2 process | PM2 process |
| **Auto-deploy (git push)** | Manual (script) | Yes (Vercel) / flyctl | Yes | Yes | Manual (script) | Partial (CF Pages auto, VPS manual) |
| **Custom domain + TLS** | Caddy auto-TLS | Vercel auto + Fly auto | Built-in | Built-in | Caddy auto-TLS | Cloudflare auto + Caddy |
| **EU data residency** | Yes (Falkenstein/Helsinki) | Vercel: edge, Fly: choose region | US-only regions | Frankfurt available | Frankfurt available | Cloudflare: edge, VPS: EU |
| **Scaling** | Vertical (resize VPS) | Horizontal (Fly autoscale) | Vertical | Vertical | Vertical | Vertical |
| **Ops complexity** | Medium (you manage server) | High (2 platforms, LiteFS) | Low | Low | Medium (you manage server) | Medium-High (2 platforms) |
| **Vendor lock-in** | None | Moderate (Vercel framework) | Low | Low | Low (AWS ecosystem) | Low |
| **Monthly cost (hosting only)** | **~$5** | ~$10-15 | ~$10-20 | ~$15-25 | ~$10 | ~$5-7 |
| **Monthly cost (with auto-sim AI)** | **~$75-100** | ~$80-110 | ~$80-115 | ~$85-120 | ~$80-105 | ~$75-100 |

### Why each option works or doesn't

| Platform | Verdict | Key issue |
|----------|---------|-----------|
| **Hetzner VPS** | **Best fit** | Cheapest, full control, native SQLite, EU-based. Only downside: manual deploys. |
| **Vercel + Fly.io** | Viable but complex | Vercel can't run Express or SQLite — API must go elsewhere. Fly.io supports SQLite via volumes but needs LiteFS for safe concurrent access. Two platforms to manage. |
| **Vercel alone** | **Not viable** | No persistent filesystem (SQLite won't work). Serverless functions timeout (simulation runner can't run). Would require migrating to Postgres + external job runner — major rewrite. |
| **Railway** | Viable | Easy deploys, persistent volumes exist. But volumes are beta, US-only regions, and usage-based pricing makes costs unpredictable with a continuous simulation runner. |
| **Render** | Viable | Good DX, persistent disk on paid plans. More expensive than Hetzner for equivalent resources. Free tier spins down (kills simulation runner). |
| **AWS Lightsail** | Viable | Similar to Hetzner but more expensive. Good if already in AWS ecosystem. |
| **Cloudflare Pages + VPS** | Viable | Best frontend performance (global CDN) but still need a VPS for API + SQLite. Added complexity for marginal frontend speed gains on a low-traffic app. |
| **Netlify** | **Not viable** | Same issue as Vercel — serverless functions, no persistent disk, no long-running processes. |
| **AWS Lambda / GCP Cloud Run** | **Not viable** | Serverless — no persistent disk for SQLite, no long-running simulation process. Would need Postgres + separate scheduler. |

### Decision matrix (scored 1-5, higher is better)

| Criteria (weight) | Hetzner VPS | Vercel+Fly | Railway | Render | Lightsail |
|---|---|---|---|---|---|
| Cost (25%) | 5 | 3 | 3 | 2 | 4 |
| SQLite compatibility (25%) | 5 | 3 | 3 | 4 | 5 |
| Simplicity (20%) | 4 | 2 | 4 | 4 | 4 |
| Deploy experience (15%) | 2 | 5 | 5 | 5 | 2 |
| EU data residency (10%) | 5 | 3 | 1 | 4 | 4 |
| Scalability (5%) | 2 | 5 | 4 | 3 | 3 |
| **Weighted total** | **4.15** | **3.15** | **3.35** | **3.45** | **3.80** |

---

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

### 6. GitHub Actions CI/CD

Automated via two workflows in `.github/workflows/`:

**CI** (`ci.yml`) — runs on every push/PR to `main`:
- Typecheck all packages
- Build all packages
- Upload web build artifact (on main push)

**Deploy** (`deploy.yml`) — runs after CI passes on `main`, or manually:
- SSHes into the VPS
- Pulls latest code, installs deps, builds, migrates, restarts PM2

#### Required GitHub Secrets

Set these in **Settings > Secrets and variables > Actions**:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user (e.g., `deploy`) |
| `DEPLOY_SSH_KEY` | Private SSH key (ed25519 recommended) |
| `DEPLOY_PORT` | SSH port (optional, defaults to 22) |

#### GitHub Environment

Create a **production** environment in **Settings > Environments** with:
- Required reviewers (optional — adds manual approval gate)
- Deployment branch rule: `main` only

#### Server-Side SSH Setup

```bash
# On the VPS — create a deploy user with limited access
adduser --disabled-password deploy
usermod -aG www-data deploy

# Allow deploy user to restart PM2
# Add to /etc/sudoers.d/deploy:
echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/pm2" > /etc/sudoers.d/deploy

# Set up SSH key
mkdir -p /home/deploy/.ssh
echo "<public-key>" >> /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Give deploy user ownership of the app directory
chown -R deploy:deploy /opt/ki-bundestag
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
