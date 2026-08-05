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
DISABLE_DIR="/etc/nginx/sites-disabled-haulz-$(date +%Y%m%d%H%M%S)"

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

mkdir -p /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html "$DISABLE_DIR"

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

# Убрать default и любые другие site-файлы, где server_name = api.haulz.ru
# (часто certbot оставляет отдельный блок только с return 301).
if [[ -L /etc/nginx/sites-enabled/default || -f /etc/nginx/sites-enabled/default ]]; then
  mv /etc/nginx/sites-enabled/default "$DISABLE_DIR/default" || true
fi

shopt -s nullglob
for f in /etc/nginx/sites-enabled/*; do
  base=$(basename "$f")
  [[ "$base" == "api.haulz.ru" ]] && continue
  # симлинк/файл упоминает наш домен — отключаем, чтобы не было второго server{} с 301
  if grep -qE "server_name[[:space:]]+.*${DOMAIN}" "$f" 2>/dev/null; then
    echo "==> disable conflicting site: $f"
    mv "$f" "$DISABLE_DIR/$base"
  fi
done
shopt -u nullglob

# Также вычистить conf.d, если certbot клал туда
shopt -s nullglob
for f in /etc/nginx/conf.d/*.conf; do
  if grep -qE "server_name[[:space:]]+.*${DOMAIN}" "$f" 2>/dev/null; then
    echo "==> disable conflicting conf.d: $f"
    mv "$f" "$DISABLE_DIR/conf.d-$(basename "$f")"
  fi
done
shopt -u nullglob

nginx -t
systemctl reload nginx

echo "==> active server_name matches for ${DOMAIN}:"
grep -RIn --include='*.conf' "server_name" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -F "$DOMAIN" || true

echo "==> smoke"
echo -n "http80: "
curl -sS --max-time 5 -D- -o /tmp/haulz_http_api.json -H "Host: ${DOMAIN}" "http://127.0.0.1/api/auth-config" | head -n 1
head -c 160 /tmp/haulz_http_api.json; echo
echo -n "https_local: "
curl -skS --max-time 5 -H "Host: ${DOMAIN}" "https://127.0.0.1/api/auth-config" | head -c 160; echo
echo -n "https_public: "
curl -sS --max-time 8 "https://${DOMAIN}/api/auth-config" | head -c 160; echo

code=$(curl -sS --max-time 5 -o /tmp/haulz_http_api.json -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1/api/auth-config" || true)
echo "http80_api_code=${code}"
if [[ "$code" != "200" ]]; then
  echo "ERROR: /api on :80 must return 200 JSON (got ${code}). Disabled sites in $DISABLE_DIR" >&2
  echo "==> dump listen/server from enabled sites:" >&2
  grep -RIn --include='*.conf' -E 'listen |server_name |return 301|location /api' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -80 >&2 || true
  exit 2
fi

if ! grep -q '"config"' /tmp/haulz_http_api.json; then
  echo "ERROR: http :80 /api body is not auth-config JSON" >&2
  head -c 200 /tmp/haulz_http_api.json >&2; echo >&2
  exit 2
fi

echo "==> nginx api applied OK (disabled extras in $DISABLE_DIR)"
