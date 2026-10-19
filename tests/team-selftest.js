/* ============================================================
   Browser self-test for the TEAM page's derived evidence row.
   Injected into a generated copy of team.html
   (see tests/run-team-selftest.sh).

   Seeds a roster, a work log and galleries, then checks that each
   member card shows DERIVED figures (years, projects, sq ft, photos)
   and that a member with no data shows no invented numbers.

   Results are written to a <pre id="team-selftest"> at the bottom.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[team-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  window.addEventListener('error', (e) => log('!! window error: ' + (e.message || e.error)));

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'team-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  // Seed unless all fixtures are already present. Checking the data (not a
  // session flag) means a re-run after a test that cleared the store re-seeds
  // instead of running against an empty store.
  const seededNow = (() => {
    try {
      const wl = localStorage.getItem('painterPlusWorkLog') || '';
      const gal = localStorage.getItem('painterPlusGallery') || '';
      return wl.indexOf('Sunrise Villa') !== -1 && gal.indexOf('Team fixture photo') !== -1;
    } catch (e) { return false; }
  })();
  if (!seededNow) {
    try {
      localStorage.setItem('painterPlusTeam', JSON.stringify([
        { id: 'gahonsh', name: 'Gahonsh', role: 'head', startYear: '2015', title: 'Head & Founder' },
        { id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', startYear: '2018', title: 'Senior Painter' },
        { id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter', title: 'Painter' }
      ]));
      localStorage.setItem('painterPlusWorkLog', JSON.stringify({
        '2026-10-10': { date: '2026-10-10', project: 'Sunrise Villa', projectId: 'sunrise-villa', crew: 'ramesh-kumar', status: 'submitted',
          entries: [ { id: 'e1', area: 'wall', label: 'Wall', sqft: 100, crew: 'ramesh-kumar' } ] },
        '2026-10-11': { date: '2026-10-11', project: 'Sunrise Villa', projectId: 'sunrise-villa', crew: 'ramesh-kumar', status: 'open',
          entries: [ { id: 'e2', area: 'wall', label: 'Wall', sqft: 20, crew: 'ramesh-kumar' } ] }
      }));
      localStorage.setItem('painterPlusERP', JSON.stringify({
        projects: [{ id: 'sunrise-villa', name: 'Sunrise Villa' }], approvals: {}, bills: {}
      }));
      localStorage.setItem('painterPlusGallery', JSON.stringify({
        'ramesh-kumar': [{ id: 'g1', title: 'Team fixture photo', photo: 'https://example.com/a.jpg', sqft: 120, at: '2026-10-10T09:00:00Z' }]
      }));
    } catch (e) {}
    sessionStorage.setItem('teamSelftestSeeded', '1');
    location.reload();
    return;
  }

  async function run() {
    await sleep(150);
    const G = window.PPGallery;
    check(!!G, 'PPGallery is loaded on the team page');

    const cards = document.querySelectorAll('#tmGrid .tm-card');
    check(cards.length === 3, 'all three members render (got ' + cards.length + ')');

    const byName = {};
    cards.forEach((c) => { byName[c.querySelector('h3').textContent.trim()] = c.textContent.replace(/\s+/g, ' '); });

    const ramesh = byName['Ramesh Kumar'] || '';
    const nowYear = new Date().getFullYear();
    check(ramesh.indexOf((nowYear - 2018) + '+ yrs') !== -1, 'Ramesh shows derived years (' + (nowYear - 2018) + '+ yrs)');
    check(ramesh.indexOf('1 project') !== -1, 'Ramesh shows 1 project');
    check(ramesh.indexOf('120 sq ft') !== -1, 'Ramesh shows 120 sq ft of logged work');
    check(ramesh.indexOf('📸') !== -1, 'Ramesh shows a photo count from the gallery');

    const suresh = byName['Suresh Mahto'] || '';
    check(suresh.indexOf('yrs') === -1 && suresh.indexOf('sq ft') === -1,
      'a member with no data shows no invented figures');

    // The derived row must match the engine, not a separate calculation.
    const r = G.workRecord('ramesh-kumar');
    check(r.sqft === 120 && r.projects === 1 && r.years === (nowYear - 2018),
      'the card figures match PPGallery.workRecord');

    finish();
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
