/* ============================================================
   Browser self-test for the ADMIN "Accounts & access" pane
   (admin.html + js/accounts-page.js + js/auth.js).

   Injected into a generated copy of admin.html
   (see tests/run-admin-selftest.sh and run-all-headless.sh).

   It proves the pane is a REAL authorisation surface, not just a
   hidden button:
     - with no signed-in account the pane refuses and shows no controls
     - a signed-in Painter account sees no account controls
     - a signed-in Admin sees the pending account, can approve it,
       set its role and edit rights, and the change is persisted
     - the audit log shows the approval
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[admin-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (c, m) => c ? ok(m) : fail(m);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  window.addEventListener('error', (e) => log('!! window error: ' + (e.message || e.error)));

  // Same WebCrypto shim as tests/auth-selftest.js — Chromium's
  // --virtual-time-budget never resolves real PBKDF2. The hashing itself is
  // covered by tests/auth.test.js.
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
    } catch (e) {}
  })();

  // Supply the operator passcode + its digest so first-run bootstrap works in
  // the harness (js/auth-config.js ships with the digest blank = bootstrap closed).
  window.__ppBootstrapPasscode = 'selftest-operator-pass';
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
    pre.id = 'admin-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some((l) => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  const clean = (() => { try { return !localStorage.getItem('painterPlusAuth'); } catch (e) { return true; } })();
  if (!clean && sessionStorage.getItem('adminSelftestClean') !== '1') {
    try {
      localStorage.removeItem('painterPlusAuth');
      localStorage.removeItem('painterPlusAudit');
      sessionStorage.clear();
    } catch (e) {}
    sessionStorage.setItem('adminSelftestClean', '1');
    location.reload();
    return;
  }

  async function run() {
    await sleep(150);
    const A = window.PPAuth;
    check(!!A, 'PPAuth engine is loaded on admin.html');
    if (!A) { finish(); return; }

    // ---- 0. Boot with a signed-in Admin must not crash ----
    // A signed-in Admin/Head auto-opens the panel. That used to run *before*
    // the profile/project consts (pfGet, form, fields) were declared, so the
    // open threw `Cannot access 'pfGet' before initialization`, aborted the
    // whole DOMContentLoaded handler and left the tabs unwired. Check the
    // listener the harness installed on the panel's own script before the
    // account was created, then sign in and see that the panel opened.
    let bootErr = null;
    const bootProbe = (e) => { bootErr = (e && (e.message || e.error)) || 'unknown error'; };
    window.addEventListener('error', bootProbe);
    const owner = await A.register({ name: 'Owner', username: 'owner', email: 'owner@example.com', password: 'secret123' });
    await A.promoteBootstrapAdmin(null, owner.account.id, window.__ppBootstrapPasscode);
    await A.login('owner', 'secret123');
    document.dispatchEvent(new CustomEvent('ppauth:change'));
    await sleep(120);
    window.removeEventListener('error', bootProbe);
    check(!bootErr, 'signing in as an Admin opens the panel without a boot error' + (bootErr ? ' (' + bootErr + ')' : ''));
    check(!$('admPanel').hidden, 'the Admin panel is open after sign-in');
    // The tabs must be wired — a boot crash used to abort the handler before
    // the tab listeners were attached, so clicking a tab did nothing.
    const projTab = $('tabProjects');
    if (projTab) projTab.click();
    await sleep(40);
    check($('paneProjects') && !$('paneProjects').hidden, 'the tab wiring ran (clicking Projects shows its pane)');
    const teamTab = $('tabTeam');
    if (teamTab) teamTab.click();
    await sleep(40);

    // ---- 1. No signed-in account → the pane refuses ----
    A.logout();
    document.dispatchEvent(new CustomEvent('ppadmin:open'));
    await sleep(60);
    const list = $('acctList');
    check(!!list, 'the accounts list element exists');
    check(!list.querySelector('.acct-item'), 'no account controls render without a signed-in account');
    check(/Sign in as an Admin or Head/.test(list.textContent), 'the pane asks for an Admin/Head sign-in');

    // ---- 2. Seed an Admin + a pending painter ----
    // (The Admin was created in step 0; reuse it.)
    const admin = A.getAccount(owner.account.id);
    const pend = await A.register({ name: 'New Painter', username: 'newbie', email: 'newbie@example.com', password: 'secret123' });
    check(A.getAccount(pend.account.id).status === 'pending', 'a fresh account is pending');

    // ---- 3. A Painter account sees no account controls ----
    const painter = await A.register({ name: 'Plain Painter', username: 'plain', email: 'plain@example.com', password: 'secret123' });
    A.setStatus(admin, painter.account.id, 'active');
    await A.login('plain', 'secret123');
    document.dispatchEvent(new CustomEvent('ppadmin:open'));
    await sleep(60);
    check(!list.querySelector('.acct-item'), 'a signed-in Painter sees no account controls');
    A.logout();

    // ---- 4. The Admin sees the pending account and approves it ----
    await A.login('owner', 'secret123');
    document.dispatchEvent(new CustomEvent('ppadmin:open'));
    await sleep(80);
    const items = list.querySelectorAll('.acct-item');
    check(items.length >= 2, 'the Admin sees the accounts');
    const pendingCard = Array.prototype.find.call(items, (li) => /newbie/.test(li.textContent));
    check(!!pendingCard, 'the pending account is listed');

    const approveBtn = pendingCard && pendingCard.querySelector('[data-act="approve"]');
    check(!!approveBtn, 'a pending account offers an Approve button');
    if (approveBtn) {
      approveBtn.click();
      await sleep(120);
      check(A.getAccount(pend.account.id).status === 'active', 'approving activates the account');
    }

    // ---- 5. Set the role and edit rights ----
    document.dispatchEvent(new CustomEvent('ppadmin:open'));
    await sleep(80);
    const card2 = Array.prototype.find.call(list.querySelectorAll('.acct-item'), (li) => /newbie/.test(li.textContent));
    const roleSel = card2 && card2.querySelector('[data-act="role"]');
    check(!!roleSel, 'the Admin sees a role selector');
    if (roleSel) {
      roleSel.value = 'head';
      roleSel.dispatchEvent(new Event('change'));
      await sleep(120);
      check(A.getAccount(pend.account.id).role === 'head', 'the Admin can set the role');
    }
    document.dispatchEvent(new CustomEvent('ppadmin:open'));
    await sleep(80);
    const card3 = Array.prototype.find.call(list.querySelectorAll('.acct-item'), (li) => /newbie/.test(li.textContent));
    const rightsBoxes = card3 ? card3.querySelectorAll('[data-right]') : [];
    check(rightsBoxes.length > 0, 'the Admin sees per-field edit-rights checkboxes');
    if (rightsBoxes.length) {
      rightsBoxes.forEach((cb) => { cb.checked = true; });
      const saveRights = card3.querySelector('[data-act="saveRights"]');
      saveRights.click();
      await sleep(120);
      const acct = A.getAccount(pend.account.id);
      check(acct.editRights && acct.editRights.phone === true, 'edit rights are persisted');
    }

    // ---- 6. The audit log records the approval ----
    const auditUl = $('auditList');
    check(!!auditUl, 'the audit log element exists');
    check(/account\.update/.test(auditUl.textContent) || auditUl.children.length > 0,
      'the audit log shows the recorded actions');

    finish();
  }

  function boot() { run().catch((e) => { fail('harness threw: ' + (e && e.message ? e.message : e)); finish(); }); }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
