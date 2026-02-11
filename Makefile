.PHONY: dev dev-backend dev-frontend test test-backend lint db-migrate db-upgrade db-seed docker-up docker-down

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

# Docker
docker-up:
	docker compose up -d

docker-down:
	docker compose down

# Lint
lint:
	cd frontend && npm run lint
