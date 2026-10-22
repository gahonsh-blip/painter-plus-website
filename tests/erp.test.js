/* ============================================================
   Tests for js/erp.js — run with:  node tests/erp.test.js
   No dependencies; uses Node's built-in assert.

   The most important test in this file is "unapproved work never
   reaches a bill total". Everything else supports it.
   ============================================================ */
const assert = require('assert');
const E = require('../js/erp.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}
function close(a, b, tol) {
  assert.ok(Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol), a + ' != ' + b);
}

// ---------- an in-memory store so nothing touches the real browser ----------
function memStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

// A fake work log: two projects, several days in different states.
function seedWorld() {
  const worklog = {
    '2026-10-10': {
      date: '2026-10-10', projectId: 'sharma-house', project: 'Sharma House',
      crew: 'Ramesh Kumar', status: 'submitted', rate: 12, coverage: 130, coats: 2,
      entries: [{ id: 'e1', area: 'wall', label: 'Wall', sqft: 100, method: 'measured' }]
    },
    '2026-10-11': {
      date: '2026-10-11', projectId: 'sharma-house', project: 'Sharma House',
      crew: 'Ramesh Kumar', status: 'submitted', rate: 12, coverage: 130, coats: 2,
      entries: [{ id: 'e2', area: 'wall', label: 'Wall', sqft: 50, method: 'measured' }]
    },
    '2026-10-12': {
      date: '2026-10-12', projectId: 'sharma-house', project: 'Sharma House',
      crew: 'Suresh Mahto', status: 'open', rate: 12, coverage: 130, coats: 2,
      entries: [{ id: 'e3', area: 'wall', label: 'Wall', sqft: 25, method: 'measured' }]
    },
    '2026-10-13': {
      date: '2026-10-13', project: 'Verma Flat',
      crew: 'Ajay Munda', status: 'submitted', rate: 10, coverage: 130, coats: 2,
      entries: [{ id: 'e4', area: 'ceiling', label: 'Ceiling', sqft: 80, method: 'manual', w: 10, h: 8 }]
    }
  };
  const store = memStore({
    painterPlusWorkLog: JSON.stringify(worklog),
    painterPlusERP: JSON.stringify({
      projects: [
        { id: 'sharma-house', name: 'Sharma House', client: 'Mr Sharma', rate: 12, coverage: 130, coats: 2, status: 'active' },
        { id: 'verma-flat', name: 'Verma Flat', client: 'Mrs Verma', rate: 10, coverage: 130, coats: 2, status: 'active' }
      ],
      approvals: {
        '2026-10-10': { status: 'approved', by: 'Gahonsh', at: '2026-10-10T10:00:00Z' }
      },
      bills: {}
    })
  });
  E._setStore(store);
  return store;
}

// ============================================================
// MONEY / FORMAT
// ============================================================
test('money formats rupees', () => assert.strictEqual(E.money(960), '₹960'));
test('money rounds to paise', () => assert.strictEqual(E.money(1234.567), '₹1,234.57'));
test('fmtSqft rounds to one decimal', () => assert.strictEqual(E.fmtSqft(30.14), '30.1 sq ft'));
test('num rejects negatives and junk', () => {
  assert.strictEqual(E.num(-5), 0);
  assert.strictEqual(E.num('abc'), 0);
  assert.strictEqual(E.num('12'), 12);
});

// ============================================================
// PROJECTS
// ============================================================
test('saveProject assigns an id and normalises rates', () => {
  seedWorld();
  const r = E.saveProject({ name: 'New Site', rate: '15', coats: 3 });
  assert.ok(r.ok);
  assert.ok(r.project.id, 'expected an id');
  assert.strictEqual(r.project.rate, 15);
  assert.strictEqual(r.project.coats, 3);
  assert.strictEqual(r.project.status, 'active');
});
test('saveProject rejects a blank name', () => {
  seedWorld();
  assert.strictEqual(E.saveProject({ name: '  ' }).ok, false);
});
test('saveProject updates in place instead of duplicating', () => {
  seedWorld();
  const before = E.listProjects().length;
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 20 });
  assert.strictEqual(E.listProjects().length, before);
  assert.strictEqual(E.getProject('sharma-house').rate, 20);
});
test('removeProject drops its bills too', () => {
  seedWorld();
  E.addBill('sharma-house', { amount: 500 });
  E.removeProject('sharma-house');
  assert.strictEqual(E.getProject('sharma-house'), null);
  assert.strictEqual(E.billFor('sharma-house').ok, false);
});

