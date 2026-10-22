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

  // Shown when a real save could not be persisted. The browser drops the
  // write silently when storage is full or blocked, so the UI must say so
  // instead of pretending the change was saved.
  const STORAGE_ERROR = 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.';

  function read() {
    let data = null;
    try { data = JSON.parse(rawGet(STORE_KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') data = {};
    if (!Array.isArray(data.projects)) data.projects = [];
    // Drop malformed project entries. A `null`/scalar in the array made every
    // consumer (`listProjects` sorting by name, the page's project options)
    // throw on `null.name` and abort the whole page script.
    data.projects = data.projects.filter((p) => p && typeof p === 'object' && !Array.isArray(p));
    if (!data.approvals || typeof data.approvals !== 'object' || Array.isArray(data.approvals)) data.approvals = {};
    if (!data.bills || typeof data.bills !== 'object' || Array.isArray(data.bills)) data.bills = {};
    // Bills live per project id as an array; a corrupt store can hold anything.
    Object.keys(data.bills).forEach((k) => {
      const list = data.bills[k];
      data.bills[k] = Array.isArray(list) ? list.filter((b) => b && typeof b === 'object' && !Array.isArray(b)) : [];
    });
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
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    // A hand-edited or half-written day can be `null` or a scalar. Every
    // consumer reads `day.status`, `day.entries`, `day.date`… so drop anything
    // that is not a plain object here, once, rather than guarding at each call.
    const out = {};
    Object.keys(data).forEach((k) => {
      const day = data[k];
      if (day && typeof day === 'object' && !Array.isArray(day)) out[k] = day;
    });
    return out;
  }

  // A day's own costing, computed here rather than trusting a stored
  // total, so a bill always reflects the entries actually saved.
  function dayTotals(day) {
    // `entries` can be anything in a hand-edited store (a string, an object,
    // nulls inside the array); treat only a real array of objects as entries.
    const entries = (day && Array.isArray(day.entries) ? day.entries : [])
      .filter((e) => e && typeof e === 'object' && !Array.isArray(e));
    let sqft = 0;
    entries.forEach((e) => {
      const s = num(e.sqft) || (num(e.w) * num(e.h));
      sqft += s;
    });
    return { count: entries.length, sqft: sqft };
  }

  // The rates a day is actually costed at: the project's when set, else the
  // day's own. Shared by dayCosting and daySignature so a change to either
  // source is caught by the approval fingerprint (see daySignature).
  function effectiveRates(day, project) {
    return {
      // A project's rate overrides the day's own, but a project left at ₹0 is
      // "not set yet", not "free" — falling back to the day's rate keeps the
      // labour the crew already entered from being silently zeroed.
      rate: (project && num(project.rate)) || num(day && day.rate),
      coverage: (project && num(project.coverage)) || num(day && day.coverage) || DEFAULTS.coverage,
      coats: (project && num(project.coats)) || num(day && day.coats) || DEFAULTS.coats,
      paintRate: (project && num(project.paintRate)) || num(day && day.paintRate) || 0
    };
  }

  function dayCosting(day, project) {
    const t = dayTotals(day);
    const r = effectiveRates(day, project);
    const rate = r.rate;
    const coverage = r.coverage;
    const coats = r.coats;
    const paintRate = r.paintRate;
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

  // A fresh id that is guaranteed not to collide with an existing project.
  // `slugId` alone is `name + '-' + Date.now()`, so two projects saved with the
  // same name inside the same millisecond (a double-tap, a fast script) would
  // share an id and the second save would silently overwrite the first.
  function uniqueProjectId(name, projects) {
    let id = slugId(name);
    while ((projects || []).some((p) => p && p.id === id)) {
      id = slugId(name) + '-' + Math.random().toString(36).slice(2, 5);
    }
    return id;
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
    if (!p.id) p.id = uniqueProjectId(p.name, d.projects);
    const idx = d.projects.findIndex((x) => x.id === p.id);
    if (idx >= 0) d.projects[idx] = p; else d.projects.push(p);
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, project: p, data: d };
  }

  function removeProject(id, data) {
    const d = data || read();
    d.projects = d.projects.filter((p) => p.id !== id);
    if (d.bills) delete d.bills[id];
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
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
    // When a day carries an explicit project id, that id is authoritative — it
    // must match, and nothing else counts. Falling through to a name match when
    // the id is set (and simply belongs to another project) let one day match
    // TWO projects at once if its free-text name happened to equal the other
    // project's name, so the same measured area was billed under both.
    if (day.projectId) return day.projectId === project.id;
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

  // A work-log day stores its crew as the member's ID (see js/worklog.js,
  // #wlCrew option values), but older days stored a free-typed name. Turn
  // either into a stable identity + a human name, so the reports never print a
  // machine id like "ramesh-kumar" and the two forms of the same person do not
  // split into two rows. Prefers the roster (PPTeam) when it is loaded; falls
  // back to the raw value so nothing disappears if the roster is unavailable.
  function crewIdentity(value) {
    const raw = String(value || '').trim();
    if (!raw) return { key: 'Unassigned', name: 'Unassigned' };
    const T = root && root.PPTeam;
    if (T && typeof T.get === 'function') {
      try {
        // Match by id first (the modern form)…
        let m = T.get(raw);
        // …then by exact name (a legacy day stored a name, not an id).
        if (!m && typeof T.list === 'function') {
          const low = raw.toLowerCase();
          m = T.list().find((x) => String(x.name || '').trim().toLowerCase() === low);
        }
        if (m) return { key: m.id || raw, name: m.name || raw };
      } catch (e) { /* roster unavailable — fall back to the raw value */ }
    }
    return { key: raw, name: raw };
  }

  // The display name for a stored crew value (id or legacy name).
  function crewName(value) { return crewIdentity(value).name; }

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
      const project = projectForDay(day, d);
      if (!canApprove(day) || daySignature(day, project) !== a.sig) {
        return { status: 'pending', by: '', at: '', note: '', stale: true };
      }
    }
    return a;
  }

  // The project a day belongs to (by id first, then by name), or null.
  function projectForDay(day, data) {
    const d = data || read();
    if (!day) return null;
    if (day.projectId) {
      const p = d.projects.find((x) => x.id === day.projectId);
      if (p) return p;
    }
    return d.projects.find((p) => dayMatchesProject(day, p)) || null;
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
      sig: daySignature(day, projectForDay(day, d))
    };
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, approval: d.approvals[date], data: d };
  }

  // A fingerprint of everything that affects a day's cost. Compared at read
  // time so an edited-after-approval day reverts to pending automatically.
  // The *effective* rates are included — not just the day's own — so a change
  // to the linked project's rate, coverage or paint rate also withdraws the
  // sign-off, instead of silently re-billing the approved day at the new rate.
  function daySignature(day, project) {
    const t = dayTotals(day);
    const p = project || null;
    const r = effectiveRates(day, p);
    const parts = [t.sqft, t.count, r.rate, r.coverage, r.coats, r.paintRate];
    parts.push((day && day.projectId) || '', (p && p.id) || '');
    (day && Array.isArray(day.entries) ? day.entries : []).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      parts.push(e.id || '', num(e.sqft), num(e.w), num(e.h));
    });
    return parts.join('|');
  }

  function approveDay(date, by, data) { return setApproval(date, 'approved', by, '', data); }
  function rejectDay(date, by, note, data) { return setApproval(date, 'rejected', by, note, data); }

  // Withdraw a decision outright. Called when a day is reopened: its numbers
  // are about to change, so the old sign-off must not linger in storage.
  function clearApproval(date, data) {
    const d = data || read();
    if (d.approvals[date]) delete d.approvals[date];
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
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
    const approved = [], pending = [], open = [], rejected = [];
    days.forEach((day) => {
      const a = approvalOf(day.date, d);
      const row = {
        date: day.date,
        crew: crewName(day.crew),
        status: day.status,
        approval: a.status,
        approvedBy: a.by || '',
        costing: dayCosting(day, project)
      };
      if (a.status === 'approved' && day.status === 'submitted') approved.push(row);
      else if (a.status === 'rejected') rejected.push(row);
      // A day still being edited (not final-submitted) is NOT awaiting
      // approval — its numbers can still change, so it belongs in its own
      // bucket. Counting it as "pending" advertised work-in-progress money as
      // if an Owner/Head had something to sign off.
      else if (day.status === 'submitted') pending.push(row);
      else open.push(row);
    });
    return { approved: approved, pending: pending, open: open, rejected: rejected, all: days };
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

  // The single rate/coverage/coats a bill was costed at, for the invoice
  // summary. Approved rows all share the project's rates when the project sets
  // them; when the project leaves a rate blank the day's own rate is used, so
  // the summary must quote that (and say so) rather than printing the project's
  // ₹0 next to a non-zero labour total.
  function billedRateInfo(project, rows, worklog) {
    const p = project || {};
    const wl = worklog || readWorkLog();
    if (num(p.rate)) {
      return {
        rate: num(p.rate), coverage: num(p.coverage) || DEFAULTS.coverage,
        coats: num(p.coats) || DEFAULTS.coats, paintRate: num(p.paintRate),
        fromDay: false
      };
    }
    // Project rate is unset — quote the day rate(s) actually billed.
    const rates = [];
    (rows || []).forEach((r) => {
      const day = wl[r.date];
      if (day) rates.push(num(day.rate));
    });
    const distinct = rates.filter((v, i) => rates.indexOf(v) === i);
    const day0 = (rows && rows.length) ? wl[rows[0].date] : null;
    const r0 = day0 ? effectiveRates(day0, project) : { coverage: DEFAULTS.coverage, coats: DEFAULTS.coats, paintRate: 0 };
    return {
      rate: distinct.length === 1 ? distinct[0] : 0,
      mixed: distinct.length > 1,
      coverage: r0.coverage, coats: r0.coats, paintRate: r0.paintRate,
      fromDay: true
    };
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
    const open = sumRows(b.open);
    const rejected = sumRows(b.rejected);
    // The rates the APPROVED work was actually costed at. The project's when
    // set, else the days' own (see effectiveRates) — so the invoice quotes the
    // rate that produced the money instead of the project's blank ₹0.
    const rateInfo = billedRateInfo(project, b.approved, worklog);
    return {
      ok: true,
      project: project,
      rateInfo: rateInfo,
      lines: b.approved,
      pendingLines: b.pending,
      openLines: b.open,
      rejectedLines: b.rejected,
      totals: approved,
      pending: pending,
      open: open,
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
  // Returns the FULL amount owed for approved work — labour plus paint — to
  // match the module's own rule that a bill is labour + material. (It used to
  // return labour only, so any caller of this alias silently dropped the paint
  // cost.)
  function billTotal(projectId, data, worklog) {
    const b = billFor(projectId, data, worklog);
    return b.ok ? b.totals.total : 0;
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
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
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
    if (data === undefined && !write(d)) return { ok: false, error: STORAGE_ERROR };
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
    const ri = b.rateInfo || {};
    lines.push('Labour rate:  ' + (ri.mixed ? 'per day (see lines above)' : money(ri.rate)) +
      (ri.fromDay ? ' per sq ft (day rate)' : ' per sq ft'));
    lines.push('Labour total: ' + money(b.totals.labour));
    lines.push('Paint needed: ' + fmtLitres(b.totals.litres) + ' (' + ri.coats + ' coats)');
    if (b.totals.paintCost) {
      lines.push('Paint cost:   ' + fmtLitres(b.totals.litres) + ' × ' +
        money(ri.paintRate) + '/L = ' + money(b.totals.paintCost));
    }
    lines.push('GRAND TOTAL:  ' + money(b.totals.total));
    if (b.pending.count) {
      lines.push('');
      lines.push('NOT INCLUDED (awaiting approval): ' +
        b.pending.count + ' day(s), ' + fmtSqft(b.pending.sqft) +
        ', ' + money(b.pending.labour));
    }
    if (b.open && b.open.count) {
      lines.push('');
      lines.push('NOT INCLUDED (still open, not submitted): ' +
        b.open.count + ' day(s), ' + fmtSqft(b.open.sqft));
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
        // A human name, never the stored member id.
        crew: crewName(day.crew),
        crewId: (day.crew && crewIdentity(day.crew).key !== 'Unassigned') ? crewIdentity(day.crew).key : '',
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
        open: sumRows(b.open),
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
      // Group by the person's identity, not the raw stored value, so an id and
      // a legacy name for the same crew member collapse into one row and the
      // report shows a human name instead of "ramesh-kumar".
      const ident = crewIdentity(day.crew);
      const who = ident.key;
      if (!map[who]) map[who] = { crew: ident.name, crewId: who === 'Unassigned' ? '' : who, days: 0, sqft: 0, labour: 0, litres: 0, paintCost: 0, approvedSqft: 0, approvedLabour: 0, approvedLitres: 0, approvedPaintCost: 0 };
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
    let pendingCount = 0, pendingSqft = 0, pendingLabour = 0;
    let openCount = 0, openSqft = 0, openLabour = 0;
    let rejectedSqft = 0, rejectedLabour = 0;
    daily.forEach((r) => {
      sqft += r.sqft; labour += r.labour; litres += r.litres; paintCost += r.paintCost;
      if (r.approval === 'approved' && r.status === 'submitted') {
        approvedSqft += r.sqft; approvedLabour += r.labour;
        approvedLitres += r.litres; approvedPaintCost += r.paintCost;
      }
      // A rejected day is not awaiting approval — it needs rework, and its
      // area must not be advertised as pending money.
      else if (r.approval === 'rejected') { rejectedSqft += r.sqft; rejectedLabour += r.labour; }
      // Awaiting approval means: final-submitted, and no decision yet. A day
      // still OPEN is being edited, so its money is work-in-progress, not
      // pending revenue — it goes in its own bucket.
      else if (r.status === 'submitted') { pendingCount++; pendingSqft += r.sqft; pendingLabour += r.labour; }
      else { openCount++; openSqft += r.sqft; openLabour += r.labour; }
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
      pendingSqft: pendingSqft,
      pendingLabour: pendingLabour,
      openDays: openCount,
      openSqft: openSqft,
      openLabour: openLabour,
      rejectedSqft: rejectedSqft,
      rejectedLabour: rejectedLabour,
      // Money measured but not yet approved. Excludes OPEN days (still being
      // edited) and rejected days (needs rework) — only submitted-awaiting
      // work is "pending", so this now agrees with pendingDays.
      unbilledLabour: pendingLabour
    };
  }

  return {
    STORE_KEY, WORKLOG_KEY, PROJECT_STATUS, APPROVAL_STATUS, DEFAULTS,
    // numbers
    num, money, fmtSqft, fmtLitres,
    // store
    read, write, _setStore, STORAGE_ERROR,
    readWorkLog, dayTotals, dayCosting, paintLitres, effectiveRates, projectForDay,
    crewIdentity, crewName, uniqueProjectId,
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
