#!/usr/bin/env bash
# ------------------------------------------------------------
# Headless runner for every browser self-test and the full-site
# runtime sweep. It builds each throwaway page the same way the
# individual run-*.sh scripts do, serves the repo root on one port,
# then drives headless Chromium and prints each ok / FAIL block.
#
# Why: the interactive runners print a URL for a human to open. In CI
# (and for an agent) there is no human, so this script does the same
# checks and exits non-zero if any page reports a FAIL.
#
# Usage:  bash tests/run-all-headless.sh [port]
# Requires: chromium (or google-chrome) on PATH, python3.
# ------------------------------------------------------------
set -u
PORT="${1:-8170}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
if [ -z "$CHROME" ]; then
  echo "No headless browser found (chromium/google-chrome). Aborting." >&2
  exit 2
fi

BUST="$(date +%s)"
# build <source-page> <harness> <out>
# Cache-busts local scripts and appends the harness just before </body>,
# which works regardless of whether a page loads script.js with defer.
build() {
  local src="$1" harness="$2" out="$3"
  python3 - "$ROOT" "$src" "$harness" "$out" "$BUST" <<'PY'
import sys, re
root, src, harness, out, bust = sys.argv[1:6]
html = open(root + '/' + src, encoding='utf-8').read()
html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"',
              lambda m: m.group(1) + '?v=' + bust + '"', html)
inject = '<script src="./tests/%s?v=%s" defer></script>\n' % (harness, bust)
html = html.replace('</body>', inject + '</body>', 1)
open(root + '/' + out, 'w', encoding='utf-8').write(html)
PY
}

build worklog.html        wl-selftest.js        _selftest.html
build erp.html            erp-selftest.js       _erp-selftest.html
build worklog.html        wl-erp-selftest.js    _wl-erp-selftest.html
build team.html           team-selftest.js      _team-selftest.html
build gallery.html        gallery-selftest.js   _gallery-selftest.html
build painter-profile.html profile-selftest.js  _profile-selftest.html
build color-studio.html   pmp-selftest.js       _pmp-selftest.html

# The portfolio merge test needs a hostile project seeded before script.js
# runs, so it gets its own builder rather than the generic one.
python3 - "$ROOT" "$BUST" <<'PY'
import sys, re
root, bust = sys.argv[1], sys.argv[2]
html = open(root + '/portfolio.html', encoding='utf-8').read()
html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"', lambda m: m.group(1) + '?v=' + bust + '"', html)
seed = ('<script>(function(){try{var p=[{title:"Pwn <img src=x onerror=window.__pwned=1>",'
        'category:"interior",image:"x\\" onerror=\\"window.__pwned=1",location:"A\\" onmouseover=\\"window.__pwned=2",'
        'challenge:"<img src=x onerror=window.__pwned=3>",solution:"ok",result:"<script>window.__pwned=4<\\/script>"}];'
        'localStorage.setItem("painterPlusProjects", JSON.stringify(p));}catch(e){}})();</script>\n')
html = html.replace('</head>', seed + '</head>', 1)
html = html.replace('</body>', '<script src="./tests/portfolio-selftest.js?v=%s" defer></script>\n' % bust + '</body>', 1)
open(root + '/_portfolio-selftest.html', 'w', encoding='utf-8').write(html)
PY

# Page sweep: build every page with an error collector + an index.
python3 - "$ROOT" "$BUST" <<'PY'
import sys, os, re
root, bust = sys.argv[1], sys.argv[2]
coll = ('<script>window.__pageErrors=[];(function(){var p=window.__pageErrors;'
        'window.addEventListener("error",function(e){p.push("error: "+(e.message||e.error||"unknown"));});'
        'window.addEventListener("unhandledrejection",function(e){p.push("rejection: "+(e.reason&&e.reason.message||e.reason||"unknown"));});'
        'var ce=console.error;console.error=function(){p.push("console.error: "+Array.prototype.slice.call(arguments).join(" "));ce.apply(console,arguments);};})();</script>')
