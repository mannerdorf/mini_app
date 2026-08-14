#!/usr/bin/env bash
# Откат кода API на VPS к pre-refactor + Timeweb DB + invoice strip.
# НЕ трогает /opt/haulz/.env
#
# На Mac:  scp /tmp/haulz-vps-rollback-062cd21-timeweb.tgz root@72.56.36.185:/tmp/
# На VPS:  bash /opt/haulz/app/deploy/apply-vps-rollback.sh
#   или:   TGZ=/tmp/haulz-vps-rollback-062cd21-timeweb.tgz bash -s < deploy/apply-vps-rollback.sh
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"
TGZ="${TGZ:-/tmp/haulz-vps-rollback-062cd21-timeweb.tgz}"
BACKUP="/opt/haulz/app.bak.$(date +%Y%m%d%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ ! -f "$TGZ" ]]; then
  echo "Missing tarball: $TGZ" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — abort (Timeweb DATABASE_URL must stay)" >&2
  exit 1
fi

echo "==> env stays at $ENV_FILE (not overwritten)"
grep -E '^(DATABASE_URL|PGSSLMODE|PUBLIC_API_ORIGIN)=' "$ENV_FILE" | sed 's/=.*/=***/' || true

echo "==> backup $APP_DIR -> $BACKUP"
systemctl stop haulz-api || true
mv "$APP_DIR" "$BACKUP"
mkdir -p "$APP_DIR"

echo "==> extract $TGZ"
tar -xzf "$TGZ" -C "$APP_DIR"

# restore env-dependent deploy scripts if missing from tarball
if [[ -f "$BACKUP/deploy/stabilize-vps.sh" && ! -f "$APP_DIR/deploy/stabilize-vps.sh" ]]; then
  cp -a "$BACKUP/deploy/stabilize-vps.sh" "$APP_DIR/deploy/" || true
fi

cd "$APP_DIR"
echo "==> npm ci"
npm ci

echo "==> restart haulz-api (nginx leave as-is)"
systemctl start haulz-api
sleep 2
systemctl --no-pager --full status haulz-api | head -20 || true

echo "==> smoke"
curl -sS --max-time 8 http://127.0.0.1:3000/api/auth-config | head -c 160; echo
curl -sS --max-time 8 -H 'Host: api.haulz.ru' http://127.0.0.1/api/auth-config | head -c 160; echo

echo "==> rollback applied. Backup: $BACKUP"
echo "    Restore if needed: systemctl stop haulz-api; rm -rf $APP_DIR; mv $BACKUP $APP_DIR; systemctl start haulz-api"
