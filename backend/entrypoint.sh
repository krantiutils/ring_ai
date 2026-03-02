#!/bin/bash
set -e

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting uvicorn..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-1}
