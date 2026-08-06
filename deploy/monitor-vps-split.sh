#!/usr/bin/env bash
# Краткий health-check после split API + cron VPS.
# Usage: bash deploy/monitor-vps-split.sh [api|cron]
set -euo pipefail

ROLE="${1:-}"

check_api() {
  echo "==> API-VPS checks"
  systemctl is-active haulz-api || true
  curl -fsS --max-time 8 -o /dev/null -w "auth-config: %{http_code} %{time_total}s\n" \
    "https://api.haulz.ru/api/auth-config" || echo "auth-config FAIL"
  curl -fsS --max-time 3 http://127.0.0.1:3000/health && echo "local health OK"
  journalctl -u haulz-api --since "10 min ago" --no-pager -n 5 || true
}

check_cron() {
  echo "==> Cron-VPS checks"
  systemctl is-active haulz-cron || true
  curl -fsS --max-time 3 http://127.0.0.1:3000/health && echo "local health OK"
  journalctl -u haulz-cron --since "30 min ago" --no-pager -n 10 || true
  if crontab -l 2>/dev/null | grep -q cron-call; then
    echo "crontab: cron-call jobs present"
  else
    echo "WARN: no cron-call in crontab" >&2
  fi
}

case "$ROLE" in
  api) check_api ;;
  cron) check_cron ;;
  "")
    check_api 2>/dev/null || echo "(not API VPS?)"
    echo "---"
    check_cron 2>/dev/null || echo "(not cron VPS?)"
    ;;
  *)
    echo "usage: $0 [api|cron]" >&2
    exit 1
    ;;
esac

echo "==> memory"
free -h | head -2

echo "==> recent OOM"
dmesg -T 2>/dev/null | grep -i 'out of memory' | tail -3 || true
