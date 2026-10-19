/* ============================================================
   Tests for js/gallery.js — run with:  node tests/gallery.test.js
   No dependencies; uses Node's built-in assert.

   The important idea under test: the work record is DERIVED from the
   work log, so the numbers a client sees are evidence, not a typed
   claim. The CRUD + derivation tests below lock that in.
   ============================================================ */
const assert = require('assert');
const G = require('../js/gallery.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}

function memStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

// A small world: two members, three days, two projects.
function seedWorld() {
  const worklog = {
    '2026-10-10': {
      date: '2026-10-10', projectId: 'sharma-house', project: 'Sharma House',
      crew: 'ramesh-kumar', status: 'submitted',
      entries: [
        { id: 'e1', area: 'wall', label: 'Wall', sqft: 100, photo: 'p1', crew: 'ramesh-kumar' },
        { id: 'e2', area: 'ceiling', label: 'Ceiling', sqft: 40, photo: 'p2', crew: 'suresh-mahto' }
      ]
    },
    '2026-10-11': {
      date: '2026-10-11', projectId: 'sharma-house', project: 'Sharma House',
      crew: 'ramesh-kumar', status: 'open',
      entries: [{ id: 'e3', area: 'wall', label: 'Wall', w: 5, h: 4, crew: 'ramesh-kumar' }]
    },
    '2026-10-12': {
      date: '2026-10-12', project: 'Verma Flat',
      crew: 'suresh-mahto', status: 'submitted',
      entries: [{ id: 'e4', area: 'ceiling', label: 'Ceiling', sqft: 80, photo: 'p4', crew: 'suresh-mahto' }]
    }
  };
  const erp = {
    projects: [
      { id: 'sharma-house', name: 'Sharma House' },
      { id: 'verma-flat', name: 'Verma Flat' }
    ],
    approvals: {}, bills: {}
  };
  const team = [
    { id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', startYear: '2018' },
    { id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter' },
    { id: 'gahonsh', name: 'Gahonsh', role: 'head', startYear: '2015' }
  ];
  const gallery = {
    'ramesh-kumar': [
      { id: 'g1', title: 'Living room', photo: 'x', sqft: 100, at: '2026-10-10T09:00:00Z' }
    ]
  };
  const store = memStore({
    painterPlusWorkLog: JSON.stringify(worklog),
    painterPlusERP: JSON.stringify(erp),
    painterPlusTeam: JSON.stringify(team),
    painterPlusGallery: JSON.stringify(gallery)
  });
  G._setStore(store);
  return store;
}

// ============================================================
// FORMATTERS
// ============================================================
test('fmtSqft rounds to one decimal', () => assert.strictEqual(G.fmtSqft(30.14), '30.1 sq ft'));
test('fmtCount drops decimals', () => assert.strictEqual(G.fmtCount(12.7), '13'));
test('num rejects negatives and junk', () => {
  assert.strictEqual(G.num(-5), 0);
  assert.strictEqual(G.num('abc'), 0);
  assert.strictEqual(G.num('12'), 12);
});
test('year accepts plausible years only', () => {
  assert.strictEqual(G.year('2018'), 2018);
  assert.strictEqual(G.year('12'), 0);
  assert.strictEqual(G.year(''), 0);
});

// ============================================================
// GALLERY CRUD
// ============================================================
test('add stores an item under the member', () => {
  seedWorld();
  const r = G.add('ajay-munda', { title: 'Feature wall', photo: 'data:x', sqft: 50 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(G.list('ajay-munda').length, 1);
  assert.ok(r.item.id, 'an id is assigned');
  assert.ok(r.item.at, 'a timestamp is assigned');
});
test('add rejects an empty item', () => {
  seedWorld();
  const r = G.add('ajay-munda', { title: '', photo: '' });
  assert.strictEqual(r.ok, false);
});
test('list is newest-first', () => {
  seedWorld();
  G.add('x', { title: 'old', at: '2026-01-01T00:00:00Z' });
  G.add('x', { title: 'new', at: '2026-06-01T00:00:00Z' });
  const titles = G.list('x').map((i) => i.title);
  assert.deepStrictEqual(titles, ['new', 'old']);
});
test('add with an existing id updates in place', () => {
  seedWorld();
  G.add('x', { id: 'fixed', title: 'first' });
  G.add('x', { id: 'fixed', title: 'second' });
  const items = G.list('x');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].title, 'second');
});
test('remove deletes one item', () => {
  seedWorld();
  const a = G.add('x', { title: 'a' }).item;
  G.add('x', { title: 'b' });
  G.remove('x', a.id);
  assert.deepStrictEqual(G.list('x').map((i) => i.title), ['b']);
});
test('removeAll clears a member', () => {
  seedWorld();
  G.add('x', { title: 'a' });
  G.removeAll('x');
  assert.strictEqual(G.list('x').length, 0);
});
test('feed flattens every member, newest first, tagged', () => {
  seedWorld();
  G.removeAll('ramesh-kumar');       // drop the seeded item so the assert is deterministic
  G.add('a', { title: 'a1', at: '2026-01-01T00:00:00Z' });
  G.add('b', { title: 'b1', at: '2026-05-01T00:00:00Z' });
  const feed = G.feed();
  assert.strictEqual(feed[0].title, 'b1');
  assert.strictEqual(feed[0].memberId, 'b');
  assert.ok(feed.every((x) => x.memberId));
});

// ============================================================
// WORK RECORD — derived, not typed
// ============================================================
test('record credits the day owner with the whole day', () => {
  seedWorld();
  const r = G.workRecord('ramesh-kumar');
  // 2026-10-10: his own entry e1 = 100 (e2 belongs to Suresh)
  // 2026-10-11: his own day, untagged entry = 5x4 = 20
  assert.strictEqual(r.sqft, 120);
  assert.strictEqual(r.daysOnSite, 2);
  assert.strictEqual(r.submittedDays, 1);
});
test('an entry tagged to another painter is not double-counted', () => {
  seedWorld();
  // On 2026-10-10 the day crew is Ramesh but e2 is tagged to Suresh, so it
  // must leave Ramesh's credit — otherwise a shared day inflates both.
  const ramesh = G.workRecord('ramesh-kumar');
  const suresh = G.workRecord('suresh-mahto');
  assert.strictEqual(ramesh.sqft, 120);        // 100 + 20
  assert.strictEqual(suresh.sqft, 120);        // 40 + 80
  assert.strictEqual(ramesh.sqft + suresh.sqft, 240);  // = total logged, no overlap
});
test('record credits a per-entry crew only their own entry', () => {
  seedWorld();
  const r = G.workRecord('suresh-mahto');
  // 2026-10-10 entry e2 = 40, plus his own day 2026-10-12 = 80
  assert.strictEqual(r.sqft, 120);
  assert.strictEqual(r.daysOnSite, 2);
});
test('record counts distinct projects', () => {
  seedWorld();
  assert.strictEqual(G.workRecord('ramesh-kumar').projects, 1);
  assert.strictEqual(G.workRecord('suresh-mahto').projects, 2);
});
test('record resolves project names through the ERP', () => {
  seedWorld();
  const labels = G.workRecord('suresh-mahto').projectLabels.map((p) => p.name).sort();
  assert.deepStrictEqual(labels, ['Sharma House', 'Verma Flat']);
});
test('record counts photos the member is credited with', () => {
  seedWorld();
  // Ramesh: day 10 photo p1. His own day 11 has no photo.
  assert.strictEqual(G.workRecord('ramesh-kumar').photos, 1);
  // Suresh: entry p2 on day 10 + own day 12 photo p4.
  assert.strictEqual(G.workRecord('suresh-mahto').photos, 2);
});
test('record counts co-workers on shared projects', () => {
  seedWorld();
  const r = G.workRecord('ramesh-kumar');
  // Suresh shares Sharma House; Gahonsh never logged.
  assert.strictEqual(r.coworkers, 1);
  assert.deepStrictEqual(r.coworkerIds, ['suresh-mahto']);
  assert.strictEqual(r.sharedProjects, 1);
});
test('years experience comes from the declared start year', () => {
  seedWorld();
  const now = new Date().getFullYear();
  assert.strictEqual(G.workRecord('ramesh-kumar').startYear, 2018);
  assert.strictEqual(G.workRecord('ramesh-kumar').years, now - 2018);
});
test('years fall back to the earliest logged day', () => {
  seedWorld();
  // Suresh has no startYear; earliest day is 2026-10-10.
  assert.strictEqual(G.workRecord('suresh-mahto').startYear, 2026);
});
test('a member with no work has an empty record', () => {
  seedWorld();
  const r = G.workRecord('ghost');
  assert.strictEqual(r.sqft, 0);
  assert.strictEqual(r.projects, 0);
  assert.strictEqual(r.daysOnSite, 0);
  assert.strictEqual(r.galleryCount, 0);
});
test('the gallery count is the member\'s own items', () => {
  seedWorld();
  assert.strictEqual(G.workRecord('ramesh-kumar').galleryCount, 1);
});

// ============================================================
// STORAGE SAFETY
// ============================================================
test('a blocked store does not throw', () => {
  G._setStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => G.list('x'));
  assert.doesNotThrow(() => G.workRecord('x'));
  // A write that cannot persist must be reported, not silently claimed as saved.
  const res = G.add('x', { title: 'ok' });
  assert.strictEqual(res.ok, false);
  assert.ok(/storage/i.test(res.error));
});
test('corrupt stored JSON falls back to empty', () => {
  G._setStore(memStore({ painterPlusGallery: 'not json{{{' }));
  assert.deepStrictEqual(G.list('x'), []);
  assert.deepStrictEqual(G.feed(), []);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
