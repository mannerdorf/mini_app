#!/usr/bin/env bash
# Починка SSL api.haulz.space на VPS (72.56.36.185).
# С Mac (без git pull на сервере):
#   scp deploy/nginx-api.haulz.space.conf deploy/fix-api-space-ssl.sh root@72.56.36.185:/tmp/
#   ssh root@72.56.36.185 'bash /tmp/fix-api-space-ssl.sh /tmp/nginx-api.haulz.space.conf'
set -euo pipefail

CONF_SRC="${1:-/opt/haulz/app/deploy/nginx-api.haulz.space.conf}"
SITE_DST="/etc/nginx/sites-available/api.haulz.space"
DOMAIN="api.haulz.space"
EMAIL="${CERTBOT_EMAIL:-admin@haulz.space}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запускайте на VPS от root" >&2
  exit 1
fi

if [[ ! -f "$CONF_SRC" ]]; then
  echo "Нет файла $CONF_SRC" >&2
  echo "С Mac: scp deploy/nginx-api.haulz.space.conf root@72.56.36.185:/tmp/" >&2
  exit 1
fi

echo "==> Текущие сертификаты"
ls -la /etc/letsencrypt/live/ 2>/dev/null || true

echo "==> HTTP-only nginx (без :443, пока нет cert для ${DOMAIN})"
awk '/^server \{/{n++} n==2{exit} {print}' "$CONF_SRC" > "$SITE_DST"
ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.space
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Проверка :80 /health"
curl -sS --max-time 5 "http://127.0.0.1/health" -H "Host: ${DOMAIN}" || true
echo

if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  echo "==> Выпуск cert для ${DOMAIN}..."
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" \
    || certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
fi

if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  echo "ERROR: cert для ${DOMAIN} не создан. Запустите вручную:" >&2
  echo "  certbot certonly --nginx -d ${DOMAIN}" >&2
  exit 2
fi

echo "==> Полный nginx (HTTP + HTTPS с cert ${DOMAIN})"
cp "$CONF_SRC" "$SITE_DST"
ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/api.haulz.space
nginx -t
systemctl reload nginx

echo "==> TLS SAN (должен быть ${DOMAIN}, НЕ api.haulz.ru)"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName

echo "==> smoke HTTPS"
curl -sS --max-time 10 "https://${DOMAIN}/health"
echo
curl -sS --max-time 10 -o /dev/null -w "POST perevozki: HTTP %{http_code}\n" \
  -X POST "https://${DOMAIN}/api/perevozki" \
  -H "Content-Type: application/json" \
  -d '{"login":"x","password":"y","dateFrom":"2026-01-01","dateTo":"2026-01-02"}'

curl -sS --max-time 12 -o /dev/null -w "haulz.space POST: HTTP %{http_code}\n" \
  -X POST "https://haulz.space/api/perevozki" \
  -H "Content-Type: application/json" \
  -d '{"login":"x","password":"y","dateFrom":"2026-01-01","dateTo":"2026-01-02"}'

echo "==> OK если health {\"ok\":true} и cert SAN = ${DOMAIN}"
