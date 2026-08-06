#!/usr/bin/env bash
# Собрать tarball для апгрейда normalized cache на VPS (поверх 062cd21 + Timeweb overlay).
# Запуск на Mac:
#   bash deploy/build-vps-cache-upgrade-tgz.sh
#   scp /tmp/haulz-vps-cache-upgrade.tgz root@72.56.36.185:/tmp/
#   ssh root@72.56.36.185 'bash /tmp/apply-vps-cache-upgrade.sh /tmp/haulz-vps-cache-upgrade.tgz'

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="/tmp/haulz-vps-cache-upgrade"
OUT="/tmp/haulz-vps-cache-upgrade.tgz"

rm -rf "$STAGE"
mkdir -p "$STAGE"/{lib,api,migrations,deploy}

FILES=(
  lib/documentCacheNormalized.ts
  lib/documentCacheRead.ts
  lib/documentCacheRefreshCore.ts
  lib/sendingsMetrics.ts
  api/perevozki.ts
  api/sendings.ts
  api/invoices.ts
  api/acts.ts
  api/admin-document-cache-backfill.ts
  migrations/087_cache_document_rows.sql
  deploy/apply-vps-cache-upgrade.sh
)

for f in "${FILES[@]}"; do
  cp "$ROOT/$f" "$STAGE/$f"
done

cat >"$STAGE/UPGRADE_NOTE.txt" <<EOF
Normalized document cache upgrade
Built from: $(git -C "$ROOT" rev-parse --short HEAD) $(git -C "$ROOT" log -1 --format='%s')
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

tar -czf "$OUT" -C "$STAGE" .
echo "==> $OUT ($(du -h "$OUT" | awk '{print $1}'))"
tar -tzf "$OUT" | head -20
