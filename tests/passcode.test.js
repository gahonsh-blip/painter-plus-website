/* ============================================================
   Tests for the staff passcode gate in js/team.js
   Run with:  node tests/passcode.test.js
   No dependencies; uses Node's built-in assert + crypto.

   Locks in three things:
     1. js/team.js contains NO plaintext passcode — only a digest.
     2. The in-browser SHA-256 agrees with Node's crypto for the
        real passcode and for awkward inputs (empty, unicode, long).
     3. unlockHead() only accepts the real passcode, and the
        anonymous "claim" path is gone: claim() without the correct
        passcode must not authorise editing.
   ============================================================ */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TEAM_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'team.js'), 'utf8');
const REAL_PASSCODE = 'painter123'; // the owner's current passcode
const hashPasscode = require('./hash-passcode.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}

// ---------- load js/team.js in a browser-like context ----------
function memStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

function loadTeam() {
  const localStorage = memStore();
  const sessionStorage = memStore();
  const listeners = {};
  const sandbox = {
    console,
    localStorage,
    sessionStorage,
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    window: null,
    document: { addEventListener() {}, dispatchEvent() { return true; } }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  sandbox.window.location = { search: '' };
  vm.createContext(sandbox);
  vm.runInContext(TEAM_SRC, sandbox, { filename: 'js/team.js' });
  return { T: sandbox.window.PPTeam, localStorage, sessionStorage };
}

// ---------- 1. no plaintext passcode in the served file ----------
test('js/team.js ships no plaintext passcode', () => {
  assert.ok(TEAM_SRC.indexOf(REAL_PASSCODE) === -1,
    'the file still contains the literal passcode "' + REAL_PASSCODE + '"');
});

test('js/team.js exposes a digest, not a PASSCODE constant', () => {
  assert.ok(/PASSCODE_SHA256\s*=/.test(TEAM_SRC), 'expected a PASSCODE_SHA256 constant');
  assert.ok(!/const\s+PASSCODE\s*=/.test(TEAM_SRC), 'the old plaintext PASSCODE constant is still present');
});

// ---------- 2. the browser hash matches Node's crypto ----------
test('sha256Hex agrees with Node crypto for the real passcode', () => {
  const { T } = loadTeam();
  const expected = crypto.createHash('sha256').update('painter-plus::v1::' + REAL_PASSCODE, 'utf8').digest('hex');
  assert.strictEqual(T.passcodeDigest(REAL_PASSCODE), expected);
});

test('sha256Hex agrees with Node crypto for awkward inputs', () => {
  const { T } = loadTeam();
  const inputs = ['', 'a', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(65), 'पेंटर 🎨', 'null'];
  for (const s of inputs) {
    const expected = crypto.createHash('sha256').update('painter-plus::v1::' + s, 'utf8').digest('hex');
    assert.strictEqual(T.passcodeDigest(s), expected, 'mismatch for ' + JSON.stringify(s));
  }
});

test('passcodeDigest tolerates null / undefined without throwing', () => {
  const { T } = loadTeam();
  // passcodeDigest coerces a missing value to the empty string.
  assert.strictEqual(T.passcodeDigest(null), T.passcodeDigest(''));
  assert.strictEqual(T.passcodeDigest(undefined), T.passcodeDigest(''));
});

// ---------- 3. the gate behaves ----------
test('unlockHead accepts the real passcode and opens the session', () => {
  const { T, sessionStorage } = loadTeam();
  assert.strictEqual(T.unlockHead(REAL_PASSCODE), true);
  assert.strictEqual(sessionStorage.getItem('ppAdminUnlocked'), '1');
  assert.strictEqual(T.isActingHead(), true);
});

test('unlockHead rejects wrong / empty / missing passcodes', () => {
  for (const bad of ['', 'wrong', 'painter124', 'PAINTER123', ' painter123', null, undefined]) {
    const { T, sessionStorage } = loadTeam();
    assert.strictEqual(T.unlockHead(bad), false, 'accepted a bad passcode: ' + JSON.stringify(bad));
    assert.strictEqual(sessionStorage.getItem('ppAdminUnlocked'), null);
    assert.strictEqual(T.isActingHead(), false);
  }
});

test('lockHead clears the session', () => {
  const { T } = loadTeam();
  T.unlockHead(REAL_PASSCODE);
  assert.strictEqual(T.isActingHead(), true);
  T.lockHead();
  assert.strictEqual(T.isActingHead(), false);
});

// ---------- 4. the anonymous edit path is gone ----------
test('an anonymous visitor cannot claim (and so cannot edit) a profile', () => {
  const { T } = loadTeam();
  // Seed a roster with a non-lead member.
  T.save({ id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter' });
  assert.strictEqual(T.claim('ramesh-kumar'), false, 'claim() succeeded with no passcode');
  assert.strictEqual(T.claim('ramesh-kumar', 'wrong'), false, 'claim() succeeded with a wrong passcode');
  assert.strictEqual(T.isMe('ramesh-kumar'), false, 'isMe() is true for an anonymous visitor');
  assert.strictEqual(T.claimedId(), '', 'a member id was claimed without a passcode');
});

test('claim with the real passcode authorises editing that member', () => {
  const { T } = loadTeam();
  T.save({ id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter' });
  assert.strictEqual(T.claim('ramesh-kumar', REAL_PASSCODE), true);
  assert.strictEqual(T.isMe('ramesh-kumar'), true);
  assert.strictEqual(T.claimedId(), 'ramesh-kumar');
});

test('isMe is false once the staff session ends', () => {
  const { T } = loadTeam();
  T.save({ id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter' });
  T.claim('ramesh-kumar', REAL_PASSCODE);
  assert.strictEqual(T.isMe('ramesh-kumar'), true);
  T.lockHead();
  assert.strictEqual(T.isMe('ramesh-kumar'), false, 'a stale claim still authorises editing after sign-out');
});

test('claim rejects an unknown member id', () => {
  const { T } = loadTeam();
  assert.strictEqual(T.claim('nobody', REAL_PASSCODE), false);
});

// ---------- 5. the helper tool agrees with the file ----------
test('tests/hash-passcode.js prints the digest js/team.js actually stores', () => {
  const { T } = loadTeam();
  assert.strictEqual(hashPasscode.digest(REAL_PASSCODE), T.PASSCODE_SHA256,
    'the stored digest does not match the documented passcode — ' +
    'run: node tests/hash-passcode.js "' + REAL_PASSCODE + '"');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
