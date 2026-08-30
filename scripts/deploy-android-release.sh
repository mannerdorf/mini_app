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

HOST="${ANDROID_RELEASE_HOST:-app.haulz.space}"
ORIGIN="https://${HOST}"
SSH_TARGET="${ANDROID_RELEASE_SSH:-}"
REMOTE_DIR="${ANDROID_RELEASE_DIR:-/var/www/app.haulz.space}"
GRADLE_FILE="$ROOT/android/app/build.gradle"
INDEX_FILE="$ROOT/deploy/android-release-index.html"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first: npm run android:release" >&2
  exit 1
fi

VERSION_CODE="$(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE" | sed -n '1p')"
VERSION_NAME="$(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE" | sed -n '2p')"

if [[ ! "$VERSION_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: invalid versionName \"${VERSION_NAME}\" in build.gradle (expected X.Y.Z)." >&2
  echo "Fix with: ./scripts/bump-android-version.sh --name 1.3.23 --code $((VERSION_CODE))" >&2
  exit 1
fi

APK_BASENAME="haulz-miniapp-${VERSION_NAME}.apk"
RELEASES_PATH="releases/${APK_BASENAME}"
PUBLISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$APK" | awk '{print $1}')"
else
  SHA256="$(sha256sum "$APK" | awk '{print $1}')"
fi

NOTES="${ANDROID_RELEASE_NOTES:-}"

REMOTE_VERSION_CODE=""
if command -v curl >/dev/null 2>&1; then
  REMOTE_VERSION_CODE="$(curl -fsS "${ORIGIN}/version.json" 2>/dev/null | sed -n 's/.*"versionCode"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1 || true)"
fi
if [[ -n "$REMOTE_VERSION_CODE" && "$REMOTE_VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "Remote ${ORIGIN}/version.json → versionCode ${REMOTE_VERSION_CODE}"
  if [[ "$VERSION_CODE" -le "$REMOTE_VERSION_CODE" ]]; then
    echo "ERROR: local versionCode=${VERSION_CODE} must be greater than remote ${REMOTE_VERSION_CODE}." >&2
    echo "Bump android/app/build.gradle, rebuild APK, then deploy again." >&2
    exit 1
  fi
fi

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
echo ""
echo "Verify:"
echo "  curl -sS ${ORIGIN}/version.json"
