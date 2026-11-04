/* ============================================================
   CORRUPT-STORE SEED
   ------------------------------------------------------------
   Every storage key the site reads, filled with hostile / malformed
   data: nulls and scalars where arrays and objects belong, non-string
   colours, a non-array `entries`, a `null` work-log day, a `null`
   project, a non-array member gallery.

   `localStorage` is untrusted input — it can be hand-edited, half
   written by a failed save, or left behind by an older build. The
   site loads page scripts site-wide, so a single unguarded access on
   such data aborts the whole file and silently kills unrelated
   features. tests/corrupt-store-selftest.js loads every page with this
   seed in place and fails if any page throws.
   ============================================================ */
(function () {
  'use strict';
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } }

  set('painterPlusTeam', JSON.stringify([
    // The founder is the default member painter-profile.html renders, so give
    // its text fields hostile non-string values: `String({})` is the literal
    // "[object Object]", which used to reach the tagline/bio/quote/note.
    { id: 'gahonsh', name: 'Gahonsh', role: 'head', tagline: {}, bio: [], quote: {}, note: {}, title: {}, startYear: {} },
    { id: null, name: null, role: 'painter' },
    { id: {}, name: [], role: 123 },
    { id: 'x', name: 'X', role: 'painter', startYear: {}, photo: 5, title: null, tagline: [], order: 'a' }
  ]));

  set('painterPlusWorkLog', JSON.stringify({
    '2026-10-10': {
      date: '2026-10-10', status: 'submitted', crew: {}, projectId: [], project: null,
      rate: 'abc', coverage: null, coats: {},
      entries: [
        { id: null, area: 9, label: {}, w: 'x', h: [], sqft: '12.5', method: 'measured', photo: 5, note: [], measure: { calib: { w: {}, h: [] }, points: null } },
        { id: 'e2', sqft: null, w: '3', h: '4' },
        null
      ]
    },
    '2026-10-11': { date: '2026-10-11', status: null, crew: null, entries: 'not-an-array' },
    'bad-date': {},
    '2026-10-12': null
  }));

  set('painterPlusERP', JSON.stringify({
    projects: [
      { id: null, name: {}, rate: 'x', coverage: [], coats: null, paintRate: {}, status: 7, client: [] },
      { id: 'p2', name: 'P2', rate: 12, coverage: 130, coats: 2, paintRate: 400, status: 'active' },
      null
    ],
    approvals: { '2026-10-10': { status: 'approved', by: {}, at: [], sig: null }, '2026-10-11': 5 },
    bills: { p2: [{ id: null, no: {}, amount: 'x', sqft: [], date: 5 }, null], bad: 7 }
  }));

  set('painterPlusGallery', JSON.stringify({
    gahonsh: [
      { id: null, title: {}, photo: 5, meta: [], sqft: 'x', area: {}, label: [], at: null },
      { id: 'g1', title: 'ok', photo: 'https://x/y.jpg', sqft: 10 },
      null
    ],
    nope: 'not-an-array',
    nullmember: null
  }));

  set('painterPlusProjects', JSON.stringify([
    { id: null, title: {}, image: 5, category: [], challenge: {}, solution: null, result: [], tag: {} },
    null, 'x', 7
  ]));

  set('pp_studio', JSON.stringify({
    colours: { living: { wall: 42, floor: null, accent: {} } },
    scene: 99, surface: {}, areas: { living: { wall: { w: {}, h: [] } } }, finish: null, light: []
  }));

  set('painterPlusProfile', JSON.stringify({ name: {}, title: [], bio: null }));

  // Reviews store: hostile shapes. A review that is a scalar, an object where
  // the author/text belongs, a non-array subject, and a score that is not a
  // number. The rating layer must drop/normalise these, never print
  // "[object Object]" and never throw.
  set('painterPlusReviews', JSON.stringify({
    'painter:gahonsh': [
      { id: {}, type: 'painter', key: 'gahonsh', author: {}, authorId: [], score: {}, text: {}, at: [] },
      { id: 'r1', type: 'painter', key: 'gahonsh', author: 'X', authorId: 'acc', score: 9, text: 'clamped', at: 5 },
      null, 7, 'x'
    ],
    'company:painter-plus': 'not-an-array',
    'painter:ramesh-kumar': { nope: true }
  }));

  // Auth store: hostile shapes. A `null`/scalar where an account belongs, a
  // non-string role/status/privacy, a plaintext pw record, a recovery record
  // that is a string, and an audit log that is not JSON at all.
  set('painterPlusAuth', JSON.stringify([
    null, 5, 'x', [],
    { id: 'ok', username: 'ok', email: 'ok@example.com', name: 'OK', role: 'painter', status: 'active', privacy: 'public' },
    { id: {}, username: [], email: {}, name: null, role: 9, status: [], privacy: {}, editRights: 'no', pw: 'plaintext', recovery: 'nope' }
  ]));
  set('painterPlusAudit', 'not json at all');

  try {
    sessionStorage.setItem('ppAdminUnlocked', '1');
    sessionStorage.setItem('ppClaimedMember', JSON.stringify({}));
    // A hostile auth session: valid-looking id that does not exist, plus a
    // scalar that is not JSON.
    sessionStorage.setItem('ppAuthSession', JSON.stringify({ id: {}, at: [], exp: 'soon', token: 7 }));
  } catch (e) { /* blocked */ }
})();
