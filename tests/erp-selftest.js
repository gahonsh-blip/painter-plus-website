/* ============================================================
   Browser self-test for the Painter ERP flow.
   Injected into a generated copy of erp.html (see tests/run-erp-selftest.sh).
   It drives the REAL page end to end: unlock the gate, create a project,
   seed work-log days (one submitted, one open), approve the submitted one,
   then check the approvals list, the bill and the reports in the DOM.
   Results are written to #erp-selftest.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[erp-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const txt = (id) => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const html = (id) => { const el = $(id); return el ? el.innerHTML : ''; };

  window.addEventListener('error', (e) => {
    log('!! window error: ' + (e.message || e.error));
  });

  // The site's service worker caches assets cache-first; while iterating that
  // can serve a stale erp.js. Drop it so the harness always tests what is on disk.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'erp-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  // Seed a work-log day directly through the real store, then let the ERP read it.
  function seedDay(date, projectName, projectId, w, h, crew) {
    const day = window.PPWorkLog.getDay(date);
    day.project = projectName;
    day.projectId = projectId || '';
    day.crew = crew || '';
    day.entries = [{
      id: 'e' + date, area: 'wall', label: 'Wall',
      w: w, h: h, method: 'manual', sqft: w * h,
      measure: null, photo: '', note: '', project: projectName, crew: crew || ''
    }];
    window.PPWorkLog.saveDay(day);
  }

  // Start from a clean slate so the numbers are deterministic. The page
  // controller renders on load, so clearing storage means one reload; the
  // flag lives in sessionStorage and survives that reload.
  const dirty = (() => {
    try { return !!(localStorage.getItem('painterPlusERP') || localStorage.getItem('painterPlusWorkLog')); }
    catch (e) { return false; }
  })();

  if (dirty || sessionStorage.getItem('erpSelftestClean') !== '1') {
    try {
      localStorage.removeItem('painterPlusERP');
      localStorage.removeItem('painterPlusWorkLog');
    } catch (e) {}
    if (dirty) {
      sessionStorage.setItem('erpSelftestClean', '1');
      window.addEventListener('load', () => location.reload());
      return;
    }
  }

  window.addEventListener('load', () => setTimeout(async () => {
    const E = window.PPERP, Team = window.PPTeam, WL = window.PPWorkLog;
    if (!E || !Team || !WL) { fail('modules missing: ERP=' + !!E + ' Team=' + !!Team + ' WorkLog=' + !!WL); finish(); return; }
    try {
      // ---- 1. unlock the gate with the real passcode ----
      const pass = $('erpPass');
      if (pass) { pass.value = 'painter123'; } // the real staff passcode (js/team.js stores only its digest)
      const unlock = $('erpUnlock');
      if (unlock) unlock.click();
      await sleep(150);
      check(!$('erpPanel').hidden, 'gate unlocks with the real passcode and shows the ERP panel');

      // ---- 2. create a project through the real form ----
      $('erpProjName').value = 'Sharma House';
      $('erpProjClient').value = 'Mr Sharma';
      $('erpProjPhone').value = '9800000000';
      $('erpProjRate').value = '12';
      $('erpProjCoats').value = '2';
      $('erpProjCoverage').value = '130';
      $('erpProjForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await sleep(120);
      const proj = E.listProjects()[0];
      check(!!proj && proj.name === 'Sharma House', 'project saved from the form: ' + (proj && proj.name));
      check(html('erpProjList').indexOf('Sharma House') !== -1, 'project appears in the Projects list');

      // ---- 3. seed two days: one submitted (approvable), one open ----
      seedDay('2026-10-10', 'Sharma House', proj.id, 10, 8, 'gahonsh');   // 80 sq ft
      WL.submitDay('2026-10-10', 'gahonsh');
      seedDay('2026-10-11', 'Sharma House', proj.id, 5, 4, 'gahonsh');    // 20 sq ft, left open

      // ---- 4. dashboard reads the money (nothing approved yet) ----
      document.querySelector('#tabDash').click();
      await sleep(80);
      const kpis = txt('erpKpis');
      check(kpis.indexOf('₹0') !== -1, 'dashboard billable is ₹0 before any approval (the rule)');
      check(kpis.indexOf('100 sq ft') !== -1 || kpis.indexOf('100.0 sq ft') !== -1, 'dashboard total measured = 100 sq ft');
      check(kpis.indexOf('1 day(s) submitted') !== -1, 'dashboard counts 1 day awaiting approval');

      // ---- 5. approvals: only the submitted day is offered ----
      document.querySelector('#tabApprove').click();
      await sleep(80);
      const waiting = html('erpApprList');
      check(waiting.indexOf('2026-10-10') !== -1, 'submitted day 2026-10-10 is offered for approval');
      check(waiting.indexOf('2026-10-11') === -1, 'open day 2026-10-11 is NOT offered (still being edited)');

      // ---- 6. billing BEFORE approval: nothing billable, pending shown ----
      document.querySelector('#tabBill').click();
      await sleep(80);
      $('erpBillProject').value = proj.id;
      $('erpBillProject').dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(80);
      let bill = txt('erpBillOut');
      check(bill.indexOf('₹0') !== -1, 'bill total is ₹0 before approval (the rule)');
      check(bill.indexOf('1 day(s) awaiting approval') !== -1, 'the submitted day is shown as awaiting approval');
      check(bill.indexOf('1 day(s) still open') !== -1, 'the open day is shown in its own bucket, not as pending');

      // ---- 7. approve the submitted day ----
      document.querySelector('#tabApprove').click();
      await sleep(60);
      const apBtn = document.querySelector('[data-approve="2026-10-10"]');
      check(!!apBtn, 'approve button is present for the submitted day');
      if (apBtn) apBtn.click();
      await sleep(150);
      check(E.approvalOf('2026-10-10').status === 'approved', 'day 2026-10-10 is now approved in the store');

      // ---- 8. billing AFTER approval: the money appears ----
      document.querySelector('#tabBill').click();
      await sleep(80);
      $('erpBillProject').value = proj.id;
      $('erpBillProject').dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(80);
      bill = txt('erpBillOut');
      check(bill.indexOf('₹960') !== -1, 'bill total is ₹960 after approval (80 sq ft × ₹12)');
      check(bill.indexOf('80 sq ft') !== -1, 'bill shows 80 sq ft approved');
      check(bill.indexOf('20 sq ft') !== -1, 'the open 20 sq ft is still listed separately');
      check(bill.indexOf('1 day(s) still open') !== -1, 'the open day is called out, not counted as pending');

      // ---- 9. record the bill ----
      const raise = $('erpRaiseBill');
      if (raise) raise.click();
      await sleep(120);
      const bills = E.billFor(proj.id).bills;
      check(bills.length === 1 && bills[0].amount === 960, 'invoice recorded: ' + JSON.stringify(bills[0] || {}).slice(0, 80));
      check(html('erpBillOut').indexOf('PP-001') !== -1, 'invoice numbered PP-001 appears in the list');

      // ---- 10. reports ----
      document.querySelector('#tabReport').click();
      await sleep(80);
      let rep = txt('erpReportOut');
      check(rep.indexOf('2026-10-10') !== -1 && rep.indexOf('2026-10-11') !== -1, 'daily report lists both days');
      check(rep.indexOf('₹960') !== -1, 'daily report shows the approved ₹960');

      document.querySelector('#repTabProject').click();
      await sleep(80);
      rep = txt('erpReportOut');
      check(rep.indexOf('Sharma House') !== -1, 'project report lists Sharma House');
      check(rep.indexOf('80 sq ft') !== -1, 'project report separates 80 sq ft approved');

      document.querySelector('#repTabPainter').click();
      await sleep(80);
      rep = txt('erpReportOut');
      check(rep.indexOf('Gahonsh') !== -1, 'painter report shows the crew NAME, not the id');
      check(rep.indexOf('gahonsh') === -1, 'painter report does not leak the raw member id');

      // ---- 11. reject a day and prove it never bills ----
      seedDay('2026-10-12', 'Sharma House', proj.id, 100, 10, 'gahonsh'); // 1000 sq ft
      WL.submitDay('2026-10-12', 'gahonsh');
      const before = E.billFor(proj.id).totals.labour;
      E.rejectDay('2026-10-12', 'gahonsh', 'not our work');
      const after = E.billFor(proj.id).totals.labour;
      check(before === after, 'a rejected 1000 sq ft day does not change the bill total (' + after + ')');

      // ---- 12. money format sanity ----
      check(E.money(960) === '₹960', 'money format: ' + E.money(960));

      // ---- 13. paint quantity + material cost reach the bill ----
      // Give the project a paint rate. That is a costing change, so the
      // approval that covered the old costing is withdrawn (bug 25).
      const E2 = window.PPERP;
      const p2 = E2.getProject(proj.id);
      p2.paintRate = 200;
      E2.saveProject(p2);
      check(E2.approvalOf('2026-10-10').status === 'pending',
        'a project paint-rate change withdraws the approval (bug 25)');
      // The day already invoiced (₹960) must never come back into a bill — not
      // even after being re-approved at the new rates.
      E2.approveDay('2026-10-10', 'gahonsh');
      check(E2.billFor(proj.id).totals.total === 0,
        'an already-invoiced day is not billed again after a rate change');

      // A NEW day is the real workflow for billing at the new rates.
      seedDay('2026-10-13', 'Sharma House', proj.id, 10, 8, 'gahonsh'); // 80 sq ft
      WL.submitDay('2026-10-13', 'gahonsh');
      E2.approveDay('2026-10-13', 'gahonsh');
      document.querySelector('#tabBill').click();
      await sleep(80);
      $('erpBillProject').value = proj.id;
      $('erpBillProject').dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(80);
      const bill2 = txt('erpBillOut');
      // 80 sq ft × 2 coats / 130 × 1.1 = 1.354 L; × ₹200 ≈ ₹271.
      check(bill2.indexOf('Paint needed') !== -1, 'bill shows a Paint needed figure once a paint rate is set');
      check(bill2.indexOf('1.4 L') !== -1, 'bill shows the paint quantity (1.4 L)');
      check(bill2.indexOf('Grand total') !== -1, 'bill shows a Grand total (labour + paint)');
      check(bill2.indexOf('already invoiced') !== -1, 'the earlier invoice is called out, not re-billed');
      const bd = E2.billFor(proj.id);
      check(bd.totals.paintCost > 0, 'approved paint cost is non-zero: ' + bd.totals.paintCost);
      check(Math.abs(bd.totals.total - (bd.totals.labour + bd.totals.paintCost)) < 1e-6,
        'grand total = labour + paint (' + bd.totals.total + ')');

      // ---- 14. paint quantity reaches the painter report ----
      document.querySelector('#tabReport').click();
      await sleep(60);
      document.querySelector('#repTabPainter').click();
      await sleep(80);
      const rep2 = txt('erpReportOut');
      check(rep2.indexOf('Paint') !== -1, 'painter report has a Paint column');
      const pr = E2.reportByPainter().find((r) => r.crew === 'Gahonsh');
      check(!!pr && pr.approvedLitres > 0, 'painter report carries approved paint litres: ' + (pr && pr.approvedLitres));
      check(!!pr && rep2.indexOf(E2.fmtLitres(pr.approvedLitres)) !== -1,
        'painter report shows the approved paint litres (' + (pr && E2.fmtLitres(pr.approvedLitres)) + ')');
    } catch (err) {
      fail('threw: ' + (err && err.message));
      console.error(err);
    }
    finish();
  }, 250));
})();
