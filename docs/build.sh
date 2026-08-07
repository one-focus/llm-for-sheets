#!/bin/bash
# Renders the markdown sources into a static site under site/.
#
# The output is committed and served by GitHub Pages straight from docs/ — no
# Jekyll (see .nojekyll), so what is checked in is exactly what is served. Any
# other static host can take the same folder.
#
#   ./docs/build.sh
set -e
cd "$(dirname "$0")/.."
OUT=docs

page() { # source.md  out-dir  title
  local src="$1" dir="$2" title="$3"
  mkdir -p "$OUT/$dir"
  # Jekyll front matter would render as text; strip it before converting.
  awk 'NR==1 && /^---$/ {fm=1; next} fm && /^---$/ {fm=0; next} !fm' "$src" > /tmp/llm-page.md
  local body
  body=$(npx -y marked --gfm -i /tmp/llm-page.md)
  local prefix=""
  [ -n "$dir" ] && prefix="../"
  cat > "$OUT/$dir/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<link rel="icon" href="${prefix}assets/icon-128.png">
<style>
  :root { --green:#059669; --dark:#047857; --text:#0f172a; --muted:#64748b; --line:#e2e8f0; }
  * { box-sizing:border-box }
  body { margin:0; padding:0 20px 80px; color:var(--text); background:#fff;
         font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  main { max-width:760px; margin:0 auto }
  header { max-width:760px; margin:0 auto; padding:28px 0 20px; border-bottom:1px solid var(--line);
           display:flex; align-items:center; gap:12px }
  header img { width:36px; height:36px; border-radius:8px }
  header a { color:var(--text); text-decoration:none; font-weight:700; font-size:18px }
  h1 { font-size:32px; line-height:1.2; margin:32px 0 12px }
  h2 { font-size:22px; margin:36px 0 10px }
  p, li { color:#1f2937 }
  a { color:var(--dark) }
  code { background:#ecfdf5; color:var(--dark); padding:2px 6px; border-radius:4px;
         font-family:ui-monospace,Menlo,monospace; font-size:.92em }
  pre { background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:14px 16px;
        overflow-x:auto }
  pre code { background:none; padding:0; color:var(--text) }
  img { max-width:100%; border:1px solid var(--line); border-radius:10px }
  table { border-collapse:collapse; width:100%; margin:16px 0; font-size:.94em }
  th, td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top }
  th { background:#f8fafc }
  footer { max-width:760px; margin:56px auto 0; padding-top:20px; border-top:1px solid var(--line);
           color:var(--muted); font-size:14px }
  footer a { color:var(--muted) }
</style>
</head>
<body>
<header>
  <img src="${prefix}assets/icon-128.png" alt="">
  <a href="${prefix}">LLM for Sheets</a>
</header>
<main>
$body
</main>
<footer>
  <a href="${prefix}">Home</a> ·
  <a href="${prefix}privacy/">Privacy</a> ·
  <a href="${prefix}terms/">Terms</a> ·
  <a href="https://github.com/one-focus/llm-for-sheets">Source</a>
</footer>
</body>
</html>
HTML
  rm -f /tmp/llm-page.md
  echo "  $OUT/$dir/index.html"
}

mkdir -p "$OUT/assets"
cp assets/icon-128.png assets/screenshot-1.png "$OUT/assets/"
cp google*.html "$OUT/" 2>/dev/null || true

page index.md   ""        "LLM for Sheets — any LLM in a Google Sheets cell"
page PRIVACY.md "privacy" "Privacy Policy — LLM for Sheets"
page TERMS.md   "terms"   "Terms of Service — LLM for Sheets"
