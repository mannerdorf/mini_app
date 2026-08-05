#!/usr/bin/env bash
# Полная стабилизация API на VPS после обновления файлов в /opt/haulz/app.
# bash /opt/haulz/app/deploy/stabilize-vps.sh
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
cd "$APP_DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

echo "==> install watchdog"
install -m 755 "$APP_DIR/deploy/watchdog-api-tls.sh" /opt/haulz/watchdog-api-tls.sh
install -m 755 "$APP_DIR/deploy/apply-nginx-api.sh" /opt/haulz/apply-nginx-api.sh
touch /var/log/haulz-api-watchdog.log
CRON_LINE='* * * * * /opt/haulz/watchdog-api-tls.sh >/dev/null 2>&1'
(crontab -l 2>/dev/null | grep -v 'watchdog-api-tls.sh'; echo "$CRON_LINE") | crontab -

echo "==> systemd unit"
if [[ -f "$APP_DIR/deploy/haulz-api.service" ]]; then
  cp "$APP_DIR/deploy/haulz-api.service" /etc/systemd/system/haulz-api.service
  systemctl daemon-reload
fi

echo "==> apply nginx"
bash "$APP_DIR/deploy/apply-nginx-api.sh"

echo "==> restart haulz-api"
systemctl restart haulz-api
sleep 2
systemctl --no-pager --full status haulz-api | head -20 || true

echo "==> external smoke"
curl -sS --max-time 10 -w "auth:%{http_code} t:%{time_total}\n" -o /dev/null "https://api.haulz.ru/api/auth-config" || echo "auth FAIL"
curl -sS --max-time 5 -H "Host: api.haulz.ru" -w "http80:%{http_code} t:%{time_total}\n" -o /tmp/h80.json "http://127.0.0.1/api/auth-config" || true
head -c 120 /tmp/h80.json; echo

echo "==> stabilize done"
