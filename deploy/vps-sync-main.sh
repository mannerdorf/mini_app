#!/usr/bin/env bash
# Sync VPS api.haulz.ru to origin/main (эталон prod — см. deploy/README-vps-api.md).
# Run on haulzbackend as root:
#   bash /opt/haulz/app/deploy/vps-sync-main.sh
# Or after tarball:
#   cd /opt/haulz/app && tar xzf /tmp/haulz-main-55861c2.tgz && bash deploy/vps-sync-main.sh

set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
ENV_FILE="${HAULZ_ENV_FILE:-/opt/haulz/.env}"

cd "$APP_DIR"

echo "==> haulz-api sync in $APP_DIR"

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

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "==> apply migrations (best-effort)"
  for f in migrations/*.sql; do
    [[ -f "$f" ]] || continue
    psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$f" >/dev/null 2>&1 || true
  done
fi

if [[ -f deploy/cron-call.sh ]]; then
  install -m 755 deploy/cron-call.sh /opt/haulz/cron-call.sh
fi

echo "==> restart haulz-api"
systemctl restart haulz-api
sleep 2

echo "==> smoke tests"
curl -fsS http://127.0.0.1:3000/api/auth-config | head -c 120; echo
curl -sS http://127.0.0.1:3000/api/admin-haulz-calculator-tariffs -H "Authorization: Bearer test" | head -c 120; echo
curl -sS http://127.0.0.1:3000/api/admin-document-cache-backfill -H "Authorization: Bearer test" | head -c 120; echo

echo "==> done"
