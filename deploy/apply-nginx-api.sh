#!/usr/bin/env bash
# Применить nginx-конфиг api.haulz.ru и проверить TLS/HTTP.
# Запуск на VPS: bash /opt/haulz/app/deploy/apply-nginx-api.sh
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
SITE_SRC="$APP_DIR/deploy/nginx-api.haulz.ru.conf"
SITE_DST="/etc/nginx/sites-available/api.haulz.ru"
CERT_SNIPPET="/etc/nginx/snippets/haulz-api-ssl-certs.conf"
DOMAIN="${HAULZ_API_DOMAIN:-api.haulz.ru}"
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "Missing $SITE_SRC" >&2
  exit 1
fi

if [[ ! -f "$LIVE_DIR/fullchain.pem" || ! -f "$LIVE_DIR/privkey.pem" ]]; then
  echo "Missing Let's Encrypt certs in $LIVE_DIR" >&2
  echo "Run: certbot --nginx -d $DOMAIN" >&2
  exit 1
fi

mkdir -p /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html

# Backup current site if present
if [[ -f "$SITE_DST" ]]; then
  cp -a "$SITE_DST" "${SITE_DST}.bak.$(date +%Y%m%d%H%M%S)"
fi

{
  echo "ssl_certificate     ${LIVE_DIR}/fullchain.pem;"
  echo "ssl_certificate_key ${LIVE_DIR}/privkey.pem;"
  if [[ -s /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    echo "include /etc/letsencrypt/options-ssl-nginx.conf;"
  fi
  if [[ -s /etc/letsencrypt/ssl-dhparams.pem ]]; then
    echo "ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
} > "$CERT_SNIPPET"

cp "$SITE_SRC" "$SITE_DST"
ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.ru

# Drop default site if it steals server_name
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

# Ensure worker_connections is not tiny (best-effort comment in nginx.conf)
nginx -t
systemctl reload nginx

echo "==> smoke"
curl -sS --max-time 5 -H "Host: ${DOMAIN}" "http://127.0.0.1/api/auth-config" | head -c 160; echo
curl -skS --max-time 5 -H "Host: ${DOMAIN}" "https://127.0.0.1/api/auth-config" | head -c 160; echo
# External-facing check from the box
curl -sS --max-time 8 "https://${DOMAIN}/api/auth-config" | head -c 160; echo

# Confirm :80 /api is NOT a blind 301 for API
code=$(curl -sS --max-time 5 -o /tmp/haulz_http_api.json -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1/api/auth-config" || true)
echo "http80_api_code=${code}"
if [[ "$code" == "301" || "$code" == "302" ]]; then
  echo "WARN: /api on :80 still redirects — TLS outages will kill the app" >&2
  exit 2
fi

echo "==> nginx api applied OK"
