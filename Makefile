.PHONY: dev dev-backend dev-frontend test test-backend lint db-migrate db-upgrade db-seed docker-up docker-down docker-logs docker-ps docker-migrate docker-shell

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
	cd backend && PYTHONPATH=. uv run alembic revision --autogenerate -m "$(MSG)"

db-upgrade:
	cd backend && PYTHONPATH=. uv run alembic upgrade head

db-seed:
	cd backend && PYTHONPATH=. uv run python -m app.seed

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

# Lint
lint:
	cd frontend && npm run lint
