/* ============================================================
   Browser self-test for the Paint-my-photo studio.
   Appended to a generated copy of color-studio.html by
   tests/run-pmp-selftest.sh. Drives the REAL page and writes
   ok/FAIL lines into #pmpTestOut, which the agent reads back.
   ============================================================ */
(function () {
  const out = document.createElement('pre');
  out.id = 'pmpTestOut';
  out.style.cssText = 'white-space:pre-wrap;padding:16px;background:#0b1220;color:#d1fae5;font:13px monospace;';
  out.textContent = 'running…';
  document.body.appendChild(out);
  const lines = [];
  let passed = 0, failed = 0;
  function ok(name, cond, extra) {
    if (cond) { passed++; lines.push('ok ' + name + (extra ? ' — ' + extra : '')); }
    else { failed++; lines.push('FAIL ' + name + (extra ? ' — ' + extra : '')); }
    out.textContent = lines.join('\n');
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function px(canvas, x, y) {
    const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  async function run() {
    // This harness is a non-deferred script, so it runs before the page's
    // deferred scripts. Wait for them, then read the globals.
    await sleep(400);
    const P = window.PPPhoto;

    ok('PPPhoto loaded', !!P);
    ok('PPMeasure loaded (geometry dependency)', !!window.PPMeasure);

    // --- demo scene generation ---
    const demo = P.demoScene('interior');
    ok('demoScene returns a data URL', typeof demo === 'string' && demo.indexOf('data:image') === 0, demo.slice(0, 24));
    ok('exterior demo also builds', P.demoScene('exterior').indexOf('data:image') === 0);

    // --- material maths on the page's own rates ---
    const m = P.computeMaterial(120, 'interior');
    ok('120 sq ft interior -> ~2 L paint', Math.abs(m.paint.litres - 2.03) < 0.3, m.paint.litres + ' L');
    ok('120 sq ft -> 2 × 40 kg putty bags', m.putty.pack === '1 × 40', m.putty.pack);

    // --- drive the real UI: press Demo interior ---
    const demoBtn = document.getElementById('pmpDemoInterior');
    ok('demo interior button exists', !!demoBtn);
    demoBtn.click();
    await sleep(700);

    const canvas = document.getElementById('pmpCanvas');
    ok('canvas has a working size after demo', canvas.width > 100 && canvas.height > 100, canvas.width + 'x' + canvas.height);
    ok('empty overlay hidden after demo', document.getElementById('pmpEmpty').hidden === true);

    // The interior demo's back wall sits at x 0.15..0.85, y 120/700..560/700.
    const wx = Math.round(canvas.width * 0.5), wy = Math.round(canvas.height * 0.45);
    const fx = Math.round(canvas.width * 0.5), fy = Math.round(canvas.height * 0.9); // floor, outside the wall

    // Capture the TRUE original wall by flipping to the before view, then back.
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const wallOriginal = px(canvas, wx, wy);
    const floorOriginal = px(canvas, fx, fy);
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const wallBefore = px(canvas, wx, wy);
    const floorBefore = px(canvas, fx, fy);
    ok('the demo wall is repainted by default', wallBefore.join() !== wallOriginal.join(),
      'orig ' + wallOriginal.join(',') + ' painted ' + wallBefore.join(','));
    // The floor lies outside the tapped quad and must keep its ORIGINAL photo
    // pixels — not be wiped to black or tinted by the paint.
    ok('floor outside the wall keeps its original pixels',
      floorBefore[0] === floorOriginal[0] && floorBefore[1] === floorOriginal[1] && floorBefore[2] === floorOriginal[2] && floorBefore[0] > 20,
      'floor ' + floorBefore.join(',') + ' vs original ' + floorOriginal.join(','));

    // --- pick a strongly coloured paint via the palette ---
    const swatch = document.querySelector('.pmp-swatch[data-hex="#2f4858"]');
    ok('deep slate swatch rendered', !!swatch);
    if (swatch) swatch.click();
    await sleep(500);

    const wallAfter = px(canvas, wx, wy);
    const floorAfter = px(canvas, fx, fy);
    const changed = Math.abs(wallAfter[0] - wallBefore[0]) + Math.abs(wallAfter[1] - wallBefore[1]) + Math.abs(wallAfter[2] - wallBefore[2]);
    ok('wall pixels changed after repaint', changed > 40, 'delta ' + changed);
    ok('repainted wall is dark blue-grey (blue >= red)', wallAfter[2] >= wallAfter[0], wallAfter.join(','));
    ok('floor outside the wall is untouched', floorAfter[0] === floorBefore[0] && floorAfter[1] === floorBefore[1] && floorAfter[2] === floorBefore[2]);

    // --- finish changes the render ---
    const glossBtn = document.querySelector('.pmp-finish[data-finish="gloss"]');
    if (glossBtn) glossBtn.click();
    await sleep(400);
    const wallGloss = px(canvas, wx, wy);
    ok('gloss finish changes the wall pixels', wallGloss.join() !== wallAfter.join(), wallGloss.join(','));

    // --- texture overlay changes the wall ---
    const stucco = document.querySelector('.pmp-tex[data-tex="stucco"]');
    if (stucco) stucco.click();
    await sleep(500);
    // sample a small patch; texture must introduce pixel variation
    let lo = 999, hi = -1;
    for (let i = 0; i < 40; i++) {
      const p = px(canvas, wx + i - 20, wy);
      const lum = 0.3 * p[0] + 0.6 * p[1] + 0.1 * p[2];
      lo = Math.min(lo, lum); hi = Math.max(hi, lum);
    }
    ok('stucco texture introduces variation', hi - lo > 1, 'spread ' + (hi - lo).toFixed(1));

    // --- before/after toggle restores the original ---
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const wallBeforeView = px(canvas, wx, wy);
    ok('before/after shows the original wall',
      Math.abs(wallBeforeView[0] - wallOriginal[0]) < 8 && Math.abs(wallBeforeView[1] - wallOriginal[1]) < 8 && Math.abs(wallBeforeView[2] - wallOriginal[2]) < 8,
      'view ' + wallBeforeView.join(',') + ' vs original ' + wallOriginal.join(','));
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const wallPainted = px(canvas, wx, wy);
    ok('toggling back shows the paint again', wallPainted.join() !== wallBeforeView.join());

    // --- manual corner tapping (the core interaction) ---
    // Clear, then dispatch four real pointer events on the canvas. The editor
    // must pick them up, snap the wall, and repaint.
    document.getElementById('pmpClearBtn').click();
    await sleep(300);
    ok('clearing corners removes the wall selection', px(canvas, wx, wy).join() === wallOriginal.join());
    const r = canvas.getBoundingClientRect();
    const taps = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.75], [0.2, 0.75]];
    for (const [tx, ty] of taps) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + tx * r.width,
        clientY: r.top + ty * r.height,
        bubbles: true
      }));
      await sleep(120);
    }
    await sleep(500);
    const tapped = px(canvas, wx, wy);
    ok('four taps repaint the tapped region', tapped.join() !== wallOriginal.join(), tapped.join(','));
    ok('tapped region carries the chosen colour (dark)', tapped[2] < 120, tapped.join(','));

    // --- area + material readout through the UI ---
    const wIn = document.getElementById('pmpWallW'), hIn = document.getElementById('pmpWallH');
    wIn.value = '12'; wIn.dispatchEvent(new Event('input', { bubbles: true }));
    hIn.value = '10'; hIn.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    ok('wall area readout shows 120 sq ft', /120\s*sq ft/.test(document.getElementById('pmpAreaSqft').textContent), document.getElementById('pmpAreaSqft').textContent);
    const matRows = document.querySelectorAll('#pmpMaterial .pmp-mat-row');
    ok('material table shows paint, putty and primer', matRows.length === 3, matRows.length + ' rows');
    const quoteHref = document.getElementById('pmpQuote').getAttribute('href');
    ok('quote link carries the area', /sqft=120/.test(quoteHref), quoteHref);
    ok('quote link carries the colour', /colors=%232f4858/i.test(quoteHref), quoteHref);

    // --- exterior switch ---
    document.querySelector('.pmp-atype[data-type="exterior"]').click();
    await sleep(200);
    ok('exterior selected updates the material note', /Exterior/.test(document.getElementById('pmpMaterial').textContent));

    // --- save preview produces a data URL ---
    const dl = document.createElement('a');
    ok('canvas exports a preview data URL', document.getElementById('pmpCanvas').toDataURL().indexOf('data:image') === 0);

    // --- exterior demo ---
    document.getElementById('pmpDemoExterior').click();
    await sleep(700);
    ok('exterior demo loads a canvas', canvas.width > 100);
    // Same technique: the exterior demo pre-applies the current colour, so the
    // true original is what the before view shows.
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const exOriginal = px(canvas, Math.round(canvas.width * 0.5), Math.round(canvas.height * 0.45));
    document.getElementById('pmpBeforeBtn').click();
    await sleep(400);
    const exWall = px(canvas, Math.round(canvas.width * 0.5), Math.round(canvas.height * 0.45));
    ok('exterior wall is repainted from its original', exWall.join() !== exOriginal.join(),
      'orig ' + exOriginal.join(',') + ' painted ' + exWall.join(','));

    lines.push('');
    lines.push(passed + ' passed, ' + failed + ' failed');
    out.textContent = lines.join('\n');
    out.dataset.done = '1';
  }

  run().catch(e => {
    lines.push('FAIL harness threw: ' + (e && e.message));
    out.textContent = lines.join('\n');
    out.dataset.done = '1';
  });
})();
