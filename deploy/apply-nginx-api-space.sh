#!/usr/bin/env bash
# Применить nginx + Let's Encrypt для api.haulz.space (iOS/Android native API).
# Запуск НА API-VPS (вы уже root@haulzbackend / 72.56.36.185):
#   cd /opt/haulz/app && git pull && bash deploy/apply-nginx-api-space.sh
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
SITE_SRC="$APP_DIR/deploy/nginx-api.haulz.space.conf"
SITE_DST="/etc/nginx/sites-available/api.haulz.space"
DOMAIN="api.haulz.space"
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on API VPS (72.56.36.185)" >&2
  exit 1
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "Missing $SITE_SRC — git pull in $APP_DIR first" >&2
  exit 1
fi

echo "==> Stop certbot from turning :80 /api into 301-only redirect"
rm -f /etc/nginx/sites-enabled/default

cp "$SITE_SRC" "$SITE_DST"
ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.space

# HTTP-only first (443 block needs certs; comment ssl server if missing)
if [[ ! -f "$LIVE_DIR/fullchain.pem" ]]; then
  echo "==> No cert yet — enable HTTP-only config for certbot"
  awk '/^server \{/{n++} n==2{exit} {print}' "$SITE_DST" > "${SITE_DST}.tmp"
  mv "${SITE_DST}.tmp" "$SITE_DST"
fi

nginx -t
systemctl reload nginx

echo "==> smoke HTTP :80 (must NOT be 301 for /health)"
curl -sS --max-time 8 -w "\nHTTP:%{http_code}\n" "http://127.0.0.1/health" -H "Host: ${DOMAIN}" || true

if [[ ! -f "$LIVE_DIR/fullchain.pem" ]]; then
  echo "==> Issuing Let's Encrypt cert for ${DOMAIN}..."
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${CERTBOT_EMAIL:-admin@haulz.space}" || {
    echo "certbot failed — run: certbot certonly --nginx -d ${DOMAIN}" >&2
    exit 1
  }
  cp "$APP_DIR/deploy/nginx-api.haulz.space.conf" "$SITE_DST"
  ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.space
  nginx -t
  systemctl reload nginx
fi

echo "==> TLS check"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null || echo "WARN: openssl check failed"

echo "==> smoke HTTPS"
curl -sS --max-time 10 "https://${DOMAIN}/health"
echo
curl -sS --max-time 10 -o /dev/null -w "POST perevozki: %{http_code}\n" \
  -X POST "https://${DOMAIN}/api/perevozki" \
  -H "Content-Type: application/json" \
  -d '{"login":"x","password":"y","dateFrom":"2026-01-01","dateTo":"2026-01-02"}'

echo "==> smoke via haulz.space (Timeweb proxy, must NOT be 301)"
curl -sS --max-time 12 -o /dev/null -w "haulz.space/api/perevozki POST: %{http_code}\n" \
  -X POST "https://haulz.space/api/perevozki" \
  -H "Content-Type: application/json" \
  -d '{"login":"x","password":"y","dateFrom":"2026-01-01","dateTo":"2026-01-02"}'

if ! curl -sS --max-time 10 "https://${DOMAIN}/health" | grep -q '"ok"'; then
  echo "ERROR: https://${DOMAIN}/health failed — iOS spinner will stay until this is OK" >&2
  exit 2
fi

echo "==> api.haulz.space OK — rebuild TestFlight after git pull + ios:sync"
