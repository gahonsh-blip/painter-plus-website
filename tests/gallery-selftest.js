/* ============================================================
   Browser self-test for the CREW WORK GALLERY page.
   Injected into a generated copy of gallery.html
   (see tests/run-gallery-selftest.sh).

   Seeds a roster, two members' galleries and a work log, then checks
   the real page: cards render, each is attributed to a painter and a
   project, the painter filter and project filter work, and the
   lightbox opens/closes.

   Results are written to a <pre id="gallery-selftest"> at the bottom.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[gallery-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const txt = (id) => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };

  window.addEventListener('error', (e) => log('!! window error: ' + (e.message || e.error)));

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'gallery-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  // Seed unless the gallery already holds the fixtures. Checking the data
  // (not a session flag) means a re-run after the empty-state test re-seeds
  // instead of running against an empty store.
  const seededNow = (() => {
    try { return (localStorage.getItem('painterPlusGallery') || '').indexOf('Living room repaint') !== -1; }
    catch (e) { return false; }
  })();
  if (!seededNow) {
    try {
      localStorage.setItem('painterPlusTeam', JSON.stringify([
        { id: 'gahonsh', name: 'Gahonsh', role: 'head', startYear: '2015' },
        { id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', startYear: '2018' },
        { id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter' }
      ]));
      localStorage.setItem('painterPlusGallery', JSON.stringify({
        'ramesh-kumar': [
          { id: 'g1', title: 'Living room repaint', photo: 'https://example.com/a.jpg', label: 'Interior wall', location: 'Ranchi', year: '2026', sqft: 120, project: 'Sharma House', at: '2026-10-10T09:00:00Z' }
        ],
        'suresh-mahto': [
          { id: 'g2', title: 'Exterior facade', photo: 'https://example.com/b.jpg', label: 'Exterior wall', location: 'Khunti', year: '2026', sqft: 300, project: 'Verma Flat', at: '2026-10-11T09:00:00Z' }
        ]
      }));
    } catch (e) {}
    sessionStorage.setItem('gallerySelftestSeeded', '1');
    location.reload();
    return;
  }

  async function run() {
    await sleep(120);
    const G = window.PPGallery;
    check(!!G, 'PPGallery is loaded');

    const grid = $('cgGrid');
    const cards = grid ? grid.querySelectorAll('.cg-card') : [];
    check(cards.length === 2, 'both crew photos render as cards (got ' + cards.length + ')');
    check($('cgEmpty').hidden, 'the empty message is hidden while photos exist');

    const gridText = grid ? grid.textContent.replace(/\s+/g, ' ') : '';
    check(gridText.indexOf('Living room repaint') !== -1, 'a card shows its title');
    check(gridText.indexOf('Ramesh Kumar') !== -1, 'a card is attributed to the painter');
    check(gridText.indexOf('Sharma House') !== -1, 'a card shows its project');
    check(gridText.indexOf('120 sq ft') !== -1, 'a card shows its square feet');

    // Newest first: Suresh's 10-11 photo leads Ramesh's 10-10 photo.
    const first = cards[0] ? cards[0].textContent : '';
    check(first.indexOf('Exterior facade') !== -1, 'cards are newest-first');

    // Painter filter.
    const filters = $('cgFilters') ? $('cgFilters').querySelectorAll('.tm-filter') : [];
    check(filters.length === 3, 'filters list All + each painter with photos (got ' + filters.length + ')');
    const rameshBtn = Array.from(filters).find((b) => b.textContent.indexOf('Ramesh Kumar') !== -1);
    check(!!rameshBtn, 'a filter button exists for Ramesh Kumar');
    if (rameshBtn) {
      rameshBtn.click();
      await sleep(60);
      const after = $('cgGrid').querySelectorAll('.cg-card');
      check(after.length === 1, 'filtering by painter narrows to that painter (got ' + after.length + ')');
      check($('cgGrid').textContent.indexOf('Living room repaint') !== -1, 'the filtered card is the right one');
    }

    // Reset the painter filter, then filter by project.
    const allBtn = Array.from($('cgFilters').querySelectorAll('.tm-filter')).find((b) => b.dataset.member === 'all');
    if (allBtn) { allBtn.click(); await sleep(60); }
    const sel = $('cgProject');
    check(!!sel && sel.options.length === 3, 'the project filter lists All + each project (got ' + (sel ? sel.options.length : 0) + ')');
    if (sel) {
      sel.value = 'Verma Flat';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(60);
      const after = $('cgGrid').querySelectorAll('.cg-card');
      check(after.length === 1, 'filtering by project narrows to that project (got ' + after.length + ')');
      check($('cgGrid').textContent.indexOf('Exterior facade') !== -1, 'the filtered card is the right one');
    }

    // Lightbox.
    if (allBtn) { allBtn.click(); await sleep(60); }
    const media = $('cgGrid').querySelector('.cg-media');
    check(!!media, 'a gallery photo is clickable');
    if (media) {
      media.click();
      await sleep(60);
      check(!!document.querySelector('.pp-lightbox'), 'clicking opens the lightbox');
      const close = document.querySelector('.pp-lb-close');
      if (close) close.click();
      await sleep(40);
      check(!document.querySelector('.pp-lightbox'), 'the lightbox closes');
    }

    // Empty state.
    try { localStorage.setItem('painterPlusGallery', '{}'); } catch (e) {}
    G.write(G.read());
    document.dispatchEvent(new CustomEvent('ppgallery:change'));
    await sleep(60);
    check($('cgGrid').querySelectorAll('.cg-card').length === 0, 'an empty gallery shows no cards');
    check(!$('cgEmpty').hidden, 'an empty gallery shows the empty message');

    finish();
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
