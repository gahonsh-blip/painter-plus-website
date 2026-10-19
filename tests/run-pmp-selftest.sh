#!/usr/bin/env bash
# Build a self-testing copy of color-studio.html and serve it, so the
# Paint-my-photo studio can be exercised in a real browser.
#
#   bash tests/run-pmp-selftest.sh [PORT]
#
# Then open http://localhost:<PORT>/_pmp-selftest.html and read the
# ok/FAIL block at the bottom of the page.
set -u
PORT="${1:-8133}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# Inject the harness right before </body> of a COPY of the page, and
# cache-bust every local script so the service worker cannot serve stale JS.
python3 - "$ROOT" <<'PY'
import sys, re, time
root = sys.argv[1]
bust = str(int(time.time()))
page = open(root + '/color-studio.html', encoding='utf-8').read()
page = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"',
              lambda m: m.group(1) + '?v=' + bust + '"', page)
harness = '<script src="./tests/pmp-selftest.js?v=' + bust + '" defer></script>\n'
page = page.replace('</body>', harness + '</body>')
open(root + '/_pmp-selftest.html', 'w', encoding='utf-8').write(page)
print('wrote _pmp-selftest.html')
PY

echo "serving on http://localhost:$PORT/_pmp-selftest.html"
python3 -m http.server "$PORT"
