#!/usr/bin/env bash
# Генерация favicon, PWA и Android-иконок из исходника (синий фон + HAULZ, без чёрных углов).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/public/haulz-logo-source.jpg}"
if [[ ! -f "$SRC" ]]; then
  echo "Source not found: $SRC" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

to_png() {
  local in="$1"
  local out="$2"
  local w="${3:-}"
  local h="${4:-}"
  if [[ -n "$w" && -n "$h" ]]; then
    sips -s format png -z "$h" "$w" "$in" --out "$out" >/dev/null
  else
    sips -s format png "$in" --out "$out" >/dev/null
  fi
}

pad_splash() {
  local in="$1"
  local out="$2"
  local h="$3"
  local w="$4"
  sips -s format png --padToHeightWidth "$h" "$w" "$in" --padColor 3655ff --out "$out" >/dev/null
}

# Квадрат по центру (без полей с чёрным/белым по углам)
sips -c 828 828 "$SRC" --out "$TMP/square.jpg" >/dev/null
to_png "$TMP/square.jpg" "$TMP/square.png"

PUBLIC="$ROOT/public"
mkdir -p "$PUBLIC"
to_png "$TMP/square.png" "$PUBLIC/pwa-512.png" 512 512
to_png "$TMP/square.png" "$PUBLIC/pwa-192.png" 192 192
to_png "$TMP/square.png" "$PUBLIC/apple-touch-icon.png" 180 180
to_png "$TMP/square.png" "$PUBLIC/favicon-32.png" 32 32
to_png "$TMP/square.png" "$PUBLIC/favicon-16.png" 16 16
cp "$PUBLIC/pwa-192.png" "$PUBLIC/favicon.png"
sips -s format png -Z 200 "$SRC" --out "$PUBLIC/haulz-logo.png" >/dev/null

ANDROID_RES="$ROOT/android/app/src/main/res"

for size in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dens="${size%%:*}"
  px="${size##*:}"
  to_png "$TMP/square.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher.png" "$px" "$px"
  to_png "$TMP/square.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher_round.png" "$px" "$px"
  to_png "$TMP/square.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher_foreground.png" "$px" "$px"
done

# Splash portrait / landscape
declare -a SPLASH_PORT=(
  "drawable:1280:800"
  "drawable-port-mdpi:480:320"
  "drawable-port-hdpi:800:480"
  "drawable-port-xhdpi:1280:720"
  "drawable-port-xxhdpi:1920:1080"
  "drawable-port-xxxhdpi:2560:1440"
)
declare -a SPLASH_LAND=(
  "drawable-land-mdpi:320:480"
  "drawable-land-hdpi:480:800"
  "drawable-land-xhdpi:720:1280"
  "drawable-land-xxhdpi:1080:1920"
  "drawable-land-xxxhdpi:1440:2560"
)

for entry in "${SPLASH_PORT[@]}"; do
  IFS=':' read -r folder h w <<<"$entry"
  pad_splash "$TMP/square.png" "$ANDROID_RES/${folder}/splash.png" "$h" "$w"
done
for entry in "${SPLASH_LAND[@]}"; do
  IFS=':' read -r folder h w <<<"$entry"
  pad_splash "$TMP/square.png" "$ANDROID_RES/${folder}/splash.png" "$h" "$w"
done

echo "Icons written to public/ and android/app/src/main/res/"
