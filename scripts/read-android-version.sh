#!/usr/bin/env bash
# Читает versionCode / versionName из android/app/build.gradle
set -euo pipefail

GRADLE_FILE="${1:-android/app/build.gradle}"

if [[ ! -f "$GRADLE_FILE" ]]; then
  echo "Gradle file not found: $GRADLE_FILE" >&2
  exit 1
fi

VERSION_CODE="$(grep -E '^\s*versionCode\s+' "$GRADLE_FILE" | head -1 | sed -E 's/.*versionCode[[:space:]]+([0-9]+).*/\1/')"
VERSION_NAME="$(grep -E '^\s*versionName\s+' "$GRADLE_FILE" | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')"

if [[ -z "$VERSION_CODE" || -z "$VERSION_NAME" ]]; then
  echo "Could not parse version from $GRADLE_FILE" >&2
  exit 1
fi

echo "$VERSION_CODE"
echo "$VERSION_NAME"
