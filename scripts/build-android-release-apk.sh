#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
KEYSTORE="$ANDROID_DIR/haulz-release.jks"
PROPS="$ANDROID_DIR/keystore.properties"
API_ORIGIN="${VITE_API_ORIGIN:-https://api.haulz.space}"

cd "$ROOT"

resolve_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    return 0
  fi
  local candidate
  for candidate in \
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"; do
    if [[ -x "$candidate/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "Using JAVA_HOME=$JAVA_HOME"
      return 0
    fi
  done
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local picked
    picked="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [[ -n "$picked" && -x "$picked/bin/java" ]]; then
      export JAVA_HOME="$picked"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "Using JAVA_HOME=$JAVA_HOME"
      return 0
    fi
  fi
  return 1
}

if ! command -v java >/dev/null 2>&1 || ! java -version 2>&1 | grep -qE 'version "(1[7-9]|[2-9][0-9])'; then
  resolve_java_home || true
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java JDK 17+ is required (recommended: brew install openjdk@21)." >&2
  exit 1
fi

if ! java -version 2>&1 | grep -qE 'version "(1[7-9]|[2-9][0-9])'; then
  echo "Android Gradle plugin requires Java 17+. Current:" >&2
  java -version >&2
  echo "Intel Mac: export JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" >&2
  echo "Apple Silicon: export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
    echo "Using ANDROID_HOME=$ANDROID_HOME"
  else
    echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK path." >&2
    echo "Typical Mac path: export ANDROID_HOME=\"\$HOME/Library/Android/sdk\"" >&2
    exit 1
  fi
fi

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
LOCAL_PROPS="$ANDROID_DIR/local.properties"
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "Android SDK directory not found: $ANDROID_HOME" >&2
  echo "Install Android Studio SDK or fix ANDROID_HOME / android/local.properties (sdk.dir)." >&2
  exit 1
fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" >"$LOCAL_PROPS"
echo "Wrote $LOCAL_PROPS → sdk.dir=$ANDROID_HOME"

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

echo "Installing npm dependencies..."
npm ci

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
echo ""
echo "Publish to app.haulz.space:"
echo "  ANDROID_RELEASE_SSH=root@YOUR_SERVER ./scripts/deploy-android-release.sh \"$OUT\""
