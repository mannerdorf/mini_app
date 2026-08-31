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
#   ./scripts/deploy-android-vps.sh

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

LOCAL_CODE="$(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE" | sed -n '1p')"
LOCAL_NAME="$(bash "$ROOT/scripts/read-android-version.sh" "$GRADLE_FILE" | sed -n '2p')"

REMOTE_CODE=0
REMOTE_NAME=""
if [[ "$CHECK_REMOTE" == "1" ]] && command -v curl >/dev/null 2>&1; then
  REMOTE_JSON="$(curl -fsS "$REMOTE_URL" 2>/dev/null || true)"
  if [[ -n "$REMOTE_JSON" ]]; then
    REMOTE_CODE="$(printf '%s' "$REMOTE_JSON" | sed -n 's/.*"versionCode"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -1)"
    REMOTE_CODE="${REMOTE_CODE:-0}"
    REMOTE_NAME="$(printf '%s' "$REMOTE_JSON" | sed -n 's/.*"versionName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    echo "Remote ${REMOTE_URL} → versionCode ${REMOTE_CODE}, versionName \"${REMOTE_NAME}\""
  else
    echo "WARN: could not fetch ${REMOTE_URL}; using local only" >&2
  fi
fi

# 0 if $1 > $2 (semver X.Y.Z). bash 3.2-safe, no mapfile/arrays.
semver_gt() {
  local a="$1" b="$2" a1 a2 a3 b1 b2 b3 rest
  a1="${a%%.*}"; rest="${a#*.}"; a2="${rest%%.*}"; a3="${rest#*.}"
  b1="${b%%.*}"; rest="${b#*.}"; b2="${rest%%.*}"; b3="${rest#*.}"
  if [ "$a1" -gt "$b1" ]; then return 0; fi
  if [ "$a1" -lt "$b1" ]; then return 1; fi
  if [ "$a2" -gt "$b2" ]; then return 0; fi
  if [ "$a2" -lt "$b2" ]; then return 1; fi
  if [ "$a3" -gt "$b3" ]; then return 0; fi
  return 1
}

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
  # База для patch: больший semver из local и live version.json
  BASE_NAME="$LOCAL_NAME"
  if [[ ! "$BASE_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$REMOTE_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      BASE_NAME="$REMOTE_NAME"
    else
      BASE_NAME="1.3.22"
    fi
  fi
  if [[ "$CHECK_REMOTE" == "1" && "$REMOTE_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if semver_gt "$REMOTE_NAME" "$BASE_NAME"; then
      BASE_NAME="$REMOTE_NAME"
    fi
  fi
  if [[ "$BASE_NAME" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
    NEW_NAME="${major}.${minor}.$((patch + 1))"
  else
    echo "ERROR: cannot derive versionName from \"${LOCAL_NAME}\"" >&2
    exit 1
  fi
fi

if [[ ! "$NEW_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: invalid versionName \"${NEW_NAME}\" (expected X.Y.Z)" >&2
  exit 1
fi

echo "Local now:  versionCode ${LOCAL_CODE}, versionName \"${LOCAL_NAME}\""
echo "Target:     versionCode ${NEW_CODE}, versionName \"${NEW_NAME}\""

if [[ "$NEW_CODE" -le "$REMOTE_CODE" && "$CHECK_REMOTE" == "1" && -z "$FORCE_CODE" ]]; then
  echo "ERROR: new versionCode ${NEW_CODE} must be > remote ${REMOTE_CODE}" >&2
  exit 1
fi

if [[ "$CHECK_REMOTE" == "1" && -z "$FORCE_NAME" && "$REMOTE_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if ! semver_gt "$NEW_NAME" "$REMOTE_NAME"; then
    echo "ERROR: new versionName ${NEW_NAME} must be > remote ${REMOTE_NAME}" >&2
    exit 1
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run — build.gradle not changed."
  exit 0
fi

TMP="$(mktemp)"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([[:space:]]*versionCode[[:space:]]+)[0-9]+[[:space:]]*$ ]]; then
    printf '%s%s\n' "${BASH_REMATCH[1]}" "$NEW_CODE"
  elif [[ "$line" =~ ^([[:space:]]*versionName[[:space:]]+\")[^\"]*(\".*)$ ]]; then
    printf '%s%s%s\n' "${BASH_REMATCH[1]}" "$NEW_NAME" "${BASH_REMATCH[2]}"
  else
    printf '%s\n' "$line"
  fi
done <"$GRADLE_FILE" >"$TMP"
mv "$TMP" "$GRADLE_FILE"

echo "Updated $GRADLE_FILE"
echo ""
echo "Next:"
echo "  npm run android:release"
echo "  ./scripts/deploy-android-vps.sh"