pages = []
for name in sorted(os.listdir(root)):
    if not name.endswith('.html') or name.startswith('_'): continue
    html = open(os.path.join(root, name), encoding='utf-8').read()
    html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"', lambda m: m.group(1)+'?v='+bust+'"', html)
    html = html.replace('</head>', coll+'</head>', 1)
    open(os.path.join(root, '_sweep-'+name), 'w', encoding='utf-8').write(html)
    pages.append(name)
idx = ['<!DOCTYPE html><html><head><meta charset="utf-8"><title>sweep</title></head><body>',
       '<pre id="sweepOut" style="font:13px/1.5 monospace">running...</pre>',
       '<iframe id="sweepFrame" hidden></iframe><script>',
       'var PAGES='+repr(pages)+';var out=document.getElementById("sweepOut");var fails=0;var i=0;var fr=document.getElementById("sweepFrame");',
       'function next(){if(i>=PAGES.length){fr.remove();out.textContent=out.textContent.replace("running...","")+(fails?("DONE: "+fails+" page(s) with errors"):"DONE: all pages clean");return;}',
       'var name=PAGES[i++];fr.onload=function(){setTimeout(function(){var errs=[];try{errs=(fr.contentWindow.__pageErrors||[]).slice();}catch(e){errs=["<cross-origin>"];}',
       'out.textContent+=(errs.length?("FAIL "+name+"\\n"+errs.map(function(x){return "   - "+x;}).join("\\n")+"\\n"):("ok   "+name+"\\n"));if(errs.length)fails++;next();},400);};fr.src="./_sweep-"+name;}next();',
       '</script></body></html>']
open(os.path.join(root, '_sweep.html'), 'w', encoding='utf-8').write('\n'.join(idx))
PY

cleanup() {
  rm -f "$ROOT"/_selftest.html "$ROOT"/_erp-selftest.html "$ROOT"/_wl-erp-selftest.html \
        "$ROOT"/_team-selftest.html "$ROOT"/_gallery-selftest.html "$ROOT"/_profile-selftest.html \
        "$ROOT"/_pmp-selftest.html "$ROOT"/_portfolio-selftest.html "$ROOT"/_sweep.html "$ROOT"/_sweep-*.html
  pkill -f "http.server $PORT" 2>/dev/null
}
trap cleanup EXIT

python3 -m http.server "$PORT" >/dev/null 2>&1 &
sleep 2

FAILED=0
run_pre() {  # run_pre <page> <pre-id> <label>
  local page="$1" pid="$2" label="$3"
  local dom
  dom="$("$CHROME" --headless --no-sandbox --disable-gpu --virtual-time-budget=15000 \
        --dump-dom "http://localhost:$PORT/$page" 2>/dev/null)"
  echo "===== $label ====="
  echo "$dom" | python3 -c "
import sys, re, html
s = sys.stdin.read()
m = re.search(r'<pre id=\"$pid\"[^>]*>(.*?)</pre>', s, re.S)
if not m:
    print('NO OUTPUT (<pre id=$pid> not found)'); sys.exit(3)
body = html.unescape(m.group(1))
print(body)
bad = 'RESULT: FAILURES' in body or re.search(r'^FAIL', body, re.M)
sys.exit(1 if bad else 0)
" || FAILED=1
  echo
}

run_pre _selftest.html         wl-selftest        "WORK LOG selftest"
run_pre _erp-selftest.html     erp-selftest       "ERP selftest"
run_pre _wl-erp-selftest.html  wl-selftest        "WORK LOG -> ERP selftest"
run_pre _team-selftest.html    team-selftest      "TEAM selftest"
run_pre _gallery-selftest.html gallery-selftest   "GALLERY selftest"
run_pre _profile-selftest.html profile-selftest   "PAINTER PROFILE selftest"
run_pre _pmp-selftest.html     pmpTestOut         "PAINT-MY-PHOTO selftest"
run_pre _portfolio-selftest.html portfolio-selftest "PORTFOLIO injection selftest"
run_pre _sweep.html            sweepOut           "FULL-SITE SWEEP"

if [ "$FAILED" -eq 0 ]; then echo "ALL BROWSER CHECKS PASSED"; else echo "SOME BROWSER CHECKS FAILED"; fi
exit "$FAILED"
