/* ============================================================
   PAINTER PLUS — AUTHENTICATION, ACCOUNTS & ROLE-BASED ACCESS
   ------------------------------------------------------------
   window.PPAuth — a small, dependency-free account system with:

     • Registration, login, logout, password change, password recovery
     • Admin/Head approval before an account becomes active
     • Roles: admin / head / painter  (see ROLE_LEVEL)
     • REAL authorisation on every write (not just hidden buttons):
       updateProfile / updateAccount / setStatus / setRole /
       changePassword / requestRecovery all check `can()` first and
       refuse with an error when the actor is not allowed.
     • Privacy: a painter can make their profile public or private;
       company-required fields stay under Admin/Head control.
     • An append-only audit log of every mutating action.

   SECURITY — READ THIS
   --------------------
   Passwords are NEVER stored in plain text. Each account stores a
   PBKDF2-HMAC-SHA256 hash with a unique random salt (see hashPassword).
   Verification is a constant-time comparison.

   Provider 'local' (the default in js/auth-config.js) keeps accounts
   in this browser's localStorage. That is a DEMO / small-crew mode:
   accounts do not sync between devices, and anyone who can edit the
   page in their own browser can bypass the client-side gate — because
   there is no server to enforce anything. It is NOT production
   security. For real, server-enforced authentication and storage set
   provider:'supabase' in js/auth-config.js (see docs/AUTH.md); the
   same public API then talks to Supabase Auth + Postgres with
   row-level security. No secret is ever placed in this file.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPAuth = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  root = root || {};
  const ls = () => { try { return root.localStorage || null; } catch (e) { return null; } };
  const ss = () => { try { return root.sessionStorage || null; } catch (e) { return null; } };
  const cryptoObj = () => root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  const now = () => Date.now();

  // ----- in-memory store for Node tests (injected via _setStore) -----
  let injectedStore = null;
  function _setStore(s) { injectedStore = s; }
  function backing() { return injectedStore || { local: ls(), session: ss() }; }

  const STORE_KEY = 'painterPlusAuth';
  const AUDIT_KEY = 'painterPlusAudit';
  const SESSION_KEY = 'ppAuthSession';
  const AUDIT_LIMIT = 500;
  // Domain-separation salt for the bootstrap-passcode digest, so a plain
  // SHA-256 of the passcode (rainbow-tableable) is never what is stored.
  const SALT_BOOTSTRAP = 'pp-auth-bootstrap-v1:';
  // Domain-separation salt for stored recovery-code digests.
  const SALT_RECOVERY = 'pp-auth-recovery-v1:';
  // How many wrong recovery codes an account may try before the code is burnt.
  const RECOVERY_MAX_TRIES = 5;
  // Login throttling: after this many consecutive failures, lock for the window.
  const LOGIN_MAX_FAILS = 5;
  const LOGIN_LOCK_MS = 5 * 60 * 1000;

  const ROLE_LEVEL = { painter: 1, head: 2, admin: 3 };
  const ROLES = [
    { id: 'admin', label: 'Admin', icon: '🛡️', desc: 'Full control of accounts, roles, profile permissions and approvals.' },
    { id: 'head', label: 'Head', icon: '🎩', desc: 'Views the crew and may edit the profiles of painters in their scope.' },
    { id: 'painter', label: 'Painter', icon: '🎨', desc: 'Edits only their own permitted profile details.' }
  ];
  const ROLE_IDS = ROLES.map(r => r.id);

  const STATUSES = ['pending', 'active', 'suspended', 'rejected'];
  const ACCOUNT_STATUS = {
    pending: { label: 'Pending approval', tone: 'warn' },
    active: { label: 'Active', tone: 'ok' },
    suspended: { label: 'Suspended', tone: 'bad' },
    rejected: { label: 'Rejected', tone: 'bad' }
  };

  // Profile fields a painter owns about themselves (presentation only).
  const SELF_FIELDS = ['name', 'title', 'tagline', 'bio', 'photo', 'startYear', 'quote'];
  // Company-required contact details. A painter may NOT change these unless an
  // Admin/Head grants the 'contact' edit right — the company's own phone,
  // email and address must stay authoritative.
  const COMPANY_FIELDS = ['phone', 'email', 'address', 'note'];
  const PROFILE_FIELDS = SELF_FIELDS.concat(COMPANY_FIELDS);
  // Fields only an Admin may set on an account.
  const ADMIN_FIELDS = ['role', 'status', 'editRights', 'memberId'];

  const ERR = {
    NOT_AUTHORIZED: 'You are not allowed to make this change.',
    NOT_FOUND: 'Account not found.',
    STORAGE: 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.',
    BAD_CREDENTIALS: 'Wrong email/username or password.',
    INACTIVE: 'This account is not active yet.',
    DUPLICATE: 'An account with that email or username already exists.',
    VALIDATION: 'Please check the form and try again.',
    NO_CRYPTO: 'Secure hashing is unavailable in this browser (it needs HTTPS or localhost).',
    LAST_ADMIN: 'There must always be at least one active Admin.',
    WRONG_PASSWORD: 'The current password is incorrect.',
    BAD_CODE: 'That recovery code is invalid or has expired.'
  };

  // ------------------------------------------------------------
  // small helpers
  // ------------------------------------------------------------
  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (v == null ? '' : String(v));
  const trim = (v) => str(v).trim();
  const normEmail = (v) => trim(v).toLowerCase();
  const normUser = (v) => trim(v).toLowerCase();

  function toHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }
  function fromHex(hex) {
    const h = str(hex);
    const out = new Uint8Array(Math.floor(h.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16) || 0;
    return out;
  }
  function randomHex(bytes) {
    const c = cryptoObj();
    const buf = new Uint8Array(bytes);
    if (c && c.getRandomValues) c.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    return toHex(buf);
  }
  // Length-independent constant-time-ish comparison.
  function timingSafeEqual(a, b) {
    const x = str(a), y = str(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
  }
  function makeId(prefix) {
    return (prefix || 'acc') + '-' + now().toString(36) + '-' + randomHex(4);
  }

  // ------------------------------------------------------------
  // password hashing — PBKDF2-HMAC-SHA256, unique salt per account
  // ------------------------------------------------------------
  const b64 = {
    encode(buf) {
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      if (typeof btoa === 'function') return btoa(s);
      if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
      return s;
    },
    decode(text) {
      const t = str(text);
      if (typeof atob === 'function') {
        const bin = atob(t);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(t, 'base64'));
      const out = new Uint8Array(t.length);
      for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 0xff;
      return out;
    }
  };

  function iterations() {
    const cfg = (root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.iterations) || 150000;
    return Math.max(1000, parseInt(cfg, 10) || 150000);
  }

  // Derive the PBKDF2 hash. Async because WebCrypto only offers it async;
  // the Node test path uses require('crypto').pbkdf2Sync so it stays simple.
  async function pbkdf2(password, saltBytes, iter, dkLen) {
    const c = cryptoObj();
    if (c && c.subtle && c.subtle.importKey) {
      const keyMaterial = await c.subtle.importKey(
        'raw', new TextEncoder().encode(str(password)), { name: 'PBKDF2' }, false, ['deriveBits']
      );
      const bits = await c.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
        keyMaterial, dkLen * 8
      );
      return new Uint8Array(bits);
    }
    // Node (tests): synchronous, same algorithm.
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        return new Uint8Array(nodeCrypto.pbkdf2Sync(str(password), Buffer.from(saltBytes), iter, dkLen, 'sha256'));
      } catch (e) { /* fall through */ }
    }
    throw new Error(ERR.NO_CRYPTO);
  }

  // Returns a storable record: { algo, iter, salt, hash }. The plaintext is
  // never kept anywhere.
  async function hashPassword(password) {
    const salt = new Uint8Array(16);
    const c = cryptoObj();
    if (c && c.getRandomValues) c.getRandomValues(salt);
    else for (let i = 0; i < salt.length; i++) salt[i] = Math.floor(Math.random() * 256);
    const iter = iterations();
    const bits = await pbkdf2(password, salt, iter, 32);
    return { algo: 'PBKDF2-SHA256', iter: iter, salt: b64.encode(salt), hash: b64.encode(bits) };
  }

  async function verifyPassword(password, rec) {
    if (!rec || typeof rec !== 'object' || !rec.salt || !rec.hash) return false;
    const iter = parseInt(rec.iter, 10) || iterations();
    let bits;
    try { bits = await pbkdf2(password, b64.decode(rec.salt), iter, 32); }
    catch (e) { return false; }
    return timingSafeEqual(b64.encode(bits), rec.hash);
  }

  // Plain SHA-256 → lowercase hex. Used only to verify the bootstrap passcode
  // digest (never for passwords, which use the slow PBKDF2 above).
  async function sha256Hex(text) {
    const c = cryptoObj();
    const bytes = new TextEncoder().encode(str(text));
    if (c && c.subtle && c.subtle.digest) {
      const buf = await c.subtle.digest('SHA-256', bytes);
      return toHex(new Uint8Array(buf));
    }
    if (typeof require === 'function') {
      try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.createHash('sha256').update(str(text), 'utf8').digest('hex');
      } catch (e) { /* fall through */ }
    }
    throw new Error(ERR.NO_CRYPTO);
  }

  // ------------------------------------------------------------
  // password policy
  // ------------------------------------------------------------
  function policy() {
    const p = (root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.password) || {};
    return {
      minLength: parseInt(p.minLength, 10) || 8,
      requireLetter: p.requireLetter !== false,
      requireNumber: p.requireNumber !== false
    };
  }
  function validatePassword(pw) {
    const p = policy();
    const s = str(pw);
    if (s.length < p.minLength) return { ok: false, error: 'Password must be at least ' + p.minLength + ' characters.' };
    if (p.requireLetter && !/[A-Za-z]/.test(s)) return { ok: false, error: 'Password must include a letter.' };
    if (p.requireNumber && !/[0-9]/.test(s)) return { ok: false, error: 'Password must include a number.' };
    return { ok: true };
  }
  function validateEmail(email) {
    const e = normEmail(email);
    if (!e) return { ok: false, error: 'Email is required.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Please enter a valid email address.' };
    return { ok: true, email: e };
  }
  function validateUsername(u) {
    const s = normUser(u);
    if (!s) return { ok: false, error: 'Username is required.' };
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(s)) return { ok: false, error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' };
    return { ok: true, username: s };
  }


  // ------------------------------------------------------------
  // storage — accounts + audit log
  // ------------------------------------------------------------
  function lsGet(key) {
    const b = backing();
    try { return b.local ? b.local.getItem(key) : null; } catch (e) { return null; }
  }
  function lsSet(key, val) {
    const b = backing();
    try { if (!b.local) return false; b.local.setItem(key, val); return true; }
    catch (e) { return false; }
  }
  function ssGet(key) {
    const b = backing();
    try { return b.session ? b.session.getItem(key) : null; } catch (e) { return null; }
  }
  function ssSet(key, val) {
    const b = backing();
    try { if (!b.session) return false; b.session.setItem(key, val); return true; }
    catch (e) { return false; }
  }
  function ssDel(key) {
    const b = backing();
    try { if (b.session) b.session.removeItem(key); } catch (e) { /* blocked */ }
  }

  function blankAccount() {
    return {
      id: '', username: '', email: '', name: '', phone: '', role: 'painter',
      status: 'pending', memberId: '', photo: '', title: '', tagline: '', bio: '',
      startYear: '', quote: '', privacy: 'public', editRights: {}, createdAt: 0,
      approvedAt: 0, approvedBy: '', updatedAt: 0, pw: null, recovery: null,
      pwAt: 0, fails: 0, lockedUntil: 0
    };
  }

  // Normalise one raw record into a safe account, or null if unusable.
  function normaliseAccount(raw) {
    if (!isPlainObject(raw)) return null;
    const a = Object.assign(blankAccount(), raw);
    a.id = trim(a.id) || makeId('acc');
    a.username = normUser(a.username);
    a.email = normEmail(a.email);
    a.role = ROLE_IDS.indexOf(a.role) === -1 ? 'painter' : a.role;
    a.status = STATUSES.indexOf(a.status) === -1 ? 'pending' : a.status;
    a.privacy = a.privacy === 'private' ? 'private' : 'public';
    a.editRights = isPlainObject(a.editRights) ? a.editRights : {};
    a.pw = isPlainObject(a.pw) ? a.pw : null;
    a.recovery = isPlainObject(a.recovery) ? a.recovery : null;
    a.pwAt = parseInt(a.pwAt, 10) || 0;
    a.fails = parseInt(a.fails, 10) || 0;
    a.lockedUntil = parseInt(a.lockedUntil, 10) || 0;
    ['name', 'phone', 'memberId', 'photo', 'title', 'tagline', 'bio', 'startYear', 'quote', 'approvedBy']
      .forEach((k) => { a[k] = str(a[k]); });
    return a;
  }

  function read() {
    let stored;
    try { stored = JSON.parse(lsGet(STORE_KEY)); } catch (e) { stored = null; }
    const list = Array.isArray(stored) ? stored : [];
    return list.map(normaliseAccount).filter(Boolean);
  }

  function write(accounts) {
    return lsSet(STORE_KEY, JSON.stringify(accounts));
  }

  function audit(action, actorId, targetId, detail) {
    const entry = {
      id: makeId('log'), at: now(), action: str(action), actor: str(actorId),
      target: str(targetId), detail: detail == null ? '' : str(detail)
    };
    let log;
    try { log = JSON.parse(lsGet(AUDIT_KEY)); } catch (e) { log = null; }
    if (!Array.isArray(log)) log = [];
    log.push(entry);
    if (log.length > AUDIT_LIMIT) log = log.slice(log.length - AUDIT_LIMIT);
    lsSet(AUDIT_KEY, JSON.stringify(log));
    return entry;
  }
  function localAuditLog() {
    let log;
    try { log = JSON.parse(lsGet(AUDIT_KEY)); } catch (e) { log = null; }
    if (!Array.isArray(log)) return [];
    return log.filter(isPlainObject).sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  function emit() {
    // Dispatch on the document (like PPTeam does) so `document.addEventListener`
    // listeners in the page scripts receive it. An event fired on `window` does
    // not reach a document-level listener.
    const target = (root && root.document) || root;
    if (target && typeof target.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      try { target.dispatchEvent(new root.CustomEvent('ppauth:change')); } catch (e) { /* noop */ }
    }
  }

  function findByLogin(accounts, login) {
    const key = normUser(login);
    if (!key) return null;
    return accounts.find((a) => a.username === key || a.email === key) || null;
  }
  function findById(accounts, id) {
    const key = trim(id);
    return accounts.find((a) => a.id === key) || null;
  }


  // ------------------------------------------------------------
  // session
  // ------------------------------------------------------------
  function sessionMinutes() {
    const m = (root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.sessionMinutes) || 480;
    return Math.max(1, parseInt(m, 10) || 480);
  }

  function saveSession(account) {
    // pwAt binds the session to the password that created it: change or reset
    // the password and every older session stops matching, so it dies.
    const s = { id: account.id, at: now(), exp: now() + sessionMinutes() * 60000, token: randomHex(16), pwAt: parseInt(account.pwAt, 10) || 0 };
    ssSet(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function localCurrentSession() {
    let s;
    try { s = JSON.parse(ssGet(SESSION_KEY)); } catch (e) { s = null; }
    if (!isPlainObject(s) || !s.id) return null;
    if (s.exp && now() > s.exp) { ssDel(SESSION_KEY); return null; }
    return s;
  }

  // The signed-in account, or null. Re-reads the account each call so a
  // status/role change made elsewhere is reflected immediately, and drops the
  // session if the account is no longer active or its password has changed.
  function localCurrentUser() {
    const s = currentSession();
    if (!s) return null;
    const acc = findById(read(), s.id);
    if (!acc || acc.status !== 'active') { ssDel(SESSION_KEY); return null; }
    if ((parseInt(acc.pwAt, 10) || 0) !== (parseInt(s.pwAt, 10) || 0)) { ssDel(SESSION_KEY); return null; }
    return acc;
  }

  function localIsLoggedIn() { return !!localCurrentUser(); }

  function localLogout() {
    const u = currentUser();
    ssDel(SESSION_KEY);
    if (u) audit('logout', u.id, u.id, u.username);
    emit();
    return { ok: true };
  }

  // ------------------------------------------------------------
  // PERMISSIONS — the single source of truth. Every mutator calls
  // can(); the UI only mirrors what this decides. Never rely on a
  // hidden button for security.
  // ------------------------------------------------------------
  // Action keys:
  //   self.edit          edit your own permitted profile fields
  //   self.privacy       change your own public/private flag
  //   profile.edit       edit another member's profile
  //   profile.editContact edit a member's company contact fields
  //   account.manage     approve/reject/role/rights for any account
  //   audit.view         read the audit log
  //   roster.manage      add/remove team members (roster)
  //   projects.manage    manage portfolio projects
  // `extra` carries action-specific data (e.g. the role being assigned).
  function can(actor, action, target, extra) {
    const u = isPlainObject(actor) ? actor : null;
    const t = isPlainObject(target) ? target : null;
    if (!u || u.status !== 'active') return false;
    const lvl = ROLE_LEVEL[u.role] || 0;
    const isSelf = !!t && t.id === u.id;

    // A lead may only act on someone STRICTLY below their own level. This one
    // rule is what stops a Head managing another Head (or an Admin) — without
    // it, a Head could demote a peer, reset a peer's password, or hand out the
    // Admin role. Only an Admin sits at the top and so may act on anyone.
    const outranks = (target2) => {
      const tl = target2 ? (ROLE_LEVEL[target2.role] || 0) : 0;
      return lvl >= ROLE_LEVEL.admin || tl < lvl;
    };
    // A lead may never grant a role at or above their own — only an Admin may
    // create another Admin (or a Head, since the Admin outranks it).
    const canGrantRole = (role) => {
      const rl = ROLE_LEVEL[role] || 0;
      return lvl >= ROLE_LEVEL.admin || (rl > 0 && rl < lvl);
    };

    switch (action) {
      case 'self.edit':
        return isSelf;
      case 'self.privacy':
        return isSelf;
      case 'profile.edit':
        if (isSelf) return true;
        return outranks(t);
      case 'profile.editContact':
        // Company contact details: an Admin always; a lead for members they
        // outrank; a painter only for themselves AND only when granted the
        // 'contact' right.
        if (lvl >= ROLE_LEVEL.admin) return true;
        if (isSelf) return !!(u.editRights && u.editRights.contact);
        return outranks(t);
      case 'account.manage':
        if (lvl < ROLE_LEVEL.head) return false;
        // Never manage a peer or a superior; only an Admin may manage an Admin.
        return outranks(t);
      case 'role.assign':
        // Assigning a role needs account-management rights over the target AND
        // the authority to hand out that particular role.
        if (lvl < ROLE_LEVEL.head) return false;
        if (!outranks(t)) return false;
        return canGrantRole(extra);
      case 'audit.view':
        return lvl >= ROLE_LEVEL.head;
      case 'roster.manage':
        // A general capability when asked without a target; when a target is
        // given, the lead must outrank it (so a Head cannot re-role a peer).
        return lvl >= ROLE_LEVEL.head && (!t || outranks(t));
      case 'projects.manage':
        return lvl >= ROLE_LEVEL.head;
      default:
        return false;
    }
  }

  // Which profile fields may this actor set on this target right now?
  function editableFields(actor, target) {
    const fields = [];
    if (can(actor, 'profile.edit', target)) fields.push.apply(fields, SELF_FIELDS);
    if (can(actor, 'profile.editContact', target)) fields.push.apply(fields, COMPANY_FIELDS);
    return fields;
  }

  // ------------------------------------------------------------
  // REGISTER — creates a pending account awaiting Admin/Head approval
  // ------------------------------------------------------------
  async function localRegister(data) {
    const d = isPlainObject(data) ? data : {};
    const name = trim(d.name);
    if (!name) return { ok: false, error: 'Please enter your full name.' };
    const vUser = validateUsername(d.username);
    if (!vUser.ok) return { ok: false, error: vUser.error };
    const vEmail = validateEmail(d.email);
    if (!vEmail.ok) return { ok: false, error: vEmail.error };
    const vPw = validatePassword(d.password);
    if (!vPw.ok) return { ok: false, error: vPw.error };

    const accounts = read();
    if (findByLogin(accounts, vUser.username) || findByLogin(accounts, vEmail.email)) {
      return { ok: false, error: ERR.DUPLICATE };
    }

    let pw;
    try { pw = await hashPassword(d.password); }
    catch (e) { return { ok: false, error: ERR.NO_CRYPTO }; }

    const account = Object.assign(blankAccount(), {
      id: makeId('acc'),
      username: vUser.username,
      email: vEmail.email,
      name: name,
      phone: trim(d.phone),
      role: 'painter',
      status: 'pending',
      privacy: 'public',
      editRights: {},
      createdAt: now(),
      updatedAt: now(),
      pw: pw
    });
    accounts.push(account);
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('register', account.id, account.id, account.username);
    emit();
    return { ok: true, account: publicView(account) };
  }

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------
  async function localLogin(loginId, password) {
    const accounts = read();
    const account = findByLogin(accounts, loginId);
    // Always run a verification (even with no account) so a missing user and a
    // wrong password take a similar amount of time.
    const rec = account ? account.pw : { algo: 'PBKDF2-SHA256', iter: iterations(), salt: b64.encode(new Uint8Array(16)), hash: 'AAAA' };
    const passOk = await verifyPassword(password, rec);

    // Throttle: a locked account is refused before the password is even judged,
    // so a script cannot grind passwords. A correct password clears the counter.
    if (account && account.lockedUntil && now() < account.lockedUntil) {
      return { ok: false, error: 'Too many failed attempts. Try again in a few minutes.' };
    }
    if (!account || !passOk) {
      if (account) {
        account.fails = (parseInt(account.fails, 10) || 0) + 1;
        if (account.fails >= LOGIN_MAX_FAILS) { account.lockedUntil = now() + LOGIN_LOCK_MS; account.fails = 0; }
        write(accounts);
      }
      return { ok: false, error: ERR.BAD_CREDENTIALS };
    }
    if (account.status === 'pending') return { ok: false, error: 'Your account is awaiting Admin/Head approval.' };
    if (account.status === 'rejected') return { ok: false, error: 'Your account request was rejected.' };
    if (account.status === 'suspended') return { ok: false, error: 'Your account is suspended. Contact the Admin.' };
    if (account.fails || account.lockedUntil) { account.fails = 0; account.lockedUntil = 0; write(accounts); }
    saveSession(account);
    audit('login', account.id, account.id, account.username);
    emit();
    return { ok: true, account: publicView(account) };
  }

  // ------------------------------------------------------------
  // AUTHORIZED WRITES
  // ------------------------------------------------------------
  // Update a member's profile. Only the fields the actor is allowed to change
  // are applied; anything else in `patch` is silently ignored (so a crafted
  // call cannot smuggle a role or status change through the profile path).
  function localUpdateProfile(actor, targetId, patch) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const target = findById(accounts, targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'profile.edit', target) && !can(me, 'profile.editContact', target)) {
      return { ok: false, error: ERR.NOT_AUTHORIZED };
    }
    const allowed = editableFields(me, target);
    const p = isPlainObject(patch) ? patch : {};
    const changed = [];
    allowed.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(p, f)) {
        const next = trim(p[f]);
        if (target[f] !== next) { target[f] = next; changed.push(f); }
      }
    });
    if (!changed.length) return { ok: true, account: publicView(target), changed: [] };
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('profile.update', me.id, target.id, changed.join(', '));
    emit();
    return { ok: true, account: publicView(target), changed: changed };
  }

  function localUpdateAccount(actor, targetId, patch) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const target = findById(accounts, targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'account.manage', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    const p = isPlainObject(patch) ? patch : {};
    const changed = [];
    if (Object.prototype.hasOwnProperty.call(p, 'role') && ROLE_IDS.indexOf(p.role) !== -1 && p.role !== target.role) {
      // The actor must be allowed to hand out this particular role — a Head can
      // never grant admin/head, and no one may promote a peer or superior.
      if (!can(me, 'role.assign', target, p.role)) return { ok: false, error: ERR.NOT_AUTHORIZED };
      // Guard: never leave the site without an active Admin.
      if (target.role === 'admin' && p.role !== 'admin' && localCountActiveAdmins(accounts) <= 1) {
        return { ok: false, error: ERR.LAST_ADMIN };
      }
      target.role = p.role; changed.push('role');
    }
    if (Object.prototype.hasOwnProperty.call(p, 'status') && STATUSES.indexOf(p.status) !== -1 && p.status !== target.status) {
      if (target.role === 'admin' && p.status !== 'active' && localCountActiveAdmins(accounts) <= 1) {
        return { ok: false, error: ERR.LAST_ADMIN };
      }
      target.status = p.status; changed.push('status');
      if (p.status === 'active') { target.approvedAt = now(); target.approvedBy = me.id; }
    }
    if (isPlainObject(p.editRights)) {
      target.editRights = Object.assign({}, target.editRights, p.editRights); changed.push('editRights');
    }
    if (Object.prototype.hasOwnProperty.call(p, 'memberId')) {
      target.memberId = trim(p.memberId); changed.push('memberId');
    }
    if (!changed.length) return { ok: true, account: publicView(target), changed: [] };
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('account.update', me.id, target.id, changed.join(', '));
    emit();
    return { ok: true, account: publicView(target), changed: changed };
  }

  // Convenience wrappers used by the admin UI, all authorisation-checked.
  function localSetStatus(actor, targetId, status) { return localUpdateAccount(actor, targetId, { status: status }); }
  function localSetRole(actor, targetId, role) { return localUpdateAccount(actor, targetId, { role: role }); }
  function localSetEditRights(actor, targetId, rights) { return localUpdateAccount(actor, targetId, { editRights: rights }); }

  // ------------------------------------------------------------
  // PRIVACY — a painter controls their own visibility
  // ------------------------------------------------------------
  function localSetPrivacy(actor, targetId, privacy) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const target = findById(accounts, targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    // Own privacy, or an Admin/Head setting it for a painter in scope.
    if (!can(me, 'self.privacy', target) && !can(me, 'account.manage', target)) {
      return { ok: false, error: ERR.NOT_AUTHORIZED };
    }
    target.privacy = privacy === 'private' ? 'private' : 'public';
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('privacy.set', me.id, target.id, target.privacy);
    emit();
    return { ok: true, account: publicView(target) };
  }

  // Is this profile visible to a cold, anonymous visitor?
  function isPublic(account) {
    if (!isPlainObject(account)) return false;
    if (account.status !== 'active') return false;
    return account.privacy !== 'private';
  }

  // ------------------------------------------------------------
  // PASSWORD change & recovery
  // ------------------------------------------------------------
  async function localChangePassword(actor, currentPassword, newPassword) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    if (!me) return { ok: false, error: ERR.NOT_FOUND };
    const okPw = await verifyPassword(currentPassword, me.pw);
    if (!okPw) return { ok: false, error: ERR.WRONG_PASSWORD };
    const v = validatePassword(newPassword);
    if (!v.ok) return { ok: false, error: v.error };
    try { me.pw = await hashPassword(newPassword); }
    catch (e) { return { ok: false, error: ERR.NO_CRYPTO }; }
    me.recovery = null;
    me.pwAt = now();                             // invalidate other sessions
    me.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('password.change', me.id, me.id, '');
    // Re-issue the caller's own session against the new password stamp so the
    // person who just changed it is not logged out of the tab they are in.
    saveSession(me);
    emit();
    return { ok: true };
  }

  // Admin/Head sets a new password for a member (reset on their behalf).
  async function localResetPassword(actor, targetId, newPassword) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const target = findById(accounts, targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'account.manage', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    const v = validatePassword(newPassword);
    if (!v.ok) return { ok: false, error: v.error };
    try { target.pw = await hashPassword(newPassword); }
    catch (e) { return { ok: false, error: ERR.NO_CRYPTO }; }
    target.recovery = null;
    target.pwAt = now();                         // the member's old sessions die
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('password.reset', me.id, target.id, '');
    emit();
    return { ok: true };
  }

  // Step 1 of recovery. A backend-less site cannot send email, so an
  // Admin/Head issues a one-time code to the member out-of-band (they hand it
  // over in person or by phone). The code is NEVER returned to an unauthenticated
  // caller — the earlier version returned it, so anyone could take over any
  // account by typing the victim's email. Only the code's SHA-256 digest is
  // stored, it expires in 30 minutes, and it can be used once.
  //
  // Returns { ok:true, code } only to an authorised issuer (an Admin/Head acting
  // on an account they outrank); every other caller gets { ok:true, sent:true }
  // with no code, so the form reveals nothing about which accounts exist.
  async function localIssueRecoveryCode(actor, targetId) {
    const accounts = read();
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const target = findById(accounts, targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'account.manage', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    if (target.status !== 'active') return { ok: false, error: 'Only an active account can be recovered.' };
    const code = randomHex(4).toUpperCase();     // 8 hex chars = 32 bits
    target.recovery = { hash: await sha256Hex(SALT_RECOVERY + code), exp: now() + 30 * 60000, used: false, tries: 0 };
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('recovery.issue', me.id, target.id, '');
    emit();
    return { ok: true, code: code };
  }

  // Public "forgot password" entry point. Always answers the same way, and
  // never hands back a code — a real deployment wires this to an email sender
  // (or Supabase's recover endpoint). It is deliberately inert for the caller.
  function localRequestRecovery(email) {
    const key = normEmail(email);
    // Record the request in the audit log only when it names a real account, but
    // keep the *response* identical either way.
    const accounts = read();
    const account = findByLogin(accounts, key);
    if (account) {
      audit('recovery.request', account.id, account.id, '');
      emit();
    }
    return { ok: true, sent: true };
  }

  // Step 2: redeem the code and set a new password. Single-use, expiry-checked,
  // and attempt-limited so a 32-bit code cannot be brute-forced from a script.
  async function localResetWithCode(email, code, newPassword) {
    const accounts = read();
    const account = findByLogin(accounts, email);
    const rec = account && account.recovery;
    if (!account || !isPlainObject(rec) || rec.used || !rec.hash) return { ok: false, error: ERR.BAD_CODE };
    if (rec.exp && now() > rec.exp) return { ok: false, error: ERR.BAD_CODE };
    if (parseInt(rec.tries, 10) >= RECOVERY_MAX_TRIES) return { ok: false, error: ERR.BAD_CODE };
    const got = await sha256Hex(SALT_RECOVERY + trim(code).toUpperCase());
    if (!timingSafeEqual(got, str(rec.hash))) {
      // Count the failed attempt; burn the code once the budget is spent.
      rec.tries = (parseInt(rec.tries, 10) || 0) + 1;
      if (rec.tries >= RECOVERY_MAX_TRIES) rec.used = true;
      account.recovery = rec;
      write(accounts);
      return { ok: false, error: ERR.BAD_CODE };
    }
    const v = validatePassword(newPassword);
    if (!v.ok) return { ok: false, error: v.error };
    try { account.pw = await hashPassword(newPassword); }
    catch (e) { return { ok: false, error: ERR.NO_CRYPTO }; }
    account.recovery = null;
    account.pwAt = now();                        // invalidate existing sessions
    account.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('recovery.reset', account.id, account.id, '');
    emit();
    return { ok: true };
  }

  // ------------------------------------------------------------
  // reads (never expose the password record)
  // ------------------------------------------------------------
  function publicView(account) {
    if (!isPlainObject(account)) return null;
    const a = Object.assign({}, account);
    delete a.pw;
    delete a.recovery;
    return a;
  }

  function localListAccounts() { return read().map(publicView); }
  function localGetAccount(id) { return publicView(findById(read(), id)); }
  function localFindByMember(memberId) {
    const key = trim(memberId);
    if (!key) return null;
    return publicView(read().find((a) => a.memberId && a.memberId === key) || null);
  }
  function localListByStatus(status) {
    return localListAccounts().filter((a) => a.status === status);
  }
  function localCountActiveAdmins(accounts) {
    const list = accounts || read();
    return list.filter((a) => a.role === 'admin' && a.status === 'active').length;
  }

  // The first Admin gets created once, on first use, so the site is
  // administrable out of the box. Its credentials are set by the operator
  // (documented in docs/AUTH.md) — change them immediately after first login.
  function seedIfEmpty() {
    const accounts = read();
    if (accounts.length) return { ok: true, seeded: false };
    // Deliberately NOT done automatically: seeding a default password would be
    // a back door. The Admin registers through login.html and is activated by
    // the first-run bootstrap below.
    return { ok: true, seeded: false, needsBootstrap: true };
  }

  // Bootstrap: if there is no Admin yet, a registered account may be promoted
  // to Admin by an operator who holds the *deployment passcode*. This keeps a
  // fresh install administrable without shipping a password.
  //
  // SECURITY: the earlier version only checked "no Admin exists yet", so ANY
  // account — even a never-approved `pending` one — could promote ITSELF to
  // Admin with a forged/absent actor, which is a total authentication bypass.
  // The bootstrap now requires the operator passcode (a secret only the
  // deployer holds), which is what makes the promotion trustworthy. The
  // passcode is never stored in plaintext; only its salted SHA-256 digest lives
  // in PP_AUTH_CONFIG. If no digest is configured the path is closed (fail
  // closed), and an existing Admin can still promote members from the UI.
  function localNeedsBootstrapAdmin() {
    return localCountActiveAdmins() === 0;
  }

  function bootstrapDigest() {
    const c = root.PP_AUTH_CONFIG || {};
    return str(c.bootstrapPasscodeSha256).trim().toLowerCase();
  }

  // Verify the operator passcode against the configured digest. Async because it
  // uses WebCrypto (with the same Node fallback as the password hasher).
  async function verifyBootstrapPasscode(passcode) {
    const want = bootstrapDigest();
    if (!want) return false;                       // no digest configured → closed
    if (!passcode) return false;
    const got = await sha256Hex(SALT_BOOTSTRAP + str(passcode));
    return !!got && timingSafeEqual(got, want);
  }

  // Promote an account to Admin. Allowed while there is no Admin yet (bootstrap,
  // operator passcode required), or by an existing Admin.
  async function localPromoteBootstrapAdmin(actor, targetId, passcode) {
    const accounts = read();
    const target = findById(accounts, targetId);
    if (!target) return { ok: false, error: ERR.NOT_FOUND };
    const me = isPlainObject(actor) ? findById(accounts, actor.id) : null;
    const byAdmin = !!me && can(me, 'account.manage', target) && me.role === 'admin';
    if (!byAdmin) {
      if (!localNeedsBootstrapAdmin()) return { ok: false, error: ERR.NOT_AUTHORIZED };
      // A suspended or rejected account may never be bootstrapped.
      if (target.status === 'suspended' || target.status === 'rejected') {
        return { ok: false, error: 'A suspended or rejected account cannot be made an Admin.' };
      }
      // The operator passcode is the gate: without it this is an open back door.
      let okPass = false;
      try { okPass = await verifyBootstrapPasscode(passcode); }
      catch (e) { return { ok: false, error: ERR.NO_CRYPTO }; }
      if (!okPass) return { ok: false, error: ERR.NOT_AUTHORIZED };
    }
    target.role = 'admin';
    target.status = 'active';
    target.approvedAt = now();
    target.approvedBy = me ? me.id : 'bootstrap';
    target.updatedAt = now();
    if (!write(accounts)) return { ok: false, error: ERR.STORAGE };
    audit('account.bootstrap-admin', me ? me.id : 'bootstrap', target.id, target.username);
    emit();
    return { ok: true, account: publicView(target) };
  }

  // ------------------------------------------------------------
  // Supabase provider — real, server-enforced auth + storage
  // ------------------------------------------------------------
  function supabaseCfg() {
    const c = (root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.supabase) || {};
    return { url: str(c.url).replace(/\/$/, ''), anonKey: str(c.anonKey), profilesTable: c.profilesTable || 'pp_profiles', auditTable: c.auditTable || 'pp_audit_log' };
  }
  function supabaseReady() {
    const c = supabaseCfg();
    return !!(c.url && c.anonKey && root.fetch);
  }
  function providerName() {
    const p = (root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.provider) || 'local';
    return p === 'supabase' && supabaseReady() ? 'supabase' : 'local';
  }
  // Thin REST wrapper. Authorisation is enforced by Postgres row-level security,
  // NOT by this client — the anon key is public by design.
  async function sbFetch(path, options) {
    const c = supabaseCfg();
    const res = await root.fetch(c.url + '/rest/v1/' + path, Object.assign({
      headers: {
        apikey: c.anonKey,
        Authorization: 'Bearer ' + c.anonKey,
        'Content-Type': 'application/json'
      }
    }, options || {}));
    if (!res.ok) {
      let msg = 'Request failed (' + res.status + ')';
      try { const body = await res.json(); if (body && body.message) msg = body.message; } catch (e) { /* keep default */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // Auth endpoints live under /auth/v1, not /rest/v1.
  async function sbAuth(path, body) {
    const c = supabaseCfg();
    const res = await root.fetch(c.url + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: c.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const msg = (payload && (payload.msg || payload.error_description || payload.error)) || ('Auth failed (' + res.status + ')');
      throw new Error(msg);
    }
    return payload;
  }

  function sbSession() {
    try { return JSON.parse(ssGet(SESSION_KEY)); } catch (e) { return null; }
  }
  function sbSaveSession(s) { ssSet(SESSION_KEY, JSON.stringify(s)); }

  // A profile row as stored in pp_profiles. RLS decides who may read/write it.
  function sbRow(account) {
    return {
      id: account.id, username: account.username, email: account.email,
      name: account.name, phone: account.phone, role: account.role,
      status: account.status, member_id: account.memberId || null,
      photo: account.photo, title: account.title, tagline: account.tagline,
      bio: account.bio, start_year: account.startYear, quote: account.quote,
      privacy: account.privacy, edit_rights: account.editRights || {}
    };
  }
  function sbAccount(row) {
    if (!isPlainObject(row)) return null;
    return normaliseAccount(Object.assign({}, row, {
      id: row.id, memberId: row.member_id, startYear: row.start_year,
      editRights: row.edit_rights, privacy: row.privacy, role: row.role, status: row.status
    }));
  }

  async function sbRegister(data) {
    const d = isPlainObject(data) ? data : {};
    const name = trim(d.name);
    if (!name) return { ok: false, error: 'Please enter your full name.' };
    const vUser = validateUsername(d.username); if (!vUser.ok) return { ok: false, error: vUser.error };
    const vEmail = validateEmail(d.email); if (!vEmail.ok) return { ok: false, error: vEmail.error };
    const vPw = validatePassword(d.password); if (!vPw.ok) return { ok: false, error: vPw.error };
    try {
      const signup = await sbAuth('signup', { email: vEmail.email, password: d.password });
      const uid = signup && signup.user && signup.user.id;
      if (!uid) throw new Error('Sign-up did not return a user.');
      const row = { id: uid, username: vUser.username, email: vEmail.email, name: name, phone: trim(d.phone), role: 'painter', status: 'pending', privacy: 'public', edit_rights: {} };
      await sbFetch(supabaseCfg().profilesTable, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      sbAudit('register', uid, uid, vUser.username);
      return { ok: true, account: sbAccount(row) };
    } catch (e) { return { ok: false, error: e.message || ERR.VALIDATION }; }
  }

  async function sbLogin(loginId, password) {
    // Supabase Auth signs in by email; a username is resolved to its email first.
    let email = normEmail(loginId);
    if (email.indexOf('@') === -1) {
      try {
        const rows = await sbFetch(supabaseCfg().profilesTable + '?username=eq.' + encodeURIComponent(normUser(loginId)) + '&select=email');
        if (Array.isArray(rows) && rows[0] && rows[0].email) email = rows[0].email;
      } catch (e) { /* fall through to a failed sign-in */ }
    }
    try {
      const tok = await sbAuth('token?grant_type=password', { email: email, password: password });
      const uid = tok && tok.user && tok.user.id;
      if (!uid) throw new Error(ERR.BAD_CREDENTIALS);
      const rows = await sbFetch(supabaseCfg().profilesTable + '?id=eq.' + encodeURIComponent(uid) + '&select=*');
      const account = Array.isArray(rows) ? sbAccount(rows[0]) : null;
      if (!account) throw new Error('No profile is linked to this login.');
      if (account.status === 'pending') return { ok: false, error: 'Your account is awaiting Admin/Head approval.' };
      if (account.status === 'rejected') return { ok: false, error: 'Your account request was rejected.' };
      if (account.status === 'suspended') return { ok: false, error: 'Your account is suspended. Contact the Admin.' };
      sbSaveSession({ id: account.id, at: now(), exp: now() + sessionMinutes() * 60000, access_token: tok.access_token, account: publicView(account) });
      sbAudit('login', account.id, account.id, account.username);
      return { ok: true, account: publicView(account) };
    } catch (e) { return { ok: false, error: ERR.BAD_CREDENTIALS }; }
  }

  async function sbLogout() {
    const s = sbSession();
    try { if (s && s.access_token) await root.fetch(supabaseCfg().url + '/auth/v1/logout', { method: 'POST', headers: { apikey: supabaseCfg().anonKey, Authorization: 'Bearer ' + s.access_token } }); } catch (e) { /* best effort */ }
    ssDel(SESSION_KEY);
    emit();
    return { ok: true };
  }

  function sbCurrentUser() {
    const s = sbSession();
    if (!isPlainObject(s) || !s.account) return null;
    if (s.exp && now() > s.exp) { ssDel(SESSION_KEY); return null; }
    return s.account;
  }

  // Reads and writes go through PostgREST; row-level security on the tables is
  // what actually authorises each row (see docs/AUTH.md for the policies).
  async function sbListAccounts() {
    const rows = await sbFetch(supabaseCfg().profilesTable + '?select=*&order=created_at.asc');
    return Array.isArray(rows) ? rows.map(sbAccount).filter(Boolean).map(publicView) : [];
  }
  async function sbGetAccount(id) {
    const rows = await sbFetch(supabaseCfg().profilesTable + '?id=eq.' + encodeURIComponent(str(id)) + '&select=*');
    return Array.isArray(rows) && rows[0] ? publicView(sbAccount(rows[0])) : null;
  }
  async function sbPatch(id, patch) {
    await sbFetch(supabaseCfg().profilesTable + '?id=eq.' + encodeURIComponent(str(id)), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    return { ok: true };
  }
  async function sbAuditLog() {
    const rows = await sbFetch(supabaseCfg().auditTable + '?select=*&order=at.desc&limit=500');
    return Array.isArray(rows) ? rows.filter(isPlainObject) : [];
  }
  // Best-effort audit write. The table's insert policy is what allows it; a
  // failure must never block the action the user asked for.
  async function sbAudit(action, actorId, targetId, detail) {
    try {
      await sbFetch(supabaseCfg().auditTable, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ at: now(), action: str(action), actor: str(actorId), target: str(targetId), detail: detail == null ? '' : str(detail) })
      });
    } catch (e) { /* audit is best-effort */ }
  }

  // --- Supabase mutators. The client repeats the same `can()` check the local
  // provider does (for a clear error and no wasted round-trip); the actual
  // enforcement is the row-level-security policy on the table.
  function sbCached(id) { return sbCache.accounts.find((a) => a.id === id) || null; }

  async function sbUpdateProfile(me, targetId, patch) {
    const target = sbCached(targetId) || await sbGetAccount(targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'profile.edit', target) && !can(me, 'profile.editContact', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    const allowed = editableFields(me, target);
    const p = isPlainObject(patch) ? patch : {};
    const row = {}, changed = [];
    allowed.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(p, f)) {
        const next = trim(p[f]);
        if (target[f] !== next) { row[f] = next; changed.push(f); }
      }
    });
    if (!changed.length) return { ok: true, account: target, changed: [] };
    try { await sbPatch(targetId, row); } catch (e) { return { ok: false, error: e.message || ERR.STORAGE }; }
    sbAudit('profile.update', me.id, targetId, changed.join(', '));
    await refresh();
    return { ok: true, account: await sbGetAccount(targetId), changed: changed };
  }

  async function sbUpdateAccount(me, targetId, patch) {
    const target = sbCached(targetId) || await sbGetAccount(targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'account.manage', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    const p = isPlainObject(patch) ? patch : {};
    const row = {}, changed = [];
    if (Object.prototype.hasOwnProperty.call(p, 'role') && ROLE_IDS.indexOf(p.role) !== -1 && p.role !== target.role) {
      if (!can(me, 'role.assign', target, p.role)) return { ok: false, error: ERR.NOT_AUTHORIZED };
      if (target.role === 'admin' && p.role !== 'admin' && countActiveAdmins() <= 1) return { ok: false, error: ERR.LAST_ADMIN };
      row.role = p.role; changed.push('role');
    }
    if (Object.prototype.hasOwnProperty.call(p, 'status') && STATUSES.indexOf(p.status) !== -1 && p.status !== target.status) {
      if (target.role === 'admin' && p.status !== 'active' && countActiveAdmins() <= 1) return { ok: false, error: ERR.LAST_ADMIN };
      row.status = p.status; changed.push('status');
    }
    if (isPlainObject(p.editRights)) { row.edit_rights = Object.assign({}, target.editRights, p.editRights); changed.push('editRights'); }
    if (Object.prototype.hasOwnProperty.call(p, 'memberId')) { row.member_id = trim(p.memberId) || null; changed.push('memberId'); }
    if (!changed.length) return { ok: true, account: target, changed: [] };
    try { await sbPatch(targetId, row); } catch (e) { return { ok: false, error: e.message || ERR.STORAGE }; }
    sbAudit('account.update', me.id, targetId, changed.join(', '));
    await refresh();
    return { ok: true, account: await sbGetAccount(targetId), changed: changed };
  }

  async function sbSetPrivacy(me, targetId, privacy) {
    const target = sbCached(targetId) || await sbGetAccount(targetId);
    if (!me || !target) return { ok: false, error: ERR.NOT_FOUND };
    if (!can(me, 'self.privacy', target) && !can(me, 'account.manage', target)) return { ok: false, error: ERR.NOT_AUTHORIZED };
    const next = privacy === 'private' ? 'private' : 'public';
    try { await sbPatch(targetId, { privacy: next }); } catch (e) { return { ok: false, error: e.message || ERR.STORAGE }; }
    sbAudit('privacy.set', me.id, targetId, next);
    await refresh();
    return { ok: true, account: await sbGetAccount(targetId) };
  }

  async function sbChangePassword(me, currentPassword, newPassword) {
    if (!me) return { ok: false, error: ERR.NOT_FOUND };
    const v = validatePassword(newPassword); if (!v.ok) return { ok: false, error: v.error };
    const s = sbSession();
    try {
      // Re-authenticate with the current password, then update it.
      const tok = await sbAuth('token?grant_type=password', { email: me.email, password: currentPassword });
      await root.fetch(supabaseCfg().url + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: supabaseCfg().anonKey, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (s) { s.access_token = tok.access_token; sbSaveSession(s); }
      return { ok: true };
    } catch (e) { return { ok: false, error: ERR.WRONG_PASSWORD }; }
  }

  function sessionMinutes() {
    return parseInt(root.PP_AUTH_CONFIG && root.PP_AUTH_CONFIG.sessionMinutes, 10) || 480;
  }

  // ------------------------------------------------------------
  // Provider dispatch
  // ------------------------------------------------------------
  // The public API is the same for both providers. Async operations (register,
  // login, logout, password changes) await the Supabase call when it is active.
  // Reads stay SYNCHRONOUS for callers, so in Supabase mode they serve a cache
  // that `refresh()` fills and then announces with `ppauth:change`.
  const sbCache = { accounts: [], audit: [], loaded: false };
  const useSupabase = () => providerName() === 'supabase';

  async function refresh() {
    if (!useSupabase()) return { ok: true, provider: 'local' };
    try {
      const [accounts, audit] = await Promise.all([sbListAccounts(), sbAuditLog().catch(() => [])]);
      sbCache.accounts = accounts; sbCache.audit = audit; sbCache.loaded = true;
      emit();
      return { ok: true, provider: 'supabase' };
    } catch (e) {
      return { ok: false, provider: 'supabase', error: e.message || ERR.STORAGE };
    }
  }

  // Fill the cache once when Supabase is configured, so the first render has data.
  if (useSupabase()) { refresh(); }

  // --- dispatched public API ---
  async function register(data) { return useSupabase() ? sbRegister(data) : localRegister(data); }
  async function login(loginId, password) { return useSupabase() ? sbLogin(loginId, password) : localLogin(loginId, password); }
  async function logout() { return useSupabase() ? sbLogout() : localLogout(); }
  function currentSession() {
    if (useSupabase()) { const s = sbSession(); return s && s.id ? { id: s.id, at: s.at, exp: s.exp } : null; }
    return localCurrentSession();
  }
  function currentUser() { return useSupabase() ? sbCurrentUser() : localCurrentUser(); }
  function isLoggedIn() { return !!currentUser(); }
  function updateProfile(me, targetId, patch) { return useSupabase() ? sbUpdateProfile(me, targetId, patch) : localUpdateProfile(me, targetId, patch); }
  function updateAccount(me, targetId, patch) { return useSupabase() ? sbUpdateAccount(me, targetId, patch) : localUpdateAccount(me, targetId, patch); }
  function setStatus(me, id, status) { return updateAccount(me, id, { status: status }); }
  function setRole(me, id, role) { return updateAccount(me, id, { role: role }); }
  function setEditRights(me, id, rights) { return updateAccount(me, id, { editRights: rights }); }
  function setPrivacy(me, id, privacy) { return useSupabase() ? sbSetPrivacy(me, id, privacy) : localSetPrivacy(me, id, privacy); }
  function changePassword(me, cur, next) { return useSupabase() ? sbChangePassword(me, cur, next) : localChangePassword(me, cur, next); }
  async function resetPassword(me, targetId, next) {
    // Supabase has no "admin sets a member's password" from the client (by
    // design — that needs a service role). The Admin instead issues a recovery
    // email; the local provider resets directly.
    if (useSupabase()) return { ok: false, error: 'Use password recovery: the member sets their own new password from the emailed link.' };
    return localResetPassword(me, targetId, next);
  }
  function requestRecovery(email) {
    if (useSupabase()) {
      try { root.fetch(supabaseCfg().url + '/auth/v1/recover', { method: 'POST', headers: { apikey: supabaseCfg().anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normEmail(email) }) }); } catch (e) { /* best effort */ }
      return { ok: true, sent: true, emailed: true };
    }
    return localRequestRecovery(email);
  }
  // Admin/Head issues a one-time recovery code to a member they outrank. The
  // code is returned ONLY to that authorised issuer.
  async function issueRecoveryCode(me, targetId) {
    if (useSupabase()) return { ok: false, error: 'Use password recovery: the member sets their own new password from the emailed link.' };
    return localIssueRecoveryCode(me, targetId);
  }
  async function resetWithCode(email, code, next) {
    if (useSupabase()) return { ok: false, error: 'In Supabase mode, follow the link in the recovery email to set a new password.' };
    return localResetWithCode(email, code, next);
  }
  function listAccounts() { return useSupabase() ? sbCache.accounts.slice() : localListAccounts(); }
  function getAccount(id) { return useSupabase() ? (sbCache.accounts.find((a) => a.id === id) || null) : localGetAccount(id); }
  function findByMember(memberId) { return useSupabase() ? (sbCache.accounts.find((a) => a.memberId && a.memberId === trim(memberId)) || null) : localFindByMember(memberId); }
  function listByStatus(status) { return listAccounts().filter((a) => a.status === status); }
  function auditLog() { return useSupabase() ? sbCache.audit.slice() : localAuditLog(); }
  function countActiveAdmins() { return listAccounts().filter((a) => a.role === 'admin' && a.status === 'active').length; }
  function needsBootstrapAdmin() { return countActiveAdmins() === 0; }
  // Synchronous for the local provider (callers read `.ok` directly); a promise
  // only in Supabase mode, where every write is a network round-trip. The
  // bootstrap path also requires the operator passcode.
  function promoteBootstrapAdmin(me, targetId, passcode) {
    if (useSupabase()) return sbUpdateAccount(me, targetId, { role: 'admin', status: 'active' });
    return localPromoteBootstrapAdmin(me, targetId, passcode);
  }

  return {
    // constants
    STORE_KEY, AUDIT_KEY, SESSION_KEY, ROLE_LEVEL, ROLES, ROLE_IDS, STATUSES,
    ACCOUNT_STATUS, SELF_FIELDS, COMPANY_FIELDS, PROFILE_FIELDS, ADMIN_FIELDS, ERR,
    // helpers
    _setStore, providerName, supabaseReady, refresh,
    // validation
    policy, validatePassword, validateEmail, validateUsername,
    // hashing
    hashPassword, verifyPassword,
    // session
    register, login, logout, currentUser, isLoggedIn, currentSession,
    // permissions
    can, editableFields,
    // writes
    updateProfile, updateAccount, setStatus, setRole, setEditRights, setPrivacy,
    changePassword, resetPassword, requestRecovery, issueRecoveryCode, resetWithCode,
    // reads
    listAccounts, getAccount, findByMember, listByStatus, isPublic, auditLog,
    countActiveAdmins, needsBootstrapAdmin, promoteBootstrapAdmin, seedIfEmpty
  };
});



