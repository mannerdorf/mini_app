#!/usr/bin/env bash
# Smoke-тесты cron worker на cron-VPS (до включения crontab).
set -euo pipefail

ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"
CRON_CALL="${HAULZ_CRON_CALL:-/opt/haulz/cron-call.sh}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

echo "==> health"
curl -fsS http://127.0.0.1:3000/health
echo

echo "==> postgres"
psql "$DATABASE_URL" -c 'select 1 as ok'

echo "==> light cron job"
"$CRON_CALL" /api/cron/process-claim-push-queue

echo "==> refresh-cache (may take 1-3 min)"
"$CRON_CALL" /api/cron/refresh-cache

echo "==> smoke OK"
