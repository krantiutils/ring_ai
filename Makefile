.PHONY: dev dev-backend dev-frontend test test-backend lint db-migrate db-upgrade docker-up docker-down

# Development
dev:
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# Testing
test: test-backend

test-backend:
	cd backend && uv run pytest -v

# Database
db-migrate:
	cd backend && uv run alembic revision --autogenerate -m "$(MSG)"

db-upgrade:
	cd backend && uv run alembic upgrade head

# Docker
docker-up:
	docker compose up -d

docker-down:
	docker compose down

# Lint
lint:
	cd frontend && npm run lint
