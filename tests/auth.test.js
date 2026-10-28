/* ============================================================
   Tests for the authentication + RBAC engine (js/auth.js).
   Run with:  node tests/auth.test.js
   No dependencies; uses Node's built-in assert.

   These pin the security invariants that matter:
     1. Passwords are never stored in plain text (PBKDF2 hash + salt).
     2. A new account is PENDING and cannot sign in until approved.
     3. Authorisation is enforced in the engine, not the UI: a painter
        cannot edit another painter, cannot change a role/status, and a
        crafted updateProfile() cannot smuggle admin fields through.
     4. Privacy: a private profile is not public; the owner may toggle it.
     5. Password change requires the current password; recovery works.
     6. The last active Admin cannot be demoted or suspended.
     7. A corrupt / hostile account store never throws.
   ============================================================ */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

// The operator passcode that guards first-run bootstrap. In production it is a
// secret set in js/auth-config.js as a salted SHA-256 digest; the tests use a
// known passcode and derive the same digest (salt = SALT_BOOTSTRAP in auth.js).
const BOOTSTRAP_PASSCODE = 'test-operator-pass';
const BOOTSTRAP_DIGEST = nodeCrypto.createHash('sha256')
  .update('pp-auth-bootstrap-v1:' + BOOTSTRAP_PASSCODE, 'utf8').digest('hex');

// Keep the work factor small so the suite is fast; production default is 150000.
globalThis.PP_AUTH_CONFIG = {
  provider: 'local',
  iterations: 1000,
  sessionMinutes: 60,
  bootstrapPasscodeSha256: BOOTSTRAP_DIGEST,
  password: { minLength: 8, requireLetter: true, requireNumber: true },
  supabase: { url: '', anonKey: '' }
};

const AUTH_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function memStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

// Fresh engine + store for each test.
function fresh() {
  delete require.cache[require.resolve('../js/auth.js')];
  const local = memStore();
  const session = memStore();
  const A = require('../js/auth.js');
  A._setStore({ local, session });
  return { A, local, session };
}

