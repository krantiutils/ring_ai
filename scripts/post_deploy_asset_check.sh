#!/usr/bin/env bash
set -euo pipefail

# Validate that production Next.js static assets are reachable.
# Usage:
#   ./scripts/post_deploy_asset_check.sh https://agentshakti.xyz

BASE_URL="${1:-}"
if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: $0 <base_url>" >&2
  exit 2
fi

if [[ "${BASE_URL}" != http://* && "${BASE_URL}" != https://* ]]; then
  echo "ERROR: base_url must start with http:// or https://" >&2
  exit 2
fi

TMP_HTML="$(mktemp)"
trap 'rm -f "${TMP_HTML}"' EXIT

echo "Checking homepage: ${BASE_URL}/"
curl -fsSL "${BASE_URL}/" -o "${TMP_HTML}"

mapfile -t ASSET_PATHS < <(
  grep -oE '/_next/[^" )]+' "${TMP_HTML}" \
    | sed 's/&amp;/\&/g' \
    | sed 's/\\$//' \
    | sort -u
)

if [[ ${#ASSET_PATHS[@]} -eq 0 ]]; then
  echo "ERROR: no /_next asset references found in homepage HTML" >&2
  exit 1
fi

OK=0
BAD=0

for path in "${ASSET_PATHS[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${path}")"
  if [[ "${code}" == "200" || "${code}" == "304" ]]; then
    OK=$((OK + 1))
  else
    BAD=$((BAD + 1))
    echo "BAD ${code} ${BASE_URL}${path}"
  fi
done

echo "Asset check complete: OK=${OK} BAD=${BAD}"
if [[ "${BAD}" -gt 0 ]]; then
  exit 1
fi

echo "PASS: all discovered /_next assets are reachable."
