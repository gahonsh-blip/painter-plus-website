#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the painter PROFILE + GALLERY flow
# (painter-profile.html + js/profile-page.js + js/gallery.js).
#
# The profile page needs a real browser (localStorage, DOM, the file
# downscaler, the lightbox). This runner builds a throwaway copy of
# painter-profile.html with tests/profile-selftest.js appended, serves
# it, and prints the URL.
#
# Open that URL: the harness seeds a work log and roster, opens a
# member profile, and writes ok / FAIL lines into a
# <pre id="profile-selftest"> at the bottom.
#
# The service worker caches assets cache-first, which can serve stale
# scripts while iterating. The generated page loads the scripts with a
# cache-busting query string, and the harness unregisters any worker.
#
# Usage:  bash tests/run-profile-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8132}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_profile-selftest.html"
BUST="$(date +%s)"

# Cache-bust the page's own scripts and append the harness.
sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/profile-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/painter-profile.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_profile-selftest.html?id=ramesh-kumar"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