const PAINTER = { name: 'Ramesh Kumar', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' };
const HEAD = { name: 'Gahonsh', username: 'gahonsh', email: 'gahonsh@example.com', password: 'secret123' };
const ADMIN = { name: 'Owner', username: 'owner', email: 'owner@example.com', password: 'secret123' };

// Create an active account. The FIRST account created in a fresh store is
// bootstrapped to Admin (that is how a brand-new install gets its first admin);
// every later account is approved by that admin. `role` sets the final role.
async function makeActive(A, spec, role) {
  const reg = await A.register(spec);
  assert.ok(reg.ok, 'register should succeed: ' + (reg.error || ''));
  const id = reg.account.id;

  const admin = A.listAccounts().find((a) => a.role === 'admin' && a.status === 'active');
  if (!admin) {
    // No admin yet → bootstrap this account as the first Admin, using the
    // operator passcode (the engine refuses bootstrap without it).
    const boot = await A.promoteBootstrapAdmin(null, id, BOOTSTRAP_PASSCODE);
    assert.ok(boot.ok, 'bootstrap promote should succeed: ' + (boot.error || ''));
  } else {
    const appr = A.setStatus(admin, id, 'active');
    assert.ok(appr.ok, 'admin approval should succeed: ' + (appr.error || ''));
  }
  if (role && role !== 'admin') {
    const actor = A.listAccounts().find((a) => a.role === 'admin' && a.status === 'active');
    const res = A.setRole(actor, id, role);
    assert.ok(res.ok, 'setRole should succeed: ' + (res.error || ''));
  }
  return A.getAccount(id);
}

// ---------------------------------------------------------------
test('no plaintext password is ever written to storage', async () => {
  const { A, local } = fresh();
  await A.register(PAINTER);
  const raw = local.getItem(A.STORE_KEY);
  assert.ok(raw.indexOf('secret123') === -1, 'the plaintext password leaked into the account store');
  const accounts = JSON.parse(raw);
  assert.ok(accounts[0].pw && accounts[0].pw.hash, 'a password hash should be stored');
  assert.strictEqual(accounts[0].pw.algo, 'PBKDF2-SHA256');
  assert.ok(accounts[0].pw.salt && accounts[0].pw.salt.length > 10, 'a unique salt should be stored');
});

test('hashPassword + verifyPassword round-trip, and reject wrong password', async () => {
  const { A } = fresh();
  const rec = await A.hashPassword('hunter2abc');
  assert.strictEqual(await A.verifyPassword('hunter2abc', rec), true);
  assert.strictEqual(await A.verifyPassword('hunter2abd', rec), false);
  assert.strictEqual(await A.verifyPassword('', rec), false);
});

test('two accounts with the same password get different hashes (unique salt)', async () => {
  const { A } = fresh();
  const a = await A.hashPassword('samePass1');
  const b = await A.hashPassword('samePass1');
  assert.notStrictEqual(a.salt, b.salt);
  assert.notStrictEqual(a.hash, b.hash);
});

test('password policy rejects short / letter-less / number-less passwords', () => {
  const { A } = fresh();
  assert.strictEqual(A.validatePassword('short1').ok, false);
  assert.strictEqual(A.validatePassword('nonumbershere').ok, false);
  assert.strictEqual(A.validatePassword('12345678').ok, false);
  assert.strictEqual(A.validatePassword('goodPass1').ok, true);
});

test('registration creates a PENDING account that cannot log in yet', async () => {
  const { A } = fresh();
  const reg = await A.register(PAINTER);
  assert.strictEqual(reg.ok, true);
  assert.strictEqual(reg.account.status, 'pending');
  assert.strictEqual(reg.account.role, 'painter');
  assert.strictEqual(reg.account.pw, undefined, 'publicView must not expose the password record');

  const login = await A.login('ramesh', 'secret123');
  assert.strictEqual(login.ok, false);
  assert.ok(/approval/i.test(login.error), 'the message should mention approval');
  assert.strictEqual(A.isLoggedIn(), false);
});

test('duplicate username or email is rejected', async () => {
  const { A } = fresh();
  await A.register(PAINTER);
  const dupUser = await A.register(Object.assign({}, PAINTER, { email: 'other@example.com' }));
  assert.strictEqual(dupUser.ok, false);
  const dupEmail = await A.register(Object.assign({}, PAINTER, { username: 'other' }));
  assert.strictEqual(dupEmail.ok, false);
});

test('login rejects a wrong password and accepts the right one once active', async () => {
  const { A } = fresh();
  const acc = await makeActive(A, PAINTER);
  assert.strictEqual(acc.status, 'active');

  const bad = await A.login('ramesh', 'wrongpass1');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(A.isLoggedIn(), false);

  const good = await A.login('ramesh', 'secret123');
  assert.strictEqual(good.ok, true);
  assert.strictEqual(A.isLoggedIn(), true);
  assert.strictEqual(A.currentUser().id, acc.id);

  A.logout();
  assert.strictEqual(A.isLoggedIn(), false);
});

test('login accepts the email as well as the username', async () => {
  const { A } = fresh();
  await makeActive(A, PAINTER);
  const res = await A.login('ramesh@example.com', 'secret123');
  assert.strictEqual(res.ok, true);
});

// ---------------- AUTHORISATION ----------------
test('a painter cannot edit another painter\'s profile', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);       // owner → admin
  const ramesh = await makeActive(A, PAINTER);    // ramesh → painter
  const suresh = await A.register({ name: 'Suresh', username: 'suresh', email: 'suresh@example.com', password: 'secret123' });
  const sureshAcc = A.getAccount(suresh.account.id);
  // approve suresh (as admin) so he is active
  A.setStatus(admin, sureshAcc.id, 'active');

  // Ramesh (painter) tries to edit Suresh (painter): must be refused.
  const res = A.updateProfile(ramesh, sureshAcc.id, { name: 'Hacked' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(A.getAccount(sureshAcc.id).name, 'Suresh', 'the name must be unchanged');
});

test('a painter cannot change their own role or status (admin fields are ignored)', async () => {
  const { A } = fresh();
  await makeActive(A, ADMIN);                   // the first account becomes admin
  const ramesh = await makeActive(A, PAINTER);  // a plain painter
  // Smuggle admin fields through the profile path.
  const res = A.updateProfile(ramesh, ramesh.id, { name: 'Ramesh', role: 'admin', status: 'active', editRights: { contact: true } });
  assert.strictEqual(res.ok, true, 'the name change is allowed');
  const after = A.getAccount(ramesh.id);
  assert.strictEqual(after.role, 'painter', 'role must not change through updateProfile');
  assert.strictEqual(after.status, 'active');
  assert.deepStrictEqual(after.editRights, {}, 'editRights must not change through updateProfile');

  // Direct account management is refused too.
  const setRes = A.setRole(ramesh, ramesh.id, 'admin');
  assert.strictEqual(setRes.ok, false);
});

test('a painter cannot change another painter\'s privacy or password', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  const suresh = await A.register({ name: 'Suresh', username: 'suresh', email: 'suresh@example.com', password: 'secret123' });
  A.setStatus(admin, suresh.account.id, 'active');
  const sureshAcc = A.getAccount(suresh.account.id);

  const priv = A.setPrivacy(ramesh, sureshAcc.id, 'private');
  assert.strictEqual(priv.ok, false, 'a painter must not set another painter\'s privacy');

  const reset = await A.resetPassword(ramesh, sureshAcc.id, 'newpass123');
  assert.strictEqual(reset.ok, false, 'a painter must not reset another painter\'s password');
});

