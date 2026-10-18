#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the work-log -> ERP link.
#
# Proves a day logged in the work log is stamped with the chosen ERP
# project and then flows into that project's bill (approved work only).
# The page needs a real browser (localStorage, DOM, the passcode gate),
# so this runner builds a throwaway copy of worklog.html with
# tests/wl-erp-selftest.js appended, serves it, and prints the URL.
# Open that URL: the harness creates an ERP project, picks it in the
# work log, saves a photo entry, submits the day, approves it, and
# writes ok / FAIL lines into a <pre id="wl-selftest"> at the bottom.
#
# The service worker caches assets cache-first, which can serve a stale
# js file while iterating. The generated page therefore loads the
# scripts with a cache-busting query string, and the harness
# unregisters any service worker on load.
#
# Usage:  bash tests/run-wl-erp-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8132}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_wl-erp-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/worklog\.js?v=$BUST\" defer></script>#<script src=\"./js/worklog.js?v=$BUST\" defer></script>\n    <script src=\"./tests/wl-erp-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/worklog.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_wl-erp-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
