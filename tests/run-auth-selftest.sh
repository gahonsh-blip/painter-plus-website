#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the LOGIN → ACCOUNT → PROFILE → ADMIN flow
# (login.html + js/auth.js + js/login-page.js + js/accounts-page.js).
#
# Builds a throwaway copy of login.html with tests/auth-selftest.js
# appended, serves it, and prints the URL. Open that URL: the harness
# registers accounts, approves them, edits a profile, checks privacy,
# and writes ok / FAIL lines into <pre id="auth-selftest"> at the bottom.
#
# The service worker caches assets cache-first, which can serve stale
# scripts while iterating; the generated page cache-busts its scripts
# and the harness unregisters any worker.
#
# Usage:  bash tests/run-auth-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8140}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_auth-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/auth-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/login.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_auth-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
