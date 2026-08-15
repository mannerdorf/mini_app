#!/usr/bin/env bash
# Публикация signed APK на android.haulz.space (отдельный Timeweb-сервер).
#
# Локально (только сгенерировать version.json):
#   ./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local
#
# На сервер:
#   ANDROID_RELEASE_SSH=root@1.2.3.4 \
#   ANDROID_RELEASE_HOST=android.haulz.space \
#   ./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk
#
# Перед деплоем увеличьте versionCode в android/app/build.gradle.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$ROOT/dist/haulz-miniapp-release.apk}"
LOCAL_ONLY="${2:-}"

HOST="${ANDROID_RELEASE_HOST:-android.haulz.space}"
ORIGIN="https://${HOST}"
SSH_TARGET="${ANDROID_RELEASE_SSH:-}"
REMOTE_DIR="${ANDROID_RELEASE_DIR:-/var/www/android.haulz.space}"
GRADLE_FILE="$ROOT/android/app/build.gradle"
INDEX_FILE="$ROOT/deploy/android-release-index.html"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first: npm run android:release" >&2
  exit 1
fi

mapfile -t VERSION_LINES < <(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE")
VERSION_CODE="${VERSION_LINES[0]}"
VERSION_NAME="${VERSION_LINES[1]}"

APK_BASENAME="haulz-miniapp-${VERSION_NAME}.apk"
RELEASES_PATH="releases/${APK_BASENAME}"
PUBLISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$APK" | awk '{print $1}')"
else
  SHA256="$(sha256sum "$APK" | awk '{print $1}')"
fi

NOTES="${ANDROID_RELEASE_NOTES:-}"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$STAGING/releases"
cp "$APK" "$STAGING/latest.apk"
cp "$APK" "$STAGING/releases/$APK_BASENAME"

cat >"$STAGING/version.json" <<EOF
{
  "versionName": "${VERSION_NAME}",
  "versionCode": ${VERSION_CODE},
  "apkUrl": "${ORIGIN}/latest.apk",
  "apkFile": "${APK_BASENAME}",
  "releasesPath": "/${RELEASES_PATH}",
  "sha256": "${SHA256}",
  "publishedAt": "${PUBLISHED_AT}",
  "releaseNotes": "${NOTES}",
  "appId": "ru.haulz.miniapp"
}
EOF

cp "$INDEX_FILE" "$STAGING/index.html"

echo "Prepared release ${VERSION_NAME} (${VERSION_CODE})"
echo "  sha256: ${SHA256}"
echo "  staging: ${STAGING}"

if [[ "$LOCAL_ONLY" == "--local" || -z "$SSH_TARGET" ]]; then
  OUT="$ROOT/dist/android-release"
  mkdir -p "$OUT/releases"
  cp -R "$STAGING/"* "$OUT/"
  echo ""
  echo "Local bundle (upload manually or set ANDROID_RELEASE_SSH):"
  echo "  $OUT/"
  echo "  $OUT/version.json"
  exit 0
fi

echo "Uploading to ${SSH_TARGET}:${REMOTE_DIR} ..."
ssh "$SSH_TARGET" "mkdir -p '${REMOTE_DIR}/releases'"
scp -q "$STAGING/version.json" "$STAGING/index.html" "$STAGING/latest.apk" "${SSH_TARGET}:${REMOTE_DIR}/"
scp -q "$STAGING/$RELEASES_PATH" "${SSH_TARGET}:${REMOTE_DIR}/${RELEASES_PATH}"

echo ""
echo "Published:"
echo "  ${ORIGIN}/"
echo "  ${ORIGIN}/latest.apk"
echo "  ${ORIGIN}/version.json"
echo "  ${ORIGIN}/${RELEASES_PATH}"
