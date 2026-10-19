#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the work-log measurement flow.
#
# The work log's measurement tool draws on a <canvas>, which cannot
# be driven from a plain HTTP client. This runner builds a throwaway
# copy of worklog.html with tests/wl-selftest.js appended, serves it,
# and prints the URL. Open that URL in a browser: the harness unlocks
# the page, loads a synthetic perspective photo of a 10 x 6 ft wall,
# taps the calibration corners and the painted area, saves the entry,
# and writes its results (including any FAILs) into a <pre id="wl-selftest">
# at the bottom of the page.
#
# Usage:  bash tests/run-wl-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8130}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_selftest.html"

BUST="$(date +%s)"
sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"./js/worklog.js?v=$BUST\" defer></script>#<script src=\"./js/worklog.js?v=$BUST\" defer></script>\n    <script src=\"./tests/wl-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/worklog.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
