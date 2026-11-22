(function () {
  'use strict';
  const out = [], log = (m) => { out.push(m); console.log('[ui] ' + m); };
  const ok = (m) => log('ok   ' + m), fail = (m) => log('FAIL ' + m);
  const check = (c, m) => c ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function finish() {
    const pre = document.createElement('pre'); pre.id = 'ui-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px';
    pre.textContent = out.join('\n') + '\n\n' + (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }
  (async () => {
    // Deferred scripts run BEFORE DOMContentLoaded, and script.js attaches its
    // handlers from a DOMContentLoaded listener, so wait for the event first.
    if (document.readyState !== 'complete') {
      await new Promise((r) => window.addEventListener('load', r, { once: true }));
    }
    await sleep(50);

    const items = document.querySelectorAll('.faq-item');
    check(items.length === 3, 'three FAQ items');
    const q = items[0].querySelector('.question');
    check(q && q.tagName === 'BUTTON', 'FAQ question is a real <button>');
    check(q && q.getAttribute('type') === 'button', 'FAQ button has type="button"');
    check(q && q.getAttribute('aria-expanded') === 'true', 'first FAQ starts aria-expanded=true');
    const second = items[1].querySelector('.question');
    check(second.getAttribute('aria-expanded') === 'false', 'second FAQ starts aria-expanded=false');
    second.click(); await sleep(30);
    check(second.getAttribute('aria-expanded') === 'true' && items[1].classList.contains('open'), 'clicking opens the FAQ and flips aria-expanded');
    second.click(); await sleep(30);
    check(second.getAttribute('aria-expanded') === 'false' && !items[1].classList.contains('open'), 'clicking again closes it');
    check(q.tabIndex >= 0, 'FAQ question is keyboard-focusable');

    const btn = document.querySelector('.mobile-toggle');
    const nav = document.querySelector('.nav-links');
    check(!!btn && !!nav, 'mobile toggle and nav present');
    check(nav.id === 'primary-nav', 'nav has id=primary-nav');
    check(btn.getAttribute('aria-controls') === 'primary-nav', 'toggle aria-controls points at the nav');
    check(btn.getAttribute('aria-expanded') === 'false', 'toggle starts aria-expanded=false');
    btn.click(); await sleep(30);
    check(btn.getAttribute('aria-expanded') === 'true' && nav.classList.contains('open'), 'opening the menu flips aria-expanded');
    btn.click(); await sleep(30);
    check(btn.getAttribute('aria-expanded') === 'false' && !nav.classList.contains('open'), 'closing the menu flips it back');

    const active = document.querySelector('#primary-nav a.active');
    check(!!active, 'the current page link is marked active');
    check(active && active.getAttribute('aria-current') === 'page', 'the active link has aria-current=page');

    // The assistant button used to sit on top of the WhatsApp pill (both were
    // pinned bottom-right). It now lives bottom-left, so neither covers the
    // other at any viewport width.
    const botBtn = document.querySelector('.ppb-btn');
    const wa = document.querySelector('.whatsapp-float');
    check(!!botBtn && !!wa, 'the assistant button and WhatsApp float are both present');
    if (botBtn && wa) {
      const b = botBtn.getBoundingClientRect();
      const w = wa.getBoundingClientRect();
      const overlap = !(b.right <= w.left || b.left >= w.right || b.bottom <= w.top || b.top >= w.bottom);
      check(!overlap, 'the assistant button does not overlap the WhatsApp float');
    }
    finish();
  })().catch(e => { fail('harness threw: ' + e.message); finish(); });
})();
