#!/usr/bin/env bash
# Smoke-тест Partner API и my-api-keys на Vercel Production.
set -euo pipefail

BASE="${PARTNER_API_ORIGIN:-https://mini-app-lake-phi.vercel.app}"

echo "== Partner API health =="
curl -sf "${BASE}/api/partner/v1/health" | head -c 400
echo ""
echo ""

echo "== CORS preflight (Origin: haulz.ru) =="
curl -sfI -X OPTIONS "${BASE}/api/partner/v1/health" \
  -H "Origin: https://haulz.ru" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control || true
echo ""

echo "== my-api-keys (expect 400 without credentials) =="
curl -sf -X POST "${BASE}/api/my-api-keys" -H "Content-Type: application/json" || true
echo ""

echo "OK: endpoints reachable at ${BASE}"
