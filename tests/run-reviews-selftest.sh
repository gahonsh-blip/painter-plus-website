#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the RATINGS & REVIEWS flow
# (painter-profile.html + js/reviews.js + js/reviews-page.js).
#
# The rating widgets need a real browser (localStorage, DOM, the
# account engine). This runner builds a throwaway copy of
# painter-profile.html with tests/reviews-selftest.js appended,
# serves it, and prints the URL.
#
# Open that URL: the harness registers a few accounts, signs in,
# rates a painter, checks the one-review-per-account and no-self-review
# rules, exercises lead moderation, and writes ok / FAIL lines into a
# <pre id="reviews-selftest"> at the bottom.
#
# Usage:  bash tests/run-reviews-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8142}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_reviews-selftest.html"
BUST="$(date +%s)"

sed -e "s#\(src=\"\./js/[a-z-]*\.js\)\"#\1?v=$BUST\"#g" \
    -e "s#<script src=\"\./js/script\.js?v=$BUST\"></script>#<script src=\"./js/script.js?v=$BUST\"></script>\n    <script src=\"./tests/reviews-selftest.js?v=$BUST\" defer></script>#" \
  "$ROOT/painter-profile.html" > "$PAGE"

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_reviews-selftest.html?id=ramesh-kumar"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