// ============================================================
// LINKING (projectId + legacy name match)
// ============================================================
test('a day links by projectId', () => {
  seedWorld();
  const p = E.getProject('sharma-house');
  assert.strictEqual(E.daysForProject(p).length, 3);
});
test('a legacy day links by project name', () => {
  seedWorld();
  const p = E.getProject('verma-flat');
  const days = E.daysForProject(p);
  assert.strictEqual(days.length, 1);
  assert.strictEqual(days[0].date, '2026-10-13');
});
test('an unrelated day does not match', () => {
  seedWorld();
  const p = E.getProject('sharma-house');
  assert.ok(!E.dayMatchesProject({ project: 'Some Other Job' }, p));
});

// ============================================================
// APPROVAL GATING
// ============================================================
test('an OPEN day cannot be approved', () => {
  seedWorld();
  const r = E.approveDay('2026-10-12', 'Gahonsh');
  assert.strictEqual(r.ok, false);
  assert.ok(/submit/i.test(r.error));
});
test('a SUBMITTED day can be approved', () => {
  seedWorld();
  const r = E.approveDay('2026-10-11', 'Gahonsh');
  assert.ok(r.ok);
  assert.strictEqual(E.approvalOf('2026-10-11').status, 'approved');
});
test('a day can be rejected with a note', () => {
  seedWorld();
  const r = E.rejectDay('2026-10-11', 'Gahonsh', 'Photo unclear');
  assert.ok(r.ok);
  const a = E.approvalOf('2026-10-11');
  assert.strictEqual(a.status, 'rejected');
  assert.strictEqual(a.note, 'Photo unclear');
});
test('an unknown approval status is refused', () => {
  seedWorld();
  assert.strictEqual(E.setApproval('2026-10-11', 'maybe', 'x').ok, false);
});
test('a day with no approval reads as pending', () => {
  seedWorld();
  assert.strictEqual(E.approvalOf('2026-10-11').status, 'pending');
});

// ============================================================
// THE CRITICAL RULE — unapproved work never reaches a bill
// ============================================================
test('THE RULE: only approved days count toward the bill', () => {
  seedWorld();
  const b = E.billFor('sharma-house');
  assert.ok(b.ok);
  // 100 sq ft approved @ ₹12 = ₹1200. The 50 sq ft submitted-but-pending
  // and the 25 sq ft open day must NOT be in here.
  assert.strictEqual(b.lines.length, 1, 'expected exactly one billable line');
  assert.strictEqual(b.totals.sqft, 100);
  assert.strictEqual(b.billableLabour, 1200);
  assert.strictEqual(E.billTotal('sharma-house'), 1200);
});
test('THE RULE: pending work is reported but billed at zero', () => {
  seedWorld();
  const b = E.billFor('sharma-house');
  // Only the 11th is submitted-but-unapproved: 50 sq ft, ₹600 of pending money.
  assert.strictEqual(b.pending.count, 1);
  assert.strictEqual(b.pending.sqft, 50);
  assert.strictEqual(b.pending.labour, 600);
  // The 12th is still OPEN (being edited) — its own bucket, not "pending".
  assert.strictEqual(b.open.count, 1);
  assert.strictEqual(b.open.sqft, 25);
  assert.strictEqual(b.open.labour, 300);
  assert.notStrictEqual(b.pending.labour, b.totals.labour);
});
test('THE RULE: approving a pending day moves it into the bill', () => {
  seedWorld();
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 1200);
  E.approveDay('2026-10-11', 'Gahonsh');
  const after = E.billFor('sharma-house');
  assert.strictEqual(after.totals.sqft, 150);
  assert.strictEqual(after.totals.labour, 1800);
  // The 11th is now approved, so nothing submitted remains pending; the 12th
  // is still open.
  assert.strictEqual(after.pending.count, 0);
  assert.strictEqual(after.open.count, 1);
});
test('THE RULE: a rejected day is billed at zero and not pending', () => {
  seedWorld();
  E.rejectDay('2026-10-11', 'Gahonsh', 'wrong wall');
  const b = E.billFor('sharma-house');
  assert.strictEqual(b.totals.labour, 1200);
  assert.strictEqual(b.rejected.count, 1);
  assert.strictEqual(b.rejected.sqft, 50);
  // Nothing submitted-but-unapproved remains; the open day is not "pending".
  assert.strictEqual(b.pending.count, 0);
  assert.strictEqual(b.open.count, 1);
});
test('THE RULE: an empty project bills zero', () => {
  seedWorld();
  E.saveProject({ id: 'empty-site', name: 'Empty Site', rate: 12 });
  const b = E.billFor('empty-site');
  assert.strictEqual(b.totals.labour, 0);
  assert.strictEqual(b.totals.sqft, 0);
});
test('THE RULE: an unknown project cannot be billed', () => {
  seedWorld();
  assert.strictEqual(E.billFor('nope').ok, false);
});

