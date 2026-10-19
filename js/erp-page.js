/* ============================================================
   PAINTER PLUS — ERP PAGE (erp.html)
   ------------------------------------------------------------
   The browser half of js/erp.js. The costing, gating and report
   maths all live in PPERP and are unit-tested in Node; this file
   only reads the DOM, calls PPERP, and paints the results.

   Every lookup is guarded: this project loads page scripts
   site-wide, and one unguarded null access aborts the whole file.
   ============================================================ */
(function () {
  'use strict';

  const E = window.PPERP;
  const Team = window.PPTeam;
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const app = $('erpApp');
  if (!app || !E || !Team) return;

  const gate = $('erpGate');
  const panel = $('erpPanel');

  // ------------------------------------------------------------
  // TABS
  // ------------------------------------------------------------
  const TABS = [
    ['tabDash', 'paneDash', renderDashboard],
    ['tabProj', 'paneProj', renderProjects],
    ['tabApprove', 'paneApprove', renderApprovals],
    ['tabBill', 'paneBill', renderBilling],
    ['tabReport', 'paneReport', renderReports]
  ].map(([t, p, fn]) => ({ tab: $(t), pane: $(p), render: fn }))
   .filter((t) => t.tab && t.pane);

  function showTab(active) {
    TABS.forEach((t) => {
      const on = t === active;
      t.tab.classList.toggle('active', on);
      t.tab.setAttribute('aria-selected', on);
      t.pane.hidden = !on;
    });
    if (active && active.render) active.render();
  }
  TABS.forEach((t) => t.tab.addEventListener('click', () => showTab(t)));

  // Report sub-tabs
  const REP_TABS = [
    ['repTabDaily', 'daily'],
    ['repTabProject', 'project'],
    ['repTabPainter', 'painter']
  ].map(([id, kind]) => ({ tab: $(id), kind })).filter((t) => t.tab);
  let reportKind = 'daily';
  function showReport(kind) {
    reportKind = kind;
    REP_TABS.forEach((t) => {
      const on = t.kind === kind;
      t.tab.classList.toggle('active', on);
      t.tab.setAttribute('aria-selected', on);
    });
    renderReports();
  }
  REP_TABS.forEach((t) => t.tab.addEventListener('click', () => showReport(t.kind)));

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------
  function approvalBadge(status) {
    const label = { approved: '✅ Approved', pending: '⏳ Pending', rejected: '⛔ Rejected' }[status] || status;
    return '<span class="erp-badge erp-badge-' + escAttr(status) + '">' + esc(label) + '</span>';
  }
  function dayBadge(status) {
    return status === 'submitted'
      ? '<span class="erp-badge erp-badge-open">🟢 Submitted</span>'
      : '<span class="erp-badge erp-badge-pending">🟠 Open</span>';
  }
  function projectOptions(selectedId, includeBlank) {
    const opts = includeBlank ? ['<option value="">— no project —</option>'] : [];
    E.listProjects().forEach((p) => {
      opts.push('<option value="' + escAttr(p.id) + '"' +
        (p.id === selectedId ? ' selected' : '') + '>' + esc(p.name) + '</option>');
    });
    return opts.join('');
  }
  function projectName(id) {
    const p = E.getProject(id);
    return p ? p.name : '';
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function kpi(label, value, sub, tone) {
    return '<div class="erp-kpi' + (tone ? ' erp-kpi-' + tone : '') + '">' +
      '<span class="erp-kpi-label">' + esc(label) + '</span>' +
      '<strong class="erp-kpi-value">' + esc(value) + '</strong>' +
      (sub ? '<span class="erp-kpi-sub">' + esc(sub) + '</span>' : '') +
      '</div>';
  }

  function renderDashboard() {
    const o = E.overview();
    const k = $('erpKpis');
    if (k) {
      k.innerHTML =
        kpi('Approved & billable', E.money(o.approvedTotal), E.fmtSqft(o.approvedSqft) + ' approved', 'ok') +
        kpi('Awaiting approval', E.money(o.unbilledLabour), o.pendingDays + ' day(s) submitted', 'warn') +
        (o.rejectedSqft ? kpi('Rejected', E.money(o.rejectedLabour), E.fmtSqft(o.rejectedSqft) + ' needs rework', 'bad') : '') +
        kpi('Paint needed', E.fmtLitres(o.approvedLitres), o.approvedPaintCost ? E.money(o.approvedPaintCost) + ' material' : 'approved work') +
        kpi('Total measured', E.fmtSqft(o.sqft), o.days + ' day(s) logged') +
        kpi('Projects', String(o.projects), o.projects === 1 ? 'project' : 'projects');
    }

    const days = E.reportDaily().slice(0, 8);
    const dl = $('erpDashDays');
    if (dl) {
      if (!days.length) {
        dl.innerHTML = '<p class="erp-empty">No work logged yet. <a href="./worklog.html">Open the work log</a> to add a day.</p>';
      } else {
        dl.innerHTML = '<ul class="erp-list">' + days.map((d) =>
          '<li class="erp-row">' +
            '<div class="erp-row-main"><strong>' + esc(d.date) + '</strong>' +
              '<span class="erp-row-sub">' + esc(d.project) + (d.crew ? ' · ' + esc(d.crew) : '') + '</span></div>' +
            '<div class="erp-row-side"><span>' + esc(E.fmtSqft(d.sqft)) + '</span>' + approvalBadge(d.approval) + '</div>' +
          '</li>').join('') + '</ul>';
      }
    }

    const projects = E.reportByProject();
    const pl = $('erpDashProjects');
    if (pl) {
      if (!projects.length) {
        pl.innerHTML = '<p class="erp-empty">No projects yet. Add one in the Projects tab.</p>';
      } else {
        pl.innerHTML = '<ul class="erp-list">' + projects.map((r) =>
          '<li class="erp-row">' +
            '<div class="erp-row-main"><strong>' + esc(r.project.name) + '</strong>' +
              '<span class="erp-row-sub">' + esc(E.money(r.project.rate)) + '/sq ft · ' + r.project.coats + ' coats' +
                (r.project.paintRate ? ' · paint ' + esc(E.money(r.project.paintRate)) + '/L' : '') + '</span></div>' +
            '<div class="erp-row-side"><span>' + esc(E.money(r.approved.total)) + '</span>' +
              (r.pending.count ? '<span class="erp-row-sub">+' + esc(E.money(r.pending.total)) + ' pending</span>' : '') + '</div>' +
          '</li>').join('') + '</ul>';
      }
    }
  }

  // ============================================================
  // PROJECTS
  // ============================================================
  function renderProjects() {
    const ul = $('erpProjList');
    const empty = $('erpProjEmpty');
    if (!ul) return;
    const list = E.listProjects();
    ul.innerHTML = '';
    if (empty) empty.hidden = !!list.length;
    list.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'erp-row erp-row-project';
      li.innerHTML =
        '<div class="erp-row-main">' +
          '<strong>' + esc(p.name) + '</strong>' +
          '<span class="erp-row-sub">' + (p.client ? esc(p.client) + ' · ' : '') +
            esc(E.money(p.rate)) + '/sq ft · ' + p.coats + ' coats' +
            (p.paintRate ? ' · paint ' + esc(E.money(p.paintRate)) + '/L' : '') +
            ' · ' + esc(p.status) + '</span>' +
        '</div>' +
        '<div class="erp-row-actions">' +
          '<button type="button" class="erp-mini" data-edit="' + escAttr(p.id) + '">✏️ Edit</button>' +
          '<button type="button" class="erp-mini erp-danger" data-del="' + escAttr(p.id) + '">🗑 Delete</button>' +
        '</div>';
      ul.appendChild(li);
    });
  }

  function readProjectForm() {
    return {
      id: ($('erpProjId') || {}).value || '',
      name: ($('erpProjName') || {}).value || '',
      client: ($('erpProjClient') || {}).value || '',
      phone: ($('erpProjPhone') || {}).value || '',
      address: ($('erpProjAddress') || {}).value || '',
      rate: ($('erpProjRate') || {}).value || 0,
      coats: ($('erpProjCoats') || {}).value || 2,
      coverage: ($('erpProjCoverage') || {}).value || 130,
      paintRate: ($('erpProjPaintRate') || {}).value || 0,
      status: ($('erpProjStatus') || {}).value || 'active',
      note: ($('erpProjNote') || {}).value || ''
    };
  }

  function fillProjectForm(p) {
    const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? '' : v; };
    set('erpProjId', p ? p.id : '');
    set('erpProjName', p ? p.name : '');
    set('erpProjClient', p ? p.client : '');
    set('erpProjPhone', p ? p.phone : '');
    set('erpProjAddress', p ? p.address : '');
    set('erpProjRate', p ? (p.rate || '') : '');
    set('erpProjCoats', p ? (p.coats || 2) : 2);
    set('erpProjCoverage', p ? (p.coverage || 130) : 130);
    set('erpProjPaintRate', p ? (p.paintRate || '') : '');
    set('erpProjStatus', p ? p.status : 'active');
    set('erpProjNote', p ? p.note : '');
    const t = $('erpProjFormTitle');
    if (t) t.textContent = p ? '✏️ Edit project' : '➕ Add a project';
  }

  const projForm = $('erpProjForm');
  if (projForm) projForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = E.saveProject(readProjectForm());
    if (!res.ok) { alert(res.error); return; }
    fillProjectForm(null);
    renderProjects();
    refreshProjectSelects();
    renderDashboard();
  });
  const projReset = $('erpProjReset');
  if (projReset) projReset.addEventListener('click', () => fillProjectForm(null));

  const projList = $('erpProjList');
  if (projList) projList.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) {
      const p = E.getProject(edit.getAttribute('data-edit'));
      if (p) fillProjectForm(p);
    } else if (del) {
      const id = del.getAttribute('data-del');
      const p = E.getProject(id);
      if (p && confirm('Delete "' + p.name + '" and its invoices? This cannot be undone.')) {
        E.removeProject(id);
        renderProjects();
        refreshProjectSelects();
        renderDashboard();
      }
    }
  });

  // ============================================================
  // APPROVALS
  // ============================================================
  function renderApprovals() {
    const wl = E.readWorkLog();
    const data = E.read();
    const waiting = [], decided = [];
    Object.keys(wl).sort().reverse().forEach((date) => {
      const day = wl[date];
      const a = E.approvalOf(date, data);
      const proj = day.projectId ? E.getProject(day.projectId) : null;
      const name = proj ? proj.name : (day.project || '—');
      const c = E.dayCosting(day, proj);
      const row = { date: date, day: day, approval: a, project: name, costing: c };
      // Only submitted days are decidable.
      if (a.status === 'pending') { if (E.canApprove(day)) waiting.push(row); }
      else decided.push(row);
    });

    const ul = $('erpApprList');
    const empty = $('erpApprEmpty');
    if (ul) {
      ul.innerHTML = waiting.map((r) =>
        '<li class="erp-row">' +
          '<div class="erp-row-main"><strong>' + esc(r.date) + ' · ' + esc(r.project) + '</strong>' +
            '<span class="erp-row-sub">' + esc(E.fmtSqft(r.costing.sqft)) + ' · ' +
            esc(E.money(r.costing.labour)) + (r.day.crew ? ' · ' + esc(r.day.crew) : '') + '</span></div>' +
          '<div class="erp-row-actions">' +
            '<button type="button" class="erp-mini erp-ok" data-approve="' + escAttr(r.date) + '">✅ Approve</button>' +
            '<button type="button" class="erp-mini erp-danger" data-reject="' + escAttr(r.date) + '">⛔ Reject</button>' +
          '</div>' +
        '</li>').join('');
      if (empty) empty.hidden = waiting.length > 0;
    }

    const dul = $('erpApprDoneList');
    const dempty = $('erpApprDoneEmpty');
    if (dul) {
      dul.innerHTML = decided.map((r) =>
        '<li class="erp-row">' +
          '<div class="erp-row-main"><strong>' + esc(r.date) + ' · ' + esc(r.project) + '</strong>' +
            '<span class="erp-row-sub">' + esc(E.fmtSqft(r.costing.sqft)) + ' · ' +
            esc(E.money(r.costing.labour)) + (r.approval.by ? ' · by ' + esc(r.approval.by) : '') + '</span></div>' +
          '<div class="erp-row-side">' + approvalBadge(r.approval.status) +
            '<button type="button" class="erp-mini" data-reopen="' + escAttr(r.date) + '">↩ Undo</button>' +
          '</div>' +
        '</li>').join('');
      if (dempty) dempty.hidden = decided.length > 0;
    }
  }

  function actingName() {
    const head = Team.head();
    return (head && head.name) || 'Owner/Head';
  }

  const apprList = $('erpApprList');
  if (apprList) apprList.addEventListener('click', (e) => {
    const ap = e.target.closest('[data-approve]');
    const rj = e.target.closest('[data-reject]');
    if (ap) {
      const r = E.approveDay(ap.getAttribute('data-approve'), actingName());
      if (!r.ok) alert(r.error);
      renderApprovals(); renderDashboard();
    } else if (rj) {
      const note = prompt('Reason for rejecting this day (optional):') || '';
      const r = E.rejectDay(rj.getAttribute('data-reject'), actingName(), note);
      if (!r.ok) alert(r.error);
      renderApprovals(); renderDashboard();
    }
  });

  const apprDone = $('erpApprDoneList');
  if (apprDone) apprDone.addEventListener('click', (e) => {
    const un = e.target.closest('[data-reopen]');
    if (!un) return;
    const date = un.getAttribute('data-reopen');
    const data = E.read();
    delete data.approvals[date];
    E.write(data);
    renderApprovals(); renderDashboard();
  });

  // ============================================================
  // BILLING
  // ============================================================
  function refreshProjectSelects() {
    const sel = $('erpBillProject');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = projectOptions(keep);
    if (!sel.value && E.listProjects().length) sel.value = E.listProjects()[0].id;
  }

  function renderBilling() {
    const sel = $('erpBillProject');
    const out = $('erpBillOut');
    if (!sel || !out) return;
    const id = sel.value;
    if (!id) {
      out.innerHTML = '<p class="erp-empty">Add a project first, then come back to raise a bill.</p>';
      return;
    }
    const b = E.billFor(id);
    if (!b.ok) { out.innerHTML = '<p class="erp-empty">' + esc(b.error) + '</p>'; return; }

    const lines = b.lines.length
      ? '<table class="erp-table"><thead><tr><th>Date</th><th>Crew</th><th>Area</th><th>Rate</th><th>Labour</th><th>Paint</th></tr></thead><tbody>' +
        b.lines.map((r) =>
          '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.crew || '—') + '</td>' +
          '<td>' + esc(E.fmtSqft(r.costing.sqft)) + '</td>' +
          '<td>' + esc(E.money(r.costing.rate)) + '</td>' +
          '<td>' + esc(E.money(r.costing.labour)) + '</td>' +
          '<td>' + esc(E.fmtLitres(r.costing.litres)) +
            (r.costing.paintCost ? ' · ' + esc(E.money(r.costing.paintCost)) : '') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="erp-empty">No approved work yet — approve a submitted day in the Approvals tab and it will appear here.</p>';

    const pendingNote = b.pending.count
      ? '<div class="erp-callout erp-callout-warn"><strong>' + b.pending.count + ' day(s) awaiting approval</strong> — ' +
        esc(E.fmtSqft(b.pending.sqft)) + ', ' + esc(E.money(b.pending.labour)) +
        '. <em>Not included in the bill total.</em></div>'
      : '';

    const rejectedNote = b.rejected.count
      ? '<div class="erp-callout erp-callout-bad">' + b.rejected.count + ' day(s) rejected — ' +
        esc(E.fmtSqft(b.rejected.sqft)) + '. Not billed.</div>'
      : '';

    const bills = b.bills.length
      ? '<ul class="erp-list">' + b.bills.map((x) =>
          '<li class="erp-row"><div class="erp-row-main"><strong>' + esc(x.no) + '</strong>' +
            '<span class="erp-row-sub">' + esc(x.date) +
              (x.sqft ? ' · ' + esc(E.fmtSqft(x.sqft)) : '') +
              (x.litres ? ' · ' + esc(E.fmtLitres(x.litres)) + ' paint' : '') +
              (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' +
            '<div class="erp-row-side"><span>' + esc(E.money(x.amount)) + '</span>' +
            '<button type="button" class="erp-mini erp-danger" data-delbill="' + escAttr(x.id) + '">🗑</button></div></li>').join('') +
          '</ul>'
      : '<p class="erp-empty">No invoices raised for this project yet.</p>';

    out.innerHTML =
      '<div class="erp-bill-head">' +
        '<h3>' + esc(b.project.name) + '</h3>' +
        (b.project.client ? '<p class="erp-row-sub">Client: ' + esc(b.project.client) + '</p>' : '') +
      '</div>' +
      lines +
      '<div class="erp-bill-total">' +
        '<div><span>Approved area</span><strong>' + esc(E.fmtSqft(b.totals.sqft)) + '</strong></div>' +
        '<div><span>Labour rate</span><strong>' + esc(E.money(b.project.rate)) + ' / sq ft</strong></div>' +
        '<div><span>Labour total</span><strong>' + esc(E.money(b.totals.labour)) + '</strong></div>' +
        '<div><span>Paint needed</span><strong>' + esc(E.fmtLitres(b.totals.litres)) + '</strong></div>' +
        (b.totals.paintCost ? '<div><span>Paint cost</span><strong>' + esc(E.money(b.totals.paintCost)) + '</strong></div>' : '') +
        '<div class="erp-grand"><span>' + (b.totals.paintCost ? 'Grand total' : 'Total due') + '</span><strong>' + esc(E.money(b.totals.total)) + '</strong></div>' +
      '</div>' +
      pendingNote + rejectedNote +
      '<div class="erp-actions">' +
        '<button class="btn-primary" id="erpRaiseBill" type="button">🧾 Record this bill</button>' +
        '<button class="btn-secondary" id="erpCopyInvoice" type="button">📋 Copy invoice</button>' +
      '</div>' +
      '<h4 class="erp-h4">Invoices raised</h4>' + bills;

    const raise = $('erpRaiseBill');
    if (raise) raise.addEventListener('click', () => {
      if (!b.totals.total) { alert('Nothing approved to bill yet.'); return; }
      E.addBill(id, {
        amount: b.totals.total,
        sqft: b.totals.sqft,
        litres: b.totals.litres,
        labour: b.totals.labour,
        paintCost: b.totals.paintCost,
        note: b.totals.paintCost ? 'Approved work + paint' : 'Approved work'
      });
      renderBilling();
    });
    const copy = $('erpCopyInvoice');
    if (copy) copy.addEventListener('click', () => {
      const txt = E.invoiceText(id);
      copyText(txt, copy);
    });
  }

  function copyText(txt, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = '✅ Copied';
      setTimeout(() => { btn.textContent = old; }, 1400);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done).catch(() => fallback(txt, done));
        return;
      }
    } catch (e) { /* fall through */ }
    fallback(txt, done);
  }
  function fallback(txt, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { alert(txt); }
  }

  const billSel = $('erpBillProject');
  if (billSel) billSel.addEventListener('change', renderBilling);
  const billOut = $('erpBillOut');
  if (billOut) billOut.addEventListener('click', (e) => {
    const d = e.target.closest('[data-delbill]');
    if (!d) return;
    E.removeBill(billSel.value, d.getAttribute('data-delbill'));
    renderBilling();
  });

  // ============================================================
  // REPORTS
  // ============================================================
  function renderReports() {
    const out = $('erpReportOut');
    if (!out) return;
    if (reportKind === 'project') {
      const rows = E.reportByProject();
      out.innerHTML = rows.length
        ? '<table class="erp-table"><thead><tr><th>Project</th><th>Rate</th><th>Approved</th><th>Pending</th><th>Paint</th><th>Approved total</th></tr></thead><tbody>' +
          rows.map((r) =>
            '<tr><td>' + esc(r.project.name) + '</td><td>' + esc(E.money(r.project.rate)) + '</td>' +
            '<td>' + esc(E.fmtSqft(r.approved.sqft)) + '</td>' +
            '<td>' + esc(E.fmtSqft(r.pending.sqft)) + '</td>' +
            '<td>' + esc(E.fmtLitres(r.approved.litres)) + '</td>' +
            '<td><strong>' + esc(E.money(r.approved.total)) + '</strong>' +
              (r.approved.paintCost ? '<span class="erp-row-sub"> ' + esc(E.money(r.approved.labour)) + ' + ' + esc(E.money(r.approved.paintCost)) + ' paint</span>' : '') +
            '</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="erp-empty">No projects yet.</p>';
    } else if (reportKind === 'painter') {
      const rows = E.reportByPainter();
      out.innerHTML = rows.length
        ? '<table class="erp-table"><thead><tr><th>Painter</th><th>Days</th><th>Measured</th><th>Approved</th><th>Paint</th><th>Approved labour</th></tr></thead><tbody>' +
          rows.map((r) =>
            '<tr><td>' + esc(r.crew) + '</td><td>' + r.days + '</td>' +
            '<td>' + esc(E.fmtSqft(r.sqft)) + '</td>' +
            '<td>' + esc(E.fmtSqft(r.approvedSqft)) + '</td>' +
            '<td>' + esc(E.fmtLitres(r.approvedLitres)) + '</td>' +
            '<td><strong>' + esc(E.money(r.approvedLabour)) + '</strong></td></tr>').join('') +
          '</tbody></table>'
        : '<p class="erp-empty">No work logged yet.</p>';
    } else {
      const rows = E.reportDaily();
      out.innerHTML = rows.length
        ? '<table class="erp-table"><thead><tr><th>Date</th><th>Project</th><th>Crew</th><th>Area</th><th>Labour</th><th>Paint</th><th>Status</th></tr></thead><tbody>' +
          rows.map((r) =>
            '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.project) + '</td><td>' + esc(r.crew || '—') + '</td>' +
            '<td>' + esc(E.fmtSqft(r.sqft)) + '</td><td>' + esc(E.money(r.labour)) + '</td>' +
            '<td>' + esc(E.fmtLitres(r.litres)) + '</td>' +
            '<td>' + dayBadge(r.status) + ' ' + approvalBadge(r.approval) + '</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="erp-empty">No days logged yet.</p>';
    }
  }

  // ============================================================
  // GATE + BOOT
  // ============================================================
  function openPanel() {
    if (gate) gate.hidden = true;
    if (panel) panel.hidden = false;
    refreshProjectSelects();
    showTab(TABS[0]);
  }

  const unlockBtn = $('erpUnlock');
  const passInput = $('erpPass');
  const gateErr = $('erpGateErr');
  function tryUnlock() {
    if (Team.unlockHead(passInput ? passInput.value : '')) {
      openPanel();
    } else if (gateErr) {
      gateErr.hidden = false;
      if (passInput) passInput.value = '';
    }
  }
  if (unlockBtn) unlockBtn.addEventListener('click', tryUnlock);
  if (passInput) passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
  });

  if (Team.isActingHead()) openPanel();
})();
