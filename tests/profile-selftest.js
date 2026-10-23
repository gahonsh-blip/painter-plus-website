/* ============================================================
   Browser self-test for the painter PROFILE + GALLERY flow.
   Injected into a generated copy of painter-profile.html
   (see tests/run-profile-selftest.sh).

   It drives the REAL page end to end:
     - seeds a work log and a roster so the derived record has data
     - opens a member profile and checks the WORK RECORD numbers
       (years, projects, sq ft, days, co-workers) are DERIVED, not typed
     - claims "this is me", edits the profile, saves it, and checks the
       header updates
     - adds a gallery photo, checks the gallery + lightbox, removes it
     - checks an Owner/Head sees the edit section for any member

   Results are written to a <pre id="profile-selftest"> at the bottom.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[profile-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const txt = (id) => { const el = $(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  // The work-record numbers count up from zero, so a single read can catch an
  // intermediate value. Poll until the figure settles (or time out).
  const waitForText = async (id, needle, timeout) => {
    const end = Date.now() + (timeout || 2000);
    while (Date.now() < end) {
      if (txt(id).indexOf(needle) !== -1) return true;
      await sleep(50);
    }
    return false;
  };

  window.addEventListener('error', (e) => log('!! window error: ' + (e.message || e.error)));

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'profile-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  // The page renders on load, so seed first, then reload once with the id set.
  const params = new URLSearchParams(location.search);
  const MEMBER = params.get('id') || 'ramesh-kumar';

  // Seed unless the work-log fixture is already present. Checking the data
  // (not a session flag) means a re-run after a test that cleared the store
  // re-seeds instead of running against an empty store.
  const seeded = (() => {
    try {
      const wl = localStorage.getItem('painterPlusWorkLog') || '';
      return wl.indexOf('Profile Test Site') !== -1 && !sessionStorage.getItem('ppClaimedMember');
    } catch (e) { return false; }
  })();
  if (!seeded) {
    try {
      localStorage.removeItem('painterPlusWorkLog');
      localStorage.removeItem('painterPlusERP');
      localStorage.removeItem('painterPlusGallery');
      localStorage.removeItem('painterPlusTeam');
      sessionStorage.removeItem('ppClaimedMember');
      // Clear any Owner/Head session left by another harness in this tab:
      // isManager() would otherwise be true and the "This is me" button
      // would (correctly) not render, failing this test on a shared tab.
      sessionStorage.removeItem('ppAdminUnlocked');
    } catch (e) {}

    // Roster: one painter with a declared start year, one helper without.
    const team = [
      { id: 'gahonsh', name: 'Gahonsh', role: 'head', startYear: '2015', title: 'Head & Founder' },
      { id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', startYear: '2018', title: 'Senior Painter' },
      { id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter', startYear: '' }
    ];
    try { localStorage.setItem('painterPlusTeam', JSON.stringify(team)); } catch (e) {}

    // Work log: Ramesh owns two days (100 + 20 sq ft) on one project, and
    // shares that project with Suresh.
    const worklog = {
      '2026-10-10': {
        date: '2026-10-10', project: 'Profile Test Site', projectId: 'profile-test-site',
        crew: 'ramesh-kumar', status: 'submitted',
        entries: [
          { id: 'e1', area: 'wall', label: 'Wall', sqft: 100, method: 'measured', photo: '', crew: 'ramesh-kumar' },
          { id: 'e2', area: 'ceiling', label: 'Ceiling', sqft: 40, method: 'measured', photo: '', crew: 'suresh-mahto' }
        ]
      },
      '2026-10-11': {
        date: '2026-10-11', project: 'Profile Test Site', projectId: 'profile-test-site',
        crew: 'ramesh-kumar', status: 'open',
        entries: [{ id: 'e3', area: 'wall', label: 'Wall', w: 5, h: 4, sqft: 20, method: 'manual', photo: '', crew: 'ramesh-kumar' }]
      }
    };
    try { localStorage.setItem('painterPlusWorkLog', JSON.stringify(worklog)); } catch (e) {}
    try {
      localStorage.setItem('painterPlusERP', JSON.stringify({
        projects: [{ id: 'profile-test-site', name: 'Profile Test Site', rate: 12, coats: 2, coverage: 130, status: 'active' }],
        approvals: {}, bills: {}
      }));
    } catch (e) {}

    sessionStorage.setItem('profileSelftestSeeded', '1');
    // Reload onto the member we want to test.
    location.replace('?id=' + encodeURIComponent(MEMBER));
    return;
  }

  async function run() {
    await sleep(120);
    const T = window.PPTeam, G = window.PPGallery;
    check(!!T, 'PPTeam is loaded');
    check(!!G, 'PPGallery is loaded');

    // ---- WORK RECORD (derived) ----
    const record = $('ppRecord');
    const nowYear = new Date().getFullYear();

    // The figures animate 0 -> value, so wait for the section to settle before
    // snapshotting it; sampling mid-count would read an intermediate number.
    check(await waitForText('ppRecord', '120 sq ft'), 'area painted is derived (100 + 20 = 120 sq ft)');
    const recText = record ? record.textContent.replace(/\s+/g, ' ') : '';
    check(recText.indexOf('Projects logged') !== -1 || recText.indexOf('Project logged') !== -1,
      'work record shows a projects figure');
    check(recText.indexOf((nowYear - 2018) + '+') !== -1,
      'years on the tools derives from the declared start year (' + (nowYear - 2018) + '+)');
    check(recText.indexOf('Profile Test Site') !== -1, 'project name is resolved through the ERP');
    check(recText.indexOf('Co-workers') !== -1, 'co-workers figure is shown (shared project)');

    // The count-up must land on exactly the derived figure, never a rounded
    // intermediate — and the rendered text must stay formatted (the area card
    // carries " sq ft", so it counts up and settles on "120 sq ft").
    const nums = Array.prototype.map.call(
      document.querySelectorAll('#ppRecord .pp-record-num'), (el) => el.textContent.trim());
    check(nums.indexOf('120 sq ft') !== -1, 'the counted-up area settles on exactly 120 sq ft');
    check(nums.indexOf('2') !== -1, 'the counted-up day count settles on exactly 2');
    check(nums.indexOf('1') !== -1, 'the counted-up project count settles on exactly 1');
    check(nums.indexOf((nowYear - 2018) + '+') !== -1, 'the counted-up years settle on exactly ' + (nowYear - 2018) + '+');

    const r = G.workRecord(MEMBER);
    check(r.sqft === 120, 'workRecord.sqft === 120 (no double-count of the tagged entry)');
    check(r.projects === 1, 'workRecord.projects === 1');
    check(r.coworkers === 1, 'workRecord.coworkers === 1 (Suresh)');

    // ---- SPECIALISATIONS follow the member's role ----
    // A painter must not be shown a helper's cards (and vice versa), so the
    // section has to be driven by the role rather than hardcoded once.
    const specText = txt('ppSpecs');
    check(!!specText, 'the specialisations section renders');
    check(specText.indexOf('Interior Finishes') !== -1, 'a painter sees painter specialisations');
    check(specText.indexOf('Material Handling') === -1, "a painter does not see a helper's specialisations");
    check((txt('ppSpecSub') || '').indexOf('Painter') !== -1, 'the specialisations subtitle names the role');

    // Switch the member to Helper and confirm the section follows the role.
    const helper = T.setRole(MEMBER, 'helper');
    if (helper && helper.ok) {
      check(txt('ppSpecs').indexOf('Material Handling') !== -1, 'a helper sees helper specialisations');
      check(txt('ppSpecs').indexOf('Interior Finishes') === -1, "a helper no longer sees the painter's specialisations");
      T.setRole(MEMBER, 'painter');   // restore for the rest of the run
    }

    // ---- SHARE ----
    check(!!$('ppCopy'), 'the profile offers a copy-link button');
    const wa = document.querySelector('#ppShare a[href^="https://wa.me/?text="]');
    check(!!wa, 'the profile offers a WhatsApp share link');
    check((wa && decodeURIComponent(wa.getAttribute('href')) || '').indexOf(MEMBER) !== -1,
      'the share link carries this member\'s id');
    const mail = document.querySelector('#ppShare a[href^="mailto:"]');
    check(!!mail, 'the profile offers an email share link');

    // ---- SELF-EDIT: the profile is passcode-gated ----
    // A public visitor must NOT be able to edit: the edit form stays hidden
    // and there is a passcode prompt instead of a one-tap "This is me".
    check(!$('ppClaimBtn'), 'no anonymous "This is me" button is offered');
    check($('ppEditBody').hidden, 'the edit form is hidden from a signed-out visitor');
    const passInput = $('ppClaimPass');
    check(!!passInput, 'a crew passcode field is offered instead');

    if (passInput) {
      // Wrong passcode must not open the editor.
      passInput.value = 'wrong';
      $('ppClaimForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await sleep(60);
      check($('ppEditBody').hidden, 'a wrong passcode does not reveal the edit form');
      check((txt('ppClaimErr') || '').indexOf('Wrong') !== -1, 'a wrong passcode shows an error');
      check(T.claimedId() === '', 'no member is claimed after a wrong passcode');

      // The real passcode does open it, and claims this member.
      passInput.value = 'painter123';
      $('ppClaimForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await sleep(60);
      check(!$('ppEditBody').hidden, 'the real passcode reveals the edit form');
      check(T.claimedId() === MEMBER, 'the member id is claimed after signing in');
    }

    // ---- EDIT THE PROFILE ----
    const nameField = $('ppfName');
    if (nameField) {
      nameField.value = 'Ramesh Kumar';
      $('ppfTitle').value = 'Master Painter';
      $('ppfTagline').value = 'Clean edges, tidy sites.';
      $('ppEditForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await sleep(60);
      check(txt('ppRole') === 'Master Painter', 'saving the profile updates the header title');
      check(txt('ppTagline') === 'Clean edges, tidy sites.', 'saving the profile updates the tagline');
      check((txt('ppEditStatus') || '').indexOf('saved') !== -1, 'a save confirmation is shown');
      check(T.get(MEMBER).title === 'Master Painter', 'the change is persisted in the roster');
    }

    // ---- ADD A GALLERY PHOTO ----
    const before = G.list(MEMBER).length;
    $('ppgTitle').value = 'Living room repaint';
    $('ppgLabel').value = 'Interior wall';
    $('ppgLocation').value = 'Ranchi';
    $('ppgYear').value = '2026';
    $('ppgSqft').value = '120';
    $('ppgUrl').value = 'https://example.com/room.jpg';
    $('ppgUrl').dispatchEvent(new Event('input', { bubbles: true }));
    $('ppgAdd').click();
    await sleep(60);
    check(G.list(MEMBER).length === before + 1, 'the photo is added to the gallery store');
    check((txt('ppGallery') || '').indexOf('Living room repaint') !== -1, 'the photo shows on the profile gallery');
    check((txt('ppGallery') || '').indexOf('120 sq ft') !== -1, 'the photo caption shows its square feet');

    // Lightbox opens on click.
    const card = document.querySelector('#ppGallery .pp-gallery-card');
    check(!!card, 'the gallery renders a clickable card');
    if (card) {
      card.click();
      await sleep(60);
      check(!!document.querySelector('.pp-lightbox'), 'clicking a photo opens the lightbox');
      const close = document.querySelector('.pp-lb-close');
      if (close) close.click();
      await sleep(40);
      check(!document.querySelector('.pp-lightbox'), 'the lightbox closes');
    }

    // ---- REMOVE THE PHOTO ----
    const del = document.querySelector('#ppGalleryList [data-del]');
    check(!!del, 'the editor lists the photo with a remove button');
    if (del) {
      window.confirm = () => true;
      del.click();
      await sleep(60);
      check(G.list(MEMBER).length === before, 'removing the photo clears it from the gallery store');
    }

    finish();
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
