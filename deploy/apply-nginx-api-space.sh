#!/usr/bin/env bash
# Применить nginx + Let's Encrypt для api.haulz.space (iOS/Android native API).
# Запуск на API-VPS: bash /opt/haulz/app/deploy/apply-nginx-api-space.sh
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
SITE_SRC="$APP_DIR/deploy/nginx-api.haulz.space.conf"
SITE_DST="/etc/nginx/sites-available/api.haulz.space"
DOMAIN="api.haulz.space"
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on API VPS" >&2
  exit 1
fi

if [[ ! -f "$SITE_SRC" ]]; then
  echo "Missing $SITE_SRC — git pull in $APP_DIR first" >&2
  exit 1
fi

cp "$SITE_SRC" "$SITE_DST"
ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.space
nginx -t
systemctl reload nginx

if [[ ! -f "$LIVE_DIR/fullchain.pem" ]]; then
  echo "==> Issuing Let's Encrypt cert for ${DOMAIN}..."
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${CERTBOT_EMAIL:-admin@haulz.space}" || {
    echo "certbot failed — run interactively: certbot --nginx -d ${DOMAIN}" >&2
    exit 1
  }
fi

nginx -t
systemctl reload nginx

echo "==> TLS SAN check"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

echo "==> smoke"
curl -sS --max-time 8 "https://${DOMAIN}/health"
echo
curl -sS --max-time 8 "https://${DOMAIN}/api/auth-config" | head -c 200
echo

if ! curl -sS --max-time 8 "https://${DOMAIN}/health" | grep -q '"ok"'; then
  echo "ERROR: https://${DOMAIN}/health failed" >&2
  exit 2
fi

echo "==> api.haulz.space HTTPS OK — iOS/Android native API should work"
