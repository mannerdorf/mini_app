#!/bin/sh
# Copy GoogleService-Info.plist into the app bundle. Without it Capacitor iOS
# never gets an FCM token, so the device never appears in admin «Кто включил push».
set -e
PLIST="${SRCROOT}/App/GoogleService-Info.plist"
DEST="${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/GoogleService-Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "error: нет $PLIST" >&2
  echo "error: Скачайте GoogleService-Info.plist из Firebase (iOS app ru.haulz.miniapp) и положите в ios/App/App/" >&2
  exit 1
fi
mkdir -p "$(dirname "$DEST")"
cp -f "$PLIST" "$DEST"
echo "Copied GoogleService-Info.plist into ${WRAPPER_NAME}"
