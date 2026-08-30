#!/usr/bin/env bash
# Заливка dist/ на VPS (rsync + опционально reload nginx).
#
# Сначала соберите:
#   ./scripts/build-web-app.sh
#
# Заливка (по умолчанию root@72.56.36.185):
#   ./scripts/deploy-web-app-vps.sh
#
# Свой сервер / каталог:
#   HAULZ_WEB_SSH=root@1.2.3.4 \
#   HAULZ_WEB_REMOTE_DIR=/srv/haulz/www \
#   ./scripts/deploy-web-app-vps.sh
#
# Только упаковать tarball (без SSH):
#   ./scripts/deploy-web-app-vps.sh --local
#
# Переменные:
#   HAULZ_WEB_SSH          — SSH target (default: root@72.56.36.185)
#   HAULZ_WEB_REMOTE_DIR   — каталог статики на VPS (default: /var/www/haulz-web)
#   HAULZ_WEB_NGINX_RELOAD — 1 = nginx -t && reload после заливки
#   HAULZ_WEB_SSH_KEY      — путь к приватному ключу (-i), опционально

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
LOCAL_ONLY="${1:-}"

SSH_TARGET="${HAULZ_WEB_SSH:-root@72.56.36.185}"
REMOTE_DIR="${HAULZ_WEB_REMOTE_DIR:-/var/www/haulz-web}"
NGINX_RELOAD="${HAULZ_WEB_NGINX_RELOAD:-0}"
SSH_KEY="${HAULZ_WEB_SSH_KEY:-}"

if [[ ! -f "$DIST/index.html" ]]; then
  echo "dist/ not found. Run first: ./scripts/build-web-app.sh" >&2
  exit 1
fi

SSH_OPTS=()
RSYNC_SSH=()
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS=(-i "$SSH_KEY")
  RSYNC_SSH=(-e "ssh -i $SSH_KEY")
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
TARBALL="$STAGING/haulz-web-dist.tgz"
tar -C "$DIST" -czf "$TARBALL" .

echo "Prepared dist tarball ($(du -h "$TARBALL" | awk '{print $1}'))"

if [[ "$LOCAL_ONLY" == "--local" || -z "$SSH_TARGET" ]]; then
  OUT="$ROOT/dist/web-release"
  mkdir -p "$OUT"
  cp "$TARBALL" "$OUT/haulz-web-dist.tgz"
  cat >"$OUT/README.txt" <<EOF
Upload manually:
  ssh ${SSH_TARGET} "mkdir -p ${REMOTE_DIR}"
  scp haulz-web-dist.tgz ${SSH_TARGET}:/tmp/
  ssh ${SSH_TARGET} "tar -xzf /tmp/haulz-web-dist.tgz -C ${REMOTE_DIR} && rm /tmp/haulz-web-dist.tgz"
EOF
  echo ""
  echo "Local bundle: $OUT/"
  echo "  haulz-web-dist.tgz"
  exit 0
fi

echo "==> upload to ${SSH_TARGET}:${REMOTE_DIR}"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '${REMOTE_DIR}'"
if command -v rsync >/dev/null 2>&1; then
  rsync -avz --delete "${RSYNC_SSH[@]}" "$DIST/" "${SSH_TARGET}:${REMOTE_DIR}/"
else
  scp "${SSH_OPTS[@]}" -q "$TARBALL" "${SSH_TARGET}:/tmp/haulz-web-dist.tgz"
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "tar -xzf /tmp/haulz-web-dist.tgz -C '${REMOTE_DIR}' && rm /tmp/haulz-web-dist.tgz"
fi

if [[ "$NGINX_RELOAD" == "1" ]]; then
  echo "==> nginx reload"
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "nginx -t && systemctl reload nginx"
fi

echo ""
echo "Published static files to ${SSH_TARGET}:${REMOTE_DIR}"
echo ""
echo "Verify (adjust host if nginx настроен на haulz.ru):"
echo "  curl -sS -o /dev/null -w '%{http_code}\\n' http://${SSH_TARGET#*@}/"
echo ""
echo "Note: production фронт haulz.ru обычно на Timeweb App Platform (docker-compose)."
echo "      API backend: bash /opt/haulz/app/deploy/vps-sync-main.sh"
