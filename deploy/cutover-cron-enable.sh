#!/usr/bin/env bash
# Включить crontab на cron-VPS. Запуск после test-cron-smoke.sh.
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
CRON_EXAMPLE="$APP_DIR/deploy/crontab.haulz-cron.example"
BACKUP="/root/crontab-haulz-cron-$(date +%Y%m%d%H%M%S).txt"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on cron-VPS" >&2
  exit 1
fi

if [[ ! -f "$CRON_EXAMPLE" ]]; then
  echo "missing $CRON_EXAMPLE" >&2
  exit 1
fi

crontab -l > "$BACKUP" 2>/dev/null || true
cp "$CRON_EXAMPLE" /root/crontab-haulz-cron.txt
crontab /root/crontab-haulz-cron.txt

echo "==> crontab installed (backup: $BACKUP)"
crontab -l
echo
echo "Ensure API-VPS cron jobs are removed: deploy/cutover-api-remove-cron.sh"
