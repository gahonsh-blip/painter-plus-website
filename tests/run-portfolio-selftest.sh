#!/usr/bin/env bash
# ------------------------------------------------------------
# End-to-end check of the portfolio merge's escaping (bug 26).
#
# admin.html stores projects in localStorage; portfolio.html merges
# them into the grid on load. This runner builds a copy of
# portfolio.html that seeds a HOSTILE project into localStorage
# before script.js runs, then appends tests/portfolio-selftest.js.
#
# Usage:  bash tests/run-portfolio-selftest.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8134}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/_portfolio-selftest.html"
BUST="$(date +%s)"

python3 - "$ROOT" "$BUST" <<'PY'
import sys, re
root, bust = sys.argv[1], sys.argv[2]
html = open(root + '/portfolio.html', encoding='utf-8').read()
html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"',
              lambda m: m.group(1) + '?v=' + bust + '"', html)
seed = (
  '<script>(function(){try{var p=[{title:"Pwn <img src=x onerror=window.__pwned=1>",'
  'category:"interior",image:"x\\" onerror=\\"window.__pwned=1",location:"A\\" onmouseover=\\"window.__pwned=2",'
  'challenge:"<img src=x onerror=window.__pwned=3>",solution:"ok",result:"<script>window.__pwned=4<\\/script>"}];'
  'localStorage.setItem("painterPlusProjects", JSON.stringify(p));}catch(e){}})();</script>\n'
)
html = html.replace('</head>', seed + '</head>', 1)
inject = '<script src="./tests/portfolio-selftest.js?v=%s" defer></script>\n' % bust
html = html.replace('</body>', inject + '</body>', 1)
open(root + '/_portfolio-selftest.html', 'w', encoding='utf-8').write(html)
print('wrote _portfolio-selftest.html')
PY

cleanup() { rm -f "$PAGE"; }
trap cleanup EXIT

echo "Selftest page written to $PAGE"
echo "Open:  http://localhost:$PORT/_portfolio-selftest.html"
( cd "$ROOT" && python3 -m http.server "$PORT" )
