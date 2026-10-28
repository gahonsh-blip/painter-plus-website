/* ============================================================
   CREW LOGIN / REGISTER / RECOVERY PAGE
   ------------------------------------------------------------
   Drives login.html against window.PPAuth. Every action calls the
   engine, which enforces authorisation and validation; this file only
   renders the result. A signed-in crew member lands on their own
   profile; an Admin/Head also gets a link to the management pages.
   ============================================================ */
(function () {
  'use strict';

  const A = window.PPAuth;
  const T = window.PPTeam;
  const $ = (id) => document.getElementById(id);
  const txt = (el, s) => { if (el) el.textContent = s == null ? '' : String(s); };
  const show = (el, on) => { if (el) el.hidden = !on; };
  const msg = (id, text, isError) => {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-ok', !!isError === false && !!text);
  };

  const signedOut = $('authSignedOut');
  const dashboard = $('authDashboard');
  if (!A || !signedOut || !dashboard) return;

  // ------------------------------------------------------------
  // Password policy hint
  // ------------------------------------------------------------
  function policyText() {
    const p = A.policy();
    const bits = ['at least ' + p.minLength + ' characters'];
    if (p.requireLetter) bits.push('a letter');
    if (p.requireNumber) bits.push('a number');
    return 'Use ' + bits.join(', ') + '.';
  }
  txt($('regPwHint'), policyText());
  txt($('pwHint'), policyText());

  // ------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------
  const TABS = [['tabLogin', 'paneLogin'], ['tabRegister', 'paneRegister'], ['tabRecover', 'paneRecover']]
    .map(([t, p]) => ({ tab: $(t), pane: $(p) })).filter((x) => x.tab && x.pane);

  function showTab(active) {
    TABS.forEach((t) => {
      const on = t === active;
      t.tab.classList.toggle('active', on);
      t.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      t.pane.hidden = !on;
    });
  }
  TABS.forEach((t) => t.tab.addEventListener('click', () => showTab(t)));

  // ------------------------------------------------------------
  // Render signed-in / signed-out
  // ------------------------------------------------------------
  function profileHref(account) {
    return account && account.memberId
      ? './painter-profile.html?id=' + encodeURIComponent(account.memberId)
      : './painter-profile.html';
  }

  function render() {
    const me = A.currentUser();
    show(dashboard, !!me);
    show(signedOut, !me);

    const demo = $('authDemoNote');
    if (demo) {
      if (A.providerName() === 'local') {
        demo.hidden = false;
        demo.textContent = '⚠️ This site is running the built-in local account provider: accounts live only in this browser and do not sync between devices. For real, server-enforced sign-in, set provider:"supabase" in js/auth-config.js (see docs/AUTH.md).';
      } else {
        demo.hidden = true;
      }
    }

    if (!me) return;
    txt($('authDashName'), me.name || me.username);
    txt($('authDashMeta'), [A.ROLES.find((r) => r.id === me.role) ? A.ROLES.find((r) => r.id === me.role).label : me.role, me.email].filter(Boolean).join(' · '));
    const badge = A.ACCOUNT_STATUS[me.status] || { label: me.status };
    txt($('authDashStatus'), 'Account status: ' + badge.label + (me.status === 'active' ? ' ✅' : ' ⏳'));

    const av = $('authAvatar');
    if (av) {
      if (me.photo) av.innerHTML = '<img src="' + escAttr(me.photo) + '" alt="" onerror="this.remove()" />';
      else av.textContent = initials(me.name || me.username);
    }
    const goProfile = $('authGoProfile');
    if (goProfile) goProfile.href = profileHref(me);
    // The management link is built only for a signed-in Admin/Head, so no staff
    // entry point ships in the HTML a cold visitor receives.
    const slot = $('authManageSlot');
    if (slot) {
      const canManage = me.role === 'admin' || me.role === 'head';
      slot.innerHTML = canManage
        ? '<a class="btn-ghost" href="./admin.html">🛡️ Manage crew</a>'
        : '';
    }
    // Pre-fill the login id for a quick re-login after sign-out.
    const loginId = $('loginId');
    if (loginId && !loginId.value) loginId.value = me.username || me.email;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '🎨';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------
  const loginForm = $('paneLogin');
  if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = ($('loginId').value || '').trim();
    const pass = $('loginPass').value || '';
    if (!id || !pass) { msg('loginMsg', 'Enter your email/username and password.', true); return; }
    const btn = $('loginSubmit');
    setBusy(btn, true, 'Signing in…');
    const res = await A.login(id, pass);
    setBusy(btn, false);
    if (!res.ok) { msg('loginMsg', res.error, true); return; }
    msg('loginMsg', '');
    $('loginPass').value = '';
    render();
  });

  // ------------------------------------------------------------
  // REGISTER
  // ------------------------------------------------------------
  const regForm = $('paneRegister');
  if (regForm) regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $('regPassword').value || '';
    const confirm = $('regConfirm').value || '';
    if (pass !== confirm) { msg('regMsg', 'The two passwords do not match.', true); return; }
    const btn = $('regSubmit');
    setBusy(btn, true, 'Creating…');
    const res = await A.register({
      name: ($('regName').value || '').trim(),
      username: ($('regUsername').value || '').trim(),
      email: ($('regEmail').value || '').trim(),
      phone: ($('regPhone').value || '').trim(),
      password: pass
    });
    setBusy(btn, false);
    if (!res.ok) { msg('regMsg', res.error, true); return; }
    msg('regMsg', '✅ Account created. An Admin or Head must approve it before you can sign in.', false);
    regForm.reset();
    txt($('regPwHint'), policyText());
  });

  // ------------------------------------------------------------
  // RECOVERY
  // ------------------------------------------------------------
  // The code is issued by an Admin/Head, never by this form, so there is no
  // "send code" step here — the member just enters the code they were given.
  const recReset = $('recReset');
  if (recReset) recReset.addEventListener('click', async () => {
    const email = ($('recEmail').value || '').trim();
    const code = ($('recCode').value || '').trim();
    const pass = $('recNew').value || '';
    if (!email || !code || !pass) { msg('recMsg', 'Enter your email, the recovery code and a new password.', true); return; }
    setBusy(recReset, true, 'Saving…');
    const res = await A.resetWithCode(email, code, pass);
    setBusy(recReset, false);
    if (!res.ok) { msg('recMsg', res.error, true); return; }
    msg('recMsg', '✅ Password updated. You can now sign in.', false);
    $('recNew').value = '';
    $('recCode').value = '';
    setTimeout(() => { showTab(TABS[0]); msg('loginMsg', 'Password updated — please sign in.', false); }, 900);
  });

  // ------------------------------------------------------------
  // SIGNED-IN actions
  // ------------------------------------------------------------
  const logoutBtn = $('authLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    const res = A.logout();
    // Local sign-out is synchronous; Supabase also clears the local session at
    // once, so render now and let the network call finish in the background.
    if (res && typeof res.then === 'function') res.then(render).catch(render);
    else render();
  });

  const changePwBtn = $('authChangePwBtn');
  if (changePwBtn) changePwBtn.addEventListener('click', () => {
    show($('authChangePwForm'), true);
    msg('authDashMsg', '');
  });
  const changePwCancel = $('authChangePwCancel');
  if (changePwCancel) changePwCancel.addEventListener('click', () => show($('authChangePwForm'), false));

  const changePwForm = $('authChangePwForm');
  if (changePwForm) changePwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const me = A.currentUser();
    if (!me) { render(); return; }
    const cur = $('pwCurrent').value || '';
    const next = $('pwNew').value || '';
    const confirm = $('pwConfirm').value || '';
    if (next !== confirm) { msg('authDashMsg', 'The two new passwords do not match.', true); return; }
    const res = await A.changePassword(me, cur, next);
    if (!res.ok) { msg('authDashMsg', res.error, true); return; }
    msg('authDashMsg', '✅ Password changed.', false);
    changePwForm.reset();
    show(changePwForm, false);
  });

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
    else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  render();
  document.addEventListener('ppauth:change', render);
})();