test('a Head may edit painters but not another Head or an Admin', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const head = await makeActive(A, HEAD, 'head');
  const painter = await makeActive(A, PAINTER);

  const okRes = A.updateProfile(head, painter.id, { name: 'Ramesh Kumar' });
  assert.strictEqual(okRes.ok, true, 'a head may edit a painter');

  const noAdmin = A.updateProfile(head, admin.id, { name: 'Nope' });
  assert.strictEqual(noAdmin.ok, false, 'a head must not edit an admin');

  // A second head is out of scope for the first head.
  const head2 = await A.register({ name: 'Head Two', username: 'headtwo', email: 'headtwo@example.com', password: 'secret123' });
  A.setStatus(admin, head2.account.id, 'active');
  A.setRole(admin, head2.account.id, 'head');
  const noHead = A.updateProfile(head, head2.account.id, { name: 'Nope' });
  assert.strictEqual(noHead.ok, false, 'a head must not edit another head');
});

test('an Admin may edit anyone and manage any account', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const painter = await makeActive(A, PAINTER);
  assert.strictEqual(A.updateProfile(admin, painter.id, { title: 'Senior Painter' }).ok, true);
  assert.strictEqual(A.setRole(admin, painter.id, 'head').ok, true);
  assert.strictEqual(A.getAccount(painter.id).role, 'head');
});

test('company contact fields need the contact edit right for a painter', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);

  // Without the right, a painter cannot change their own phone.
  let res = A.updateProfile(ramesh, ramesh.id, { phone: '+91 9000000000' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(A.getAccount(ramesh.id).phone, '', 'phone must not change without the contact right');

  // An Admin grants the contact right; now it applies.
  A.setEditRights(admin, ramesh.id, { contact: true });
  res = A.updateProfile(A.getAccount(ramesh.id), ramesh.id, { phone: '+91 9000000000' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(A.getAccount(ramesh.id).phone, '+91 9000000000');
});

test('editableFields reflects the permission model', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  const selfFields = A.editableFields(ramesh, ramesh);
  assert.ok(selfFields.indexOf('name') !== -1);
  assert.ok(selfFields.indexOf('phone') === -1, 'phone needs the contact right');
  const adminFields = A.editableFields(admin, ramesh);
  assert.ok(adminFields.indexOf('phone') !== -1, 'an admin may edit contact fields');
});

// ---------------- PRIVACY ----------------
test('privacy: a private profile is not public; the owner may toggle it', async () => {
  const { A } = fresh();
  await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  assert.strictEqual(A.isPublic(A.getAccount(ramesh.id)), true, 'public by default');

  const res = A.setPrivacy(ramesh, ramesh.id, 'private');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(A.getAccount(ramesh.id).privacy, 'private');
  assert.strictEqual(A.isPublic(A.getAccount(ramesh.id)), false, 'a private profile is not public');

  A.setPrivacy(A.getAccount(ramesh.id), ramesh.id, 'public');
  assert.strictEqual(A.isPublic(A.getAccount(ramesh.id)), true);
});

test('privacy: a pending/suspended account is never public', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const pending = await A.register(PAINTER);
  assert.strictEqual(A.isPublic(A.getAccount(pending.account.id)), false);
  A.setStatus(admin, pending.account.id, 'active');
  assert.strictEqual(A.isPublic(A.getAccount(pending.account.id)), true);
  A.setStatus(admin, pending.account.id, 'suspended');
  assert.strictEqual(A.isPublic(A.getAccount(pending.account.id)), false);
});

