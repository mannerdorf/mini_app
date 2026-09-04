#!/usr/bin/env bash
# Сборка веб-приложения (Vite → dist/).
#
# Локально (Mac / CI):
#   ./scripts/build-web-app.sh
#
# Production haulz.ru / Timeweb Docker: VITE_API_ORIGIN пустой — same-origin /api.
# Preview / отдельный API:
#   VITE_API_ORIGIN=https://api.haulz.ru ./scripts/build-web-app.sh
#
# Android static (Capacitor):
#   npm run build:android

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VITE_API_ORIGIN="${VITE_API_ORIGIN-}"
export VITE_API_ORIGIN

echo "==> npm ci"
npm ci

echo "==> npm run build (VITE_API_ORIGIN=${VITE_API_ORIGIN:-<empty same-origin>})"
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "ERROR: dist/index.html not found after build" >&2
  exit 1
fi

BYTES="$(du -sh dist | awk '{print $1}')"
echo ""
echo "OK: $ROOT/dist ($BYTES)"
echo "Deploy: ./scripts/deploy-web-app-vps.sh"
