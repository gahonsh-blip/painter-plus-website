#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the Painter ERP flow (erp.html + js/erp.js).
#
# The ERP page needs a real browser (localStorage, DOM, the passcode
# gate). This runner builds a throwaway copy of erp.html with
# tests/erp-selftest.js appended, serves it, and prints the URL.
# Open that URL: the harness unlocks the page, creates a project,
# seeds work-log days, approves one, raises a bill, and writes
# ok / FAIL lines into a <pre id="erp-selftest"> at the bottom.
#
# The service worker caches assets cache-first, which can serve a
# stale erp.js while iterating. The generated page therefore loads
# the scripts with a cache-busting query string, and the harness
# unregisters any service worker on load.
#
# Usage:  bash tests/run-erp-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8131}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_erp-selftest.html"
BUST="$(date +%s)"

# Cache-bust the page's own scripts and append the harness.
sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/erp-page\.js?v=$BUST\" defer></script>#<script src=\"./js/erp-page.js?v=$BUST\" defer></script>\n    <script src=\"./tests/erp-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/erp.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_erp-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
