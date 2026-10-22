/* ============================================================
   Browser self-test for the COLOR STUDIO (color-studio.html +
   js/color-studio.js).

   Two regressions it pins down:

   1. A corrupt / hand-edited `pp_studio` in localStorage used to
      crash the scene render on load. `colours[scene][key]` could
      hold a number, null, an object or a bogus hex, and the code
      called `.toUpperCase()` / `.replace()` straight on it, so
      `selectSurface` threw during init and aborted the rest of the
      file. The page builder seeds that value BEFORE the studio
      script runs, and an early collector in <head> records anything
      thrown from the very first line, so an init-time throw is seen.
   2. A surface tab captured from a previous scene could still fire
      after the scene changed; that key does not exist in the new
      scene, so the colour lookup was undefined and threw.

   Results are written to a <pre id="cs-selftest"> at the bottom.
   ============================================================ */
(function () {
  'use strict';

  const out = [];
  const log = (m) => { out.push(m); console.log('[cs-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  // The page builder installs this in <head>, before any page script runs.
  const errs = window.__csErrors || (window.__csErrors = []);
  window.addEventListener('error', (e) => errs.push(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'cs-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  // A value is a usable colour token if it is a 3- or 6-digit hex with an
  // optional leading '#'; everything else counts as corrupt input.
  const isHex = (v) => typeof v === 'string' && /^#?[0-9a-f]{3}$/i.test(v.trim()) ||
                        typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim());

  function summaryHexes() {
    return Array.from(document.querySelectorAll('#schemeSummary .ss-hex'))
      .map((el) => el.textContent.trim());
  }

  async function run() {
    const quotes = () => ($('quoteScheme') ? $('quoteScheme').getAttribute('href') : '');

    // ---- 1. The seeded corrupt store did not break the initial render ----
    check(errs.length === 0, 'no error thrown during load with a corrupt pp_studio' +
      (errs.length ? ' :: ' + errs.slice(0, 2).join(' | ') : ''));
    check(document.querySelectorAll('.scene-tab').length >= 4, 'scene tabs rendered');
    check(document.querySelectorAll('.surface-tab').length >= 4, 'surface tabs rendered for the default scene');
    check(document.querySelectorAll('.swatch').length > 0, 'palette swatches rendered');

    // ---- 2. A healthy control still works after the corrupt load ----
    const firstSwatch = document.querySelector('.swatch');
    if (firstSwatch) {
      firstSwatch.click();
      await sleep(60);
      check(firstSwatch.classList.contains('active'), 'clicking a swatch marks it active');
    }

    // ---- 3. Every scene can be selected and re-rendered ----
    const sceneTabs = Array.from(document.querySelectorAll('.scene-tab'));
    let sceneErrs = 0;
    for (const t of sceneTabs) {
      const before = errs.length;
      t.click();
      await sleep(40);
      if (errs.length > before) sceneErrs++;
    }
    check(sceneErrs === 0, 'switching through every scene throws nothing');

    // ---- 4. The stale-surface-tab regression ----
    const staleTabs = Array.from(document.querySelectorAll('.surface-tab'));
    const otherScene = sceneTabs.find((t) => !t.classList.contains('active')) || sceneTabs[0];
    if (otherScene) otherScene.click();
    await sleep(40);
    const beforeStale = errs.length;
    staleTabs.forEach((t) => t.click());
    await sleep(60);
    check(errs.length === beforeStale, 'stale surface tabs from a previous scene do not throw');

    // ---- 5. Drive the rest of the controls with the corrupt value present ----
    const beforeDrive = errs.length;
    if ($('saveScheme')) $('saveScheme').click();
    if ($('resetScheme')) $('resetScheme').click();
    if ($('customColor')) {
      $('customColor').value = '#334455';
      $('customColor').dispatchEvent(new Event('input', { bubbles: true }));
    }
    if ($('coverage')) {
      $('coverage').value = '40';
      $('coverage').dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(150);
    check(errs.length === beforeDrive, 'save / reset / custom colour / coverage all stay clean');

    // ---- 6. No raw stored value ever reaches the DOM or the quote link ----
    const hexes = summaryHexes();
    check(hexes.length > 0, 'scheme summary still renders rows');
    check(hexes.every(isHex),
      'every summary swatch prints a real hex, not a raw stored value: ' + JSON.stringify(hexes.slice(0, 4)));

    const href = quotes();
    check(href.indexOf('undefined') === -1 && href.indexOf('null') === -1,
      'the quote link carries no undefined/null colour: ' + href.slice(0, 90));

    // The colours travel inside the `colors` param as a nested query string
    // (colors=scene%3Dliving%26back%3D334455%26…), so unwrap it before checking.
    const outer = new URLSearchParams((href.split('?')[1] || ''));
    const inner = new URLSearchParams(outer.get('colors') || '');
    const colourParams = ['back', 'left', 'right', 'ceiling', 'floor', 'accent']
      .filter((k) => inner.has(k));
    check(colourParams.length > 0, 'quote link carries colour parameters');
    check(colourParams.every((k) => /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(inner.get(k))),
      'every colour parameter is a bare hex: ' + colourParams.map((k) => k + '=' + inner.get(k)).join(' '));

    // ---- 7. The stage is still painted ----
    const painted = Array.from(document.querySelectorAll('.scene.active .paint-surface'))
      .filter((el) => /^rgb/.test(getComputedStyle(el).backgroundColor || ''));
    check(painted.length > 0, 'the active scene still paints its surfaces');

    // Leave storage clean for any later harness in the same tab.
    try { localStorage.removeItem('pp_studio'); } catch (e) { /* ignore */ }
  }

  run().then(finish).catch((e) => { fail('harness threw: ' + (e && e.message)); finish(); });
})();