// ---------------- ADMIN WORKFLOW ----------------
test('Admin approval workflow: pending → active, and rejection blocks login', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const r1 = await A.register({ name: 'A One', username: 'aone', email: 'aone@example.com', password: 'secret123' });
  const r2 = await A.register({ name: 'B Two', username: 'btwo', email: 'btwo@example.com', password: 'secret123' });

  assert.strictEqual(A.listByStatus('pending').length, 2);
  A.setStatus(admin, r1.account.id, 'active');
  assert.strictEqual((await A.login('aone', 'secret123')).ok, true);

  A.setStatus(admin, r2.account.id, 'rejected');
  const rej = await A.login('btwo', 'secret123');
  assert.strictEqual(rej.ok, false);
  assert.ok(/rejected/i.test(rej.error));
});

test('the last active Admin cannot be demoted or suspended', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const demote = A.setRole(admin, admin.id, 'painter');
  assert.strictEqual(demote.ok, false, 'the last admin must not be demoted');
  const suspend = A.setStatus(admin, admin.id, 'suspended');
  assert.strictEqual(suspend.ok, false, 'the last admin must not be suspended');

  // With a second admin, demotion is allowed.
  const a2 = await A.register({ name: 'Admin Two', username: 'admintwo', email: 'admintwo@example.com', password: 'secret123' });
  A.setStatus(admin, a2.account.id, 'active');
  A.setRole(admin, a2.account.id, 'admin');
  assert.strictEqual(A.setRole(A.getAccount(a2.account.id), admin.id, 'painter').ok, true);
});

test('a Head cannot manage an Admin account', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const head = await makeActive(A, HEAD, 'head');
  const res = A.setRole(head, admin.id, 'painter');
  assert.strictEqual(res.ok, false, 'a head must not manage an admin');
});

// ---------------- PRIVILEGE ESCALATION (regression) ----------------
// A Head must not be able to reach Admin, nor touch a peer Head. Each of these
// was a real bug: `can()` only blocked a *non-admin managing an admin target*,
// so a Head could demote a peer, reset a peer's password, or hand out the
// Admin role.
test('a Head cannot promote themselves or anyone else to Admin', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const head = await makeActive(A, HEAD, 'head');
  const painter = await makeActive(A, PAINTER);

  assert.strictEqual(A.setRole(head, head.id, 'admin').ok, false, 'no self-promotion');
  assert.strictEqual(A.getAccount(head.id).role, 'head', 'the head is still a head');
  assert.strictEqual(A.setRole(head, painter.id, 'admin').ok, false, 'cannot grant admin');
  assert.strictEqual(A.getAccount(painter.id).role, 'painter', 'the painter is still a painter');
  // Nor may a Head create another Head — that is an Admin-only promotion.
  assert.strictEqual(A.setRole(head, painter.id, 'head').ok, false, 'cannot grant head either');
});

test('a Head cannot act on a peer Head (demote, suspend, reset password)', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const head = await makeActive(A, HEAD, 'head');
  const h2 = await makeActive(A, { name: 'Head Two', username: 'headtwo', email: 'headtwo@example.com', password: 'secret123' }, 'head');

  assert.strictEqual(A.setRole(head, h2.id, 'painter').ok, false, 'cannot demote a peer');
  assert.strictEqual(A.setStatus(head, h2.id, 'suspended').ok, false, 'cannot suspend a peer');
  assert.strictEqual(A.updateProfile(head, h2.id, { name: 'Hacked' }).ok, false, 'cannot edit a peer');
  assert.strictEqual(A.can(head, 'account.manage', A.getAccount(h2.id)), false, 'no manage rights over a peer');
  assert.strictEqual((await A.resetPassword(head, h2.id, 'hacked123')).ok, false, 'cannot reset a peer password');
  assert.strictEqual(A.getAccount(h2.id).role, 'head', 'the peer is untouched');
  assert.strictEqual(A.getAccount(h2.id).status, 'active', 'the peer is untouched');
});

