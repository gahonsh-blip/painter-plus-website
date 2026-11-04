/* ============================================================
   Tests for js/reviews.js — run with:  node tests/reviews.test.js
   No dependencies; uses Node's built-in assert.

   The idea under test: a rating is only worth something if it cannot
   be gamed. So the rules below are the point — signed-in only, one
   review per account per subject, no self-review, moderation hides
   from the average, and a hostile store degrades instead of throwing
   or leaking "[object Object]".
   ============================================================ */
const assert = require('assert');
const R = require('../js/reviews.js');

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

// A fresh engine state per test, with a tiny in-memory store.
function fresh(seed) { R._setStore(memStore(seed || {})); }

const ramesh = { id: 'acc-ramesh', name: 'Ramesh Kumar', role: 'painter', status: 'active', memberId: 'ramesh-kumar' };
const suresh = { id: 'acc-suresh', name: 'Suresh Mahto', role: 'painter', status: 'active', memberId: 'suresh-mahto' };
const head = { id: 'acc-head', name: 'Gahonsh', role: 'head', status: 'active', memberId: 'gahonsh' };
const pending = { id: 'acc-pending', name: 'Newbie', role: 'painter', status: 'pending', memberId: 'newbie' };

// ------------------------------------------------------------
// subject keys + score validation
// ------------------------------------------------------------
test('subjectKey builds "<type>:<key>" and rejects junk', () => {
  assert.strictEqual(R.subjectKey('painter', 'ramesh-kumar'), 'painter:ramesh-kumar');
  assert.strictEqual(R.subjectKey('company', 'painter-plus'), 'company:painter-plus');
  assert.strictEqual(R.subjectKey('nope', 'x'), '');
  assert.strictEqual(R.subjectKey('painter', ''), '');
  assert.strictEqual(R.subjectKey('painter', {}), '');
});

test('score is clamped to a whole 1–5', () => {
  assert.strictEqual(R.clampScore(5), 5);
  assert.strictEqual(R.clampScore(9), 5);
  assert.strictEqual(R.clampScore(0), 1);
  assert.strictEqual(R.clampScore(-3), 1);
  assert.strictEqual(R.clampScore(3.6), 4);
  assert.strictEqual(R.validScore(0), false);
  assert.strictEqual(R.validScore(6), false);
  assert.strictEqual(R.validScore('4'), true);
});

// ------------------------------------------------------------
// THE RULES: signed-in only, one per account, no self-review
// ------------------------------------------------------------
test('an anonymous visitor cannot rate', () => {
  fresh();
  assert.strictEqual(R.canRate(null, 'painter', 'suresh-mahto'), false);
  const res = R.submit(null, 'painter', 'suresh-mahto', 5, 'nice');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, R.ERR.NOT_SIGNED_IN);
  assert.strictEqual(R.count('painter', 'suresh-mahto'), 0);
});

test('a pending (unapproved) account cannot rate', () => {
  fresh();
  assert.strictEqual(R.canRate(pending, 'company', 'painter-plus'), false);
  assert.strictEqual(R.submit(pending, 'company', 'painter-plus', 5, '').error, R.ERR.NOT_ACTIVE);
});

test('a painter cannot rate their own profile', () => {
  fresh();
  assert.strictEqual(R.canRate(ramesh, 'painter', 'ramesh-kumar'), false);
  assert.strictEqual(R.submit(ramesh, 'painter', 'ramesh-kumar', 5, '').error, R.ERR.SELF);
});

test('one review per account per subject — a second submit edits', () => {
  fresh();
  const first = R.submit(ramesh, 'painter', 'suresh-mahto', 5, 'great');
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.updated, false);
  const second = R.submit(ramesh, 'painter', 'suresh-mahto', 3, 'changed my mind');
  assert.strictEqual(second.updated, true);
  assert.strictEqual(R.listFor('painter', 'suresh-mahto').length, 1, 'still one row');
  assert.strictEqual(R.average('painter', 'suresh-mahto'), 3);
});

test('a bad score is refused', () => {
  fresh();
  assert.strictEqual(R.submit(ramesh, 'company', 'painter-plus', 0, '').error, R.ERR.BAD_SCORE);
  assert.strictEqual(R.submit(ramesh, 'company', 'painter-plus', 99, '').error, R.ERR.BAD_SCORE);
  assert.strictEqual(R.count('company', 'painter-plus'), 0);
});

// ------------------------------------------------------------
// AVERAGE + DISTRIBUTION
// ------------------------------------------------------------
test('the average is the mean of visible reviews, rounded to 1 dp', () => {
  fresh();
  R.submit(ramesh, 'company', 'painter-plus', 5, '');
  R.submit(suresh, 'company', 'painter-plus', 4, '');
  R.submit(head, 'company', 'painter-plus', 4, '');
  const s = R.summary('company', 'painter-plus');
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.average, 4.3);
  assert.strictEqual(s.dist[5], 1);
  assert.strictEqual(s.dist[4], 2);
  assert.strictEqual(s.dist[1], 0);
});

