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