// ============================================================
// RATES AND COVERAGE
// ============================================================
test('the project rate overrides the day rate', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 20 });
  const b = E.billFor('sharma-house');
  assert.strictEqual(b.totals.labour, 2000); // 100 sq ft × ₹20
});
test('paint litres use coats and coverage with wastage', () => {
  seedWorld();
  const b = E.billFor('sharma-house');
  // 100 sq ft × 2 coats / 130 × 1.1 = 1.6923 L
  close(b.totals.litres, 100 * 2 / 130 * 1.1, 1e-6);
});
test('a project with 3 coats needs more paint than 2', () => {
  seedWorld();
  const two = E.billFor('sharma-house').totals.litres;
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, coats: 3 });
  const three = E.billFor('sharma-house').totals.litres;
  assert.ok(three > two, three + ' should exceed ' + two);
});
test('entries fall back to width × height when sqft is missing', () => {
  seedWorld();
  const b = E.billFor('verma-flat');
  // The Verma day is submitted but pending, so its 80 sq ft sits in pending.
  assert.strictEqual(b.pending.sqft, 80);
});

// ============================================================
// PAINT QUANTITY + MATERIAL COST (steps 5–6 of the ERP plan)
// ============================================================
test('a project left at ₹0 does not zero the day rate', () => {
  seedWorld();
  // Seed a project whose rate is unset, matching a day that carries its own.
  E._setStore(memStore({
    painterPlusWorkLog: JSON.stringify({
      '2026-10-20': {
        date: '2026-10-20', projectId: 'p1', project: 'Site A', crew: 'R',
        status: 'submitted', rate: 15, coverage: 130, coats: 2,
        entries: [{ id: 'e1', area: 'wall', sqft: 80 }]
      }
    }),
    painterPlusERP: JSON.stringify({
      projects: [{ id: 'p1', name: 'Site A', rate: 0, coverage: 130, coats: 2, status: 'active' }],
      approvals: { '2026-10-20': { status: 'approved', by: 'x', at: 'x' } },
      bills: {}
    })
  }));
  const b = E.billFor('p1');
  assert.strictEqual(b.totals.labour, 1200, 'the day rate must survive a blank project rate');
});
test('a project paint rate adds a material cost to the day', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 200 });
  const b = E.billFor('sharma-house');
  const litres = 100 * 2 / 130 * 1.1;
  close(b.totals.litres, litres, 1e-6);
  close(b.totals.paintCost, litres * 200, 1e-6);
  close(b.totals.total, 1200 + litres * 200, 1e-6);
});
test('with no paint rate the total is labour only', () => {
  seedWorld();
  const b = E.billFor('sharma-house');
  assert.strictEqual(b.totals.paintCost, 0);
  assert.strictEqual(b.totals.total, b.totals.labour);
});
test('ERP paint maths match PPMeasure when it is loaded', () => {
  // The work log delegates litres to PPMeasure.paintLitres. The ERP must
  // agree with it, or the same day would quote two different quantities.
  // Load erp.js in a browser-like context where window.PPMeasure exists and
  // prove dayCosting uses it, not the local fallback.
  const vm = require('vm');
  const fs = require('fs');
  const path = require('path');
  const M = require('../js/measure.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'erp.js'), 'utf8');

  const store = {};
  const win = {
    PPMeasure: M,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    }
  };
  const sandbox = { window: win, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  const P = win.PPERP;
  const day = { date: 'x', status: 'submitted', rate: 12, coverage: 130, coats: 2, entries: [{ id: 'e', sqft: 100 }] };
  const viaMeasure = P.dayCosting(day, null).litres;
  close(viaMeasure, M.paintLitres(100, { coats: 2, coverage: 130 }), 1e-9);
  // And the local fallback (no PPMeasure) yields the same figure.
  close(P.paintLitres(100, { coats: 2, coverage: 130 }), viaMeasure, 1e-9);
});
test('the invoice shows the paint line and grand total', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 200 });
  const txt = E.invoiceText('sharma-house');
  assert.ok(txt.indexOf('Paint cost:') >= 0, 'expected a paint cost line');
  assert.ok(txt.indexOf('GRAND TOTAL:') >= 0, 'expected a grand total line');
  assert.ok(txt.indexOf('₹1,200') >= 0, 'expected the labour subtotal');
});
test('paint quantity reaches the painter-wise report', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 200 });
  const rows = E.reportByPainter();
  const r = rows.find((x) => x.crew === 'Ramesh Kumar');
  assert.ok(r, 'expected a row for Ramesh Kumar');
  assert.ok(r.approvedLitres > 0, 'approved litres must be carried through');
  assert.ok(r.approvedPaintCost > 0, 'approved paint cost must be carried through');
});
test('a day-level paintRate change withdraws a stale approval', () => {
  seedWorld();
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.strictEqual(E.approvalOf('2026-10-10').status, 'approved');
  const wl = E.readWorkLog();
  wl['2026-10-10'].paintRate = 250;
  E._setStore(memStore({ painterPlusWorkLog: JSON.stringify(wl), painterPlusERP: JSON.stringify(E.read()) }));
  assert.strictEqual(E.approvalOf('2026-10-10').status, 'pending', 'a paint-rate change must re-open the sign-off');
});

