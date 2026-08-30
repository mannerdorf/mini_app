#!/usr/bin/env bash
# Поднять versionCode / versionName в android/app/build.gradle.
#
# Использование:
#   ./scripts/bump-android-version.sh              # +1 code, patch name, сверка с app.haulz.space
#   ./scripts/bump-android-version.sh --dry-run      # только показать, без записи
#   ./scripts/bump-android-version.sh --code 30 --name 1.4.0
#   ./scripts/bump-android-version.sh --no-remote    # не смотреть version.json на сервере
#
# После bump:
#   npm run android:release
#   ./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRADLE_FILE="$ROOT/android/app/build.gradle"
REMOTE_HOST="${ANDROID_RELEASE_HOST:-app.haulz.space}"
REMOTE_URL="https://${REMOTE_HOST}/version.json"

DRY_RUN=0
CHECK_REMOTE=1
FORCE_CODE=""
FORCE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-remote) CHECK_REMOTE=0 ;;
    --code) FORCE_CODE="${2:?--code requires number}"; shift ;;
    --name) FORCE_NAME="${2:?--name requires string}"; shift ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "$GRADLE_FILE" ]]; then
  echo "Not found: $GRADLE_FILE" >&2
  exit 1
fi

read -r LOCAL_CODE LOCAL_NAME < <(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE")

REMOTE_CODE=0
if [[ "$CHECK_REMOTE" == "1" ]] && command -v curl >/dev/null 2>&1; then
  REMOTE_JSON="$(curl -fsS "$REMOTE_URL" 2>/dev/null || true)"
  if [[ -n "$REMOTE_JSON" ]]; then
    REMOTE_CODE="$(printf '%s' "$REMOTE_JSON" | sed -n 's/.*"versionCode"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)"
    REMOTE_CODE="${REMOTE_CODE:-0}"
    echo "Remote ${REMOTE_URL} → versionCode ${REMOTE_CODE}"
  else
    echo "WARN: could not fetch ${REMOTE_URL}; using local only" >&2
  fi
fi

if [[ -n "$FORCE_CODE" ]]; then
  NEW_CODE="$FORCE_CODE"
else
  BASE_CODE="$LOCAL_CODE"
  if [[ "$REMOTE_CODE" -gt "$BASE_CODE" ]]; then
    BASE_CODE="$REMOTE_CODE"
  fi
  NEW_CODE=$((BASE_CODE + 1))
fi

if [[ -n "$FORCE_NAME" ]]; then
  NEW_NAME="$FORCE_NAME"
else
  # 1.3.22 → 1.3.23 ; fallback: append .1
  if [[ "$LOCAL_NAME" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
    NEW_NAME="${major}.${minor}.$((patch + 1))"
  else
    NEW_NAME="${LOCAL_NAME}.1"
  fi
fi

echo "Local now:  versionCode ${LOCAL_CODE}, versionName \"${LOCAL_NAME}\""
echo "Target:     versionCode ${NEW_CODE}, versionName \"${NEW_NAME}\""

if [[ "$NEW_CODE" -le "$REMOTE_CODE" && "$CHECK_REMOTE" == "1" && -z "$FORCE_CODE" ]]; then
  echo "ERROR: new versionCode ${NEW_CODE} must be > remote ${REMOTE_CODE}" >&2
  exit 1
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run — build.gradle not changed."
  exit 0
fi

TMP="$(mktemp)"
sed -E \
  -e "s/^([[:space:]]*versionCode[[:space:]]+)[0-9]+/\1${NEW_CODE}/" \
  -e "s/^([[:space:]]*versionName[[:space:]]+\")[^\"]+/\1${NEW_NAME}/" \
  "$GRADLE_FILE" >"$TMP"
mv "$TMP" "$GRADLE_FILE"

echo "Updated $GRADLE_FILE"
echo ""
echo "Next:"
echo "  npm run android:release"
echo "  export ANDROID_RELEASE_SSH=root@200.165.236.49 ANDROID_RELEASE_HOST=app.haulz.space"
echo "  ./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk"
