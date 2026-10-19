#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the TEAM page's derived evidence row
# (team.html + js/team-page.js + js/gallery.js).
#
# Builds a throwaway copy of team.html with tests/team-selftest.js
# appended, serves it, and prints the URL. Open that URL: the harness
# seeds a roster, a work log and a gallery, then writes ok / FAIL lines
# into a <pre id="team-selftest"> at the bottom.
#
# Usage:  bash tests/run-team-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8134}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_team-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/team-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/team.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_team-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
