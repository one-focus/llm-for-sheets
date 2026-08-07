#!/bin/bash
# Rasterises the listing artwork from the SVG sources. Headless Chrome is the
# renderer because macOS ships no SVG converter and Chrome is already installed
# — same engine the store previews render in.
#
#   ./assets/build.sh
#
# Marketplace wants icons at 32, 48, 96 and 128, plus a 220x140 card banner.
set -e
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }

render() { # svg width height out
  cat > /tmp/llm-render.html <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${2}px;height:${3}px}</style>
<img src="$(pwd)/$1">
HTML
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --screenshot="$4" --window-size="$2,$3" /tmp/llm-render.html 2>/dev/null
  rm -f /tmp/llm-render.html
  echo "  $4  ${2}x${3}"
}

echo "icons:"
for size in 32 48 96 128; do
  render icon.svg "$size" "$size" "icon-${size}.png"
done

echo "banner:"
render banner.svg 220 140 "banner-220x140.png"

# A blank canvas at the recommended screenshot size, so the slot exists before
# the real capture does. Never overwrites: a finished screenshot lives here.
echo "screenshot placeholder:"
if [ -e screenshot-1.png ]; then
  echo "  screenshot-1.png  kept, already exists"
else
  cat > /tmp/llm-blank.html <<'HTML'
<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style>
HTML
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --screenshot="screenshot-1.png" --window-size=1280,800 /tmp/llm-blank.html 2>/dev/null
  rm -f /tmp/llm-blank.html
  echo "  screenshot-1.png  1280x800"
fi