// ============================================================
// INVOICE
// ============================================================
test('the invoice lists approved work and the total', () => {
  seedWorld();
  const txt = E.invoiceText('sharma-house');
  assert.ok(txt.indexOf('PAINTER PLUS — INVOICE') === 0);
  assert.ok(txt.indexOf('Sharma House') >= 0);
  assert.ok(txt.indexOf('₹1,200') >= 0, 'expected the approved total');
  assert.ok(txt.indexOf('100 sq ft') >= 0);
});
test('the invoice names what was left out', () => {
  seedWorld();
  const txt = E.invoiceText('sharma-house');
  assert.ok(/NOT INCLUDED \(awaiting approval\)/.test(txt));
  assert.ok(txt.indexOf('₹600') >= 0, 'expected the pending amount called out');
  // The still-open day is called out separately, not as pending.
  assert.ok(/NOT INCLUDED \(still open, not submitted\)/.test(txt));
});
test('an invoice with nothing approved says so', () => {
  seedWorld();
  E.saveProject({ id: 'empty-site', name: 'Empty Site', rate: 12 });
  const txt = E.invoiceText('empty-site');
  assert.ok(/nothing to bill/i.test(txt));
});

// ============================================================
// BILL RECORDS
// ============================================================
test('addBill numbers invoices PP-001, PP-002', () => {
  seedWorld();
  E.addBill('sharma-house', { amount: 1200 });
  E.addBill('sharma-house', { amount: 600 });
  const b = E.billFor('sharma-house');
  assert.strictEqual(b.bills.length, 2);
  assert.strictEqual(b.bills[0].no, 'PP-001');
  assert.strictEqual(b.bills[1].no, 'PP-002');
});
test('removeBill deletes one invoice', () => {
  seedWorld();
  const r = E.addBill('sharma-house', { amount: 1200 });
  E.removeBill('sharma-house', r.bill.id);
  assert.strictEqual(E.billFor('sharma-house').bills.length, 0);
});

// ============================================================
// REPORTS
// ============================================================
test('daily report is newest first', () => {
  seedWorld();
  const rows = E.reportDaily();
  assert.strictEqual(rows[0].date, '2026-10-13');
  assert.strictEqual(rows[rows.length - 1].date, '2026-10-10');
});
test('daily report carries the approval state', () => {
  seedWorld();
  const byDate = {};
  E.reportDaily().forEach((r) => { byDate[r.date] = r; });
  assert.strictEqual(byDate['2026-10-10'].approval, 'approved');
  assert.strictEqual(byDate['2026-10-11'].approval, 'pending');
});
test('daily report resolves a project name from the id', () => {
  seedWorld();
  const rows = E.reportDaily();
  assert.strictEqual(rows.find((r) => r.date === '2026-10-12').project, 'Sharma House');
});
test('project report splits approved from pending', () => {
  seedWorld();
  const rows = E.reportByProject();
  const sharma = rows.find((r) => r.project.id === 'sharma-house');
  assert.strictEqual(sharma.approved.sqft, 100);
  assert.strictEqual(sharma.pending.sqft, 50); // submitted, not approved
  assert.strictEqual(sharma.open.sqft, 25);     // still being edited
  const verma = rows.find((r) => r.project.id === 'verma-flat');
  assert.strictEqual(verma.pending.sqft, 80);
});
test('painter report attributes work to the crew', () => {
  seedWorld();
  const rows = E.reportByPainter();
  const ramesh = rows.find((r) => r.crew === 'Ramesh Kumar');
  assert.strictEqual(ramesh.days, 2);
  assert.strictEqual(ramesh.sqft, 150);
  // only the 10th is approved, so approved sq ft is 100
  assert.strictEqual(ramesh.approvedSqft, 100);
  assert.strictEqual(ramesh.approvedLabour, 1200);
});
test('painter report includes unassigned days', () => {
  seedWorld();
  const wl = E.readWorkLog();
  wl['2026-10-14'] = { date: '2026-10-14', status: 'open', entries: [{ sqft: 10 }] };
  E._setStore(memStore({ painterPlusWorkLog: JSON.stringify(wl), painterPlusERP: JSON.stringify(E.read()) }));
  assert.ok(E.reportByPainter().some((r) => r.crew === 'Unassigned'));
});
test('overview totals the whole operation', () => {
  seedWorld();
  const o = E.overview();
  assert.strictEqual(o.projects, 2);
  assert.strictEqual(o.days, 4);
  assert.strictEqual(o.sqft, 255);          // 100 + 50 + 25 + 80
  assert.strictEqual(o.labour, 2900);       // 1200 + 600 + 300 + 800
  assert.strictEqual(o.approvedSqft, 100);
  assert.strictEqual(o.approvedLabour, 1200);
  assert.strictEqual(o.pendingDays, 2);     // 11th + 13th are submitted, not approved
  assert.strictEqual(o.openDays, 1);        // the 12th is still open
  // Awaiting approval = the two submitted-but-unapproved days (₹600 + ₹800);
  // the open day (₹300) is work-in-progress, not pending.
  assert.strictEqual(o.unbilledLabour, 1400);
  assert.strictEqual(o.openLabour, 300);
});

