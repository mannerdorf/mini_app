#!/usr/bin/env bash
# Первичная установка cron-VPS. Запуск: bash deploy/setup-cron-vps.sh (root).
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"
REPO="${HAULZ_GIT_REPO:-https://github.com/mannerdorf/mini_app.git}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates postgresql-client ufw

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null || echo v0)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

mkdir -p /opt/haulz
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin main 2>/dev/null || true
git checkout main 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

echo "==> npm ci"
npm ci

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE — copy from API-VPS:" >&2
  echo "  scp root@72.56.36.185:/opt/haulz/.env root@$(hostname -I | awk '{print $1}'):$ENV_FILE" >&2
  exit 1
fi
chmod 600 "$ENV_FILE"

install -m 755 "$APP_DIR/deploy/cron-call.sh" /opt/haulz/cron-call.sh
cp "$APP_DIR/deploy/haulz-cron.service" /etc/systemd/system/haulz-cron.service
systemctl daemon-reload
systemctl enable haulz-cron
systemctl restart haulz-cron
sleep 2

echo "==> firewall (SSH only)"
ufw allow OpenSSH
ufw --force enable

echo "==> health"
curl -fsS http://127.0.0.1:3000/health
echo

echo "==> next steps:"
echo "  1. Whitelist this IP in Timeweb Postgres"
echo "  2. bash $APP_DIR/deploy/test-cron-smoke.sh"
echo "  3. bash $APP_DIR/deploy/cutover-cron-enable.sh   # after API cutover prep"
echo "  4. On API-VPS: bash deploy/cutover-api-remove-cron.sh"
