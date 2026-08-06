#!/usr/bin/env bash
# Заменить /opt/haulz/.env на VPS (с бэкапом и переносом DGIS/Zvonobot из старого файла).
#
# С Mac (после ввода пароля root):
#   cd /Users/aleksandr/mini_app_last/mini_app
#   scp deploy/.env.vps deploy/apply-vps-env.sh root@72.56.36.185:/tmp/
#   ssh root@72.56.36.185 'bash /tmp/apply-vps-env.sh /tmp/.env.vps'
#
# Уже на VPS:
#   bash /opt/haulz/app/deploy/apply-vps-env.sh /path/to/.env.vps

set -euo pipefail

SRC="${1:-/tmp/.env.vps}"
DEST="/opt/haulz/.env"
TS="$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: file not found: $SRC" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo bash $0 ...)" >&2
  exit 1
fi

merge_key_from_old() {
  local key="$1"
  local old_file="$2"
  local new_file="$3"
  if [[ ! -f "$old_file" ]]; then
    return 0
  fi
  local old_val new_val
  old_val="$(grep -E "^${key}=" "$old_file" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  new_val="$(grep -E "^${key}=" "$new_file" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  if [[ -n "$old_val" && -z "$new_val" ]]; then
    if grep -q "^${key}=" "$new_file"; then
      sed -i "s|^${key}=.*|${key}=${old_val}|" "$new_file"
    else
      echo "${key}=${old_val}" >>"$new_file"
    fi
    echo "==> preserved ${key} from previous .env"
  fi
}

if [[ -f "$DEST" ]]; then
  cp -a "$DEST" "${DEST}.bak.${TS}"
  echo "==> backup: ${DEST}.bak.${TS}"
fi

TMP="$(mktemp)"
cp "$SRC" "$TMP"
chmod 600 "$TMP"

merge_key_from_old HAULZ_DGIS_API_KEY "$DEST" "$TMP"
merge_key_from_old ZVONOBOT_API_KEY "$DEST" "$TMP"

install -m 600 "$TMP" "$DEST"
rm -f "$TMP"

echo "==> installed $DEST ($(wc -l <"$DEST") lines)"
grep -E '^(DATABASE_URL|PGSSLMODE|PUBLIC_API_ORIGIN|NEXT_PUBLIC_APP_URL)=' "$DEST" | sed 's/=.*/=***/'

systemctl restart haulz-api
sleep 2

echo "==> haulz-api status"
systemctl is-active haulz-api || { systemctl status haulz-api --no-pager; exit 1; }

echo "==> smoke"
curl -fsS http://127.0.0.1:3000/api/auth-config | head -c 200
echo
curl -sS -o /dev/null -w "https api auth-config: %{http_code}\n" https://api.haulz.ru/api/auth-config

echo "==> done"
