#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the COLOR STUDIO (color-studio.html +
# js/color-studio.js) against a corrupt `pp_studio` store.
#
# Builds a throwaway copy of color-studio.html with:
#   - tests/cs-seed.js in <head> (no defer), which installs the
#     error collector and writes the corrupt store BEFORE any page
#     script runs;
#   - tests/color-studio-selftest.js appended at the end of <body>.
# Then it serves the repo root and prints the URL. Open that URL and
# read the ok / FAIL lines in the <pre id="cs-selftest"> at the bottom.
#
# Usage:  bash tests/run-cs-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8139}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_cs-selftest.html"
BUST="$(date +%s)"

python3 - "$ROOT" "$BUST" <<'PY'
import sys, re
root, bust = sys.argv[1], sys.argv[2]
html = open(root + '/color-studio.html', encoding='utf-8').read()
html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"',
              lambda m: m.group(1) + '?v=' + bust + '"', html)
seed = '<script src="./tests/cs-seed.js?v=%s"></script>\n' % bust
html = html.replace('</head>', seed + '</head>', 1)
inject = '<script src="./tests/color-studio-selftest.js?v=%s" defer></script>\n' % bust
html = html.replace('</body>', inject + '</body>', 1)
open(root + '/_cs-selftest.html', 'w', encoding='utf-8').write(html)
PY

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_cs-selftest.html"
echo "Look for the 'ok ...' / 'FAIL ...' lines at the bottom of the page."
echo "Press Ctrl+C to stop the server."
( cd "$ROOT" && python3 -m http.server "$PORT" )
