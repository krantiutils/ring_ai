# Dockerize AgentShakti + Traefik Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Containerize AgentShakti (backend, celery, frontend, postgres, redis) behind Traefik, which also reverse-proxies the other PM2 apps on the shared EC2.

**Architecture:** Traefik v3 as the single entrypoint (ports 80/443) with Docker provider for AgentShakti containers and file provider for PM2 apps (doctorsewa, jirisewa). Backend entrypoint auto-runs Alembic migrations. Manually triggered deploys via `git pull && docker compose up -d --build`.

**Tech Stack:** Docker Compose, Traefik v3, PostgreSQL 16, Redis 7, Python 3.12 + uv, Next.js 16 standalone, Celery

**Design doc:** `docs/plans/2026-03-02-dockerize-with-traefik-design.md`

---

### Task 1: Create .dockerignore files

**Files:**
- Create: `.dockerignore`
- Create: `backend/.dockerignore`
- Create: `frontend/.dockerignore`

**Step 1: Create root .dockerignore**

```
# File: .dockerignore
.git
.github
.beads
.claude
.playwright-mcp
*.png
*.md
!README.md
docs/
e2e/
state.json
```

**Step 2: Create backend/.dockerignore**

```
# File: backend/.dockerignore
.venv
__pycache__
*.pyc
.pytest_cache
.env
.env.*
uploads/
piper-models/
certificates/
tests/
alembic/versions/__pycache__
```

**Step 3: Create frontend/.dockerignore**

```
# File: frontend/.dockerignore
node_modules
.next
.env
.env.*
certificates/
```

**Step 4: Commit**

```bash
git add .dockerignore backend/.dockerignore frontend/.dockerignore
git commit -m "chore: add .dockerignore files for Docker builds"
```

---

### Task 2: Create backend entrypoint script

**Files:**
- Create: `backend/entrypoint.sh`
- Modify: `backend/Dockerfile`

**Step 1: Create entrypoint.sh**

```bash
#!/bin/bash
set -e

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting uvicorn..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-1}
```

**Step 2: Update backend/Dockerfile**

