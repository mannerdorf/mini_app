#!/usr/bin/env bash
# Убрать cache/cron с API-VPS, оставить watchdog, применить nginx deny для cron paths.
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
BACKUP="/root/crontab-before-split-$(date +%Y%m%d%H%M%S).txt"
WATCHDOG="/opt/haulz/watchdog-api-tls.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on API-VPS (72.56.36.185)" >&2
  exit 1
fi

echo "==> backup crontab -> $BACKUP"
crontab -l > "$BACKUP" 2>/dev/null || echo "# empty" > "$BACKUP"

if [[ -f "$APP_DIR/deploy/crontab.haulz-api.example" ]]; then
  cp "$APP_DIR/deploy/crontab.haulz-api.example" /root/crontab-haulz-api-watchdog.txt
  crontab /root/crontab-haulz-api-watchdog.txt
else
  CRON_LINE='* * * * * /opt/haulz/watchdog-api-tls.sh >/dev/null 2>&1'
  (echo "$CRON_LINE") | crontab -
fi

if [[ ! -x "$WATCHDOG" && -f "$APP_DIR/deploy/watchdog-api-tls.sh" ]]; then
  install -m 755 "$APP_DIR/deploy/watchdog-api-tls.sh" "$WATCHDOG"
fi

echo "==> crontab now:"
crontab -l

echo "==> apply nginx (cron paths denied externally)"
if [[ -f "$APP_DIR/deploy/apply-nginx-api.sh" ]]; then
  bash "$APP_DIR/deploy/apply-nginx-api.sh"
else
  echo "WARN: apply-nginx-api.sh not found; update nginx manually" >&2
fi

echo "==> verify external cron blocked (expect 403)"
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  -H "Authorization: Bearer dummy" \
  "https://api.haulz.ru/api/cron/refresh-cache" || echo "000")
echo "https cron refresh-cache HTTP $code (want 403)"

echo "==> done. Rollback: crontab $BACKUP"
