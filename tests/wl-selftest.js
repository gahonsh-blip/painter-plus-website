/* ============================================================
   TEMPORARY self-test harness for the work-log measurement flow.
   Injected into a generated copy of worklog.html (see tests/run-wl-selftest.sh).
   It drives the REAL page: unlock, load a synthetic perspective photo,
   tap the calibration corners and the painted area, save, then report the
   measured square feet. Results are written to #wl-selftest.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[selftest] ' + m); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.5);

  // Synthetic "photo": a 10 ft x 6 ft wall seen at an angle, on an 800x500 canvas.
  const CW = 800, CH = 500;
  const QUAD = [[100, 80], [700, 60], [760, 440], [60, 460]];

  function makePhoto() {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const g = c.getContext('2d');
    g.fillStyle = '#1f2937'; g.fillRect(0, 0, CW, CH);
    g.beginPath();
    g.moveTo(QUAD[0][0], QUAD[0][1]);
    for (let i = 1; i < 4; i++) g.lineTo(QUAD[i][0], QUAD[i][1]);
    g.closePath();
    g.fillStyle = '#c8b48a'; g.fill();
    return c.toDataURL('image/png');
  }

  // Dispatch a pointerdown at a canvas-pixel coordinate, mapping through the
  // element's on-screen rect exactly as a real tap would.
  function tapCanvas(canvas, px, py) {
    const r = canvas.getBoundingClientRect();
    const sx = r.width / canvas.width, sy = r.height / canvas.height;
    const ev = new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true,
      clientX: r.left + px * sx, clientY: r.top + py * sy
    });
    canvas.dispatchEvent(ev);
  }

  async function waitFor(fn, ms) {
    const end = Date.now() + (ms || 3000);
    while (Date.now() < end) { if (fn()) return true; await sleep(40); }
    return false;
  }

  async function run() {
    try {
      // Unlock
      document.getElementById('wlPass').value = 'painter123';
      document.getElementById('wlUnlock').click();
      if (!(await waitFor(() => !document.getElementById('wlPanel').hidden))) { log('FAIL unlock'); return done(); }
      log('ok unlock');

      // Day labour rate
      const rate = document.getElementById('wlRate');
      rate.value = '12';
      rate.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(40);
      // A rate typed before any entry must not create a phantom day.
      if (/No days logged/.test(document.getElementById('wlHistory').textContent)) log('ok no phantom day from rate alone');
      else log('FAIL phantom day created by rate only');

      // Load the photo via the URL field
      const url = document.getElementById('wlPhotoUrl');
      url.value = makePhoto();
      url.dispatchEvent(new Event('input', { bubbles: true }));

      const canvas = document.getElementById('wlCanvas');
      if (!(await waitFor(() => canvas.width === CW && canvas.height === CH))) {
        log('FAIL photo did not load into canvas (' + canvas.width + 'x' + canvas.height + ')'); return done();
      }
      log('ok photo loaded ' + canvas.width + 'x' + canvas.height);

      // Set scale: tap the 4 corners of the known 10 x 6 ft wall
      document.getElementById('wlCalibBtn').click();
      QUAD.forEach(p => tapCanvas(canvas, p[0], p[1]));
      const cw = document.getElementById('wlCalibW'), ch = document.getElementById('wlCalibH');
      cw.value = '10'; cw.dispatchEvent(new Event('input', { bubbles: true }));
      ch.value = '6'; ch.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);

      // Draw the whole wall
      document.getElementById('wlDrawBtn').click();
      QUAD.forEach(p => tapCanvas(canvas, p[0], p[1]));
      await sleep(60);
      const shown = document.getElementById('wlMeasuredSqft').textContent;
      log('full wall measured: ' + shown + ' (expected 60 sq ft)');
      if (!near(parseFloat(shown), 60, 0.5)) log('FAIL full-wall area');
      else log('ok full-wall area');

      // Draw a half patch: left half of the wall -> 30 sq ft
      document.getElementById('wlClearBtn').click();
      const mid = [
        [QUAD[0][0], QUAD[0][1]],
        [(QUAD[0][0] + QUAD[1][0]) / 2, (QUAD[0][1] + QUAD[1][1]) / 2],
        [(QUAD[3][0] + QUAD[2][0]) / 2, (QUAD[3][1] + QUAD[2][1]) / 2],
        [QUAD[3][0], QUAD[3][1]]
      ];
      mid.forEach(p => tapCanvas(canvas, p[0], p[1]));
      await sleep(60);
      const half = parseFloat(document.getElementById('wlMeasuredSqft').textContent);
      log('half wall measured: ' + half + ' (expected ~30 sq ft)');
      if (!near(half, 30, 1.0)) log('FAIL half-wall area');
      else log('ok half-wall area');

      // Use it and save the entry
      const useBtn = document.getElementById('wlUseMeasured');
      if (useBtn.disabled) { log('FAIL use button disabled'); return done(); }
      useBtn.click();
      await sleep(40);
      log('sqft field after Use: ' + document.getElementById('wlSqft').value +
          ' | source: ' + document.getElementById('wlSqftSrc').textContent);
      document.getElementById('wlAdd').click();
      await sleep(120);

      const items = document.getElementById('wlItems').textContent.replace(/\s+/g, ' ').trim();
      log('entry: ' + items);
      const totals = document.getElementById('wlTotals').textContent.replace(/\s+/g, ' ').trim();
      log('totals: ' + totals);
      if (/measured/.test(items)) log('ok measured badge shown'); else log('FAIL no measured badge');
      if (/₹/.test(totals)) log('ok labour shown in totals'); else log('FAIL no labour row');

      // ---- Edit restores the saved measurement overlay ----
      document.querySelector('#wlItems button.edit').click();
      await sleep(300);
      const editSrc = document.getElementById('wlSqftSrc').textContent;
      const editMeasured = parseFloat(document.getElementById('wlMeasuredSqft').textContent);
      const editSqft = document.getElementById('wlSqft').value;
      log('after edit: source=' + editSrc + ' measured=' + editMeasured + ' sqft field=' + editSqft);
      if (editSrc === 'Measured on photo' && near(editMeasured, 30, 1.0)) log('ok measurement restored on edit');
      else log('FAIL measurement not restored');
      document.getElementById('wlCancelEdit').click();
      await sleep(40);

      // ---- Final submit locks the day; reopen unlocks it ----
      window.confirm = () => true;
      document.getElementById('wlSubmit').click();
      await sleep(120);
      const status = document.getElementById('wlStatus').textContent;
      log('after submit: status=' + status + ' reopenHidden=' + document.getElementById('wlReopen').hidden);
      if (/Submitted/.test(status) && !document.getElementById('wlReopen').hidden) log('ok submit locks day');
      else log('FAIL submit');
      document.getElementById('wlReopen').click();
      await sleep(120);
      log('after reopen: status=' + document.getElementById('wlStatus').textContent);
      if (/Open/.test(document.getElementById('wlStatus').textContent)) log('ok reopen'); else log('FAIL reopen');

      // ---- Summary carries labour and paint ----
      const s = window.PPWorkLog.summary(window.PPWorkLog.getDay(window.PPWorkLog.todayKey()));
      log('summary: ' + s.replace(/\n/g, ' | '));
      if (/Labour:/.test(s) && /Paint estimate:/.test(s)) log('ok summary has labour + paint'); else log('FAIL summary');

      done();
    } catch (e) {
      log('EXCEPTION: ' + (e && e.message));
      done();
    }
  }

  function done() {
    const el = document.createElement('pre');
    el.id = 'wl-selftest';
    el.textContent = out.join('\n');
    document.body.appendChild(el);
    window.__wlSelftest = out.join('\n');
  }

  const errs = [];
  window.addEventListener('error', e => errs.push('PAGEERROR ' + e.message));
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { run().then(() => { if (errs.length) { const el = document.getElementById('wl-selftest'); if (el) el.textContent += '\n' + errs.join('\n'); } }); }, 200);
  });
})();