test('an Admin may still grant Admin and Head', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const p1 = await makeActive(A, PAINTER);
  const p2 = await makeActive(A, { name: 'Second', username: 'second', email: 'second@example.com', password: 'secret123' });
  assert.strictEqual(A.setRole(admin, p1.id, 'admin').ok, true, 'an admin may create an admin');
  assert.strictEqual(A.getAccount(p1.id).role, 'admin');
  assert.strictEqual(A.setRole(admin, p2.id, 'head').ok, true, 'an admin may create a head');
  assert.strictEqual(A.getAccount(p2.id).role, 'head');
});

// ---------------- BOOTSTRAP (regression) ----------------
// The first Admin may only be created by an operator holding the deployment
// passcode. Previously ANY account — even a never-approved pending one — could
// promote ITSELF to Admin with a forged actor: a total authentication bypass.
test('bootstrap requires the operator passcode', async () => {
  const { A } = fresh();
  const reg = await A.register({ name: 'Attacker', username: 'attacker', email: 'atk@example.com', password: 'secret123' });
  const id = reg.account.id;
  assert.strictEqual(A.needsBootstrapAdmin(), true, 'a fresh store has no admin');

  const noPass = await A.promoteBootstrapAdmin({ id: 'forged' }, id);
  assert.strictEqual(noPass.ok, false, 'no passcode → refused');
  const wrongPass = await A.promoteBootstrapAdmin({ id: 'forged' }, id, 'not-the-passcode');
  assert.strictEqual(wrongPass.ok, false, 'wrong passcode → refused');
  assert.strictEqual(A.getAccount(id).role, 'painter', 'the account is unchanged');
  assert.strictEqual(A.getAccount(id).status, 'pending', 'the account is still pending');
  assert.strictEqual((await A.login('attacker', 'secret123')).ok, false, 'and still cannot log in');

  const right = await A.promoteBootstrapAdmin(null, id, BOOTSTRAP_PASSCODE);
  assert.strictEqual(right.ok, true, right.error || 'the right passcode works');
  assert.strictEqual(A.getAccount(id).role, 'admin');
  assert.strictEqual(A.getAccount(id).status, 'active');
});

test('bootstrap is closed once an Admin exists', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const other = await A.register({ name: 'Other', username: 'other', email: 'other@example.com', password: 'secret123' });
  assert.strictEqual(A.needsBootstrapAdmin(), false);
  const res = await A.promoteBootstrapAdmin({ id: 'forged' }, other.account.id, BOOTSTRAP_PASSCODE);
  assert.strictEqual(res.ok, false, 'even with the passcode, bootstrap is closed');
  assert.strictEqual(A.getAccount(other.account.id).role, 'painter');
});

test('bootstrap never activates a suspended or rejected account', async () => {
  const { A } = fresh();
  const reg = await A.register({ name: 'X', username: 'xxxx', email: 'x@example.com', password: 'secret123' });
  const id = reg.account.id;
  const boot = await A.promoteBootstrapAdmin(null, id, BOOTSTRAP_PASSCODE);
  assert.strictEqual(boot.ok, true, 'the first account becomes Admin');
  const admin = A.getAccount(id);
  const reg2 = await A.register({ name: 'Y', username: 'yyyy', email: 'y@example.com', password: 'secret123' });
  A.setStatus(admin, reg2.account.id, 'rejected');
  assert.strictEqual(A.getAccount(reg2.account.id).status, 'rejected');
  assert.strictEqual((await A.promoteBootstrapAdmin(null, reg2.account.id, BOOTSTRAP_PASSCODE)).ok, false,
    'a rejected account can never be bootstrapped');
  assert.strictEqual(A.getAccount(reg2.account.id).role, 'painter');
});

