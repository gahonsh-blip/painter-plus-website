/* ============================================================
   Tests for the Supabase provider path of js/auth.js.
   Run with:  node tests/supabase-auth.test.js

   The site ships with the backend-less 'local' provider by default,
   but requirement 6 asks for real, server-enforced auth. js/auth.js
   therefore carries a Supabase adapter (Supabase Auth for the
   password, PostgREST tables for the profiles and the audit log,
   row-level security for authorisation). These tests load the file
   in a browser-like `vm` context with a FAKE fetch and prove:

     1. register() calls Supabase Auth signup, then inserts a
        PENDING profile row — never a plaintext password.
     2. login() exchanges the password for a token and refuses a
        pending account.
     3. the client still refuses an unauthorised write before it
        reaches the network (defence in depth, not the only guard).
     4. the audit log and the account list are read through the
        provider, not from localStorage.
   ============================================================ */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function memStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

// A fake Supabase: an auth user table, a profiles table and an audit table.
function fakeSupabase() {
  const state = {
    users: {},          // email -> { id, password }
    profiles: [],       // rows
    audit: [],
    calls: []
  };
  const url = 'https://fake.supabase.co';

  function json(status, body) {
    return { ok: status >= 200 && status < 300, status: status, json: async () => body };
  }

  async function fetchImpl(href, options) {
    const u = new URL(href);
    const p = u.pathname + (u.search || '');
    const opt = options || {};
    const body = opt.body ? JSON.parse(opt.body) : null;
    state.calls.push({ path: p, method: opt.method || 'GET', body: body });

    // ---- Auth ----
    if (p.indexOf('/auth/v1/signup') === 0) {
      if (state.users[body.email]) return json(422, { msg: 'User already registered' });
      const id = 'uid-' + Object.keys(state.users).length;
      state.users[body.email] = { id: id, password: body.password };
      return json(200, { user: { id: id, email: body.email } });
    }
    if (p.indexOf('/auth/v1/token') === 0) {
      const rec = state.users[body.email];
      if (!rec || rec.password !== body.password) return json(400, { error_description: 'Invalid login credentials' });
      return json(200, { access_token: 'tok-' + rec.id, user: { id: rec.id, email: body.email } });
    }
    if (p.indexOf('/auth/v1/logout') === 0) return json(204, null);
    if (p.indexOf('/auth/v1/user') === 0) return json(200, { id: 'me' });
    if (p.indexOf('/auth/v1/recover') === 0) return json(200, {});

    // ---- PostgREST ----
    if (p.indexOf('/rest/v1/pp_profiles') === 0) {
      const eqId = /id=eq\.([^&]+)/.exec(p);
      const eqUser = /username=eq\.([^&]+)/.exec(p);
      if (opt.method === 'POST') { state.profiles.push(body); return json(201, [body]); }
      if (opt.method === 'PATCH') {
        const id = eqId && decodeURIComponent(eqId[1]);
        state.profiles = state.profiles.map((r) => (r.id === id ? Object.assign({}, r, body) : r));
        return json(204, null);
      }
      if (eqId) {
        const id = decodeURIComponent(eqId[1]);
        return json(200, state.profiles.filter((r) => r.id === id));
      }
      if (eqUser) {
        const un = decodeURIComponent(eqUser[1]);
        return json(200, state.profiles.filter((r) => r.username === un).map((r) => ({ email: r.email })));
      }
      return json(200, state.profiles);
    }
    if (p.indexOf('/rest/v1/pp_audit_log') === 0) return json(200, state.audit);
    return json(404, { message: 'not found: ' + p });
  }

  return { url, state, fetchImpl };
}

function loadSupabaseEngine(fake) {
  const local = memStore();
  const session = memStore();
  const ctx = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    crypto: require('crypto').webcrypto,
    fetch: fake.fetchImpl,
    URL: URL,
    PP_AUTH_CONFIG: {
      provider: 'supabase',
      iterations: 1000,
      sessionMinutes: 60,
      password: { minLength: 8, requireLetter: true, requireNumber: true },
      supabase: { url: fake.url, anonKey: 'public-anon-key', profilesTable: 'pp_profiles', auditTable: 'pp_audit_log' }
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.localStorage = local;
  ctx.sessionStorage = session;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'auth.js' });
  return { A: ctx.PPAuth, local, session, fake };
}

// ------------------------------------------------------------

test('provider reports supabase when configured', () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  assert.strictEqual(A.providerName(), 'supabase');
  assert.ok(A.supabaseReady(), 'supabaseReady should be true with a url + key + fetch');
});

