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
  const PASSCODE = 'painter123'; // client-side gate only — not real security
  const OWNER_ID = 'gahonsh';

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
      stat1: '10+', stat1label: 'Years experience',
      stat2: '500+', stat2label: 'Projects done',
      stat3: '5-yr', stat3label: 'Warranty',
      stat4: '100%', stat4label: 'Free inspection',
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
    write(members.filter(m => m.id !== id));
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
    if (passcode !== PASSCODE) return false;
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
    ROLES, ROLE_IDS, MANAGER_ROLE_IDS, LEAD_ROLE_IDS,
    roleOf, roleRank, list, get, head, save, setRole, remove,
    countLeads, countHeads, wouldStrandLeads,
    isActingHead, isManager, unlockHead, lockHead,
    memberFromQuery, roleBadge, roleOptions, initials, blankMember,
    ownerDefaults: ownerMember, esc
  };

  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) emit(); });
})();