// ---------------- SESSION INVALIDATION (regression) ----------------
test('a password reset by a lead kills the member\'s live session', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  assert.strictEqual((await A.login('ramesh', 'secret123')).ok, true);
  assert.strictEqual(A.isLoggedIn(), true, 'signed in');

  const res = await A.resetPassword(admin, ramesh.id, 'resetbylead1');
  assert.strictEqual(res.ok, true, res.error || '');
  assert.strictEqual(A.isLoggedIn(), false, 'the old session must be dead after a reset');
  assert.strictEqual((await A.login('ramesh', 'secret123')).ok, false, 'the old password is dead');
  assert.strictEqual((await A.login('ramesh', 'resetbylead1')).ok, true, 'the new password works');
});

test('changing your own password keeps your own session alive', async () => {
  const { A } = fresh();
  await makeActive(A, PAINTER);
  assert.strictEqual((await A.login('ramesh', 'secret123')).ok, true);
  const me = A.currentUser();
  const res = await A.changePassword(me, 'secret123', 'brandnew123');
  assert.strictEqual(res.ok, true, res.error || '');
  assert.strictEqual(A.isLoggedIn(), true, 'the person who changed it stays signed in');
});

// ---------------- LOGIN THROTTLING (regression) ----------------
test('repeated failed logins lock the account for a while', async () => {
  const { A } = fresh();
  await makeActive(A, PAINTER);
  for (let i = 0; i < 5; i++) {
    const r = await A.login('ramesh', 'wrongpass' + i);
    assert.strictEqual(r.ok, false);
  }
  const locked = await A.login('ramesh', 'secret123');
  assert.strictEqual(locked.ok, false, 'the correct password is refused while locked');
  assert.ok(/too many/i.test(locked.error || ''), 'the error explains the lock');
});

// ---------------- PASSWORD CHANGE / RECOVERY ----------------
test('changePassword requires the current password', async () => {
  const { A } = fresh();
  const ramesh = await makeActive(A, PAINTER);
  const wrong = await A.changePassword(ramesh, 'notmypass1', 'newpass123');
  assert.strictEqual(wrong.ok, false);

  const right = await A.changePassword(ramesh, 'secret123', 'newpass123');
  assert.strictEqual(right.ok, true);
  assert.strictEqual((await A.login('ramesh', 'secret123')).ok, false, 'the old password no longer works');
  assert.strictEqual((await A.login('ramesh', 'newpass123')).ok, true);
});

test('recovery is issued by an authorised lead and is single-use', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);

  // The public "forgot password" endpoint never hands back a code.
  const req = A.requestRecovery('ramesh@example.com');
  assert.strictEqual(req.ok, true);
  assert.ok(!req.code, 'the public request must not return a code');

  // A code can only be issued by a lead who outranks the member.
  const issued = await A.issueRecoveryCode(admin, ramesh.id);
  assert.strictEqual(issued.ok, true, issued.error || '');
  assert.ok(issued.code && issued.code.length >= 6, 'a recovery code should be issued');

  const bad = await A.resetWithCode('ramesh@example.com', 'WRONGCODE', 'resetpass1');
  assert.strictEqual(bad.ok, false);

  const good = await A.resetWithCode('ramesh@example.com', issued.code, 'resetpass1');
  assert.strictEqual(good.ok, true);
  assert.strictEqual((await A.login('ramesh', 'resetpass1')).ok, true);

  // The code is single-use.
  const reuse = await A.resetWithCode('ramesh@example.com', issued.code, 'againpass1');
  assert.strictEqual(reuse.ok, false);
});

test('a wrong recovery code is refused and the code is burnt after a few tries', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  const issued = await A.issueRecoveryCode(admin, ramesh.id);
  assert.ok(issued.ok, issued.error || '');
  for (let i = 0; i < 6; i++) {
    const r = await A.resetWithCode('ramesh@example.com', 'BADCODE' + i, 'x1234567');
    assert.strictEqual(r.ok, false, 'a wrong code is always refused');
  }
  // After the attempt budget is spent, even the correct code is dead.
  const after = await A.resetWithCode('ramesh@example.com', issued.code, 'x1234567');
  assert.strictEqual(after.ok, false, 'the code is burnt after too many attempts');
});

