#!/usr/bin/env bash
# Апгрейд VPS API: normalized cache + чтение по периоду dateFrom/dateTo (SQL).
#
# На VPS:
#   bash /tmp/apply-vps-cache-upgrade.sh /tmp/haulz-vps-cache-upgrade.tgz
#
# НЕ трогает /opt/haulz/.env

set -euo pipefail

TGZ="${1:-/tmp/haulz-vps-cache-upgrade.tgz}"
APP="${HAULZ_APP_DIR:-/opt/haulz/app}"
ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"
TS="$(date +%Y%m%d%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ! -f "$TGZ" ]]; then
  echo "Missing tarball: $TGZ" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

echo "==> backup app"
cp -a "$APP" "${APP}.bak.${TS}"

echo "==> extract upgrade"
TMP="$(mktemp -d)"
tar -xzf "$TGZ" -C "$TMP"
cp -a "$TMP"/lib/*.ts "$APP/lib/"
cp -a "$TMP"/api/*.ts "$APP/api/"
cp -a "$TMP"/migrations/087_cache_document_rows.sql "$APP/migrations/"
if [[ -f "$TMP/deploy/apply-vps-cache-upgrade.sh" ]]; then
  install -m 755 "$TMP/deploy/apply-vps-cache-upgrade.sh" "$APP/deploy/apply-vps-cache-upgrade.sh"
fi
rm -rf "$TMP"

echo "==> migration 087 (normalized tables)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP/migrations/087_cache_document_rows.sql"

echo "==> restart haulz-api"
systemctl restart haulz-api
sleep 3
systemctl is-active haulz-api

echo "==> refresh-cache from 1C (blob + normalized rows, 5-15 min)"
if [[ -x /opt/haulz/cron-call.sh ]]; then
  /opt/haulz/cron-call.sh /api/cron/refresh-cache
else
  echo "WARN: /opt/haulz/cron-call.sh missing — run refresh-cache manually"
fi

echo "==> normalized state"
psql "$DATABASE_URL" -c "SELECT kind, row_count, updated_at FROM document_cache_normalized_state ORDER BY kind;"

echo "==> smoke POST perevozki (expect 400/401, not 405)"
curl -fsS -o /dev/null -w "perevozki POST: %{http_code}\n" \
  -X POST http://127.0.0.1:3000/api/perevozki \
  -H 'Content-Type: application/json' \
  -d '{"login":"x","password":"y","dateFrom":"2026-08-01","dateTo":"2026-08-31","isRegisteredUser":true}' \
  || true

echo "==> done. Optional in .env after stable normalized cache:"
echo "    CACHE_REFRESH_SKIP_BLOB=1"
