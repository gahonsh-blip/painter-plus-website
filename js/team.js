/* ============================================================
   PAINTER PLUS — TEAM ROSTER & ROLES (shared, localStorage)
   ------------------------------------------------------------
   This is a static site with no backend, so the roster lives in
   localStorage and is shared by every page that loads this file.

   Roles
     head       👑  owner of Painter Plus — the only role that may
                    change anyone's role
     supervisor 🛡️  supervises site work, checks quality, signs off
     painter    🎨  applies the paint and finishes on site
     helper     🧰  assists the painter with preparation/materials

   `gahonsh` is the Head. Every other member starts as a Painter,
   and the Head can promote or demote them (painter ⇄ helper /
   supervisor) from any member's profile page or from the Admin
   page's "Team & Roles" tab.
   ============================================================ */
(function () {
  'use strict';

  const STORE_KEY = 'painterPlusTeam';
  const LEGACY_PROFILE_KEY = 'painterPlusProfile';
  const SESSION_KEY = 'ppAdminUnlocked';
  const PASSCODE = 'painter123'; // client-side gate only — not real security
  const OWNER_ID = 'gahonsh';

  const ROLES = [
    { id: 'head', label: 'Head', icon: '👑', desc: 'Owner of Painter Plus. Only the Head can change roles.' },
    { id: 'supervisor', label: 'Supervisor', icon: '🛡️', desc: 'Supervises site work, checks quality and signs off finished jobs.' },
    { id: 'painter', label: 'Painter', icon: '🎨', desc: 'Applies the paint, putty and finishes on site.' },
    { id: 'helper', label: 'Helper', icon: '🧰', desc: 'Assists the painter with surface preparation and materials.' }
  ];

  const ROLE_IDS = ROLES.map(r => r.id);

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
      stat1: '10+', stat1label: 'Years experience',
      stat2: '500+', stat2label: 'Projects done',
      stat3: '5-yr', stat3label: 'Warranty',
      stat4: '100%', stat4label: 'Free inspection',
      quote: '',
      order: 99
    }, contactDefaults());
  }

  // The Head — site owner gahonsh. Also the default member shown on
  // painter-profile.html when no member id is given.
  function ownerMember() {
    return Object.assign(blankMember('head'), {
      id: OWNER_ID,
      name: 'Gahonsh',
      role: 'head',
      title: 'Head & Founder — Painter Plus',
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

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
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
    return stored.map(m => Object.assign(blankMember(m.role), m));
  }

  function write(members) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(members)); } catch { /* storage full/blocked */ }
    emit();
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('ppteam:change'));
  }

  function roleOf(id) {
    return ROLES.find(r => r.id === id) || ROLES.find(r => r.id === 'painter');
  }

  function list() {
    return read().slice().sort((a, b) => {
      if (a.role === 'head' && b.role !== 'head') return -1;
      if (b.role === 'head' && a.role !== 'head') return 1;
      const byOrder = (a.order == null ? 99 : a.order) - (b.order == null ? 99 : b.order);
      return byOrder || String(a.name).localeCompare(String(b.name));
    });
  }

  function get(id) {
    return read().find(m => m.id === id) || null;
  }

  function head() {
    return read().find(m => m.role === 'head') || read()[0];
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
      // never let the roster end up with zero Heads
      if (members[idx].role === 'head' && clean.role !== 'head' && countHeads(members) === 1) {
        return { ok: false, error: 'There must always be at least one Head. Promote someone else to Head first.' };
      }
      members[idx] = clean;
    } else {
      members.push(clean);
    }
    write(members);
    return { ok: true, member: clean };
  }

  function setRole(id, roleId) {
    if (!ROLE_IDS.includes(roleId)) return { ok: false, error: 'Unknown role.' };
    const member = get(id);
    if (!member) return { ok: false, error: 'Member not found.' };
    member.role = roleId;
    return save(member);
  }

  function remove(id) {
    const members = read();
    const target = members.find(m => m.id === id);
    if (!target) return { ok: false, error: 'Member not found.' };
    if (target.role === 'head' && countHeads(members) === 1) {
      return { ok: false, error: 'The last Head cannot be removed. Promote someone else to Head first.' };
    }
    write(members.filter(m => m.id !== id));
    return { ok: true };
  }

  function countHeads(members) {
    return (members || read()).filter(m => m.role === 'head').length;
  }

  // ----- Head session (the passcode gate shared with admin.html) -----
  function isActingHead() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  }

  function unlockHead(passcode) {
    if (passcode !== PASSCODE) return false;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* blocked */ }
    return true;
  }

  function lockHead() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked */ }
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
    STORE_KEY, LEGACY_PROFILE_KEY, SESSION_KEY, PASSCODE, OWNER_ID,
    ROLES, ROLE_IDS,
    roleOf, list, get, head, save, setRole, remove, countHeads,
    isActingHead, unlockHead, lockHead,
    memberFromQuery, roleBadge, roleOptions, initials, blankMember,
    ownerDefaults: ownerMember, esc
  };

  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) emit(); });
})();
