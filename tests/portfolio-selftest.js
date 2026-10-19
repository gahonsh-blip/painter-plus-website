/* ============================================================
   Browser self-test for the portfolio merge (js/script.js).

   admin.html stores projects in localStorage under
   `painterPlusProjects`; portfolio.html merges them into the grid
   on load. Those fields are free text typed in admin, so this test
   proves a malicious value cannot inject markup, a live event
   handler, or CSS.

   Before the fix (bug 26): a photo URL of
     x" onerror="window.__pwned=1
   broke out of the <img src="..."> attribute and ran; and the
   --pf-img value was interpolated into a style attribute so a quote
   could escape the url().

   The harness seeds the hostile project BEFORE script.js runs by
   writing localStorage in an inline script at the top of the copy.
   See tests/run-portfolio-selftest.sh.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const ok = (m) => out.push('ok   ' + m);
  const fail = (m) => out.push('FAIL ' + m);
  const check = (c, m) => (c ? ok(m) : fail(m));

  window.addEventListener('load', () => setTimeout(() => {
    try {
      const grid = document.getElementById('pfGrid');
      if (!grid) { fail('pfGrid missing'); return finish(); }

      // The injected project must have been merged in at all.
      const cards = grid.querySelectorAll('.pf-card[data-user="1"]');
      check(cards.length === 1, 'the stored project is merged into the grid (got ' + cards.length + ')');
      if (!cards.length) return finish();
      const card = cards[0];

      // 1. No injected handler ran, and none is attached.
      check(!window.__pwned, 'the onerror payload did not execute');
      const img = card.querySelector('img.pf-img');
      check(!!img, 'the card has an image');
      check(img && !img.hasAttribute('onerror'), 'no onerror attribute survives on the image');

      // 2. The hostile URL is present only as inert text/attribute value.
      check(img && img.getAttribute('src').indexOf('onerror') !== -1,
        'the URL is kept literally, not interpreted');
      check(card.querySelectorAll('script, iframe, object, embed').length === 0,
        'no element was injected from the field text');

      // 3. Free-text fields are escaped, not rendered as markup.
      const body = card.querySelector('.pf-body');
      check(body && body.querySelectorAll('script').length === 0, 'no script element in the body');
      check(body && body.textContent.indexOf('<img') !== -1,
        'a <img> typed into a text field shows as text, not as an element');
      check(body && body.querySelectorAll('img').length === 0,
        'the typed <img> did not become a real element');

      // 4. The --pf-img custom property is a single, inert url() token whose
      //    inner URL carries no quote, so it cannot close the url() early.
      const media = card.querySelector('.pf-media');
      const pf = media ? media.style.getPropertyValue('--pf-img') : '';
      check(pf.indexOf('url("') === 0 && pf.slice(-2) === '")',
        'the hover image is a single url("…") token: ' + pf.slice(0, 44));
      const inner = pf.replace(/^url\("/, '').replace(/"\)$/, '');
      check(inner.indexOf('"') === -1 && inner.indexOf("'") === -1 && inner.indexOf(')') === -1,
        'the url() inner value contains no quote or paren that could break out');
      check((pf.match(/"/g) || []).length === 2, 'the token has exactly the two wrapping quotes');
    } catch (e) {
      fail('threw: ' + (e && e.message));
    }
    finish();
  }, 300));

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'portfolio-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }
})();