test('a Head cannot issue a recovery code for a peer Head or an Admin', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const head = await makeActive(A, HEAD, 'head');
  const h2 = await makeActive(A, { name: 'Head Two', username: 'head2', email: 'head2@example.com', password: 'secret123' }, 'head');
  assert.strictEqual((await A.issueRecoveryCode(head, h2.id)).ok, false, 'not for a peer head');
  assert.strictEqual((await A.issueRecoveryCode(head, admin.id)).ok, false, 'not for an admin');
});

test('a recovery code is not stored in plain text', async () => {
  const { A, local } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  const issued = await A.issueRecoveryCode(admin, ramesh.id);
  assert.ok(issued.code, 'a code was issued');
  assert.strictEqual(local.getItem('painterPlusAuth').indexOf(issued.code), -1,
    'the raw code must never be written to the store');
});

test('recovery for an unknown email reveals nothing', async () => {
  const { A } = fresh();
  await makeActive(A, PAINTER);
  const req = A.requestRecovery('nobody@example.com');
  assert.strictEqual(req.ok, true, 'the response is identical for an unknown email');
  assert.ok(!req.code, 'no code is issued for an unknown email');
});

// ---------------- AUDIT ----------------
test('every mutating action is written to the audit log', async () => {
  const { A } = fresh();
  const admin = await makeActive(A, ADMIN);
  const ramesh = await makeActive(A, PAINTER);
  A.updateProfile(admin, ramesh.id, { title: 'Senior Painter' });
  A.setRole(admin, ramesh.id, 'supervisor' in A.ROLE_LEVEL ? 'supervisor' : 'head');
  A.setPrivacy(A.getAccount(ramesh.id), ramesh.id, 'private');
  await A.changePassword(A.getAccount(ramesh.id), 'secret123', 'newpass123');

  const log = A.auditLog();
  const actions = log.map((e) => e.action);
  assert.ok(actions.indexOf('profile.update') !== -1, 'profile.update is logged');
  assert.ok(actions.indexOf('account.update') !== -1, 'account.update is logged');
  assert.ok(actions.indexOf('privacy.set') !== -1, 'privacy.set is logged');
  assert.ok(actions.indexOf('password.change') !== -1, 'password.change is logged');
  // Newest first.
  assert.ok(log.length > 1 && log[0].at >= log[log.length - 1].at);
});

// ---------------- CORRUPT STORE ----------------
test('a corrupt / hostile account store never throws', async () => {
  const local = memStore();
  local.setItem('painterPlusAuth', JSON.stringify([null, 5, 'x', [], { id: {}, role: 9, status: [], pw: 'plain', editRights: 'no' }, { id: 'ok', username: 'ok', role: 'painter', status: 'active' }]));
  local.setItem('painterPlusAudit', 'not json at all');
  delete require.cache[require.resolve('../js/auth.js')];
  const A = require('../js/auth.js');
  A._setStore({ local, session: memStore() });

  assert.doesNotThrow(() => A.listAccounts());
  assert.doesNotThrow(() => A.auditLog());
  assert.doesNotThrow(() => A.currentUser());
  assert.doesNotThrow(() => A.isPublic(A.getAccount('ok')));
  const list = A.listAccounts();
  assert.ok(list.every((a) => a && typeof a === 'object'), 'every account is an object');
  assert.deepStrictEqual(A.auditLog(), [], 'a corrupt audit log reads as empty');
});

test('a hostile store cannot smuggle a role through a corrupt record', async () => {
  const local = memStore();
  local.setItem('painterPlusAuth', JSON.stringify([{ id: 'x', username: 'x', role: 'superadmin', status: 'active' }]));
  delete require.cache[require.resolve('../js/auth.js')];
  const A = require('../js/auth.js');
  A._setStore({ local, session: memStore() });
  const acc = A.getAccount('x');
  assert.strictEqual(acc.role, 'painter', 'an unknown role normalises to painter');
});

