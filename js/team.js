/* ============================================================
   PAINTER PLUS — TEAM ROSTER & ROLES (shared, localStorage)
   ------------------------------------------------------------
   This is a static site with no backend, so the roster lives in
   localStorage and is shared by every page that loads this file.

   Roles (highest first)
     owner      👑  founder-owner of Painter Plus — full control
     head       🎩  runs the crew — may change anyone's role
     supervisor 🛡️  supervises site work, checks quality, signs off
     painter    🎨  applies the paint and finishes on site
     helper     🧰  assists the painter with preparation/materials

   `gahonsh` is the Head. Every other member starts as a Painter.
   Both Owner and Head may change roles, so the Head can promote any
   member to Painter, Helper, Supervisor, Head or Owner from that
   member's profile page or the Admin page's "Team & Roles" tab.
   The roster can never lose its last Owner/Head.
   ============================================================ */
(function () {
  'use strict';

  const STORE_KEY = 'painterPlusTeam';
  const LEGACY_PROFILE_KEY = 'painterPlusProfile';
  const SESSION_KEY = 'ppAdminUnlocked';
  const CLAIM_KEY = 'ppClaimedMember';
  const OWNER_ID = 'gahonsh';

  // ----- Staff passcode gate -----
  // The passcode is NOT stored in this file. Only a salted SHA-256 digest is,
  // so reading the served JavaScript (view-source, DevTools, a downloaded
  // js/team.js) does not reveal the passcode itself.
  //
  // This is still only a "keep casual visitors out" gate, not real security:
  // this is a static site with no backend, so anyone who can edit the page in
  // their own browser can bypass it, and every write lands in their own
  // localStorage. The digest is public and a weak passcode is brute-forceable —
  // real access control would need a server.
  //
  // To change the passcode: run  node tests/hash-passcode.js "new-passcode"
  // and paste the printed digest into PASSCODE_SHA256.
  const PASSCODE_SALT = 'painter-plus::v1::';
  const PASSCODE_SHA256 = 'bd5d0a0f172395f3302a296fe221ecf42b58bcf6b4fef9a7d418d11b61771fec';

  // Minimal UTF-8-aware SHA-256 (no dependencies, works in every browser we
  // support). Verified against Node's crypto in tests/passcode.test.js.
  function sha256Hex(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        const c2 = str.charCodeAt(++i);
        c = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0);
    bytes.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
    const w = new Array(64);
    for (let off = 0; off < bytes.length; off += 64) {
      for (let j = 0; j < 16; j++) {
        w[j] = ((bytes[off + j * 4] << 24) | (bytes[off + j * 4 + 1] << 16) |
                (bytes[off + j * 4 + 2] << 8) | bytes[off + j * 4 + 3]) >>> 0;
      }
      for (let j = 16; j < 64; j++) {
        const s0 = (rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)) >>> 0;
        const s1 = (rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)) >>> 0;
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let k = 0; k < 64; k++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + K[k] + w[k]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const hex = (x) => ('00000000' + x.toString(16)).slice(-8);
    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
  }

  function passcodeDigest(passcode) {
    return sha256Hex(PASSCODE_SALT + String(passcode == null ? '' : passcode));
  }

  const ROLES = [
    { id: 'owner', label: 'Owner', icon: '👑', desc: 'Founder-owner of Painter Plus. Full control, and may change anyone\'s role.' },
    { id: 'head', label: 'Head', icon: '🎩', desc: 'Runs the crew day to day and may change anyone\'s role.' },
    { id: 'supervisor', label: 'Supervisor', icon: '🛡️', desc: 'Supervises site work, checks quality and signs off finished jobs.' },
    { id: 'painter', label: 'Painter', icon: '🎨', desc: 'Applies the paint, putty and finishes on site.' },
    { id: 'helper', label: 'Helper', icon: '🧰', desc: 'Assists the painter with surface preparation and materials.' }
  ];

  const ROLE_IDS = ROLES.map(r => r.id);
  // Roles that can open the role controls and change anyone's role.
  const MANAGER_ROLE_IDS = ['owner', 'head'];
  // The roster must always keep at least one of these, so it can never
  // end up without anyone able to run it.
  const LEAD_ROLE_IDS = ['owner', 'head'];

  // Shared contact defaults — the real business details.
  function contactDefaults() {
    return {
      phone: '+91 8825183628',
      email: 'gahonsh@gmail.com',
      address: 'Upar Balalong, Arki, Khunti, Jharkhand – 835225',
      note: 'Active since 2015 · 5-year warranty on every project · Free site inspection'
    };
  }

  function blankMember(role) {
    return Object.assign({
      id: '',
      name: '',
      role: role || 'painter',
      title: '',
      photo: '',
      tagline: '',
      bio: '',
      startYear: '',
      // Optional highlight chips. Left blank on purpose: the profile's real
      // numbers come from the work log (see js/gallery.js), not typed claims.
      stat1: '', stat1label: '',
      stat2: '', stat2label: '',
      stat3: '', stat3label: '',
      stat4: '', stat4label: '',
      quote: '',
      order: 99
    }, contactDefaults());
  }

  // The founding member gahonsh — starts as Head, and is the default
  // member shown on painter-profile.html when no member id is given.
  function ownerMember() {
    return Object.assign(blankMember('head'), {
      id: OWNER_ID,
      name: 'Gahonsh',
      role: 'head',
      title: 'Head & Founder — Painter Plus',
      startYear: '2015',
      tagline: 'Master painter crafting premium finishes across Jharkhand since 2015.',
      bio: 'A hands-on painting specialist with a decade of on-site experience. From precise surface preparation to the final flawless coat, every project is treated as a signature piece. The belief is simple: great paint is 70% preparation and 100% care.',
      quote: '“Paint is the first thing a room says about itself. I make sure it always says quality.”',
      order: 0
    });
  }

  // Sample crew so the roster is visible from day one. All of them are
  // Painters — the Head re-roles them as needed from their profile pages.
  function sampleCrew() {
    return [
      Object.assign(blankMember('painter'), {
        id: 'ramesh-kumar', name: 'Ramesh Kumar', role: 'painter', order: 1,
        title: 'Senior Painter',
        tagline: 'Interior and exterior finishing with a steady hand.',
        bio: 'Handles interior and exterior coats, cutting-in and trim work. Known for clean edges and tidy sites.'
      }),
      Object.assign(blankMember('painter'), {
        id: 'suresh-mahto', name: 'Suresh Mahto', role: 'painter', order: 2,
        title: 'Texture & Putty Specialist',
        tagline: 'Wall putty, crack filling and designer textures.',
        bio: 'Specialises in surface preparation — putty, sanding and hand-troweled texture finishes.'
      }),
      Object.assign(blankMember('painter'), {
        id: 'ajay-munda', name: 'Ajay Munda', role: 'painter', order: 3,
        title: 'Painter',
        tagline: 'Reliable coats, on time, on budget.',
        bio: 'Works across residential and commercial projects, from single rooms to full buildings.'
      })
    ];
  }

  // Escapes text AND the quote characters, so it is safe in both text nodes
  // and quoted HTML attributes (names, ids and photo URLs are interpolated
  // into attributes on the team, profile and admin pages).
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function read() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { stored = null; }

    if (!Array.isArray(stored) || !stored.length) {
      const seeded = [ownerMember()].concat(sampleCrew());
      // Carry over any profile saved by the older single-profile admin editor.
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY));
        if (legacy && typeof legacy === 'object') Object.assign(seeded[0], legacy, { id: OWNER_ID, role: 'head' });
      } catch { /* ignore malformed legacy data */ }
      write(seeded);
      return seeded;
    }
    // A hand-edited roster can hold a null, a scalar or a bare array. Every
    // reader (list/get/head) does `m.role`, `m.name`, so drop anything that is
    // not a plain object before it can throw.
    return stored
      .filter(m => m && typeof m === 'object' && !Array.isArray(m))
      .map(m => Object.assign(blankMember(m.role), m));
  }

  function write(members) {
    let ok = true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(members)); }
    catch { ok = false; }
    emit();
    return ok;
  }

  const STORAGE_ERROR = 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.';

  function emit() {
    document.dispatchEvent(new CustomEvent('ppteam:change'));
  }

  function roleOf(id) {
    return ROLES.find(r => r.id === id) || ROLES.find(r => r.id === 'painter');
  }

  function roleRank(id) {
    const i = ROLE_IDS.indexOf(id);
    return i === -1 ? ROLE_IDS.length : i;
  }

  function list() {
    return read().slice().sort((a, b) => {
      const byRank = roleRank(a.role) - roleRank(b.role);
      if (byRank) return byRank;
      const byOrder = (a.order == null ? 99 : a.order) - (b.order == null ? 99 : b.order);
      return byOrder || String(a.name).localeCompare(String(b.name));
    });
  }

  function get(id) {
    return read().find(m => m.id === id) || null;
  }

  // The member who fronts the crew: the Owner if there is one, else the Head.
  function head() {
    const members = read();
    return members.find(m => m.role === 'owner') ||
           members.find(m => m.role === 'head') ||
           members[0];
  }

  function slugify(name, taken) {
    let base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
    let id = base;
    let n = 2;
    while (taken.indexOf(id) !== -1) { id = base + '-' + n; n++; }
    return id;
  }

  function save(member) {
    const members = read();
    const clean = Object.assign(blankMember(member.role), member);
    if (!ROLE_IDS.includes(clean.role)) clean.role = 'painter';

    let idx = members.findIndex(m => m.id === clean.id);
    if (!clean.id) {
      clean.id = slugify(clean.name, members.map(m => m.id));
      idx = -1;
    }
    if (idx >= 0) {
      // never let the roster lose its last Owner/Head
      const wasLead = LEAD_ROLE_IDS.includes(members[idx].role);
      const staysLead = LEAD_ROLE_IDS.includes(clean.role);
      if (wasLead && !staysLead && countLeads(members) === 1) {
        return { ok: false, error: 'There must always be at least one Owner or Head. Promote someone else first.' };
      }
      members[idx] = clean;
    } else {
      members.push(clean);
    }
    if (!write(members)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, member: clean };
  }

  function setRole(id, roleId) {
    if (!ROLE_IDS.includes(roleId)) return { ok: false, error: 'Unknown role.' };
    const member = get(id);
    if (!member) return { ok: false, error: 'Member not found.' };
    member.role = roleId;
    return save(member);
  }

  // True when moving `id` to `roleId` would leave the roster without any
  // Owner or Head. The UI uses this to disable the option before saving.
  function wouldStrandLeads(id, roleId) {
    const members = read();
    const target = members.find(m => m.id === id);
    if (!target) return false;
    if (!LEAD_ROLE_IDS.includes(target.role)) return false;
    if (LEAD_ROLE_IDS.includes(roleId)) return false;
    return countLeads(members) === 1;
  }

  function remove(id) {
    const members = read();
    const target = members.find(m => m.id === id);
    if (!target) return { ok: false, error: 'Member not found.' };
    if (LEAD_ROLE_IDS.includes(target.role) && countLeads(members) === 1) {
      return { ok: false, error: 'The last Owner/Head cannot be removed. Promote someone else first.' };
    }
    if (!write(members.filter(m => m.id !== id))) return { ok: false, error: STORAGE_ERROR };
    return { ok: true };
  }

  function countLeads(members) {
    return (members || read()).filter(m => LEAD_ROLE_IDS.includes(m.role)).length;
  }

  // Kept for callers that only care about the Head role.
  function countHeads(members) {
    return (members || read()).filter(m => m.role === 'head').length;
  }

  // ----- Head session (the passcode gate shared with admin.html) -----
  function isActingHead() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  }

  function unlockHead(passcode) {
    // Compare digests, not the raw passcode, so the plaintext is never in the
    // served file. A constant-time-ish compare is unnecessary here: the gate is
    // client-side only and the digest itself is public.
    if (passcodeDigest(passcode) !== PASSCODE_SHA256) return false;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* blocked */ }
    return true;
  }

  function lockHead() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked */ }
  }

  // True when the signed-in member's own role allows changing roles.
  // Used by the UI to decide whether to offer the role controls.
  function isManager(id) {
    if (!isActingHead()) return false;
    const me = id ? get(id) : head();
    return !!me && MANAGER_ROLE_IDS.includes(me.role);
  }

  // ----- Crew self-service ("this is me") -----
  // A painter can edit their own profile from their phone, but ONLY after
  // entering the staff passcode — the same gate as the admin/worklog/ERP pages.
  // There is no anonymous path: a random visitor viewing the public team or
  // profile pages cannot edit anyone's details or add/remove gallery photos.
  // `isMe` is true for the member who unlocked with the passcode, or for any
  // member while an Owner/Head session is active.
  function claim(id, passcode) {
    if (!id || !get(id)) return false;
    // Entering the passcode is what authorises the edit; it also opens the
    // Owner/Head session so the rest of the staff UI behaves consistently.
    if (!unlockHead(passcode)) return false;
    try { sessionStorage.setItem(CLAIM_KEY, String(id)); } catch { /* blocked */ }
    emit();
    return true;
  }
  function unclaim() {
    try { sessionStorage.removeItem(CLAIM_KEY); } catch { /* blocked */ }
    emit();
  }
  function claimedId() {
    try { return sessionStorage.getItem(CLAIM_KEY) || ''; } catch { return ''; }
  }
  function isMe(id) {
    if (!id) return false;
    if (!isActingHead()) return false;
    if (isManager()) return true;
    return claimedId() === id;
  }

  function memberFromQuery() {
    const id = new URLSearchParams(window.location.search).get('id');
    return id ? get(id) : head();
  }

  function roleBadge(member, extraClass) {
    const r = roleOf(member && member.role);
    return '<span class="role-badge role-' + esc(r.id) + (extraClass ? ' ' + extraClass : '') + '">' +
      r.icon + ' ' + esc(r.label) + '</span>';
  }

  function roleOptions(selected) {
    return ROLES.map(r =>
      '<option value="' + r.id + '"' + (r.id === selected ? ' selected' : '') + '>' + r.icon + ' ' + r.label + '</option>'
    ).join('');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  window.PPTeam = {
    STORE_KEY, LEGACY_PROFILE_KEY, SESSION_KEY, CLAIM_KEY, OWNER_ID, STORAGE_ERROR,
    PASSCODE_SHA256, passcodeDigest,
    ROLES, ROLE_IDS, MANAGER_ROLE_IDS, LEAD_ROLE_IDS,
    roleOf, roleRank, list, get, head, save, setRole, remove,
    countLeads, countHeads, wouldStrandLeads,
    isActingHead, isManager, unlockHead, lockHead,
    claim, unclaim, claimedId, isMe,
    memberFromQuery, roleBadge, roleOptions, initials, blankMember,
    ownerDefaults: ownerMember, esc
  };

  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) emit(); });
})();
