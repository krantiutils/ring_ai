# Dockerize AgentShakti + Traefik Proxy

Date: 2026-03-02

## Context

AgentShakti (agentshakti.xyz) runs on a shared EC2 instance (54.156.88.160, Ubuntu 24.04, 2 vCPU, 3.9 GB RAM) alongside DoctorSewa (doctorsewa.org) and JiriSewa (khetbata.xyz). Currently all apps are managed via PM2 behind host nginx with Certbot SSL.

Goal: Dockerize AgentShakti with its own Postgres, and replace host nginx with a single Traefik container that proxies all domains on the box.

## Architecture

```
Internet (:80/:443)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Traefik (Docker)                                       │
│  - HTTP→HTTPS redirect                                  │
│  - Let's Encrypt (HTTP-01)                              │
│  - Docker provider (AgentShakti services via labels)    │
│  - File provider (doctorsewa, jirisewa via PM2 ports)   │
└────────┬──────────────┬──────────────┬──────────────────┘
         │              │              │
    agentshakti.xyz  doctorsewa.org  khetbata.xyz
         │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
    │ Docker  │    │ PM2     │   │ PM2     │
    │ network │    │ :3100   │   │ :3200   │
    └─────────┘    └─────────┘   └─────────┘
```

### AgentShakti Docker Services

| Service | Image | Traefik routing | Memory est. |
|---------|-------|-----------------|-------------|
| traefik | traefik:v3 | Ports 80, 443 exposed | ~30MB |
| postgres | postgres:16-alpine | internal only | ~100MB |
| redis | redis:7-alpine | internal only | ~30MB |
| backend | python:3.12-slim + uv | `Host(agentshakti.xyz) && (PathPrefix(/api) \|\| PathPrefix(/health) \|\| PathPrefix(/ws))` | ~150MB |
| celery-worker | same backend image | no labels | ~150MB |
| frontend | node:22-slim standalone | `Host(agentshakti.xyz)` catch-all (lower priority) | ~80MB |

Total estimate: ~540MB

### Non-Docker Apps (Traefik File Provider)

| Domain | Target | Notes |
|--------|--------|-------|
| doctorsewa.org, *.doctorsewa.org | host:3100 | PM2 Next.js, wildcard subdomains |
| khetbata.xyz | host:3200 | PM2 Next.js + Supabase /_supabase passthrough |

PM2 apps keep their current ports but bind to 127.0.0.1 only (Traefik handles external traffic).

## Services Detail

### Traefik

- Image: `traefik:v3`
- Ports: 80, 443 on host
- Let's Encrypt HTTP-01 challenge for all domains
- Docker provider: watches labels on AgentShakti containers
- File provider: `./traefik/dynamic/` directory with routes for PM2 apps
- Dashboard: disabled in production (or internal-only on :8080)
- Volume: `letsencrypt` named volume for cert persistence

### Postgres

- Image: `postgres:16-alpine`
- Internal network only, no host port
- Volume: `pgdata` named volume
- Health check: `pg_isready`
- Credentials via `.env` file

### Redis

- Image: `redis:7-alpine`
- Internal network only
- Health check: `redis-cli ping`
- Optional persistence via appendonly

### Backend

- Existing Dockerfile enhanced with entrypoint script
- Entrypoint: `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Traefik labels route `/api/*`, `/health`, `/ws/*` to this service
- Depends on: postgres (healthy), redis (healthy)
- Environment: `.env` file with DATABASE_URL, CELERY_*, TWILIO_*, GEMINI_*, etc.
- Piper models: bind mount `./backend/piper-models:/opt/piper-models:ro`
- Uploads: named volume `uploads` at `/app/uploads`

### Celery Worker

- Same image as backend, different command: `celery -A app.core.celery_app worker -l info --concurrency=2`
- No Traefik labels (not externally reachable)
- Depends on: postgres (healthy), redis (healthy)
- Shares same `.env` as backend

### Frontend

- Existing multi-stage Dockerfile (already well-structured)
- Traefik labels: `Host(agentshakti.xyz)` with lower priority than backend
- `NEXT_PUBLIC_API_URL` set to `https://agentshakti.xyz` (goes through Traefik)
- Depends on: backend (started)

## Volumes

| Volume | Type | Purpose |
|--------|------|---------|
| pgdata | named | Postgres data persistence |
| letsencrypt | named | Traefik cert storage |
| uploads | named | User file uploads |
| ./backend/piper-models | bind mount (ro) | Piper TTS ONNX models (~160MB) |

## Files to Create/Modify

### New files
- `docker-compose.yml` — rewrite with all 6 services
- `docker-compose.override.yml` — optional dev overrides
- `.dockerignore` (root) — ignore .git, node_modules, .venv, etc.
- `backend/.dockerignore` — backend-specific ignores
- `frontend/.dockerignore` — frontend-specific ignores
- `backend/entrypoint.sh` — migrate + start uvicorn
- `.env.production.template` — all env vars documented with defaults
- `traefik/traefik.yml` — static config (entrypoints, providers, acme)
- `traefik/dynamic/non-docker-apps.yml` — file provider routes for doctorsewa/jirisewa

### Modified files
- `backend/Dockerfile` — add entrypoint script, health check
- `frontend/Dockerfile` — add health check label
- `Makefile` — update docker targets
- `README.md` — update deploy section

## WebSocket Support

Backend serves WebSocket connections for live Gemini audio streaming. Traefik routing rule includes `PathPrefix(/ws)`. Traefik natively handles WebSocket upgrade — no special config needed beyond the HTTP router.

## Health Checks

| Service | Check | Interval |
|---------|-------|----------|
| postgres | `pg_isready -U ${POSTGRES_USER}` | 5s |
| redis | `redis-cli ping` | 5s |
| backend | `curl -f http://localhost:8000/health` | 10s |
| frontend | `curl -f http://localhost:3000` | 10s |

## Migration Plan

1. Build and test Docker stack locally with `docker compose up`
2. Deploy Traefik + AgentShakti containers on EC2
3. Verify agentshakti.xyz works through Traefik (Traefik on alternate ports initially)
4. Add file provider routes for doctorsewa (3100) and jirisewa (3200)
5. Reassign PM2 apps to new ports (127.0.0.1:3100, 127.0.0.1:3200)
6. Stop host nginx, switch Traefik to ports 80/443
7. Verify all three domains work
8. Remove nginx package or disable service

## CI/CD

No automated CI/CD pipeline. Deployments are manually triggered:

```bash
# From local or SSH into EC2
cd /home/ubuntu/ring_ai
git pull
docker compose up -d --build
```

Operator decides when to deploy. No GitHub Actions, no auto-deploy on push.

## Rollback

If anything breaks:
1. Stop Traefik: `docker compose stop traefik`
2. Restart host nginx: `sudo systemctl start nginx`
3. All PM2 apps resume serving via nginx immediately

## GPU TTS (Future)

Optional `--profile gpu` service for Parler/Coqui XTTS:
- nvidia/cuda base image + torch
- Requires nvidia-container-toolkit on host
- Separate from main backend to keep images lean
- Not included in initial deployment