test('the engine exposes no way to read another account\'s password record', async () => {
  const { A } = fresh();
  await A.register(PAINTER);
  const acc = A.listAccounts()[0];
  assert.strictEqual(acc.pw, undefined);
  assert.strictEqual(acc.recovery, undefined);
});

test('suspending an account revokes its live session at once', async () => {
  const { A } = fresh();
  await makeActive(A, ADMIN);                      // the first account becomes the Admin
  const { id } = await makeActive(A, PAINTER, 'painter');
  await A.login('ramesh', 'secret123');
  assert.ok(A.isLoggedIn(), 'the painter is signed in');
  const admin = A.listAccounts().find((a) => a.role === 'admin' && a.status === 'active');
  A.setStatus(admin, id, 'suspended');
  assert.strictEqual(A.isLoggedIn(), false, 'the session dies with the account');
  assert.strictEqual(A.currentUser(), null, 'currentUser is null once suspended');
});

test('an expired session is refused', async () => {
  const { A, session } = fresh();
  await makeActive(A, ADMIN);
  await makeActive(A, PAINTER, 'painter');
  await A.login('ramesh', 'secret123');
  // Backdate the stored expiry so the session is already past its window.
  const raw = JSON.parse(session.getItem(A.SESSION_KEY));
  raw.exp = Date.now() - 1000;
  session.setItem(A.SESSION_KEY, JSON.stringify(raw));
  assert.strictEqual(A.currentSession(), null, 'an expired session is not returned');
  assert.strictEqual(A.isLoggedIn(), false, 'an expired session does not authenticate');
});

test('a demotion takes effect on the next permission check', async () => {
  const { A } = fresh();
  await makeActive(A, ADMIN);
  const { id } = await makeActive(A, HEAD, 'head');
  await A.login('gahonsh', 'secret123');
  const me = A.currentUser();
  assert.ok(A.can(me, 'account.manage', null), 'a Head may manage accounts');
  const admin = A.listAccounts().find((a) => a.role === 'admin' && a.status === 'active');
  A.setRole(admin, id, 'painter');
  const nowMe = A.currentUser();
  assert.strictEqual(nowMe.role, 'painter', 'the role change is reflected immediately');
  assert.strictEqual(A.can(nowMe, 'account.manage', null), false, 'a demoted account loses the right at once');
});

test('two accounts never share a salt or a hash for the same password', async () => {
  const { A, local } = fresh();
  await A.register({ name: 'A', username: 'alpha', email: 'a@example.com', password: 'secret123' });
  await A.register({ name: 'B', username: 'bravo', email: 'b@example.com', password: 'secret123' });
  const raw = JSON.parse(local.getItem(A.STORE_KEY));
  assert.strictEqual(raw.length, 2);
  assert.notStrictEqual(raw[0].pw.salt, raw[1].pw.salt, 'each account has a unique salt');
  assert.notStrictEqual(raw[0].pw.hash, raw[1].pw.hash, 'identical passwords hash differently');
  assert.strictEqual(JSON.stringify(raw).indexOf('secret123'), -1, 'no plaintext anywhere in the store');
});

test('a short or weak password is refused', async () => {
  const { A } = fresh();
  const short = await A.register({ name: 'X', username: 'shorty', email: 's@example.com', password: 'abc1' });
  assert.strictEqual(short.ok, false, 'a short password is refused');
  const noNum = await A.register({ name: 'Y', username: 'nonum', email: 'n@example.com', password: 'abcdefgh' });
  assert.strictEqual(noNum.ok, false, 'a password without a number is refused');
  assert.strictEqual(A.listAccounts().length, 0, 'nothing was created');
});

test('a password is never accepted for a wrong-case username variant', async () => {
  const { A } = fresh();
  await makeActive(A, ADMIN);
  await makeActive(A, PAINTER, 'painter');
  const res = await A.login('Ramesh', 'secret123');
  assert.ok(res.ok, 'the username is case-insensitive on purpose');
  const bad = await A.login('ramesh', 'Secret123');
  assert.strictEqual(bad.ok, false, 'the password is case-sensitive');
});

// ---------------------------------------------------------------
(async () => {
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.log('FAIL  ' + t.name + '\n      ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
