/* ============================================================
   Browser self-test for RATINGS & REVIEWS.
   Injected into a generated copy of painter-profile.html
   (see tests/run-reviews-selftest.sh / run-all-headless.sh).

   Drives the REAL page end to end:
     - an anonymous visitor sees the average + the review list but NO form
     - a signed-in active account gets the star form, submits, and the
       average/count update in place
     - a painter cannot rate their own profile
     - a lead can hide a review and it leaves the public average
     - a hostile stored review never renders "[object Object]"

   Results are written to a <pre id="reviews-selftest"> at the bottom.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[reviews-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const txt = (id) => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };

  const pageErrors = [];
  window.addEventListener('error', (e) => { pageErrors.push(e.message || String(e.error)); log('!! window error: ' + (e.message || e.error)); });

  // Deterministic KDF stand-in: Chromium's --virtual-time-budget never resolves
  // real PBKDF2, so registration would hang. The real round-trip is in Node.
  (function shimKdf() {
    try {
      const subtle = window.crypto && window.crypto.subtle;
      if (!subtle) return;
      subtle.importKey = function (fmt, keyData) { return Promise.resolve({ keyData: keyData }); };
      subtle.deriveBits = function (algo, key) {
        const pw = new TextDecoder().decode(key.keyData || new Uint8Array());
        const salt = Array.from((algo && algo.salt) || []).join(',');
        const seed = new TextEncoder().encode(pw + '|' + salt + '|' + (algo && algo.iterations));
        const o = new Uint8Array(32);
        for (let i = 0; i < o.length; i++) o[i] = seed[i % seed.length] ^ (i * 31);
        return Promise.resolve(o.buffer);
      };
      subtle.digest = function (algo, data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const o = new Uint8Array(32);
        for (let i = 0; i < o.length; i++) o[i] = (bytes[i % bytes.length] ^ (i * 17) ^ 0x5a) & 0xff;
        return Promise.resolve(o.buffer);
      };
    } catch (e) { /* leave crypto as-is */ }
  })();
  window.__ppBootstrapPasscode = 'reviews-operator-pass';
  (function installBootstrapPasscode() {
    const cfg = (window.PP_AUTH_CONFIG = window.PP_AUTH_CONFIG || {});
    window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('pp-auth-bootstrap-v1:' + window.__ppBootstrapPasscode))
      .then((buf) => {
        cfg.bootstrapPasscodeSha256 = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      });
  })();

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'reviews-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  const params = new URLSearchParams(location.search);
  const MEMBER = params.get('id') || 'ramesh-kumar';   // the painter being viewed
  const R = window.PPReviews;
  const A = window.PPAuth;
  const T = window.PPTeam;

  async function run() {
    if (!R || !A || !T) { fail('reviews/auth/team engine missing'); finish(); return; }

    // ---- seed a clean world --------------------------------------
    try {
      localStorage.removeItem('painterPlusReviews');
      localStorage.removeItem('painterPlusAuth');
      localStorage.removeItem('painterPlusAudit');
      sessionStorage.removeItem('ppAuthSession');
      sessionStorage.removeItem('ppAdminUnlocked');
      sessionStorage.removeItem('ppClaimedMember');
      localStorage.setItem('painterPlusTeam', JSON.stringify([
        { id: 'gahonsh', name: 'Gahonsh', role: 'head' },
        { id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', title: 'Senior Painter' },
        { id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter' }
      ]));
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('ppreviews:change'));
    document.dispatchEvent(new CustomEvent('ppteam:change'));
    await sleep(60);

    // ---- anonymous view ------------------------------------------
    const panel = $('ppReviews');
    check(!!panel, 'the profile page carries the reviews panel');
    check(panel && panel.textContent.indexOf('Sign in') !== -1, 'an anonymous visitor is told to sign in, not given a form');
    check(panel && !panel.querySelector('.rv-star-input'), 'an anonymous visitor sees no star form');
    check(panel && panel.querySelector('.rv-summary'), 'the summary (average + histogram) renders for everyone');

    // ---- register the accounts and activate them (as a lead would) ----
    const r1 = await A.register({ name: 'Ramesh Kumar', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
    const r2 = await A.register({ name: 'Suresh Mahto', username: 'suresh', email: 'suresh@example.com', password: 'secret123' });
    const adminReg = await A.register({ name: 'Gahonsh', username: 'gahonsh', email: 'gahonsh@example.com', password: 'secret123' });
    await A.promoteBootstrapAdmin(null, adminReg.account.id, window.__ppBootstrapPasscode);
    const adminLogin = await A.login('gahonsh', 'secret123');
    check(adminLogin && adminLogin.ok, 'the bootstrap Admin can sign in');
    const me = A.currentUser();
    // Link each account to a roster member and activate it.
    A.updateAccount(me, r1.account.id, { status: 'active', memberId: 'ramesh-kumar' });
    A.updateAccount(me, r2.account.id, { status: 'active', memberId: 'suresh-mahto' });
    A.updateAccount(me, adminReg.account.id, { status: 'active', memberId: 'gahonsh' });
    A.logout();
    document.dispatchEvent(new CustomEvent('ppauth:change'));
    await sleep(60);

    // ---- sign in as Suresh and rate Ramesh -----------------------
    const login = await A.login('suresh', 'secret123');
    check(login && login.ok, 'a crew account can sign in');
    document.dispatchEvent(new CustomEvent('ppauth:change'));
    document.dispatchEvent(new CustomEvent('ppreviews:change'));
    await sleep(80);

    check(panel.querySelector('.rv-star-input'), 'a signed-in account is offered the star form');
    const form = panel.querySelector('[data-rv-form]');
    check(!!form, 'the form is present');
    // Pick 5 stars and submit.
    const star5 = form.querySelector('.rv-star-input[value="5"]');
    star5.checked = true;
    const textBox = form.querySelector('.rv-text');
    if (textBox) textBox.value = 'Excellent finish, very professional.';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await sleep(80);

    check(R.count('painter', MEMBER) === 1, 'the review is stored');
    check(R.average('painter', MEMBER) === 5, 'the average reflects the new review');
    check(panel.textContent.indexOf('Excellent finish') !== -1, 'the review text appears in the list');
    check(txt('ppRating').indexOf('5.0') !== -1, 'the hero badge shows the new average');

    // ---- one review per account: editing does not add a row ------
    const star3 = panel.querySelector('.rv-star-input[value="3"]');
    const form2 = panel.querySelector('[data-rv-form]');
    star3.checked = true;
    form2.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await sleep(60);
    check(R.count('painter', MEMBER) === 1, 'editing keeps a single review row');
    check(R.average('painter', MEMBER) === 3, 'editing updates the average');

    // ---- self-review is blocked ----------------------------------
    A.logout();
    await A.login('ramesh', 'secret123');
    document.dispatchEvent(new CustomEvent('ppauth:change'));
    document.dispatchEvent(new CustomEvent('ppreviews:change'));
    await sleep(80);
    check(!R.canRate(A.currentUser(), 'painter', MEMBER), 'Ramesh cannot rate his own profile');
    check(!panel.querySelector('.rv-star-input'), 'no star form is shown for one\'s own profile');

    // ---- lead moderation hides a review from the average ---------
    A.logout();
    await A.login('gahonsh', 'secret123');
    document.dispatchEvent(new CustomEvent('ppauth:change'));
    document.dispatchEvent(new CustomEvent('ppreviews:change'));
    await sleep(80);
    const lead = A.currentUser();
    const rev = R.listFor('painter', MEMBER)[0];
    check(!!rev, 'the review is visible to the lead');
    check(R.hide(lead, rev.id).ok, 'a lead can hide a review');
    check(R.average('painter', MEMBER) === 0, 'a hidden review leaves the average');
    check(panel.textContent.indexOf('Hidden') !== -1, 'the hidden review is badged as hidden');

    // ---- hostile stored review never renders "[object Object]" ---
    try {
      localStorage.setItem('painterPlusReviews', JSON.stringify({
        'painter:suresh-mahto': [
          { id: {}, type: 'painter', key: 'suresh-mahto', author: {}, authorId: [], score: {}, text: {}, at: [] },
          { id: 'x', type: 'painter', key: 'suresh-mahto', author: 'Real', authorId: 'acc', score: 4, text: 'fine', at: 9 }
        ]
      }));
    } catch (e) {}
    const errsBefore = pageErrors.length;
    document.dispatchEvent(new CustomEvent('ppreviews:change'));
    await sleep(60);
    // Render a widget for Suresh to inspect.
    const probe = document.createElement('div');
    probe.setAttribute('data-reviews', 'painter');
    probe.setAttribute('data-review-key', 'suresh-mahto');
    document.body.appendChild(probe);
    window.PPReviewsUI.render(probe);
    await sleep(30);
    check(probe.textContent.indexOf('[object Object]') === -1, 'a hostile stored review never prints "[object Object]"');
    check(probe.textContent.indexOf('fine') !== -1, 'the one real review still renders');
    check(pageErrors.length === errsBefore, 'the hostile store throws nothing');

    finish();
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
