#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
KEYSTORE="$ANDROID_DIR/haulz-release.jks"
PROPS="$ANDROID_DIR/keystore.properties"
API_ORIGIN="${VITE_API_ORIGIN:-https://api.haulz.space}"

cd "$ROOT"

if ! command -v java >/dev/null 2>&1; then
  echo "Java (JDK 21) is required." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK path." >&2
  exit 1
fi

if [[ ! -f "$KEYSTORE" ]]; then
  STORE_PASS="${HAULZ_ANDROID_STORE_PASSWORD:-haulz-miniapp-store}"
  KEY_PASS="${HAULZ_ANDROID_KEY_PASSWORD:-$STORE_PASS}"
  echo "Creating release keystore at android/haulz-release.jks (first run only)..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias haulz \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASS" \
    -keypass "$KEY_PASS" \
    -dname "CN=HAULZ Mini App, OU=Mobile, O=HAULZ, L=Moscow, ST=Moscow, C=RU"
fi

if [[ ! -f "$PROPS" ]]; then
  STORE_PASS="${HAULZ_ANDROID_STORE_PASSWORD:-haulz-miniapp-store}"
  KEY_PASS="${HAULZ_ANDROID_KEY_PASSWORD:-$STORE_PASS}"
  cat >"$PROPS" <<EOF
storeFile=haulz-release.jks
storePassword=$STORE_PASS
keyAlias=haulz
keyPassword=$KEY_PASS
EOF
  echo "Wrote android/keystore.properties (local only, not committed)."
fi

echo "Building web bundle for Capacitor (API: $API_ORIGIN)..."
VITE_API_ORIGIN="$API_ORIGIN" npm run build

echo "Syncing Capacitor Android project..."
npx cap sync android

echo "Assembling signed release APK..."
cd "$ANDROID_DIR"
chmod +x ./gradlew
./gradlew assembleRelease

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  echo "Release APK not found at $APK" >&2
  exit 1
fi

OUT="$ROOT/dist/haulz-miniapp-release.apk"
mkdir -p "$ROOT/dist"
cp "$APK" "$OUT"
echo ""
echo "Signed release APK:"
echo "  $OUT"
echo "  $APK"
