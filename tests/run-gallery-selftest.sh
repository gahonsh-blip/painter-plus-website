#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the CREW WORK GALLERY page
# (gallery.html + js/gallery-page.js + js/gallery.js).
#
# Builds a throwaway copy of gallery.html with tests/gallery-selftest.js
# appended, serves it, and prints the URL. Open that URL: the harness
# seeds a roster and two members' galleries, then writes ok / FAIL lines
# into a <pre id="gallery-selftest"> at the bottom.
#
# Usage:  bash tests/run-gallery-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8133}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_gallery-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/gallery-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/gallery.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_gallery-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
