#!/usr/bin/env bash
# Если HTTPS api.haulz.ru с localhost не отвечает — reload/restart nginx.
# Crontab (root): * * * * * /opt/haulz/watchdog-api-tls.sh >/dev/null 2>&1
set -uo pipefail

DOMAIN="${HAULZ_API_DOMAIN:-api.haulz.ru}"
LOG="${HAULZ_WATCHDOG_LOG:-/var/log/haulz-api-watchdog.log}"
LOCK="/run/haulz-api-watchdog.lock"

exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

ok=0
for i in 1 2 3; do
  if curl -skS --max-time 4 -o /dev/null -w '' "https://127.0.0.1/api/auth-config" -H "Host: ${DOMAIN}"; then
    # also require JSON-ish body
    body=$(curl -skS --max-time 4 -H "Host: ${DOMAIN}" "https://127.0.0.1/api/auth-config" || true)
    if echo "$body" | grep -q '"config"'; then
      ok=1
      break
    fi
  fi
  sleep 1
done

if [[ "$ok" -eq 1 ]]; then
  exit 0
fi

echo "$(ts) tls_check_failed -> nginx reload" >>"$LOG"
systemctl reload nginx || true
sleep 2

ok2=0
body=$(curl -skS --max-time 5 -H "Host: ${DOMAIN}" "https://127.0.0.1/api/auth-config" || true)
if echo "$body" | grep -q '"config"'; then
  ok2=1
fi

if [[ "$ok2" -eq 1 ]]; then
  echo "$(ts) recovered_after_reload" >>"$LOG"
  exit 0
fi

echo "$(ts) still_failing -> nginx restart + haulz-api restart" >>"$LOG"
systemctl restart nginx || true
systemctl restart haulz-api || true
sleep 2
body=$(curl -skS --max-time 5 -H "Host: ${DOMAIN}" "https://127.0.0.1/api/auth-config" || true)
echo "$(ts) after_restart body=${body:0:120}" >>"$LOG"