// ============================================================
// REGRESSIONS — bugs found and fixed (see docs/BUG_AUDIT.md)
// ============================================================

// Bug: a day could be approved, then reopened and edited, and the OLD
// approval would still bill the NEW amount. The signature check must
// revert an edited-after-approval day to pending.
test('REG: editing an approved day withdraws its approval', () => {
  const store = seedWorld();
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 1200);

  const wl = E.readWorkLog();
  wl['2026-10-10'].entries.push({ id: 'e9', area: 'wall', label: 'Wall', sqft: 100, method: 'measured' });
  E._setStore(memStore({ painterPlusWorkLog: JSON.stringify(wl), painterPlusERP: JSON.stringify(E.read()) }));

  assert.strictEqual(E.approvalOf('2026-10-10').status, 'pending', 'stale approval must not survive');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 0, 'edited work must not stay billable');
  void store;
});
test('REG: re-approving an edited day bills the new amount', () => {
  seedWorld();
  E.approveDay('2026-10-10', 'Gahonsh');
  const wl = E.readWorkLog();
  wl['2026-10-10'].entries[0].sqft = 200;
  E._setStore(memStore({ painterPlusWorkLog: JSON.stringify(wl), painterPlusERP: JSON.stringify(E.read()) }));
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 2400); // 200 × 12
});
test('REG: clearApproval removes a decision', () => {
  seedWorld();
  E.approveDay('2026-10-11', 'Gahonsh');
  assert.strictEqual(E.approvalOf('2026-10-11').status, 'approved');
  E.clearApproval('2026-10-11');
  assert.strictEqual(E.approvalOf('2026-10-11').status, 'pending');
});

// Bug: two bills raised in the same millisecond shared an id, so deleting
// one deleted both.
test('REG: two bills raised together get distinct ids', () => {
  seedWorld();
  const a = E.addBill('sharma-house', { amount: 100 });
  const b = E.addBill('sharma-house', { amount: 200 });
  assert.notStrictEqual(a.bill.id, b.bill.id, 'bill ids must be unique');
  E.removeBill('sharma-house', a.bill.id);
  assert.strictEqual(E.billFor('sharma-house').bills.length, 1, 'deleting one must keep the other');
});

// Bug: the invoice number came from the list length, so deleting a bill
// freed its number and the next invoice reused it.
test('REG: a deleted invoice number is not reused', () => {
  seedWorld();
  E.addBill('sharma-house', { amount: 100 }); // PP-001
  const second = E.addBill('sharma-house', { amount: 200 }); // PP-002
  E.removeBill('sharma-house', E.billFor('sharma-house').bills[0].id); // drop PP-001
  const third = E.addBill('sharma-house', { amount: 300 });
  assert.strictEqual(third.bill.no, 'PP-003', 'a used number must never come back');
  void second;
});

// Bug: a rejected day was counted as "awaiting approval", so rejected
// money showed up as pending money on the dashboard.
test('REG: a rejected day is not counted as pending', () => {
  seedWorld();
  E.rejectDay('2026-10-11', 'Gahonsh', 'blurry');
  const o = E.overview();
  assert.strictEqual(o.rejectedLabour, 600);   // 50 sq ft × ₹12
  assert.strictEqual(o.pendingDays, 1);        // only Verma's submitted day
  // Awaiting approval = Verma's submitted-but-pending day (₹800) only — the
  // rejected ₹600 and the open ₹300 must NOT be in here.
  assert.strictEqual(o.unbilledLabour, 800);
  assert.strictEqual(o.openLabour, 300);
});

