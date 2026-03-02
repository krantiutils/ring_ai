# AgentShakti

Voice campaign platform with TTS, SMS, and survey capabilities.

## Structure

```
ring_ai/
├── backend/          # Python FastAPI
│   ├── app/
│   │   ├── api/v1/   # Versioned API endpoints
│   │   ├── core/      # Config, database
│   │   ├── models/    # SQLAlchemy models
│   │   ├── services/  # Business logic
│   │   └── tts/       # TTS provider integrations
│   ├── alembic/       # DB migrations
│   └── tests/
├── frontend/         # Next.js 15 + TypeScript + Tailwind
│   └── src/app/
├── docker-compose.yml
└── Makefile
```

## Setup

### Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL 16+ (or use Docker)
- [uv](https://docs.astral.sh/uv/) for Python dependency management

### Backend

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Docker (all services)

```bash
docker compose up -d
```

### Run tests

```bash
make test
```

## Product Screenshots

Core flows captured from E2E validation runs:

### Dashboard Overview
![Dashboard Overview](e2e/feature_parity_validation/dashboard/overview.png)

### Campaign List
![Campaign List](e2e/feature_parity_validation/campaigns/list-page.png)

### Analytics Overview
![Analytics Overview](e2e/feature_parity_validation/analytics/overview.png)

### Template Management
![Template List](e2e/feature_parity_validation/templates/list-page.png)

### OTP Send Flow
![OTP Send Form](e2e/feature_parity_validation/otp/send-form.png)

### Settings and KYC
![KYC Section](e2e/feature_parity_validation/settings/kyc-section.png)

## Production Deploy (agentshakti.xyz)

Dockerized stack behind Traefik on EC2.

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

## API Endpoints

| Prefix | Purpose |
|--------|---------|
| `/health` | Health check |
| `/api/v1/voice/` | Voice call endpoints |
| `/api/v1/text/` | SMS endpoints |
| `/api/v1/forms/` | Survey endpoints |
| `/api/v1/campaigns/` | Campaign CRUD |
| `/api/v1/templates/` | Template CRUD |
| `/api/v1/analytics/` | Metrics |
