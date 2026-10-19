#!/usr/bin/env bash
# ------------------------------------------------------------
# Full-site runtime error sweep.
#
# Builds one throwaway copy of every page with a small error collector
# injected, plus a results index. The index loads each page in ONE reused
# iframe, reads the collected errors, then removes the iframe — so the final
# page shows only the "ok / FAIL" list.
#
# Usage:  bash tests/run-page-sweep.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8155}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUST="$(date +%s)"

rm -f "$ROOT"/_sweep-*.html "$ROOT"/_sweep.html

python3 - "$ROOT" "$BUST" <<'PY'
import sys, os, re
root, bust = sys.argv[1], sys.argv[2]

coll = '''<script>window.__pageErrors=[];(function(){var p=window.__pageErrors;
window.addEventListener("error",function(e){p.push("error: "+(e.message||e.error||"unknown"));});
window.addEventListener("unhandledrejection",function(e){p.push("rejection: "+(e.reason&&e.reason.message||e.reason||"unknown"));});
var ce=console.error;console.error=function(){p.push("console.error: "+Array.prototype.slice.call(arguments).join(" "));ce.apply(console,arguments);};})();</script>'''

pages = []
for name in sorted(os.listdir(root)):
    if not name.endswith('.html') or name.startswith('_'): continue
    src = os.path.join(root, name)
    dst = os.path.join(root, '_sweep-' + name)
    html = open(src, encoding='utf-8').read()
    html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"', lambda m: m.group(1) + '?v=' + bust + '"', html)
    html = html.replace('</head>', coll + '</head>', 1)
    open(dst, 'w', encoding='utf-8').write(html)
    pages.append(name)

idx = ['<!DOCTYPE html><html><head><meta charset="utf-8"><title>Page sweep</title></head><body>',
       '<h1>Full-site runtime error sweep</h1>',
       '<p id="sweepStatus">running...</p>',
       '<pre id="sweepOut" style="font:13px/1.5 monospace"></pre>',
       '<iframe id="sweepFrame" style="width:1024px;height:700px" hidden></iframe>',
       '<script>',
       'var PAGES = ' + repr(pages) + ';',
       'var out=document.getElementById("sweepOut");var fails=0;var i=0;var fr=document.getElementById("sweepFrame");',
       'function next(){',
       '  if(i>=PAGES.length){ fr.remove(); document.getElementById("sweepStatus").textContent = fails? ("DONE: "+fails+" page(s) with errors") : "DONE: all pages clean"; return; }',
       '  var name=PAGES[i++];',
       '  fr.onload=function(){ setTimeout(function(){',
       '    var errs=[]; try{ errs=(fr.contentWindow.__pageErrors||[]).slice(); }catch(e){ errs=["<cross-origin>"]; }',
       '    if(errs.length){ fails++; out.textContent += "FAIL "+name+"\\n" + errs.map(function(x){return "   - "+x;}).join("\\n") + "\\n"; }',
       '    else { out.textContent += "ok   "+name+"\\n"; }',
       '    next();',
       '  }, 500); };',
       '  fr.src="./_sweep-"+name;',
       '}',
       'next();',
       '</script></body></html>']
open(os.path.join(root, '_sweep.html'), 'w', encoding='utf-8').write('\n'.join(idx))
print('wrote', len(pages), 'sweep pages')
PY

cleanup() { rm -f "$ROOT"/_sweep*.html; }
trap cleanup EXIT

echo "Open:  http://localhost:$PORT/_sweep.html"
( cd "$ROOT" && python3 -m http.server "$PORT" )
