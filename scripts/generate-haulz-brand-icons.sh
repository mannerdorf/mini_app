#!/usr/bin/env bash
# Генерация favicon, PWA и Android-иконок: синий фон + белый HAULZ (без внутренней «рамки»).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON_SOURCE="$ROOT/public/haulz-icon-source.png"
ICON_SVG="$ROOT/public/haulz-icon.svg"
FG_SVG="$ROOT/public/haulz-icon-foreground.svg"
EXTRACT_FG="$ROOT/scripts/extract-haulz-foreground.cjs"

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

render_svg() {
  local svg="$1"
  local out="$2"
  local width="$3"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$width" -h "$width" "$svg" -o "$out"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none "$svg" -resize "${width}x${width}" "$out"
  elif command -v convert >/dev/null 2>&1; then
    convert -background none "$svg" -resize "${width}x${width}" "$out"
  elif npx --yes @resvg/resvg-js-cli "$svg" "$out" --fit-width "$width" >/dev/null 2>&1; then
    :
  else
    echo "Install librsvg, ImageMagick, or run with network for npx @resvg/resvg-js-cli" >&2
    exit 1
  fi
}

if [[ -f "$ICON_SOURCE" ]]; then
  to_png "$ICON_SOURCE" "$TMP/square.png" 1024 1024
  if [[ ! -f "$EXTRACT_FG" ]]; then
    echo "Missing $EXTRACT_FG" >&2
    exit 1
  fi
  FG_WORK="$TMP/fg-npm"
  mkdir -p "$FG_WORK"
  (
    cd "$FG_WORK"
    npm init -y >/dev/null 2>&1
    npm install --no-save sharp >/dev/null 2>&1
    cp "$EXTRACT_FG" "$FG_WORK/extract-haulz-foreground.cjs"
    node "$FG_WORK/extract-haulz-foreground.cjs" "$ICON_SOURCE" "$TMP/foreground.png" 1024
  )
elif [[ -f "$ICON_SVG" && -f "$FG_SVG" ]]; then
  render_svg "$ICON_SVG" "$TMP/square.png" 1024
  render_svg "$FG_SVG" "$TMP/foreground.png" 1024
else
  echo "Add public/haulz-icon-source.png or haulz-icon.svg + haulz-icon-foreground.svg" >&2
  exit 1
fi

PUBLIC="$ROOT/public"
mkdir -p "$PUBLIC"
to_png "$TMP/square.png" "$PUBLIC/pwa-512.png" 512 512
to_png "$TMP/square.png" "$PUBLIC/pwa-192.png" 192 192
to_png "$TMP/square.png" "$PUBLIC/apple-touch-icon.png" 180 180
to_png "$TMP/square.png" "$PUBLIC/favicon-32.png" 32 32
to_png "$TMP/square.png" "$PUBLIC/favicon-16.png" 16 16
cp "$PUBLIC/pwa-192.png" "$PUBLIC/favicon.png"
# Прозрачная надпись для мест, где фон задаётся отдельно (CSS, слои Android).
to_png "$TMP/foreground.png" "$PUBLIC/haulz-wordmark.png" 400 400
cp "$PUBLIC/haulz-wordmark.png" "$PUBLIC/haulz-logo.png"

ANDROID_RES="$ROOT/android/app/src/main/res"
DRAWABLE="$ANDROID_RES/drawable"
mkdir -p "$DRAWABLE"

to_png "$TMP/foreground.png" "$DRAWABLE/splash_wordmark.png" 320 320
rm -f "$DRAWABLE/splash.png"

for size in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dens="${size%%:*}"
  px="${size##*:}"
  to_png "$TMP/square.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher.png" "$px" "$px"
  to_png "$TMP/square.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher_round.png" "$px" "$px"
  to_png "$TMP/foreground.png" "$ANDROID_RES/mipmap-${dens}/ic_launcher_foreground.png" "$px" "$px"
done

# Сплэши: сплошной синий (без вложенной иконки в центре).
if [[ ! -f "$TMP/blue1.png" ]]; then
  sips -c 1 1 "$TMP/square.png" --out "$TMP/blue1.png" >/dev/null
fi
make_blue_splash() {
  local out="$1"
  local h="$2"
  local w="$3"
  sips -s format png -z "$h" "$w" "$TMP/blue1.png" --out "$out" >/dev/null
}

declare -a SPLASH_PORT=(
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

for entry in "${SPLASH_PORT[@]}" "${SPLASH_LAND[@]}"; do
  IFS=':' read -r folder h w <<<"$entry"
  make_blue_splash "$ANDROID_RES/${folder}/splash.png" "$h" "$w"
done

echo "Icons written to public/ and android/app/src/main/res/"