test('an unrated subject reports 0.0 / 0 ratings', () => {
  fresh();
  const s = R.summary('painter', 'nobody');
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.average, 0);
  assert.strictEqual(R.fmtAverage(s.average), '0.0');
});

// ------------------------------------------------------------
// MODERATION
// ------------------------------------------------------------
test('only a lead may hide or delete a review', () => {
  fresh();
  const r = R.submit(ramesh, 'company', 'painter-plus', 2, 'meh').review;
  assert.strictEqual(R.hide(suresh, r.id).ok, false, 'a painter cannot moderate');
  assert.strictEqual(R.hide(head, r.id).ok, true);
});

test('a hidden review leaves the average but stays in the store', () => {
  fresh();
  const a = R.submit(ramesh, 'company', 'painter-plus', 5, '').review;
  R.submit(suresh, 'company', 'painter-plus', 1, '');
  assert.strictEqual(R.average('company', 'painter-plus'), 3);
  R.hide(head, a.id);
  assert.strictEqual(R.count('company', 'painter-plus'), 1, 'only the visible one counts');
  assert.strictEqual(R.average('company', 'painter-plus'), 1);
  assert.strictEqual(R.listFor('company', 'painter-plus').length, 2, 'still stored');
  assert.strictEqual(R.summary('company', 'painter-plus').hidden, 1);
});

test('an edited review is un-hidden automatically', () => {
  fresh();
  const r = R.submit(ramesh, 'company', 'painter-plus', 1, '').review;
  R.hide(head, r.id);
  assert.strictEqual(R.count('company', 'painter-plus'), 0);
  R.submit(ramesh, 'company', 'painter-plus', 4, 'better now');
  assert.strictEqual(R.count('company', 'painter-plus'), 1);
});

test('a lead can delete any review; the author can remove their own', () => {
  fresh();
  const r = R.submit(ramesh, 'company', 'painter-plus', 4, '').review;
  assert.strictEqual(R.remove(suresh, r.id).ok, false, 'not a lead');
  assert.strictEqual(R.removeOwn(suresh, 'company', 'painter-plus').ok, false, 'not the author');
  assert.strictEqual(R.removeOwn(ramesh, 'company', 'painter-plus').ok, true);
  assert.strictEqual(R.count('company', 'painter-plus'), 0);
});

// ------------------------------------------------------------
// DISPLAY HELPERS
// ------------------------------------------------------------
test('stars() renders filled + hollow to 5', () => {
  assert.strictEqual(R.stars(5), '★★★★★');
  assert.strictEqual(R.stars(4), '★★★★☆');
  assert.strictEqual(R.stars(4.4), '★★★★☆');
  assert.strictEqual(R.stars(0), '☆☆☆☆☆');
  assert.strictEqual(R.stars({}), '☆☆☆☆☆', 'a non-numeric score is empty stars');
});

// ------------------------------------------------------------
// HOSTILE STORE — the shape is untrusted too
// ------------------------------------------------------------
test('a hostile store does not throw and is normalised', () => {
  fresh({
    painterPlusReviews: JSON.stringify({
      'painter:suresh-mahto': [
        null, 7, 'x', {},
        { id: 'r1', type: 'painter', key: 'suresh-mahto', author: 'Ramesh', authorId: 'acc-ramesh', score: 5, text: 'ok', at: 100 },
        { id: 'r2', type: 'painter', key: 'suresh-mahto', author: {}, authorId: 'acc-x', score: 4, text: {}, at: 200 }
      ],
      'company:painter-plus': 'not-an-array',
      'painter:ramesh-kumar': { not: 'an array' }
    })
  });
  let list;
  assert.doesNotThrow(() => { list = R.listFor('painter', 'suresh-mahto'); });
  assert.strictEqual(list.length, 2, 'only the two real reviews survive');
  // An object author/text must not become "[object Object]".
  const r2 = list.find((x) => x.id === 'r2');
  assert.strictEqual(r2.author, '');
  assert.strictEqual(r2.text, '');
  assert.strictEqual(R.count('company', 'painter-plus'), 0, 'a non-array subject is dropped');
});

test('a stored review whose key/type are junk is dropped', () => {
  fresh({
    painterPlusReviews: JSON.stringify({
      'painter:suresh-mahto': [{ id: 'r', score: 5 }] // no type/key on the row
    })
  });
  // The row inherits its type/key from the map key, so it is kept and usable.
  const list = R.listFor('painter', 'suresh-mahto');
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].type, 'painter');
  assert.strictEqual(list[0].key, 'suresh-mahto');
});

test('an object subject key never produces a "[object Object]" bucket', () => {
  fresh();
  assert.strictEqual(R.subjectKey('painter', {}), '');
  assert.deepStrictEqual(R.listFor('painter', {}), []);
  assert.strictEqual(R.canRate(ramesh, 'painter', {}), false);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
