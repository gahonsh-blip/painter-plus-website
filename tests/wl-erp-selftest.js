/* TEMPORARY harness: proves the work log picks up an ERP project and
   stamps projectId on the saved day, and that the day then shows up in
   the ERP bill for that project. Injected into a copy of worklog.html. */
(function () {
  'use strict';
  const out = [];
  const log = (m) => out.push(m);
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (c, m) => c ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'wl-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' + (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  const dirty = (() => { try { return !!(localStorage.getItem('painterPlusERP') || localStorage.getItem('painterPlusWorkLog')); } catch (e) { return false; } })();
  if (dirty || sessionStorage.getItem('wlSelftestClean') !== '1') {
    try { localStorage.removeItem('painterPlusERP'); localStorage.removeItem('painterPlusWorkLog'); } catch (e) {}
    if (dirty) { sessionStorage.setItem('wlSelftestClean', '1'); window.addEventListener('load', () => location.reload()); return; }
  }

  window.addEventListener('load', () => setTimeout(async () => {
    const E = window.PPERP, WL = window.PPWorkLog, Team = window.PPTeam;
    if (!E || !WL) { fail('modules missing ERP=' + !!E + ' WorkLog=' + !!WL); finish(); return; }
    try {
      // Seed an ERP project first, exactly as the ERP page would.
      E.saveProject({ name: 'Arki Villa', client: 'Mr Kumar', rate: 15, coats: 2, coverage: 130 });

      // Unlock the work-log gate.
      $('wlPass').value = 'painter123'; // the real staff passcode
      $('wlUnlock').click();
      await sleep(150);
      check(!$('wlPanel').hidden, 'work-log gate unlocks');

      // The picker must list the ERP project.
      const pick = $('wlProjectPick');
      check(pick && pick.options.length === 2, 'project picker has the ERP project (options=' + (pick ? pick.options.length : 'n/a') + ')');
      const opt = Array.from(pick.options).find(o => o.textContent === 'Arki Villa');
      check(!!opt, 'picker lists "Arki Villa"');

      // Choose it, add a photo entry with 10 x 8 ft, save.
      pick.value = opt.value;
      pick.dispatchEvent(new Event('change', { bubbles: true }));
      $('wlW').value = '10';
      $('wlH').value = '8';
      $('wlW').dispatchEvent(new Event('input', { bubbles: true }));
      $('wlH').dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      $('wlAdd').click();
      await sleep(150);

      const date = $('wlDate').value;
      const day = WL.getDay(date);
      check(day.projectId === opt.value, 'saved day carries the ERP projectId (' + day.projectId + ')');
      check(day.entries.length === 1 && day.entries[0].sqft === 80, 'entry saved with 80 sq ft');

      // Final submit, then confirm the ERP bills it once approved.
      WL.submitDay(date, 'gahonsh');
      const b0 = E.billFor(opt.value);
      check(b0.totals.labour === 0, 'ERP bill is ₹0 while the day is unapproved');
      check(b0.pending.count === 1 && b0.pending.sqft === 80, 'ERP shows the 80 sq ft day as pending');
      E.approveDay(date, 'gahonsh');
      const b1 = E.billFor(opt.value);
      check(b1.totals.sqft === 80 && b1.totals.labour === 1200, 'after approval ERP bills 80 sq ft x ₹15 = ₹1200 (got ' + b1.totals.labour + ')');

      // History shows the approval badge. A real crew member comes back to this
      // tab (focus) after approving on the ERP page, so dispatch that.
      window.dispatchEvent(new Event('focus'));
      await sleep(80);
      const hist = $('wlHistory').textContent;
      check(hist.indexOf('approved') !== -1, 'work-log history shows the ERP approval badge');

      // REGRESSION (BUG_AUDIT §17): reopening an approved day must withdraw
      // the sign-off, and editing it must not keep billing the old amount.
      WL.reopenDay(date);
      await sleep(40);
      check(E.approvalOf(date).status === 'pending', 'reopen withdraws the ERP approval');
      const day2 = WL.getDay(date);
      day2.entries[0].sqft = 160;
      WL.saveDay(day2);
      WL.submitDay(date, 'gahonsh');
      const b2 = E.billFor(opt.value);
      check(b2.totals.labour === 0, 'an edited day is not billed on the old approval (got ' + b2.totals.labour + ')');
      check(b2.pending.sqft === 160, 'the edited 160 sq ft day waits for fresh approval');
      E.approveDay(date, 'gahonsh');
      const b3 = E.billFor(opt.value);
      check(b3.totals.labour === 2400, 'fresh approval bills 160 x ₹15 = ₹2400 (got ' + b3.totals.labour + ')');

      // REGRESSION (BUG_AUDIT §18): two bills raised together must keep
      // distinct ids and must not reuse a deleted invoice number.
      const i1 = E.addBill(opt.value, { amount: 100 });
      const i2 = E.addBill(opt.value, { amount: 200 });
      check(i1.bill.id !== i2.bill.id, 'two invoices raised together get distinct ids');
      E.removeBill(opt.value, i1.bill.id);
      const i3 = E.addBill(opt.value, { amount: 300 });
      const nos = E.billFor(opt.value).bills.map((x) => x.no);
      check(new Set(nos).size === nos.length, 'invoice numbers stay unique (' + nos.join(', ') + ')');
      check(i3.bill.no === 'PP-003', 'a deleted invoice number is not reused (got ' + i3.bill.no + ')');
    } catch (err) {
      fail('threw: ' + (err && err.message));
      console.error(err);
    }
    finish();
  }, 250));
})();