Replace entire file with:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
```

**Step 3: Verify Dockerfile builds locally**

Run: `docker build -t agentshakti-backend ./backend`
Expected: Builds successfully, final image ~300MB

**Step 4: Commit**

```bash
git add backend/entrypoint.sh backend/Dockerfile
git commit -m "feat(docker): add backend entrypoint with auto-migration"
```

---

### Task 3: Update frontend Dockerfile

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `frontend/next.config.ts`

**Step 1: Update frontend/Dockerfile to add curl + healthcheck**

Replace entire file with:

```dockerfile
FROM node:22-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server.js"]
```

**Step 2: Update next.config.ts for Docker**

The `rewrites()` proxying `/api/*` to `127.0.0.1:5001` is a dev-only concern. In Docker, Traefik routes `/api/*` directly to the backend container. The rewrite should only apply in dev:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["100.117.21.47", "192.168.1.67", "cdjk", "cdjk.fell-truck.ts.net"],
  async rewrites() {
    // In Docker/production, Traefik routes /api/* to backend directly.
    // Rewrites only needed for local dev without Traefik.
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:5001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
```

**Step 3: Verify Dockerfile builds locally**

Run: `docker build -t agentshakti-frontend ./frontend`
Expected: Builds successfully with standalone output

**Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/next.config.ts
git commit -m "feat(docker): add healthcheck to frontend, conditional rewrites for Docker"
```

---

### Task 4: Create Traefik static config and file provider

**Files:**
- Create: `traefik/traefik.yml`
- Create: `traefik/dynamic/non-docker-apps.yml`

**Step 1: Create traefik/traefik.yml (static config)**

```yaml
# Traefik v3 static configuration
api:
  dashboard: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@agentshakti.xyz
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
    network: agentshakti_default
  file:
    directory: /etc/traefik/dynamic
    watch: true

log:
  level: WARN
```

**Step 2: Create traefik/dynamic/non-docker-apps.yml (file provider for PM2 apps)**

```yaml
# Routes for non-Docker apps running under PM2 on the host.
# These apps bind to 127.0.0.1:<port> and Traefik proxies to them.
# Adjust ports to match PM2 process ports after migration.

http:
  routers:
    doctorsewa:
      rule: "Host(`doctorsewa.org`) || HostRegexp(`{sub:[a-z0-9-]+}.doctorsewa.org`)"
      entryPoints:
        - websecure
      service: doctorsewa
      tls:
        certResolver: letsencrypt
        domains:
          - main: doctorsewa.org
            sans:
              - "*.doctorsewa.org"

    jirisewa:
      rule: "Host(`khetbata.xyz`)"
      entryPoints:
        - websecure
      service: jirisewa
      tls:
        certResolver: letsencrypt

  services:
    doctorsewa:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:3100"

    jirisewa:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:3200"
```

**Step 3: Commit**

```bash
git add traefik/
git commit -m "feat(traefik): add static config and file provider for PM2 apps"
```

---

### Task 5: Create .env.production.template

**Files:**
- Create: `.env.production.template`

**Step 1: Create the template**

```bash
# .env.production.template
# Copy to .env and fill in secrets before running docker compose up

# --- Postgres (used by postgres container + backend) ---
POSTGRES_USER=ring_ai
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=ring_ai
DATABASE_URL=postgresql://ring_ai:CHANGE_ME_STRONG_PASSWORD@postgres:5432/ring_ai

# --- App ---
DEBUG=false
PROJECT_NAME=AgentShakti
SECRET_KEY=CHANGE_ME_GENERATE_WITH_openssl_rand_base64_32
CORS_ORIGINS=["https://agentshakti.xyz"]

# --- Redis / Celery ---
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

# --- Twilio ---
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WHATSAPP_NUMBER=
TWILIO_BASE_URL=https://agentshakti.xyz

# --- Gemini Interactive Agent ---
GEMINI_API_KEY=
GEMINI_MODEL_ID=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_DEFAULT_VOICE=Kore

# --- TTS (optional) ---
AZURE_TTS_KEY=
AZURE_TTS_REGION=
ELEVENLABS_API_KEY=

# --- Piper TTS (models mounted as volume) ---
PIPER_MODELS_DIR=/opt/piper-models

# --- SMS ---
AAKASH_SMS_TOKEN=
AAKASH_SMS_API_URL=https://sms.aakashsms.com/sms/v3/send

# --- OpenAI (sentiment analysis) ---
OPENAI_API_KEY=

# --- Auth ---
GOOGLE_CLIENT_ID=

# --- Frontend (build-time) ---
NEXT_PUBLIC_API_URL=https://agentshakti.xyz

# --- Traefik ---
ACME_EMAIL=admin@agentshakti.xyz
```

**Step 2: Add .env to .gitignore if not already present**

Check `.gitignore` for `.env` entry. Add `/.env` if missing (root-level compose .env).

**Step 3: Commit**

```bash
git add .env.production.template
git commit -m "chore: add production env template for Docker deployment"
```

---

### Task 6: Rewrite docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

This is the core deliverable. Replace the entire file.

**Step 1: Write the new docker-compose.yml**

```yaml
services:
  # --- Reverse Proxy ---
  traefik:
    image: traefik:v3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/dynamic:/etc/traefik/dynamic:ro
      - letsencrypt:/letsencrypt
    extra_hosts:
      - "host.docker.internal:host-gateway"

  # --- Database ---
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-ring_ai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ring_ai}
      POSTGRES_DB: ${POSTGRES_DB:-ring_ai}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ring_ai}"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- Message Broker ---
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- Backend API ---
  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-ring_ai}:${POSTGRES_PASSWORD:-ring_ai}@postgres:5432/${POSTGRES_DB:-ring_ai}
      CELERY_BROKER_URL: redis://redis:6379/0
      CELERY_RESULT_BACKEND: redis://redis:6379/1
    volumes:
      - ./backend/piper-models:/opt/piper-models:ro
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      # API + health routes
      - "traefik.http.routers.backend.rule=Host(`agentshakti.xyz`) && (PathPrefix(`/api`) || PathPrefix(`/health`))"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
      - "traefik.http.services.backend.loadbalancer.server.port=8000"
      # WebSocket routes (voice media-stream, live-agent, gateway)
      - "traefik.http.routers.backend-ws.rule=Host(`agentshakti.xyz`) && PathPrefix(`/api/v1/voice/media-stream`, `/api/v1/voice/live-agent/ws`, `/api/v1/gateway/ws`)"
      - "traefik.http.routers.backend-ws.entrypoints=websecure"
      - "traefik.http.routers.backend-ws.tls.certresolver=letsencrypt"
      - "traefik.http.services.backend-ws.loadbalancer.server.port=8000"

  # --- Background Worker ---
  celery-worker:
    build: ./backend
    restart: unless-stopped
    command: uv run celery -A app.core.celery_app worker -l info --concurrency=2
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-ring_ai}:${POSTGRES_PASSWORD:-ring_ai}@postgres:5432/${POSTGRES_DB:-ring_ai}
      CELERY_BROKER_URL: redis://redis:6379/0
      CELERY_RESULT_BACKEND: redis://redis:6379/1
    volumes:
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  # --- Frontend ---
  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-https://agentshakti.xyz}
    restart: unless-stopped
    depends_on:
      - backend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`agentshakti.xyz`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.routers.frontend.priority=1"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"

volumes:
  pgdata:
  letsencrypt:
  uploads:
```

**Step 2: Verify compose config is valid**

Run: `docker compose config --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): rewrite compose with Traefik, Redis, Celery, health checks"
```

---

### Task 7: Update Makefile and README

**Files:**
- Modify: `Makefile`
- Modify: `README.md`

**Step 1: Update Makefile docker targets**

Add/replace the docker section:

```makefile
# Docker (production)
docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

docker-migrate:
	docker compose exec backend uv run alembic upgrade head

docker-shell:
	docker compose exec backend bash
```

**Step 2: Update README.md production deploy section**

Replace the "Production Deploy" section with:

```markdown
## Production Deploy (agentshakti.xyz)

Dockerized stack behind Traefik on an EC2 instance.

### First-time setup

```bash
cp .env.production.template .env
# Edit .env with real secrets
docker compose up -d --build
```

### Deploy updates

```bash
cd /home/ubuntu/ring_ai
git pull
docker compose up -d --build
```

### Useful commands

```bash
docker compose ps              # Check service status
docker compose logs -f backend # Tail backend logs
docker compose exec backend bash  # Shell into backend
```
```

**Step 3: Commit**

```bash
git add Makefile README.md
git commit -m "docs: update Makefile and README for Docker deployment"
```

---

### Task 8: Local smoke test

**Files:** None (verification only)

**Step 1: Build all images**

Run: `docker compose build`
Expected: All 3 images (backend, celery-worker reuses backend, frontend) build successfully

**Step 2: Start the stack (minus Traefik TLS)**

For local testing without a real domain, temporarily test with port exposure:

Run: `docker compose up -d postgres redis backend celery-worker frontend`
Expected: All services start, health checks pass

**Step 3: Verify health**

Run: `docker compose ps`
Expected: All services show "healthy" or "running"

Run: `curl http://localhost:8000/health`
Expected: `{"status": "healthy"}`

**Step 4: Check migrations ran**

Run: `docker compose logs backend | head -20`
Expected: "Running database migrations..." followed by alembic output, then "Starting uvicorn..."

**Step 5: Stop and clean up**

Run: `docker compose down`

**Step 6: Final commit — tag the milestone**

```bash
git add -A
git commit -m "chore(docker): complete Dockerize + Traefik setup" --allow-empty
git push
```

---

## Migration Checklist (EC2 cutover — not part of code tasks)

After deploying to EC2:

1. [ ] Copy `.env.production.template` to `.env`, fill secrets
2. [ ] Adjust PM2 apps to bind to `127.0.0.1:3100` (doctorsewa) and `127.0.0.1:3200` (jirisewa)
3. [ ] `docker compose up -d --build`
4. [ ] Verify `https://agentshakti.xyz` works via Traefik
5. [ ] Verify `https://doctorsewa.org` routes to PM2 via file provider
6. [ ] Verify `https://khetbata.xyz` routes to PM2 via file provider
7. [ ] `sudo systemctl stop nginx && sudo systemctl disable nginx`
8. [ ] Monitor logs: `docker compose logs -f`