// ============================================================
// REGRESSIONS — second pass (bugs 1–9, see docs/BUG_AUDIT.md)
// ============================================================

// Bug 5: a day whose projectId points at project A but whose free-text name
// equalled project B's name matched BOTH, so one day's work was billed under
// two projects. An explicit id must be authoritative.
test('REG: a day with a projectId matches only that project', () => {
  E._setStore(memStore({
    painterPlusWorkLog: JSON.stringify({
      '2026-10-10': {
        date: '2026-10-10', projectId: 'a', project: 'Site B', crew: 'R',
        status: 'submitted', rate: 12, coverage: 130, coats: 2,
        entries: [{ id: 'e1', area: 'wall', sqft: 100 }]
      }
    }),
    painterPlusERP: JSON.stringify({
      projects: [
        { id: 'a', name: 'Site A', rate: 12, coverage: 130, coats: 2, status: 'active' },
        { id: 'b', name: 'Site B', rate: 12, coverage: 130, coats: 2, status: 'active' }
      ],
      approvals: { '2026-10-10': { status: 'approved', by: 'x', at: 'x' } }, bills: {}
    })
  }));
  const day = E.readWorkLog()['2026-10-10'];
  assert.strictEqual(E.dayMatchesProject(day, E.getProject('a')), true, 'must match its own project');
  assert.strictEqual(E.dayMatchesProject(day, E.getProject('b')), false, 'must NOT also match the name-twin');
  assert.strictEqual(E.billFor('a').totals.sqft, 100);
  assert.strictEqual(E.billFor('b').totals.sqft, 0, 'the other project must not be billed for this day');
});

// Bug 7: two projects with the same name saved in the same millisecond shared
// an id, so the second overwrote the first.
test('REG: two same-name projects get distinct ids', () => {
  seedWorld();
  const a = E.saveProject({ name: 'Twin Site', rate: 10 });
  const b = E.saveProject({ name: 'Twin Site', rate: 20 });
  assert.notStrictEqual(a.project.id, b.project.id, 'ids must be unique even in the same ms');
  const twins = E.listProjects().filter((p) => p.name === 'Twin Site');
  assert.strictEqual(twins.length, 2, 'both projects must survive');
});

// Bug 8: billTotal() returned labour only, dropping the paint cost.
test('REG: billTotal includes the paint cost', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 200 });
  const b = E.billFor('sharma-house');
  assert.ok(b.totals.paintCost > 0, 'the day must carry a paint cost');
  assert.strictEqual(E.billTotal('sharma-house'), b.totals.total, 'billTotal must equal labour + paint');
  assert.ok(E.billTotal('sharma-house') > b.totals.labour, 'billTotal must exceed labour alone');
});

// Bug 3: the invoice printed the project's blank ₹0 rate (and project coats)
// while billing the day's real rate.
test('REG: the invoice quotes the rate the work was billed at', () => {
  E._setStore(memStore({
    painterPlusWorkLog: JSON.stringify({
      '2026-10-20': {
        date: '2026-10-20', projectId: 'p1', project: 'Site A', crew: 'R',
        status: 'submitted', rate: 12, coverage: 130, coats: 3,
        entries: [{ id: 'e1', area: 'wall', sqft: 100 }]
      }
    }),
    painterPlusERP: JSON.stringify({
      // The project leaves its rate AND coats unset, so the day's own values
      // are what the costing actually uses.
      projects: [{ id: 'p1', name: 'Site A', rate: 0, coverage: 0, coats: 0, status: 'active' }],
      approvals: { '2026-10-20': { status: 'approved', by: 'x', at: 'x' } }, bills: {}
    })
  }));
  const txt = E.invoiceText('p1');
  assert.ok(!/Labour rate:\s*₹0/.test(txt), 'the invoice must not quote a ₹0 rate next to real labour');
  assert.ok(/Labour rate:\s*₹12/.test(txt), 'expected the day rate ₹12');
  assert.ok(/day rate/.test(txt), 'expected the day-rate note');
  assert.ok(/\(3 coats\)/.test(txt), 'expected the day coat count, not the project default');
  assert.strictEqual(E.billFor('p1').totals.labour, 1200);
});

