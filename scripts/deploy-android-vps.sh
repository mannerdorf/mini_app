#!/usr/bin/env bash
# Заливка release APK на production Android-VPS (app.haulz.space).
#
# Сначала соберите APK (versionCode должен быть > remote):
#   npm run android:release:ship
#   # или: ./scripts/bump-android-version.sh && npm run android:release
#
# Заливка:
#   ./scripts/deploy-android-vps.sh
#
# Только упаковать без SSH:
#   ./scripts/deploy-android-vps.sh --local
#
# Release notes (опционально):
#   ANDROID_RELEASE_NOTES='Исправления push' ./scripts/deploy-android-vps.sh
#
# Переопределение сервера:
#   HAULZ_ANDROID_SSH=root@1.2.3.4 ./scripts/deploy-android-vps.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$ROOT/dist/haulz-miniapp-release.apk}"
MODE="${2:-}"

export ANDROID_RELEASE_SSH="${HAULZ_ANDROID_SSH:-${ANDROID_RELEASE_SSH:-root@200.165.236.49}}"
export ANDROID_RELEASE_HOST="${HAULZ_ANDROID_HOST:-${ANDROID_RELEASE_HOST:-app.haulz.space}}"
export ANDROID_RELEASE_DIR="${HAULZ_ANDROID_DIR:-${ANDROID_RELEASE_DIR:-/var/www/app.haulz.space}}"

if [[ "$MODE" == "--local" || "${1:-}" == "--local" ]]; then
  exec bash "$ROOT/scripts/deploy-android-release.sh" "$APK" --local
fi

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first:" >&2
  echo "  cd ~/mini_app && npm run android:release:ship" >&2
  exit 1
fi

echo "==> deploy to ${ANDROID_RELEASE_HOST} via ${ANDROID_RELEASE_SSH}"
exec bash "$ROOT/scripts/deploy-android-release.sh" "$APK"
