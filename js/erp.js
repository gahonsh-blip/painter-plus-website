/* ============================================================
   PAINTER PLUS — ERP CORE (projects → approvals → billing → reports)
   ------------------------------------------------------------
   The work log (js/worklog.js) records what the crew measured each
   day. This module is the layer above it that turns those
   measurements into money and paperwork.

   The chain is deliberately gated:

       Work log day  →  Final submit  →  Owner/Head approval  →  Bill
                                        (pending)   (approved)     ↑
                                                                    |
                        only approved days reach the bill ----------+

   The single most important rule in this file: a measurement that
   has not been APPROVED never adds a rupee to a bill total. Pending
   work is shown next to the bill so it is visible, but kept in its
   own bucket (`billFor()` returns `lines` = billable and
   `pendingLines` / `rejectedLines` = not billable; only `lines`
   feeds `totals`).

   Data shape (key: painterPlusERP)
     {
       projects: [ { id, name, client, phone, address, rate,
                     coverage, coats, paintRate, startDate, status, note } ],
       approvals: { "2026-10-18": { status: "approved" | "rejected",
                                    by, at, note, sig } },
       bills: { "<projectId>": [ { id, no, date, note, amount,
                                   sqft, litres, paintCost, labour,
                                   createdAt } ] }
     }

   Each project also carries `paintRate` (₹ per litre), so a day's measured
   area yields a paint quantity (litres, via PPMeasure.paintLitres) and a
   material cost — and the two together give a grand total, not just labour.

   Everything is pure except the small storage helpers, so the
   costing and gating can be unit-tested in Node.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPERP = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const STORE_KEY = 'painterPlusERP';
  const WORKLOG_KEY = 'painterPlusWorkLog';

  const PROJECT_STATUS = ['active', 'closed'];
  const APPROVAL_STATUS = ['pending', 'approved', 'rejected'];

  // Rates are per project. These defaults match js/worklog.js.
  const DEFAULTS = { rate: 0, coverage: 130, coats: 2, paintRate: 0 };

  // ============================================================
  // NUMERIC HELPERS (pure)
  // ============================================================
  function num(n) {
    const v = parseFloat(n);
    return isFinite(v) && v > 0 ? v : 0;
  }

  function money(n) {
    const v = Math.round((parseFloat(n) || 0) * 100) / 100;
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function fmtSqft(n) {
    const v = Math.round((parseFloat(n) || 0) * 10) / 10;
    return v.toLocaleString('en-IN') + ' sq ft';
  }

  function fmtLitres(n) {
    const v = Math.round((parseFloat(n) || 0) * 10) / 10;
    return v.toLocaleString('en-IN') + ' L';
  }

  // ============================================================
  // STORAGE
  // ------------------------------------------------------------
  // A tiny localStorage wrapper that can be swapped for an in-memory
  // object in tests. Every read is defensive: a static site with no
  // backend has to survive a browser that blocks storage entirely.
  // ============================================================
  let memStore = null;

  function backing() {
    if (memStore) return memStore;
    try { if (root && root.localStorage) return root.localStorage; } catch (e) { /* blocked */ }
    return null;
  }

  function rawGet(key) {
    const s = backing();
    if (!s) return null;
    try { return s.getItem(key); } catch (e) { return null; }
  }

  function rawSet(key, val) {
    const s = backing();
    if (!s) return false;
    try { s.setItem(key, val); return true; } catch (e) { return false; }
  }

  function _setStore(obj) { memStore = obj || null; }

  function read() {
    let data = null;
    try { data = JSON.parse(rawGet(STORE_KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') data = {};
    if (!Array.isArray(data.projects)) data.projects = [];
    if (!data.approvals || typeof data.approvals !== 'object') data.approvals = {};
    if (!data.bills || typeof data.bills !== 'object') data.bills = {};
    return data;
  }

  function write(data) {
    return rawSet(STORE_KEY, JSON.stringify(data));
  }

  // Work-log days, read through the same storage so ERP and the work log
  // can never disagree about what was measured.
  function readWorkLog() {
    let data = null;
    try { data = JSON.parse(rawGet(WORKLOG_KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') return {};
    return data;
  }

  // A day's own costing, computed here rather than trusting a stored
  // total, so a bill always reflects the entries actually saved.
  function dayTotals(day) {
    const entries = (day && day.entries) || [];
    let sqft = 0;
    entries.forEach((e) => {
      const s = num(e.sqft) || (num(e.w) * num(e.h));
      sqft += s;
    });
    return { count: entries.length, sqft: sqft };
  }

  function dayCosting(day, project) {
    const t = dayTotals(day);
    // A project's rate overrides the day's own, but a project left at ₹0 is
    // "not set yet", not "free" — falling back to the day's rate keeps the
    // labour the crew already entered from being silently zeroed.
    const rate = (project && num(project.rate)) || num(day && day.rate);
    const coverage = (project && num(project.coverage)) || num(day && day.coverage) || DEFAULTS.coverage;
    const coats = (project && num(project.coats)) || num(day && day.coats) || DEFAULTS.coats;
    const paintRate = (project && num(project.paintRate)) || num(day && day.paintRate) || 0;
    const litres = paintLitres(t.sqft, { coats: coats, coverage: coverage });
    const paintCost = litres * paintRate;
    return {
      sqft: t.sqft, count: t.count,
      rate: rate, coverage: coverage, coats: coats,
      labour: t.sqft * rate,
      litres: litres,
      paintRate: paintRate,
      paintCost: paintCost,
      total: t.sqft * rate + paintCost
    };
  }

  // Litres of paint for an area, including wastage. Delegates to PPMeasure
  // when present so the ERP and the work log can never quote different
  // quantities for the same day (PPMeasure.paintLitres is the single source
  // of the coverage/wastage maths); falls back to the same formula in Node.
  function paintLitres(sqft, opts) {
    const o = opts || {};
    const M = root && root.PPMeasure;
    if (M && typeof M.paintLitres === 'function') return M.paintLitres(sqft, o);
    const area = num(sqft);
    const coats = num(o.coats) || DEFAULTS.coats;
    const coverage = num(o.coverage) || DEFAULTS.coverage;
    const wastage = o.wastage === undefined ? 0.1 : num(o.wastage);
    if (!area) return 0;
    return (area * coats / coverage) * (1 + wastage);
  }

  // ============================================================
  // PROJECTS (pure over a data object)
  // ============================================================
  function blankProject() {
    return {
      id: '', name: '', client: '', phone: '', address: '',
      rate: DEFAULTS.rate, coverage: DEFAULTS.coverage, coats: DEFAULTS.coats,
      paintRate: DEFAULTS.paintRate,
      startDate: '', status: 'active', note: ''
    };
  }

  function normaliseProject(p) {
    const b = blankProject();
    const out = Object.assign(b, p || {});
    out.id = String(out.id || '').trim();
    out.name = String(out.name || '').trim();
    out.client = String(out.client || '').trim();
    out.phone = String(out.phone || '').trim();
    out.address = String(out.address || '').trim();
    out.note = String(out.note || '').trim();
    out.startDate = String(out.startDate || '').trim();
    out.rate = num(out.rate);
    out.coverage = num(out.coverage) || DEFAULTS.coverage;
    out.coats = num(out.coats) || DEFAULTS.coats;
    out.paintRate = num(out.paintRate);
    out.status = PROJECT_STATUS.indexOf(out.status) >= 0 ? out.status : 'active';
    return out;
  }

  function slugId(name) {
    const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (base || 'project') + '-' + Date.now().toString(36);
  }

  function listProjects(data) {
    const d = data || read();
    return d.projects.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function getProject(id, data) {
    const d = data || read();
    return d.projects.find((p) => p.id === id) || null;
  }

  function saveProject(project, data) {
    const d = data || read();
    const p = normaliseProject(project);
    if (!p.name) return { ok: false, error: 'Enter a project name.' };
    if (!p.id) p.id = slugId(p.name);
    const idx = d.projects.findIndex((x) => x.id === p.id);
    if (idx >= 0) d.projects[idx] = p; else d.projects.push(p);
    if (data === undefined) write(d);
    return { ok: true, project: p, data: d };
  }

  function removeProject(id, data) {
    const d = data || read();
    d.projects = d.projects.filter((p) => p.id !== id);
    if (d.bills) delete d.bills[id];
    if (data === undefined) write(d);
    return { ok: true, data: d };
  }

  // ============================================================
  // WORK LOG ↔ PROJECT LINKING
  // ------------------------------------------------------------
  // Newer days carry `projectId`. Older days only have the free-text
  // `project` name, so a day also matches by name — otherwise the
  // measurements taken before projects existed would be invisible.
  // ============================================================
  function dayMatchesProject(day, project) {
    if (!day || !project) return false;
    if (day.projectId && day.projectId === project.id) return true;
    const a = String(day.project || '').trim().toLowerCase();
    const b = String(project.name || '').trim().toLowerCase();
    return !!a && a === b;
  }

  function daysForProject(project, worklog) {
    const wl = worklog || readWorkLog();
    const out = [];
    Object.keys(wl).forEach((date) => {
      const day = wl[date];
      if (dayMatchesProject(day, project)) out.push(day);
    });
    return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  // ============================================================
  // APPROVALS
  // ------------------------------------------------------------
  // A day can only be approved once it has been final-submitted — an
  // open day is still being edited, so its numbers are not final.
  // ============================================================
  function approvalOf(date, data) {
    const d = data || read();
    const a = d.approvals[date];
    if (!a || APPROVAL_STATUS.indexOf(a.status) < 0) return { status: 'pending', by: '', at: '', note: '' };
    // An approval records the measurements it signed off. If the day was later
    // reopened and edited, the fingerprint no longer matches and the sign-off
    // is treated as withdrawn — the work must be reviewed again before it can
    // reach a bill. (Approvals written before signatures existed have no `sig`;
    // they are honoured as-is so old data keeps working.)
    if (a.sig) {
      const day = readWorkLog()[date];
      if (!canApprove(day) || daySignature(day) !== a.sig) {
        return { status: 'pending', by: '', at: '', note: '', stale: true };
      }
    }
    return a;
  }

  function canApprove(day) {
    return !!(day && day.status === 'submitted');
  }

  function setApproval(date, status, by, note, data) {
    const d = data || read();
    if (APPROVAL_STATUS.indexOf(status) < 0) return { ok: false, error: 'Unknown approval status.' };
    const day = readWorkLog()[date];
    if (!canApprove(day)) {
      return { ok: false, error: 'Submit the day first — an open day is still being edited.' };
    }
    d.approvals[date] = {
      status: status,
      by: by || '',
      at: new Date().toISOString(),
      note: note || '',
      // The exact measurements this sign-off covers. A day that is reopened
      // and changed no longer matches, so the approval stops counting (see
      // approvalOf) until it is reviewed again. Without this, an approved day
      // could be edited after approval and the OLD sign-off would still bill
      // the NEW amount.
      sig: daySignature(day)
    };
    if (data === undefined) write(d);
    return { ok: true, approval: d.approvals[date], data: d };
  }

  // A fingerprint of everything that affects a day's cost. Compared at read
  // time so an edited-after-approval day reverts to pending automatically.
  function daySignature(day) {
    const t = dayTotals(day);
    const parts = [t.sqft, t.count, num(day && day.rate), num(day && day.coverage), num(day && day.coats), num(day && day.paintRate)];
    parts.push((day && day.projectId) || '');
    (day && day.entries || []).forEach((e) => parts.push(e.id || '', num(e.sqft), num(e.w), num(e.h)));
    return parts.join('|');
  }

  function approveDay(date, by, data) { return setApproval(date, 'approved', by, '', data); }
  function rejectDay(date, by, note, data) { return setApproval(date, 'rejected', by, note, data); }

  // Withdraw a decision outright. Called when a day is reopened: its numbers
  // are about to change, so the old sign-off must not linger in storage.
  function clearApproval(date, data) {
    const d = data || read();
    if (d.approvals[date]) delete d.approvals[date];
    if (data === undefined) write(d);
    return { ok: true, data: d };
  }

  // ============================================================
  // BILLING
  // ------------------------------------------------------------
  // Two clearly separated buckets. `approved` is money owed;
  // `pending` is work done but not yet signed off. Only `approved`
  // is ever added into a bill total.
  // ============================================================
  function bucketDays(project, data, worklog) {
    const d = data || read();
    const days = daysForProject(project, worklog);
    const approved = [], pending = [], rejected = [];
    days.forEach((day) => {
      const a = approvalOf(day.date, d);
      const row = {
        date: day.date,
        crew: day.crew || '',
        status: day.status,
        approval: a.status,
        approvedBy: a.by || '',
        costing: dayCosting(day, project)
      };
      if (a.status === 'approved' && day.status === 'submitted') approved.push(row);
      else if (a.status === 'rejected') rejected.push(row);
      else pending.push(row);
    });
    return { approved: approved, pending: pending, rejected: rejected, all: days };
  }

  function sumRows(rows) {
    const out = { count: rows.length, sqft: 0, labour: 0, litres: 0, paintCost: 0, total: 0 };
    rows.forEach((r) => {
      out.sqft += r.costing.sqft;
      out.labour += r.costing.labour;
      out.litres += r.costing.litres;
      out.paintCost += r.costing.paintCost;
      out.total += r.costing.total;
    });
    return out;
  }

  // The bill: APPROVED work only. `draft` carries everything not yet
  // approved so the page can show it without it reaching the total.
  function billFor(projectId, data, worklog) {
    const d = data || read();
    const project = getProject(projectId, d);
    if (!project) return { ok: false, error: 'Project not found.' };
    const b = bucketDays(project, d, worklog);
    const approved = sumRows(b.approved);
    const pending = sumRows(b.pending);
    const rejected = sumRows(b.rejected);
    return {
      ok: true,
      project: project,
      lines: b.approved,
      pendingLines: b.pending,
      rejectedLines: b.rejected,
      totals: approved,
      pending: pending,
      rejected: rejected,
      // Explicit so no caller can accidentally bill unapproved work.
      billableSqft: approved.sqft,
      billableLabour: approved.labour,
      billableLitres: approved.litres,
      billablePaintCost: approved.paintCost,
      billableTotal: approved.total,
      bills: (d.bills[projectId] || []).slice()
    };
  }

  // Alias kept for readability at call sites that only want the number.
  function billTotal(projectId, data, worklog) {
    const b = billFor(projectId, data, worklog);
    return b.ok ? b.totals.labour : 0;
  }

  function addBill(projectId, entry, data) {
    const d = data || read();
    if (!d.bills[projectId]) d.bills[projectId] = [];
    const list = d.bills[projectId];
    const e = {
      // Two bills raised in the same millisecond must not share an id, or
      // deleting one would delete both (removeBill filters by id).
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: (entry && entry.no) || nextBillNo(list),
      date: (entry && entry.date) || new Date().toISOString().slice(0, 10),
      note: (entry && entry.note) || '',
      amount: (entry && entry.amount) || 0,
      sqft: (entry && entry.sqft) || 0,
      litres: (entry && entry.litres) || 0,
      paintCost: (entry && entry.paintCost) || 0,
      labour: (entry && entry.labour) || 0,
      createdAt: new Date().toISOString()
    };
    list.push(e);
    if (data === undefined) write(d);
    return { ok: true, bill: e, data: d };
  }

  // The next invoice number, derived from the highest number already used
  // rather than the list length — deleting a bill must not free its number
  // for reuse, or two invoices would end up sharing a number.
  function nextBillNo(list) {
    let max = 0;
    (list || []).forEach((b) => {
      const m = /^PP-(\d+)$/.exec(String(b && b.no || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'PP-' + String(max + 1).padStart(3, '0');
  }

  function removeBill(projectId, billId, data) {
    const d = data || read();
    if (d.bills[projectId]) d.bills[projectId] = d.bills[projectId].filter((b) => b.id !== billId);
    if (data === undefined) write(d);
    return { ok: true, data: d };
  }

  // A copyable invoice for a project, built from approved work only.
  function invoiceText(projectId, data, worklog) {
    const b = billFor(projectId, data, worklog);
    if (!b.ok) return '';
    const p = b.project;
    const lines = [];
    lines.push('PAINTER PLUS — INVOICE');
    lines.push('Project: ' + p.name);
    if (p.client) lines.push('Client: ' + p.client);
    if (p.address) lines.push('Site: ' + p.address);
    lines.push('');
    if (!b.lines.length) {
      lines.push('No approved measurements yet — nothing to bill.');
    } else {
      lines.push('Approved work:');
      b.lines.forEach((r) => {
        lines.push('  ' + r.date + '  ' + fmtSqft(r.costing.sqft) +
          '  × ' + money(r.costing.rate) + '/sq ft  = ' + money(r.costing.labour) +
          (r.crew ? '  (' + r.crew + ')' : ''));
      });
    }
    lines.push('');
    lines.push('Total area:   ' + fmtSqft(b.totals.sqft));
    lines.push('Labour rate:  ' + money(b.project.rate) + ' per sq ft');
    lines.push('Labour total: ' + money(b.totals.labour));
    lines.push('Paint needed: ' + fmtLitres(b.totals.litres) + ' (' + b.project.coats + ' coats)');
    if (b.totals.paintCost) {
      lines.push('Paint cost:   ' + fmtLitres(b.totals.litres) + ' × ' +
        money(b.project.paintRate) + '/L = ' + money(b.totals.paintCost));
    }
    lines.push('GRAND TOTAL:  ' + money(b.totals.total));
    if (b.pending.count) {
      lines.push('');
      lines.push('NOT INCLUDED (awaiting approval): ' +
        b.pending.count + ' day(s), ' + fmtSqft(b.pending.sqft) +
        ', ' + money(b.pending.labour));
    }
    return lines.join('\n');
  }

  // ============================================================
  // REPORTS
  // ============================================================
  // Daily: one row per day, with approval state.
  function reportDaily(data, worklog) {
    const d = data || read();
    const wl = worklog || readWorkLog();
    return Object.keys(wl).sort().reverse().map((date) => {
      const day = wl[date];
      const project = day.projectId ? getProject(day.projectId, d) : null;
      const byName = project || d.projects.find((p) => dayMatchesProject(day, p)) || null;
      const a = approvalOf(date, d);
      const c = dayCosting(day, byName);
      return {
        date: date,
        project: byName ? byName.name : (day.project || '—'),
        projectId: byName ? byName.id : '',
        crew: day.crew || '',
        status: day.status,
        approval: a.status,
        sqft: c.sqft,
        labour: c.labour,
        litres: c.litres,
        paintCost: c.paintCost,
        total: c.total
      };
    });
  }

  // Project-wise: approved vs pending vs rejected, per project.
  function reportByProject(data, worklog) {
    const d = data || read();
    const wl = worklog || readWorkLog();
    return listProjects(d).map((p) => {
      const b = bucketDays(p, d, wl);
      return {
        project: p,
        approved: sumRows(b.approved),
        pending: sumRows(b.pending),
        rejected: sumRows(b.rejected)
      };
    });
  }

  // Painter-wise: who measured what, and how much of it is approved.
  function reportByPainter(data, worklog) {
    const d = data || read();
    const wl = worklog || readWorkLog();
    const map = {};
    Object.keys(wl).forEach((date) => {
      const day = wl[date];
      const who = day.crew || 'Unassigned';
      if (!map[who]) map[who] = { crew: who, days: 0, sqft: 0, labour: 0, litres: 0, paintCost: 0, approvedSqft: 0, approvedLabour: 0, approvedLitres: 0, approvedPaintCost: 0 };
      const project = d.projects.find((p) => dayMatchesProject(day, p)) || null;
      const c = dayCosting(day, project);
      const a = approvalOf(date, d);
      map[who].days++;
      map[who].sqft += c.sqft;
      map[who].labour += c.labour;
      map[who].litres += c.litres;
      map[who].paintCost += c.paintCost;
      if (a.status === 'approved' && day.status === 'submitted') {
        map[who].approvedSqft += c.sqft;
        map[who].approvedLabour += c.labour;
        map[who].approvedLitres += c.litres;
        map[who].approvedPaintCost += c.paintCost;
      }
    });
    return Object.keys(map).map((k) => map[k]).sort((a, b) => b.sqft - a.sqft);
  }

  // A one-glance summary of the whole operation.
  function overview(data, worklog) {
    const d = data || read();
    const daily = reportDaily(d, worklog);
    let sqft = 0, labour = 0, litres = 0, paintCost = 0;
    let approvedSqft = 0, approvedLabour = 0, approvedLitres = 0, approvedPaintCost = 0;
    let pendingCount = 0, rejectedSqft = 0, rejectedLabour = 0;
    daily.forEach((r) => {
      sqft += r.sqft; labour += r.labour; litres += r.litres; paintCost += r.paintCost;
      if (r.approval === 'approved' && r.status === 'submitted') {
        approvedSqft += r.sqft; approvedLabour += r.labour;
        approvedLitres += r.litres; approvedPaintCost += r.paintCost;
      }
      // A rejected day is not awaiting approval — it needs rework, and its
      // area must not be advertised as pending money.
      else if (r.approval === 'rejected') { rejectedSqft += r.sqft; rejectedLabour += r.labour; }
      else if (r.status === 'submitted') pendingCount++;
    });
    return {
      projects: d.projects.length,
      days: daily.length,
      sqft: sqft,
      labour: labour,
      litres: litres,
      paintCost: paintCost,
      total: labour + paintCost,
      approvedSqft: approvedSqft,
      approvedLabour: approvedLabour,
      approvedLitres: approvedLitres,
      approvedPaintCost: approvedPaintCost,
      approvedTotal: approvedLabour + approvedPaintCost,
      pendingDays: pendingCount,
      rejectedSqft: rejectedSqft,
      rejectedLabour: rejectedLabour,
      unbilledLabour: labour - approvedLabour - rejectedLabour
    };
  }

  return {
    STORE_KEY, WORKLOG_KEY, PROJECT_STATUS, APPROVAL_STATUS, DEFAULTS,
    // numbers
    num, money, fmtSqft, fmtLitres,
    // store
    read, write, _setStore,
    readWorkLog, dayTotals, dayCosting, paintLitres,
    // projects
    blankProject, normaliseProject, listProjects, getProject, saveProject, removeProject,
    // linking
    dayMatchesProject, daysForProject,
    // approvals
    approvalOf, canApprove, setApproval, approveDay, rejectDay, clearApproval, daySignature,
    // billing
    bucketDays, sumRows, billFor, billTotal, addBill, removeBill, nextBillNo, invoiceText,
    // reports
    reportDaily, reportByProject, reportByPainter, overview
  };
});
