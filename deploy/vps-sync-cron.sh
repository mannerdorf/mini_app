#!/usr/bin/env bash
# Sync dedicated cron VPS to origin/main (no DB migrations — see deploy/README-vps-cron.md).
# Run on cron VPS as root:
#   bash /opt/haulz/app/deploy/vps-sync-cron.sh

set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"

cd "$APP_DIR"

echo "==> haulz-cron sync in $APP_DIR"

if [[ -d .git ]]; then
  if git remote get-url origin 2>/dev/null | grep -q 'github.com'; then
    echo "==> git fetch origin main"
    git fetch origin main
    git reset --hard origin/main
  else
    echo "==> git remote not configured; using files on disk"
  fi
else
  echo "==> no .git; using files on disk"
fi

echo "==> npm ci"
npm ci

if [[ -f deploy/cron-call.sh ]]; then
  install -m 755 deploy/cron-call.sh /opt/haulz/cron-call.sh
fi

if [[ -f deploy/haulz-cron.service ]]; then
  cp deploy/haulz-cron.service /etc/systemd/system/haulz-cron.service
  systemctl daemon-reload
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

echo "==> restart haulz-cron"
systemctl restart haulz-cron
sleep 2

echo "==> smoke tests"
curl -fsS http://127.0.0.1:3000/health
echo
if [[ -n "${CRON_SECRET:-}" ]]; then
  curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" \
    "http://127.0.0.1:3000/api/cron/process-claim-push-queue" | head -c 160 || true
  echo
else
  echo "WARN: CRON_SECRET not set in $ENV_FILE"
fi

echo "==> done (migrations run only on API VPS: deploy/vps-sync-main.sh)"
