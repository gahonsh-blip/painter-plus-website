/* ============================================================
   VISITOR EXPOSURE PROBE
   ------------------------------------------------------------
   Run as an EXTERNAL script (defer) appended to a page. It answers
   one question: as a COLD, ANONYMOUS visitor with no passcode, can
   this page show or let me use anything that is meant for staff?

   It writes a <pre id="visitor-probe"> with ok/FAIL lines and sets
   window.__visitorProbe. A FAIL means a visitor can see or reach a
   staff-only control.
   ============================================================ */
(function () {
  'use strict';
  const T = (id) => document.getElementById(id);
  const vis = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden &&
           (r.width > 0 || r.height > 0);
  };
  const lines = [];
  const bad = [];
  const ok = (m) => lines.push('ok   ' + m);
  const fail = (m) => { lines.push('FAIL ' + m); bad.push(m); };
  const page = (location.pathname.split('/').pop() || '').replace(/^_vex-/, '');

  const STAFF_PAGES = ['admin.html', 'worklog.html', 'erp.html'];
  const isStaffPage = STAFF_PAGES.includes(page);

  // ---- staff PANELS must never be visible without a passcode ----
  for (const sel of ['#wlPanel', '#erpPanel', '#admPanel']) {
    const el = document.querySelector(sel);
    if (el && vis(el)) fail(page + ': staff panel visible to a visitor -> ' + sel);
  }

  // ---- profile edit form + role controls ----
  const editBody = T('ppEditBody');
  if (editBody) {
    if (vis(editBody)) fail('profile: edit form visible to a signed-out visitor');
    else ok('profile: edit form hidden from a signed-out visitor');
    const live = [...editBody.querySelectorAll('input,textarea,select,button')].filter(vis);
    if (live.length) fail('profile: ' + live.length + ' editable field(s) reachable');
    else ok('profile: zero editable fields reachable');
  }
  const roleSec = T('ppRoleSection');
  if (roleSec) {
    if (vis(roleSec)) fail('profile: role controls visible to a visitor');
    else ok('profile: role controls hidden');
  }

  // ---- the passcode must not be printed anywhere ----
  if (/painter123/.test(document.documentElement.outerHTML)) fail(page + ': passcode printed in the page');
  else ok(page + ': no passcode in the page');

  // ---- a wrong passcode must reveal nothing ----
  const claimForm = T('ppClaimForm');
  if (claimForm && vis(claimForm) && T('ppClaimPass')) {
    T('ppClaimPass').value = 'wrong-' + Math.random();
    claimForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const body = T('ppEditBody');
    if (body && vis(body)) fail('profile: a WRONG passcode revealed the edit form');
    else ok('profile: a wrong passcode reveals nothing');
  }
  for (const gate of ['admGate', 'wlGate', 'erpGate']) {
    const form = T(gate);
    if (!form) continue;
    const pw = form.querySelector('input[type=password]');
    if (!pw) continue;
    pw.value = 'wrong-' + Math.random();
    const b = form.querySelector('button[type=submit], button');
    if (b) b.click();
    const panels = ['admPanel', 'wlPanel', 'erpPanel'].map(T).filter(Boolean);
    if (panels.some(vis)) fail(page + ': a WRONG passcode opened a staff panel');
    else ok(page + ': a wrong passcode opens no staff panel');
  }

  // ---- file uploads must never be reachable ----
  for (const inp of document.querySelectorAll('input[type=file]')) {
    if (vis(inp)) fail(page + ': file upload reachable by a visitor -> #' + inp.id);
  }

  // ---- a public page must not link to a staff tool ----
  if (!isStaffPage) {
    const links = [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => /admin\.html|worklog\.html|erp\.html/.test(h));
    if (links.length) fail(page + ': links to a staff tool -> ' + links.join(', '));
    else ok(page + ': no link to a staff tool');
  } else {
    // Staff pages are noindex and unlinked; being reachable by URL is expected.
    ok(page + ': staff page (noindex, reachable only by direct URL)');
  }

  // ---- a cold visit must not carry a staff session ----
  let flags = [];
  try { if (sessionStorage.getItem('ppAdminUnlocked')) flags.push('ppAdminUnlocked'); } catch (e) {}
  try { if (sessionStorage.getItem('ppClaimedMember')) flags.push('ppClaimedMember'); } catch (e) {}
  if (flags.length) fail(page + ': staff session present on a cold visit -> ' + flags.join(', '));
  else ok(page + ': no staff session on a cold visit');

  const out = document.createElement('pre');
  out.id = 'visitor-probe';
  out.style.cssText = 'white-space:pre-wrap;background:#111;color:#0f0;padding:12px;font:12px monospace;margin:12px';
  out.textContent = 'VISITOR PROBE (' + page + ')\n' + lines.join('\n') +
    '\n\n' + (bad.length ? bad.length + ' EXPOSURE(S)' : 'CLEAN');
  document.body.appendChild(out);
  window.__visitorProbe = { page, bad, lines };
})();
