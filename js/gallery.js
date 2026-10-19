/* ============================================================
   PAINTER PLUS — WORK GALLERY & VERIFIED WORK RECORD
   ------------------------------------------------------------
   Gives every crew member a professional profile: a gallery of the
   work they actually did (photo + what/where/when), and a "work
   record" of numbers DERIVED FROM THE WORK LOG rather than typed in.

   Why derive instead of type? A number a painter types ("500+ projects")
   is a claim; a number the site computes from the day book is evidence.
   Clients trust the second one, and the Owner/Head can see who really
   did what. So the gallery is hand-curated (photos + captions), but the
   record band (years, projects, square feet, days, crews) is computed
   from `painterPlusWorkLog` and `painterPlusERP` every time it renders.

   Data shape (key: painterPlusGallery)
     {
       "<memberId>": [
         { id, title, photo, area, label, location, year, finish,
           project, projectId, sqft, note, at }
       ]
     }

   `photo` is a downscaled data-URL (like the work log) or an http(s) URL.

   Everything pure is unit-tested in tests/gallery.test.js; the browser
   storage, the file downscaler and the lightbox are guarded so a missing
   DOM or a blocked store cannot throw.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPGallery = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const STORE_KEY = 'painterPlusGallery';
  const WORKLOG_KEY = 'painterPlusWorkLog';
  const ERP_KEY = 'painterPlusERP';
  const TEAM_KEY = 'painterPlusTeam';

  // ============================================================
  // NUMERIC + TEXT HELPERS (pure)
  // ============================================================
  function num(n) {
    const v = parseFloat(n);
    return isFinite(v) && v > 0 ? v : 0;
  }
  function fmtSqft(n) {
    const v = Math.round((num(n)) * 10) / 10;
    return v.toLocaleString('en-IN') + ' sq ft';
  }
  function fmtCount(n) {
    return Math.round(num(n)).toLocaleString('en-IN');
  }
  // A year like 2015, else 0. Used for the derived "years experience".
  function year(v) {
    const y = parseInt(v, 10);
    return y >= 1900 && y <= 2100 ? y : 0;
  }

  // ============================================================
  // STORE (guarded, in-memory fallback like js/erp.js)
  // ============================================================
  let store = null;
  function backing() {
    if (store) return store;
    try { store = (root && root.localStorage) || null; } catch (e) { store = null; }
    return store;
  }
  function _setStore(s) { store = s; }

  function readRaw() {
    const s = backing();
    if (!s) return {};
    let raw;
    try { raw = JSON.parse(s.getItem(STORE_KEY)); } catch (e) { raw = null; }
    return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  }
  function writeRaw(data) {
    const s = backing();
    let ok = true;
    if (s) { try { s.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { ok = false; } }
    if (root && root.document) {
      try { root.document.dispatchEvent(new CustomEvent('ppgallery:change')); } catch (e) { /* no CustomEvent */ }
    }
    return ok;
  }

  const STORAGE_ERROR = 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.';

  // ============================================================
  // ITEM SHAPE (pure)
  // ============================================================
  function blankItem() {
    return {
      id: '', title: '', photo: '', area: '', label: '',
      location: '', year: '', finish: '',
      project: '', projectId: '', sqft: 0, note: '', at: ''
    };
  }
  function normaliseItem(item) {
    const out = Object.assign(blankItem(), item || {});
    out.id = String(out.id || '');
    out.title = String(out.title || '');
    out.photo = String(out.photo || '');
    out.area = String(out.area || '');
    out.label = String(out.label || '');
    out.location = String(out.location || '');
    out.year = String(out.year || '');
    out.finish = String(out.finish || '');
    out.project = String(out.project || '');
    out.projectId = String(out.projectId || '');
    out.sqft = num(out.sqft);
    out.note = String(out.note || '');
    out.at = String(out.at || '');
    return out;
  }
  function makeId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  // Newest first by `at`, then by id (stable for items with no timestamp).
  function sortItems(items) {
    return (items || []).slice().sort((a, b) => {
      const byAt = String(b.at || '').localeCompare(String(a.at || ''));
      if (byAt) return byAt;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }

  // ============================================================
  // CRUD (pure over the data object)
  // ============================================================
  function list(memberId, data) {
    const d = data || readRaw();
    return sortItems(d[memberId] || []);
  }
  function get(memberId, id, data) {
    return list(memberId, data).find((x) => x.id === id) || null;
  }
  function count(memberId, data) {
    return ((data || readRaw())[memberId] || []).length;
  }
  function add(memberId, item, data) {
    const d = data || readRaw();
    const clean = normaliseItem(item);
    if (!clean.title && !clean.photo) return { ok: false, error: 'Add at least a title or a photo.' };
    if (!clean.id) clean.id = makeId();
    if (!clean.at) clean.at = new Date().toISOString();
    if (!d[memberId]) d[memberId] = [];
    const idx = d[memberId].findIndex((x) => x.id === clean.id);
    if (idx >= 0) d[memberId][idx] = clean; else d[memberId].push(clean);
    if (data === undefined && !writeRaw(d)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, item: clean, data: d };
  }
  function remove(memberId, id, data) {
    const d = data || readRaw();
    if (d[memberId]) d[memberId] = d[memberId].filter((x) => x.id !== id);
    if (data === undefined && !writeRaw(d)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, data: d };
  }
  function removeAll(memberId, data) {
    const d = data || readRaw();
    delete d[memberId];
    if (data === undefined && !writeRaw(d)) return { ok: false, error: STORAGE_ERROR };
    return { ok: true, data: d };
  }

  // Every gallery item across every member, newest first, each tagged with
  // the member it belongs to. Powers the public crew gallery.
  function feed(data) {
    const d = data || readRaw();
    const out = [];
    Object.keys(d).forEach((memberId) => {
      (d[memberId] || []).forEach((item) => out.push(Object.assign({ memberId: memberId }, normaliseItem(item))));
    });
    return sortItems(out);
  }

  // ============================================================
  // WORK RECORD — derived from the work log + ERP + roster (pure)
  // ------------------------------------------------------------
  // `ctx` lets the caller inject data (tests do); otherwise we read the
  // real modules/keys that the site already keeps.
  // ============================================================
  function readJSON(key) {
    const s = backing();
    if (!s) return null;
    try { return JSON.parse(s.getItem(key)); } catch (e) { return null; }
  }

  function worklogDays(ctx) {
    if (ctx && ctx.days) return ctx.days;
    if (root && root.PPWorkLog && typeof root.PPWorkLog.listDays === 'function') {
      try { return root.PPWorkLog.listDays(); } catch (e) { /* fall through */ }
    }
    const raw = readJSON(WORKLOG_KEY) || {};
    return Object.keys(raw).sort().reverse().map((k) => raw[k]);
  }

  function erpProjects(ctx) {
    if (ctx && ctx.projects) return ctx.projects;
    if (root && root.PPERP && typeof root.PPERP.listProjects === 'function') {
      try { return root.PPERP.listProjects(); } catch (e) { /* fall through */ }
    }
    const raw = readJSON(ERP_KEY);
    return (raw && Array.isArray(raw.projects)) ? raw.projects : [];
  }

  function roster(ctx) {
    if (ctx && ctx.members) return ctx.members;
    if (root && root.PPTeam && typeof root.PPTeam.list === 'function') {
      try { return root.PPTeam.list(); } catch (e) { /* fall through */ }
    }
    const raw = readJSON(TEAM_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  // The members present on one work-log day: the day's own crew plus any
  // per-entry crew, de-duplicated.
  function dayMembers(day) {
    const set = [];
    const push = (id) => { const v = String(id || ''); if (v && set.indexOf(v) === -1) set.push(v); };
    push(day && day.crew);
    ((day && day.entries) || []).forEach((e) => push(e.crew));
    return set;
  }

  // Square feet a member is credited with on a day: the whole day when the
  // day is theirs, else only the entries tagged to them.
  function creditedEntries(day, memberId) {
    const entries = (day && day.entries) || [];
    const dayCrew = String((day && day.crew) || '');
    // An entry tagged to someone belongs to them; an untagged entry belongs
    // to the day's crew. This keeps a shared day from double-counting.
    return entries.filter((e) => {
      const c = String((e && e.crew) || '');
      return c ? c === memberId : dayCrew === memberId;
    });
  }

  function creditFor(day, memberId) {
    const entries = creditedEntries(day, memberId);
    let sqft = 0, photos = 0;
    entries.forEach((e) => {
      sqft += num(e.sqft) || num(e.w) * num(e.h);
      if (e.photo) photos++;
    });
    return { sqft: sqft, photos: photos };
  }

  function sqftFor(day, memberId) {
    return creditFor(day, memberId).sqft;
  }

  function projectKey(day) {
    return String((day && (day.projectId || day.project)) || '').trim();
  }

  // The full derived record for one member. Numbers are evidence, not claims.
  function workRecord(memberId, ctx) {
    const days = worklogDays(ctx);
    const projects = erpProjects(ctx);
    const members = roster(ctx);
    const gallery = list(memberId, ctx && ctx.gallery);

    const mine = days.filter((d) => dayMembers(d).indexOf(memberId) !== -1);

    let sqft = 0, photos = 0, submitted = 0, daysOnSite = 0;
    const projectSet = [];
    mine.forEach((d) => {
      daysOnSite++;
      if (d.status === 'submitted') submitted++;
      const credit = creditFor(d, memberId);
      sqft += credit.sqft;
      photos += credit.photos;
      const key = projectKey(d);
      if (key && projectSet.indexOf(key) === -1) projectSet.push(key);
    });

    // Co-workers: everyone who logged on any of the member's projects.
    const projectMembers = {};   // projectKey -> [memberId]
    days.forEach((d) => {
      const key = projectKey(d);
      if (!key) return;
      if (!projectMembers[key]) projectMembers[key] = [];
      dayMembers(d).forEach((id) => { if (projectMembers[key].indexOf(id) === -1) projectMembers[key].push(id); });
    });
    const coworkerSet = [];
    let sharedProjects = 0;
    projectSet.forEach((key) => {
      const peers = (projectMembers[key] || []).filter((id) => id !== memberId);
      if (peers.length) sharedProjects++;
      peers.forEach((id) => { if (coworkerSet.indexOf(id) === -1) coworkerSet.push(id); });
    });

    const dates = mine.map((d) => String(d.date || '')).filter(Boolean).sort();
    const firstDate = dates[0] || '';
    const lastDate = dates[dates.length - 1] || '';

    // Years experience: prefer the member's declared start year; otherwise
    // fall back to the earliest day on record.
    const me = members.find((m) => m.id === memberId) || null;
    const startYear = year(me && me.startYear) || (firstDate ? year(firstDate.slice(0, 4)) : 0);
    const nowYear = new Date().getFullYear();
    const years = startYear ? Math.max(0, nowYear - startYear) : 0;

    // Project labels for display, resolved through the ERP where possible.
    const projectLabels = projectSet.map((key) => {
      const p = projects.find((x) => x.id === key) || projects.find((x) => x.name === key);
      return { key: key, name: (p && p.name) || key };
    });

    return {
      memberId: memberId,
      years: years,
      startYear: startYear,
      daysOnSite: daysOnSite,
      submittedDays: submitted,
      sqft: sqft,
      photos: photos,
      galleryCount: gallery.length,
      projects: projectSet.length,
      projectLabels: projectLabels,
      coworkers: coworkerSet.length,
      coworkerIds: coworkerSet,
      sharedProjects: sharedProjects,
      firstDate: firstDate,
      lastDate: lastDate,
      projects_: projects
    };
  }

  // ============================================================
  // BROWSER-ONLY HELPERS (guarded)
  // ============================================================

  // Downscale an uploaded image to a data-URL, exactly like the work log, so
  // a gallery photo does not blow the localStorage quota. Calls back with ''.
  function downscaleFile(file, cb, max) {
    const MAX = max || 1024;
    if (!file || typeof FileReader === 'undefined' || !root || !root.document) { cb(''); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale) || MAX;
          const h = Math.round(img.height * scale) || MAX;
          const c = root.document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => cb('');
        img.src = reader.result;
      } catch (e) { cb(''); }
    };
    reader.onerror = () => cb('');
    reader.readAsDataURL(file);
  }

  // A tiny lightbox shared by the profile and gallery pages.
  function openLightbox(items, index) {
    if (!root || !root.document) return;
    const doc = root.document;
    let i = Math.max(0, Math.min(index || 0, (items || []).length - 1));
    const box = doc.createElement('div');
    box.className = 'pp-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const render = () => {
      const it = (items || [])[i];
      if (!it) return;
      box.innerHTML =
        '<button class="pp-lb-close" type="button" aria-label="Close">✕</button>' +
        (items.length > 1 ? '<button class="pp-lb-nav pp-lb-prev" type="button" aria-label="Previous">‹</button>' +
          '<button class="pp-lb-nav pp-lb-next" type="button" aria-label="Next">›</button>' : '') +
        '<figure class="pp-lb-figure">' +
          (it.photo ? '<img src="' + it.photo.replace(/"/g, '&quot;') + '" alt="" />' : '') +
          '<figcaption><strong>' + escHtml(it.title || 'Work photo') + '</strong>' +
            (it.meta ? '<span>' + escHtml(it.meta) + '</span>' : '') + '</figcaption>' +
        '</figure>';
      const close = box.querySelector('.pp-lb-close');
      if (close) close.addEventListener('click', () => box.remove());
      const prev = box.querySelector('.pp-lb-prev');
      if (prev) prev.addEventListener('click', () => { i = (i - 1 + items.length) % items.length; render(); });
      const next = box.querySelector('.pp-lb-next');
      if (next) next.addEventListener('click', () => { i = (i + 1) % items.length; render(); });
    };
    render();
    box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
    const onKey = (e) => {
      if (e.key === 'Escape') { box.remove(); doc.removeEventListener('keydown', onKey); }
      if (e.key === 'ArrowLeft') { i = (i - 1 + items.length) % items.length; render(); }
      if (e.key === 'ArrowRight') { i = (i + 1) % items.length; render(); }
    };
    doc.addEventListener('keydown', onKey);
    doc.body.appendChild(box);
    const close = box.querySelector('.pp-lb-close');
    if (close) close.focus();
  }

  function escHtml(s) {
    if (root && root.document) {
      const d = root.document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML;
    }
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    STORE_KEY, WORKLOG_KEY, ERP_KEY, TEAM_KEY, STORAGE_ERROR,
    num, fmtSqft, fmtCount, year,
    read: readRaw, write: writeRaw, _setStore,
    blankItem, normaliseItem, sortItems, makeId,
    list, get, count, add, remove, removeAll, feed,
    worklogDays, erpProjects, roster, dayMembers, creditedEntries, creditFor, sqftFor, projectKey,
    workRecord, downscaleFile, openLightbox, escHtml
  };
});
