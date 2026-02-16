#!/usr/bin/env bash
set -euo pipefail

# Fix Next.js standalone runtime assets.
# Usage:
#   ./scripts/fix_next_standalone_assets.sh [frontend_dir]
#
# Default frontend_dir: ./frontend

FRONTEND_DIR="${1:-frontend}"
NEXT_DIR="${FRONTEND_DIR}/.next"
STANDALONE_APP_DIR="${NEXT_DIR}/standalone/frontend"

if [[ ! -d "${NEXT_DIR}" ]]; then
  echo "ERROR: ${NEXT_DIR} not found. Run frontend build first." >&2
  exit 1
fi

if [[ ! -f "${STANDALONE_APP_DIR}/server.js" ]]; then
  echo "ERROR: standalone server not found at ${STANDALONE_APP_DIR}/server.js" >&2
  exit 1
fi

mkdir -p "${STANDALONE_APP_DIR}/.next"
rm -rf "${STANDALONE_APP_DIR}/.next/static"
cp -a "${NEXT_DIR}/static" "${STANDALONE_APP_DIR}/.next/static"

if [[ -d "${FRONTEND_DIR}/public" ]]; then
  rm -rf "${STANDALONE_APP_DIR}/public"
  cp -a "${FRONTEND_DIR}/public" "${STANDALONE_APP_DIR}/public"
fi

echo "Standalone assets prepared:"
echo "  - ${STANDALONE_APP_DIR}/.next/static"
if [[ -d "${STANDALONE_APP_DIR}/public" ]]; then
  echo "  - ${STANDALONE_APP_DIR}/public"
fi
