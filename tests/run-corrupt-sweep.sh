#!/usr/bin/env bash
# ------------------------------------------------------------
# Corrupt-store runtime sweep.
#
# Builds a throwaway copy of every page that (1) seeds localStorage and
# sessionStorage with hostile, malformed data BEFORE any page script runs and
# (2) collects uncaught errors. The index loads each page in one reused iframe
# and reports any page that throws.
#
# Why this exists: the site loads page scripts site-wide, so one unguarded
# access on a corrupt store aborts the whole file and silently kills unrelated
# features. tests/corrupt-seed.js holds the seed; the headless runner has a
# "CORRUPT STORE sweep" step that fails on any error.
#
# Usage:  bash tests/run-corrupt-sweep.sh [port]
# ------------------------------------------------------------
set -u
PORT="${1:-8172}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUST="$(date +%s)"

rm -f "$ROOT"/_corrupt-*.html "$ROOT"/_corrupt.html

python3 - "$ROOT" "$BUST" <<'PY'
import sys, os, re
root, bust = sys.argv[1], sys.argv[2]

seed = open(os.path.join(root, 'tests', 'corrupt-seed.js'), encoding='utf-8').read()

coll = '''<script>window.__pageErrors=[];(function(){var p=window.__pageErrors;
window.addEventListener("error",function(e){p.push("error: "+(e.message||e.error||"unknown"));});
window.addEventListener("unhandledrejection",function(e){p.push("rejection: "+(e.reason&&e.reason.message||e.reason||"unknown"));});
var ce=console.error;console.error=function(){p.push("console.error: "+Array.prototype.slice.call(arguments).join(" "));ce.apply(console,arguments);};})();</script>'''

pages = []
for name in sorted(os.listdir(root)):
    if not name.endswith('.html') or name.startswith('_'): continue
    html = open(os.path.join(root, name), encoding='utf-8').read()
    html = re.sub(r'(src="\./(?:js|tests)/[a-z-]+\.js)"', lambda m: m.group(1) + '?v=' + bust + '"', html)
    # Seed first (no defer, before any page script), then the error collector.
    html = html.replace('</head>', coll + '<script>' + seed + '</script></head>', 1)
    open(os.path.join(root, '_corrupt-' + name), 'w', encoding='utf-8').write(html)
    pages.append(name)

idx = ['<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corrupt-store sweep</title></head><body>',
       '<h1>Corrupt-store runtime sweep</h1>',
       '<p id="corruptStatus">running...</p>',
       '<pre id="corruptOut" style="font:13px/1.5 monospace"></pre>',
       '<iframe id="corruptFrame" style="width:1024px;height:700px" hidden></iframe>',
       '<script>',
       'var PAGES = ' + repr(pages) + ';',
       'var out=document.getElementById("corruptOut");var fails=0;var i=0;var fr=document.getElementById("corruptFrame");',
       'function next(){',
       '  if(i>=PAGES.length){ fr.remove(); document.getElementById("corruptStatus").textContent = fails? ("DONE: "+fails+" page(s) with errors") : "DONE: all pages clean"; return; }',
       '  var name=PAGES[i++];',
       '  fr.onload=function(){ setTimeout(function(){',
       '    var errs=[]; try{ errs=(fr.contentWindow.__pageErrors||[]).slice(); }catch(e){ errs=["<cross-origin>"]; }',
       '    if(errs.length){ fails++; out.textContent += "FAIL "+name+"\\n" + errs.map(function(x){return "   - "+x;}).join("\\n") + "\\n"; }',
       '    else { out.textContent += "ok   "+name+"\\n"; }',
       '    next();',
       '  }, 500); };',
       '  fr.src="./_corrupt-"+name;',
       '}',
       'next();',
       '</script></body></html>']
open(os.path.join(root, '_corrupt.html'), 'w', encoding='utf-8').write('\n'.join(idx))
print('wrote', len(pages), 'corrupt-store pages')
PY

cleanup() { rm -f "$ROOT"/_corrupt*.html; }
trap cleanup EXIT

echo "Open:  http://localhost:$PORT/_corrupt.html"
( cd "$ROOT" && python3 -m http.server "$PORT" )
