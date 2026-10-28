/* ============================================================
   ADMIN — ACCOUNTS & ACCESS CONTROL
   ------------------------------------------------------------
   Renders and drives the "Accounts & Access" tab on admin.html
   against window.PPAuth. It only ever *asks* the engine to act;
   the engine checks authorisation and returns an error that this
   file surfaces. So a Painter — or anyone who opens this page —
   sees the controls but every action is refused by the engine.

   Also shows the append-only audit log.
   ============================================================ */
(function () {
  'use strict';

  const A = window.PPAuth;
  const listEl = document.getElementById('acctList');
  if (!A || !listEl) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let filter = 'all';
  const STATUS_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
    { id: 'suspended', label: 'Suspended' },
    { id: 'rejected', label: 'Rejected' }
  ];

  // Is the signed-in account allowed to manage accounts at all?
  function me() { return A.currentUser(); }
  function canManage() {
    const u = me();
    return !!u && A.can(u, 'account.manage', null);
  }
  function isAdmin() { const u = me(); return !!u && u.role === 'admin'; }

  function flash(text, isError) {
    let el = $('acctMsg');
    if (!el) {
      el = document.createElement('p');
      el.id = 'acctMsg';
      el.className = 'auth-msg';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      listEl.parentNode.insertBefore(el, listEl);
    }
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-ok', !isError && !!text);
  }

  function renderFilters() {
    const wrap = $('acctFilters');
    if (!wrap) return;
    wrap.innerHTML = STATUS_FILTERS.map((f) =>
      '<button type="button" class="adm-acct-filter' + (f.id === filter ? ' active' : '') + '" data-status="' + f.id + '">' +
      esc(f.label) + '</button>').join('');
    wrap.querySelectorAll('.adm-acct-filter').forEach((b) => {
      b.addEventListener('click', () => { filter = b.dataset.status; render(); });
    });
  }

  function badge(text, cls) { return '<span class="acct-badge ' + cls + '">' + esc(text) + '</span>'; }

  function accountCard(a) {
    const u = me();
    const statusMeta = A.ACCOUNT_STATUS[a.status] || { label: a.status, tone: '' };
    const initials = (function (n) {
      const p = String(n || '').trim().split(/\s+/).filter(Boolean);
      if (!p.length) return '?';
      return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    })(a.name || a.username);

    // What may the signed-in account actually do to THIS account? The engine is
    // the real gate; mirroring it here keeps a Head from being shown controls
    // for a peer Head or an Admin that would only fail when clicked.
    const manageable = !!u && A.can(u, 'account.manage', a);
    // Only offer roles the actor is allowed to hand out (a Head cannot grant
    // admin or head), so the dropdown can never propose an escalation.
    const roleOptions = A.ROLES
      .filter((r) => A.can(u, 'role.assign', a, r.id) || r.id === a.role)
      .map((r) => '<option value="' + r.id + '"' + (r.id === a.role ? ' selected' : '') + '>' + r.icon + ' ' + esc(r.label) + '</option>').join('');

    const rights = A.SELF_FIELDS.concat(A.COMPANY_FIELDS).map((f) =>
      '<label><input type="checkbox" data-right="' + f + '"' + (a.editRights && a.editRights[f] ? ' checked' : '') + (manageable ? '' : ' disabled') + ' /> ' + esc(f) + '</label>').join('');

    const avatar = a.photo
      ? '<img src="' + esc(a.photo) + '" alt="" onerror="this.remove()" />'
      : esc(initials);

    const controls = manageable
      ? '<div class="acct-controls">' +
          '<label class="adm-field"><span>Role</span><select class="form-control" data-act="role">' + roleOptions + '</select></label>' +
          '<label class="adm-field"><span>Member link</span><input type="text" class="form-control" data-act="memberId" value="' + esc(a.memberId) + '" placeholder="e.g. ramesh-kumar" /></label>' +
        '</div>' +
        '<div class="acct-rights">' + rights + '</div>' +
        '<div class="acct-actions">' +
          (a.status !== 'active' ? '<button type="button" class="approve" data-act="approve">✅ Approve</button>' : '') +
          (a.status !== 'suspended' ? '<button type="button" class="suspend" data-act="suspend">⏸ Suspend</button>' : '') +
          (a.status !== 'rejected' ? '<button type="button" class="reject" data-act="reject">⛔ Reject</button>' : '') +
          (a.role !== 'admin' && (A.can(u, 'role.assign', a, 'admin') || (A.needsBootstrapAdmin() && a.status === 'active'))
            ? '<button type="button" class="promote" data-act="promote">🛡️ Make Admin</button>' : '') +
          '<button type="button" data-act="saveRights">💾 Save edit rights</button>' +
          '<button type="button" data-act="resetPw">🔑 Reset password</button>' +
          (a.status === 'active' ? '<button type="button" data-act="issueCode">🎟️ Recovery code</button>' : '') +
        '</div>'
      : '<p class="acct-readonly">🔒 View only — you do not outrank this account.</p>';

    return '<li class="acct-item" data-id="' + esc(a.id) + '">' +
      '<div class="acct-top">' +
        '<span class="acct-avatar">' + avatar + '</span>' +
        '<div class="acct-id">' +
          '<div class="acct-name">' + esc(a.name || a.username) +
            badge(statusMeta.label, statusMeta.tone) +
            badge(a.role, 'role') +
            (a.privacy === 'private' ? badge('Private', 'warn') : badge('Public', 'ok')) +
          '</div>' +
          '<div class="acct-meta">@' + esc(a.username) + ' · ' + esc(a.email) + (a.memberId ? ' · member: ' + esc(a.memberId) : '') + '</div>' +
        '</div>' +
      '</div>' +
      controls +
    '</li>';
  }

  function render() {
    renderFilters();
    const empty = $('acctEmpty');
    const auditUl = $('auditList');
    const auditEmpty = $('auditEmpty');

    // REAL authorisation gate: without a signed-in Admin/Head *account* this
    // pane shows nothing but a sign-in prompt. The passcode gate that opens
    // admin.html is not sufficient — account management needs an account.
    if (!canManage()) {
      listEl.innerHTML = '<li class="acct-empty">🔐 Sign in as an Admin or Head account to approve crew accounts and manage access. ' +
        '<a href="./login.html">Go to crew login →</a></li>';
      if (empty) empty.hidden = true;
      if (auditUl) auditUl.innerHTML = '';
      if (auditEmpty) auditEmpty.hidden = true;
      return;
    }

    const all = A.listAccounts();
    const list = filter === 'all' ? all : all.filter((a) => a.status === filter);

    // Bootstrap note: with no Admin yet, a signed-in Admin/Head may promote the
    // first approved account. Keeps a fresh install administrable.
    if (A.needsBootstrapAdmin()) {
      flash('No Admin exists yet. Use “Make Admin” on the account that should run the site.', false);
    }

    if (!list.length) {
      listEl.innerHTML = '';
      if (empty) empty.hidden = false;
      renderAudit();
      return;
    }
    if (empty) empty.hidden = true;
    listEl.innerHTML = list.map(accountCard).join('');
    wire(listEl);
    renderAudit();
  }

  function act(fn) {
    const u = me();
    if (!u) { flash('Sign in with an Admin or Head account to manage crew accounts.', true); return; }
    if (!canManage()) { flash('Only an Admin or Head can manage accounts.', true); return; }
    // Local writes are synchronous; Supabase writes return a promise. Handle both.
    const res = fn(u);
    if (res && typeof res.then === 'function') {
      res.then((r) => {
        if (!r || !r.ok) { flash((r && r.error) || 'Action failed.', true); return; }
        flash('✅ Saved.', false);
        render();
      }).catch((e) => flash((e && e.message) || 'Action failed.', true));
      return;
    }
    if (!res || !res.ok) { flash((res && res.error) || 'Action failed.', true); return; }
    flash('✅ Saved.', false);
    render();
  }

  function wire(scope) {
    scope.querySelectorAll('.acct-item').forEach((li) => {
      const id = li.dataset.id;
      li.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.act;
          if (a === 'approve') return act((u) => A.setStatus(u, id, 'active'));
          if (a === 'suspend') return act((u) => A.setStatus(u, id, 'suspended'));
          if (a === 'reject') return act((u) => A.setStatus(u, id, 'rejected'));
          if (a === 'promote') return act(async (u) => {
            // Bootstrap (no Admin yet) needs the operator passcode; an Admin
            // promoting someone does not. Ask for it only when required.
            let passcode = '';
            if (A.needsBootstrapAdmin() && u.role !== 'admin') {
              passcode = window.prompt('Operator passcode (set in js/auth-config.js as bootstrapPasscodeSha256):') || '';
              if (!passcode) return { ok: false, error: 'A passcode is required to create the first Admin.' };
            }
            return A.promoteBootstrapAdmin(u, id, passcode);
          });
          if (a === 'saveRights') {
            const rights = {};
            li.querySelectorAll('[data-right]').forEach((cb) => { rights[cb.dataset.right] = cb.checked; });
            return act((u) => A.setEditRights(u, id, rights));
          }
          if (a === 'resetPw') {
            const pw = window.prompt('New password for this account (min 8 chars, a letter and a number):');
            if (pw == null) return;
            const u = me();
            if (!u || !canManage()) { flash('Only an Admin or Head can reset a password.', true); return; }
            A.resetPassword(u, id, pw).then((res) => {
              if (!res.ok) { flash(res.error, true); return; }
              flash('✅ Password reset.', false);
            });
          }
          if (a === 'issueCode') {
            const u = me();
            if (!u || !canManage()) { flash('Only an Admin or Head can issue a recovery code.', true); return; }
            A.issueRecoveryCode(u, id).then((res) => {
              if (!res.ok) { flash(res.error, true); return; }
              // Show the one-time code to the issuer so they can hand it over.
              window.alert('One-time recovery code for ' + (li.querySelector('.acct-name') ? li.querySelector('.acct-name').textContent.trim() : 'this member') + ':\n\n' + res.code + '\n\nIt expires in 30 minutes and can be used once. Give it to the member in person or by phone.');
              flash('🎟️ Recovery code issued.', false);
            });
          }
        });
      });
      const roleSel = li.querySelector('[data-act="role"]');
      if (roleSel) roleSel.addEventListener('change', () => act((u) => A.setRole(u, id, roleSel.value)));
      const memberInput = li.querySelector('[data-act="memberId"]');
      if (memberInput) memberInput.addEventListener('change', () => act((u) => A.updateAccount(u, id, { memberId: memberInput.value })));
    });
  }

  function renderAudit() {
    const ul = $('auditList');
    const empty = $('auditEmpty');
    if (!ul) return;
    const log = A.auditLog();
    if (!log.length) { ul.innerHTML = ''; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    const nameOf = (id) => {
      const a = A.getAccount(id);
      return a ? (a.name || a.username) : (id || 'system');
    };
    ul.innerHTML = log.slice(0, 100).map((e) => {
      const when = e.at ? new Date(e.at).toLocaleString() : '';
      return '<li class="audit-item">' +
        '<span class="audit-when">' + esc(when) + '</span>' +
        '<span class="audit-act">' + esc(e.action) + '</span>' +
        '<span class="audit-detail">' + esc(nameOf(e.actor)) + ' → ' + esc(nameOf(e.target)) + (e.detail ? ' · ' + esc(e.detail) : '') + '</span>' +
      '</li>';
    }).join('');
  }

  const refresh = $('auditRefresh');
  if (refresh) refresh.addEventListener('click', renderAudit);

  // Render when the admin panel opens (script.js dispatches ppadmin:open) and
  // on any auth change. Also render once on load in case the panel is already
  // unlocked from a previous session in this tab.
  document.addEventListener('ppadmin:open', render);
  document.addEventListener('ppauth:change', render);
  window.addEventListener('focus', render);
  render();
})();
