#!/bin/bash
set -e

echo "Running database migrations..."
if ! uv run alembic upgrade head 2>&1; then
  echo "WARNING: alembic upgrade head failed, trying 'heads'..."
  if ! uv run alembic upgrade heads 2>&1; then
    echo "WARNING: migrations failed — stamping current heads and continuing"
    uv run alembic stamp heads 2>&1 || true
  fi
fi

echo "Starting uvicorn..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-1}
