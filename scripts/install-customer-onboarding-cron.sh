#!/usr/bin/env bash
set -euo pipefail
# Run on the cron VPS after API deployment and migration 127. No secrets are stored here.
command -v crontab >/dev/null
[[ -x /opt/haulz/cron-call.sh ]]
cron_tmp=$(mktemp)
trap 'rm -f "$cron_tmp"' EXIT
(crontab -l 2>/dev/null || true) | sed '/# BEGIN CUSTOMER ONBOARDING/,/# END CUSTOMER ONBOARDING/d' > "$cron_tmp"
cat >> "$cron_tmp" <<'CRON'
# BEGIN CUSTOMER ONBOARDING
*/5 * * * * /opt/haulz/cron-call.sh /api/cron/refresh-customers-cache
2-59/5 * * * * /opt/haulz/cron-call.sh /api/cron/process-customer-onboarding
# END CUSTOMER ONBOARDING
CRON
crontab "$cron_tmp"
