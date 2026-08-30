#!/usr/bin/env bash
# Сборка HAULZ iOS (Capacitor). Подписанный IPA / Run в симуляторе — только на Mac + Xcode.
#
#   npm run ios:release
#   npm run ios:open          # открыть Xcode после sync
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ORIGIN="${VITE_API_ORIGIN:-https://haulz.space}"
IOS_DIR="$ROOT/ios/App"
WORKSPACE="$IOS_DIR/App.xcworkspace"
SCHEME="${IOS_SCHEME:-App}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"

cd "$ROOT"

echo "Building web bundle for Capacitor iOS (API: $API_ORIGIN)..."
VITE_API_ORIGIN="$API_ORIGIN" npm run build

echo "Syncing Capacitor iOS project..."
npx cap sync ios

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo ""
  echo "iOS native build needs macOS + Xcode (this host is $(uname -s))."
  echo "On the Intel Mac with Xcode 26.3:"
  echo "  git fetch origin && git pull"
  echo "  npm install"
  echo "  xcode-select -p   # /Applications/Xcode.app/Contents/Developer"
  echo "  npm run ios:release"
  echo "  # or: npm run ios:sync && npx cap open ios"
  exit 0
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install Xcode 26.3 and run:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  echo "  sudo xcodebuild -license accept" >&2
  exit 1
fi

if [[ ! -d "$IOS_DIR/Pods" ]]; then
  echo "CocoaPods did not install. On the Mac run ONE command:" >&2
  echo "  NONINTERACTIVE=1 brew install cocoapods" >&2
  echo "Then: cd ios/App && pod install && cd ../.." >&2
  exit 1
fi

echo "xcodebuild $CONFIGURATION ($SCHEME) for iOS Simulator..."
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$ROOT/dist/ios/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build

echo ""
echo "Simulator build OK."
echo "Open Xcode to Run on a simulator or a signed device:"
echo "  npx cap open ios"
echo "Signing: Xcode → App target → Signing & Capabilities → Team (Apple ID)."