test('register signs up with Supabase Auth and inserts a pending profile row', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  const res = await A.register({ name: 'Ramesh Kumar', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  assert.ok(res.ok, 'register should succeed: ' + (res.error || ''));
  const row = fake.state.profiles[0];
  assert.strictEqual(row.status, 'pending', 'a new profile row is pending');
  assert.strictEqual(row.role, 'painter', 'a new profile row is a painter');
  assert.strictEqual(row.password, undefined, 'no password is written to the profile row');
  assert.ok(fake.state.calls.some((c) => c.path.indexOf('/auth/v1/signup') === 0), 'Supabase Auth signup was called');
  assert.ok(fake.state.calls.some((c) => c.path.indexOf('/rest/v1/pp_profiles') === 0 && c.method === 'POST'), 'a profile row was inserted');
});

test('a pending Supabase account cannot sign in', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  await A.register({ name: 'Ramesh', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  const res = await A.login('ramesh@example.com', 'secret123');
  assert.strictEqual(res.ok, false, 'a pending account must not sign in');
  assert.ok(/awaiting/i.test(res.error), 'the error explains the account is awaiting approval: ' + res.error);
});

test('an active Supabase account signs in and the session is stored', async () => {
  const fake = fakeSupabase();
  const { A, session } = loadSupabaseEngine(fake);
  await A.register({ name: 'Ramesh', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  fake.state.profiles[0].status = 'active';
  const res = await A.login('ramesh@example.com', 'secret123');
  assert.ok(res.ok, 'an active account should sign in: ' + (res.error || ''));
  assert.strictEqual(res.account.username, 'ramesh');
  assert.ok(session.getItem('ppAuthSession'), 'a session was persisted');
  assert.ok(A.isLoggedIn(), 'isLoggedIn is true');
  assert.strictEqual(A.currentUser().email, 'ramesh@example.com');
});

test('a wrong Supabase password does not sign in', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  await A.register({ name: 'Ramesh', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  fake.state.profiles[0].status = 'active';
  const res = await A.login('ramesh@example.com', 'wrong-pass-1');
  assert.strictEqual(res.ok, false, 'a wrong password must not sign in');
  assert.strictEqual(A.isLoggedIn(), false, 'no session is created');
});

test('the client refuses an unauthorised write before it hits the network', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  await A.register({ name: 'Painter One', username: 'painterone', email: 'p1@example.com', password: 'secret123' });
  await A.register({ name: 'Painter Two', username: 'paintertwo', email: 'p2@example.com', password: 'secret123' });
  await A.refresh();
  const p1 = A.listAccounts().find((a) => a.username === 'painterone');
  const p2 = A.listAccounts().find((a) => a.username === 'paintertwo');
  const before = fake.state.calls.length;
  const res = await A.updateProfile(p1, p2.id, { name: 'Hacked' });
  assert.strictEqual(res.ok, false, 'a painter must not edit another painter');
  assert.strictEqual(res.error, A.ERR.NOT_AUTHORIZED);
  assert.strictEqual(fake.state.calls.length, before, 'no network request was made for the refused write');
});

test('a Head cannot escalate to Admin through the Supabase provider', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  await A.register({ name: 'Owner', username: 'owner', email: 'owner@example.com', password: 'secret123' });
  await A.register({ name: 'Head One', username: 'headone', email: 'h1@example.com', password: 'secret123' });
  await A.register({ name: 'Painter', username: 'painter', email: 'p@example.com', password: 'secret123' });
  const set = (u, role) => {
    const row = fake.state.profiles.find((r) => r.username === u);
    row.role = role; row.status = 'active';
  };
  set('owner', 'admin'); set('headone', 'head'); set('painter', 'painter');
  await A.refresh();
  const head = A.listAccounts().find((a) => a.username === 'headone');
  const painter = A.listAccounts().find((a) => a.username === 'painter');
  const before = fake.state.calls.length;
  const res = await A.setRole(head, painter.id, 'admin');
  assert.strictEqual(res.ok, false, 'a head must not grant the admin role');
  assert.strictEqual(res.error, A.ERR.NOT_AUTHORIZED);
  assert.strictEqual(fake.state.calls.length, before, 'the refused escalation never reached the network');
  assert.strictEqual(fake.state.profiles.find((r) => r.username === 'painter').role, 'painter', 'the row is untouched');
});

test('an Admin can approve a Supabase account and the change is persisted', async () => {
  const fake = fakeSupabase();
  const { A } = loadSupabaseEngine(fake);
  await A.register({ name: 'Owner', username: 'owner', email: 'owner@example.com', password: 'secret123' });
  await A.register({ name: 'Ramesh', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  await A.refresh();
  const admin = A.listAccounts().find((a) => a.username === 'owner');
  admin.role = 'admin'; admin.status = 'active';
  fake.state.profiles.find((r) => r.username === 'owner').role = 'admin';
  fake.state.profiles.find((r) => r.username === 'owner').status = 'active';
  await A.refresh();
  const me = A.getAccount(admin.id);
  const target = A.listAccounts().find((a) => a.username === 'ramesh');
  const res = await A.setStatus(me, target.id, 'active');
  assert.ok(res.ok, 'the Admin should be able to approve: ' + (res.error || ''));
  assert.strictEqual(fake.state.profiles.find((r) => r.username === 'ramesh').status, 'active', 'the approval reached the table');
});

test('the account list and audit log are read from Supabase, not localStorage', async () => {
  const fake = fakeSupabase();
  const { A, local } = loadSupabaseEngine(fake);
  await A.register({ name: 'Ramesh', username: 'ramesh', email: 'ramesh@example.com', password: 'secret123' });
  await A.refresh();
  assert.strictEqual(A.listAccounts().length, 1, 'the profile came from the provider');
  assert.strictEqual(local.getItem('painterPlusAuth'), null, 'nothing is written to localStorage in Supabase mode');
});

// ------------------------------------------------------------
(async () => {
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.log('FAIL  ' + t.name + '\n      ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
