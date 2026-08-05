#!/usr/bin/env bash
# Вызов cron-эндпоинта с VPS. Установка:
#   sudo cp deploy/cron-call.sh /opt/haulz/cron-call.sh
#   sudo chmod +x /opt/haulz/cron-call.sh
#
# Crontab (пример):
#   */5 * * * * /opt/haulz/cron-call.sh /api/cron/refresh-cache

set -euo pipefail

ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"
API_BASE="${HAULZ_CRON_API_BASE:-http://127.0.0.1:3000}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "cron-call: env file not found: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"

if [[ $# -lt 1 ]]; then
  echo "usage: cron-call.sh /api/cron/refresh-cache" >&2
  exit 1
fi

path="$1"
if [[ "$path" != /api/* ]]; then
  echo "cron-call: path must start with /api/: $path" >&2
  exit 1
fi

secret="${CRON_SECRET:-${VERCEL_CRON_SECRET:-}}"
if [[ -z "$secret" ]]; then
  echo "cron-call: CRON_SECRET is not set in $ENV_FILE" >&2
  exit 1
fi

curl -fsS -H "Authorization: Bearer ${secret}" "${API_BASE}${path}" >/dev/null