// Bug 1: the painter/daily reports printed the stored crew id ("ramesh-kumar")
// instead of the member's name, and split one person into two rows. Resolve
// through PPTeam when it is loaded.
test('REG: the painter report shows a name, not the crew id, and merges the two forms', () => {
  const vm = require('vm');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'erp.js'), 'utf8');
  const store = {
    painterPlusWorkLog: JSON.stringify({
      // modern form: crew = member id
      '2026-10-10': { date: '2026-10-10', projectId: 'p1', project: 'P1', crew: 'ramesh-kumar', status: 'submitted', rate: 12, coverage: 130, coats: 2, entries: [{ id: 'e1', sqft: 100 }] },
      // legacy form: crew = typed name, same person
      '2026-10-11': { date: '2026-10-11', projectId: 'p1', project: 'P1', crew: 'Ramesh Kumar', status: 'submitted', rate: 12, coverage: 130, coats: 2, entries: [{ id: 'e2', sqft: 50 }] }
    }),
    painterPlusERP: JSON.stringify({ projects: [{ id: 'p1', name: 'P1', rate: 12, coverage: 130, coats: 2, status: 'active' }], approvals: {}, bills: {} })
  };
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    PPTeam: {
      get: (id) => (id === 'ramesh-kumar' ? { id: 'ramesh-kumar', name: 'Ramesh Kumar' } : null),
      list: () => [{ id: 'ramesh-kumar', name: 'Ramesh Kumar' }]
    }
  };
  const sandbox = { window: win, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const P = win.PPERP;
  const rows = P.reportByPainter();
  assert.strictEqual(rows.length, 1, 'the id and the legacy name must collapse into ONE row');
  assert.strictEqual(rows[0].crew, 'Ramesh Kumar', 'the report must show the name, not the id');
  assert.strictEqual(rows[0].days, 2);
  assert.strictEqual(rows[0].sqft, 150);
  // And the daily report shows the name too.
  const daily = P.reportDaily();
  assert.ok(daily.every((r) => r.crew === 'Ramesh Kumar'), 'daily report must resolve the crew name');
});

// Bug 2: "awaiting approval" counted days that were never submitted, so the
// dashboard advertised work-in-progress as pending revenue and the KPI's own
// subtitle disagreed with its money.
test('REG: awaiting approval excludes open days and agrees with its count', () => {
  seedWorld();
  const o = E.overview();
  const b = E.billFor('sharma-house');
  // Submitted-but-unapproved days: 11th (₹600) + Verma 13th (₹800) = ₹1400.
  assert.strictEqual(o.unbilledLabour, 1400);
  // The KPI money (unbilledLabour) counts exactly pendingDays days.
  assert.strictEqual(o.pendingDays, 2);
  // The open day is separated out, and the bill's pending bucket holds only
  // the submitted day — dashboard and bill now agree.
  assert.strictEqual(o.openLabour, 300);
  assert.strictEqual(b.pending.count, 1);
  assert.strictEqual(b.open.count, 1);
});


// ============================================================
// STORAGE SAFETY
// ============================================================
test('a blocked store does not throw', () => {
  E._setStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => E.listProjects());
  assert.doesNotThrow(() => E.overview());
  // A write that cannot persist must be reported, not silently claimed as saved.
  const res = E.saveProject({ name: 'X' });
  assert.strictEqual(res.ok, false);
  assert.ok(/storage/i.test(res.error));
});
test('corrupt stored JSON falls back to empty', () => {
  E._setStore(memStore({ painterPlusERP: 'not json{{{' }));
  assert.deepStrictEqual(E.listProjects(), []);
  assert.strictEqual(E.overview().projects, 0);
});

// ============================================================
// REGRESSIONS — pricing + persistence (see docs/BUG_AUDIT.md)
// ============================================================

// Bug: a project's rate/coverage/paint-rate could be changed AFTER a day was
// approved. The signature only covered the day's own rates, so the old
// sign-off kept billing the approved day at the NEW project rate with no
// re-approval. The signature must include the effective (project) rates.
test('REG: changing the project rate withdraws an approved day', () => {
  seedWorld();
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 1200); // 100 × 12
  // The owner raises the project rate from ₹12 to ₹50.
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 50, coverage: 130, coats: 2 });
  assert.strictEqual(E.approvalOf('2026-10-10').status, 'pending', 'a project-rate change must re-open the sign-off');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 0, 'the old approval must not bill the new rate');
});
test('REG: changing the project paint rate withdraws an approved day', () => {
  seedWorld();
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 200 });
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.ok(E.billFor('sharma-house').totals.total > 1200);
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 12, paintRate: 400 });
  assert.strictEqual(E.approvalOf('2026-10-10').status, 'pending', 'a project paint-rate change must re-open the sign-off');
});
test('REG: re-approving after a project-rate change bills the new rate', () => {
  seedWorld();
  E.approveDay('2026-10-10', 'Gahonsh');
  E.saveProject({ id: 'sharma-house', name: 'Sharma House', rate: 50, coverage: 130, coats: 2 });
  E.approveDay('2026-10-10', 'Gahonsh');
  assert.strictEqual(E.approvalOf('2026-10-10').status, 'approved');
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 5000); // 100 × 50
});

