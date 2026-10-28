#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the ADMIN "Accounts & Access" pane
# (admin.html + js/accounts-page.js + js/auth.js).
#
# Builds a throwaway copy of admin.html with tests/admin-selftest.js
# appended, serves it, and prints the URL. Open that URL: the harness
# signs in as an Admin, approves a pending account, sets its role and
# edit rights, and reads the audit log — writing ok / FAIL lines into
# <pre id="admin-selftest"> at the bottom.
#
# The service worker caches assets cache-first, which can serve stale
# scripts while iterating; the generated page cache-busts its scripts
# and the harness unregisters any worker.
#
# Usage:  bash tests/run-admin-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8141}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_admin-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/admin-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/admin.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_admin-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
