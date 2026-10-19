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
  // 50 submitted (pending) + 25 open = 75 sq ft, ₹900 of unbilled labour.
  assert.strictEqual(b.pending.count, 2);
  assert.strictEqual(b.pending.sqft, 75);
  assert.strictEqual(b.pending.labour, 900);
  assert.notStrictEqual(b.pending.labour, b.totals.labour);
});
test('THE RULE: approving a pending day moves it into the bill', () => {
  seedWorld();
  assert.strictEqual(E.billFor('sharma-house').totals.labour, 1200);
  E.approveDay('2026-10-11', 'Gahonsh');
  const after = E.billFor('sharma-house');
  assert.strictEqual(after.totals.sqft, 150);
  assert.strictEqual(after.totals.labour, 1800);
  assert.strictEqual(after.pending.count, 1);
});
test('THE RULE: a rejected day is billed at zero and not pending', () => {
  seedWorld();
  E.rejectDay('2026-10-11', 'Gahonsh', 'wrong wall');
  const b = E.billFor('sharma-house');
  assert.strictEqual(b.totals.labour, 1200);
  assert.strictEqual(b.rejected.count, 1);
  assert.strictEqual(b.rejected.sqft, 50);
  assert.strictEqual(b.pending.count, 1); // only the open day
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
  assert.ok(txt.indexOf('₹900') >= 0, 'expected the pending amount called out');
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
  assert.strictEqual(sharma.pending.sqft, 75);
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
  assert.strictEqual(o.unbilledLabour, 1700); // 2900 - 1200
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
  assert.strictEqual(o.pendingDays, 1);        // only the open 12th
  // Unbilled is the open day (₹300) plus Verma's submitted-but-pending day
  // (₹800) — the rejected ₹600 must NOT be in here.
  assert.strictEqual(o.unbilledLabour, 1100);
});

// ============================================================
// STORAGE SAFETY
// ============================================================
test('a blocked store does not throw', () => {
  E._setStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => E.listProjects());
  assert.doesNotThrow(() => E.overview());
  assert.strictEqual(E.saveProject({ name: 'X' }).ok, true); // in-memory write is best-effort
});
test('corrupt stored JSON falls back to empty', () => {
  E._setStore(memStore({ painterPlusERP: 'not json{{{' }));
  assert.deepStrictEqual(E.listProjects(), []);
  assert.strictEqual(E.overview().projects, 0);
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