// ============================================================
// CORRUPT-STORE RESILIENCE
// ------------------------------------------------------------
// localStorage is untrusted input: it can be hand-edited, half-written
// by a failed save, or left behind by an older build. A `null` or a
// scalar inside the stored arrays/objects must never throw — the whole
// page script aborts when it does (this codebase loads page scripts
// site-wide), so a bad store silently kills unrelated features.
// ============================================================
test('REG: a corrupt ERP store does not throw and drops the bad rows', () => {
  const store = memStore({
    painterPlusERP: JSON.stringify({
      projects: [null, 'x', 7, [], { id: 'p1', name: 'Real', rate: 10 }],
      approvals: { '2026-10-10': 5, '2026-10-11': null },
      bills: { p1: [null, 'x', { id: 'b1', no: 'PP-001', amount: 10 }], bad: 7 }
    })
  });
  E._setStore(store);
  assert.doesNotThrow(() => E.read());
  assert.doesNotThrow(() => E.listProjects());
  assert.doesNotThrow(() => E.reportByProject());
  assert.doesNotThrow(() => E.overview());
  assert.strictEqual(E.listProjects().length, 1, 'only the real project survives');
  const b = E.billFor('p1');
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.bills.length, 1, 'only the real bill survives');
});

test('REG: a corrupt work log does not throw', () => {
  const store = memStore({
    painterPlusWorkLog: JSON.stringify({
      '2026-10-10': null,
      '2026-10-11': 'nope',
      '2026-10-12': { date: '2026-10-12', status: 'submitted', entries: 'not-an-array' },
      '2026-10-13': { date: '2026-10-13', status: 'submitted', entries: [null, 7, { id: 'e1', sqft: 20 }] }
    })
  });
  E._setStore(store);
  assert.doesNotThrow(() => E.readWorkLog());
  assert.doesNotThrow(() => E.reportDaily());
  assert.doesNotThrow(() => E.overview());
  assert.doesNotThrow(() => E.dayCosting(E.readWorkLog()['2026-10-12']));
  // The good day is still costed from its one real entry.
  assert.strictEqual(E.dayCosting(E.readWorkLog()['2026-10-13']).sqft, 20);
});

test('REG: a daySignature over a corrupt day does not throw', () => {
  assert.doesNotThrow(() => E.daySignature({ date: 'd', entries: [null, 'x', {}] }, null));
  assert.doesNotThrow(() => E.daySignature(null, null));
});

// Bug: a save whose localStorage write failed (quota/blocked) still reported
// ok:true, so the UI said "saved" while nothing was stored.
test('REG: a failed write is reported, not silently swallowed', () => {
  E._setStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  const res = E.saveProject({ name: 'Doomed', rate: 10 });
  assert.strictEqual(res.ok, false, 'a save that did not persist must not report ok');
  assert.ok(/storage/i.test(res.error), 'expected a storage error message');
  assert.strictEqual(E.listProjects().length, 0);
});

// ============================================================
// BROWSER GLOBAL BINDING
// ------------------------------------------------------------
// The UMD wrapper must hand the factory the real global so it can
// reach window.localStorage. A regression here once left `root`
// undefined in the browser: every save silently no-op'd because the
// module fell back to a null backing store. Load the file in a fresh
// context that looks like a browser (a `window` global, no `module`)
// and prove a save actually reaches window.localStorage.
// ============================================================
test('binds to window and persists through window.localStorage', () => {
  const vm = require('vm');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'erp.js'), 'utf8');

  const store = {};
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    }
  };
  const sandbox = { window: win, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  assert.ok(win.PPERP, 'window.PPERP was not set — the factory did not receive the global');
  const res = win.PPERP.saveProject({ name: 'Browser Test', rate: 10 });
  assert.strictEqual(res.ok, true);
  assert.ok(store.painterPlusERP, 'save did not reach window.localStorage (root/localStorage unbound)');
  assert.strictEqual(win.PPERP.listProjects().length, 1);
  assert.strictEqual(win.PPERP.listProjects()[0].name, 'Browser Test');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
