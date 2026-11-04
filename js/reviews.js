/* ============================================================
   PAINTER PLUS — RATINGS & REVIEWS (window.PPReviews)
   ------------------------------------------------------------
   A Google-reviews-style rating layer that sits on top of the
   account system (js/auth.js). Signed-in crew members and approved
   client accounts can rate and review three kinds of subject:

       painter  — a crew member (by roster member id)
       project  — a portfolio / ERP project (by project id or name)
       company  — Painter Plus itself (a single, well-known id)

   A review is one star score (1–5) plus optional text, tied to the
   account that wrote it. The rules are deliberately strict, because
   a rating is only worth something if it cannot be gamed:

     • Only a signed-in, ACTIVE account may write. An anonymous
       visitor can read every rating but can never submit one.
     • One review per account per subject (by key), so a member can
       change their mind but not stuff the ballot.
     • A member may NOT review themselves (a painter cannot rate
       their own profile). Company self-reviews are refused too.
     • The score is clamped to a whole 1–5; text is length-capped.
     • An Admin/Head may hide (or unhide) a review — moderation —
       and every hidden review is excluded from the average.

   Data shape (key: painterPlusReviews)

     {
       "<subjectType>:<subjectKey>": [
         { id, type, key, author, authorId, score, text, at,
           editedAt, hidden, hiddenBy }
       ]
     }

   `authorId` is the account id; `author` is a display-name snapshot
   so a review survives the account being removed. Everything pure is
   unit-tested in tests/reviews.test.js; the browser store is guarded
   the same way as js/gallery.js, and a hostile store (an object where
   a string belongs, a review that is not an object) is normalised or
   dropped rather than allowed to throw or print "[object Object]".
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPReviews = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const STORE_KEY = 'painterPlusReviews';
  const COMPANY_KEY = 'painter-plus';

  const TYPES = ['painter', 'project', 'company'];
  const MAX_TEXT = 1200;
  const MIN_SCORE = 1;
  const MAX_SCORE = 5;

  // Shown when a real save could not be persisted (storage full or blocked).
  const STORAGE_ERROR = 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.';

  const ERR = {
    NOT_SIGNED_IN: 'Please sign in to leave a rating.',
    NOT_ACTIVE: 'Your account must be approved before you can rate.',
    BAD_SUBJECT: 'That is not something you can rate.',
    SELF: 'You cannot rate yourself.',
    BAD_SCORE: 'Please choose a rating from 1 to 5 stars.',
    NOT_FOUND: 'That review no longer exists.',
    NOT_ALLOWED: 'You are not allowed to do that.',
    STORAGE: STORAGE_ERROR
  };

  // ============================================================
  // PURE HELPERS
  // ============================================================
  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // A stored value where text belongs must never become "[object Object]".
  function text(v) { return (v == null || typeof v === 'object') ? '' : String(v); }
  function clean(v) { return text(v).trim(); }

  function clampScore(n) {
    const v = Math.round(parseFloat(n));
    if (!isFinite(v)) return 0;
    if (v < MIN_SCORE) return MIN_SCORE;
    if (v > MAX_SCORE) return MAX_SCORE;
    return v;
  }
  function validScore(n) {
    const v = parseFloat(n);
    return isFinite(v) && v >= MIN_SCORE && v <= MAX_SCORE;
  }

  function isType(t) { return TYPES.indexOf(clean(t)) !== -1; }

  // The map key for one subject. Kept in one place so list/add/remove agree.
  function subjectKey(type, key) {
    const t = clean(type);
    const k = clean(key);
    if (!isType(t) || !k) return '';
    return t + ':' + k;
  }

  function makeId() { return 'rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // Normalise one stored review, or null if it is unusable.
  function normaliseReview(raw, key) {
    if (!isPlainObject(raw)) return null;
    const type = clean(raw.type) || (key ? clean(key).split(':')[0] : '');
    const skey = clean(raw.key) || (key ? clean(key).split(':').slice(1).join(':') : '');
    if (!isType(type) || !skey) return null;
    const score = clampScore(raw.score);
    if (!score) return null;
    return {
      id: clean(raw.id) || makeId(),
      type: type,
      key: skey,
      author: clean(raw.author),
      authorId: clean(raw.authorId),
      score: score,
      text: text(raw.text).slice(0, MAX_TEXT),
      at: parseInt(raw.at, 10) || 0,
      editedAt: parseInt(raw.editedAt, 10) || 0,
      hidden: raw.hidden === true,
      hiddenBy: clean(raw.hiddenBy)
    };
  }

  // Coerce a whole stored map into { key: [review, …] }, dropping anything
  // that is not a review object. A scalar where an array belongs is dropped.
  function normaliseAll(raw) {
    if (!isPlainObject(raw)) return {};
    const out = {};
    Object.keys(raw).forEach(function (k) {
      const arr = raw[k];
      if (!Array.isArray(arr)) return;
      const list = arr.map(function (r) { return normaliseReview(r, k); }).filter(Boolean);
      if (list.length) out[k] = list;
    });
    return out;
  }

  // ============================================================
  // STORE (guarded, in-memory fallback like js/gallery.js)
  // ============================================================
  let store = null;
  function backing() {
    if (store) return store;
    try { store = (root && root.localStorage) || null; } catch (e) { store = null; }
    return store;
  }
  function _setStore(s) { store = s || null; }

  function readRaw() {
    const s = backing();
    if (!s) return {};
    let raw;
    try { raw = JSON.parse(s.getItem(STORE_KEY)); } catch (e) { raw = null; }
    return normaliseAll(raw);
  }
  function writeRaw(data) {
    const s = backing();
    let ok = true;
    if (s) { try { s.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { ok = false; } }
    if (root && root.document) {
      try { root.document.dispatchEvent(new CustomEvent('ppreviews:change')); } catch (e) { /* no CustomEvent */ }
    }
    return ok;
  }

  function auth() { return (root && root.PPAuth) || null; }
  function team() { return (root && root.PPTeam) || null; }

  // ============================================================
  // READ
  // ============================================================
  // All reviews for one subject, newest first, hidden ones included.
  function listFor(type, key) {
    const sk = subjectKey(type, key);
    if (!sk) return [];
    const all = readRaw();
    return (all[sk] || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  // The public view: hidden reviews removed.
  function visibleFor(type, key) {
    return listFor(type, key).filter(function (r) { return !r.hidden; });
  }

  // The review one account wrote for a subject, or null.
  function reviewBy(authorId, type, key) {
    const id = clean(authorId);
    if (!id) return null;
    return listFor(type, key).find(function (r) { return r.authorId === id; }) || null;
  }

  // Average + count + a 1..5 star histogram, hidden reviews excluded.
  function summary(type, key) {
    const list = visibleFor(type, key);
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    list.forEach(function (r) { dist[r.score] += 1; sum += r.score; });
    const count = list.length;
    const average = count ? Math.round((sum / count) * 10) / 10 : 0;
    return {
      type: clean(type), key: clean(key),
      count: count, average: average, sum: sum, dist: dist,
      hidden: listFor(type, key).length - count
    };
  }

  function average(type, key) { return summary(type, key).average; }
  function count(type, key) { return summary(type, key).count; }

  // Every review across every subject (newest first), for an admin view.
  function feed() {
    const all = readRaw();
    const out = [];
    Object.keys(all).forEach(function (k) {
      all[k].forEach(function (r) { out.push(r); });
    });
    return out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  // ============================================================
  // AUTHORISATION
  // ============================================================
  // The signed-in, active account, or null. Reads root.PPAuth so a page that
  // has not loaded the account engine simply has no rater.
  function me() {
    const A = auth();
    if (!A || typeof A.currentUser !== 'function') return null;
    const u = A.currentUser();
    return isPlainObject(u) ? u : null;
  }

  // A lead (Admin/Head) may moderate. Uses the shared can() when available so
  // there is exactly one permission rule in the codebase.
  function canModerate(actor) {
    const A = auth();
    const u = isPlainObject(actor) ? actor : null;
    if (!u || u.status !== 'active') return false;
    if (A && typeof A.can === 'function') {
      return !!A.can(u, 'roster.manage') || !!A.can(u, 'account.manage');
    }
    return u.role === 'admin' || u.role === 'head';
  }

  // The member id linked to an account (the profile the account owns).
  function ownMemberId(actor) {
    return actor && typeof actor.memberId === 'string' ? actor.memberId : '';
  }

  // Why a write is refused, or null when it is allowed.
  function blockReason(actor, type, key) {
    const u = isPlainObject(actor) ? actor : null;
    if (!u) return ERR.NOT_SIGNED_IN;
    if (u.status !== 'active') return ERR.NOT_ACTIVE;
    if (!isType(type) || !clean(key)) return ERR.BAD_SUBJECT;
    // No self-review: a painter cannot rate their own profile, and nobody
    // rates the company "as themselves" through this surface.
    if (clean(type) === 'painter' && ownMemberId(u) && ownMemberId(u) === clean(key)) return ERR.SELF;
    return null;
  }

  function canRate(actor, type, key) { return !blockReason(actor, type, key); }

  // ============================================================
  // WRITE
  // ============================================================
  // Add or update the signed-in account's review of one subject.
  // Returns { ok:true, review } or { ok:false, error }.
  function submit(actor, type, key, score, body) {
    const u = isPlainObject(actor) ? actor : null;
    const reason = blockReason(u, type, key);
    if (reason) return { ok: false, error: reason };
    if (!validScore(score)) return { ok: false, error: ERR.BAD_SCORE };

    const sk = subjectKey(type, key);
    const all = readRaw();
    const list = all[sk] || [];
    const idx = list.findIndex(function (r) { return r.authorId === u.id; });
    const now = Date.now();
    const name = clean(u.name) || clean(u.username) || 'Crew member';

    let review;
    if (idx !== -1) {
      // One review per account per subject: an edit, not a second row.
      review = Object.assign({}, list[idx], {
        score: clampScore(score),
        text: text(body).slice(0, MAX_TEXT),
        editedAt: now,
        // An edited review is re-shown even if a lead had hidden it.
        hidden: false,
        hiddenBy: ''
      });
      list[idx] = review;
    } else {
      review = {
        id: makeId(), type: clean(type), key: clean(key),
        author: name, authorId: clean(u.id),
        score: clampScore(score), text: text(body).slice(0, MAX_TEXT),
        at: now, editedAt: 0, hidden: false, hiddenBy: ''
      };
      list.push(review);
    }
    all[sk] = list;
    if (!writeRaw(all)) return { ok: false, error: ERR.STORAGE };
    return { ok: true, review: review, updated: idx !== -1 };
  }

  // The signed-in account removes its own review.
  function removeOwn(actor, type, key) {
    const u = isPlainObject(actor) ? actor : null;
    if (!u) return { ok: false, error: ERR.NOT_SIGNED_IN };
    const sk = subjectKey(type, key);
    const all = readRaw();
    const list = all[sk] || [];
    const next = list.filter(function (r) { return r.authorId !== u.id; });
    if (next.length === list.length) return { ok: false, error: ERR.NOT_FOUND };
    if (next.length) all[sk] = next; else delete all[sk];
    if (!writeRaw(all)) return { ok: false, error: ERR.STORAGE };
    return { ok: true };
  }

  // A lead hides or unhides any review (moderation). Hidden reviews stay in
  // the store but are excluded from the public average.
  function setHidden(actor, reviewId, hidden) {
    const u = isPlainObject(actor) ? actor : null;
    if (!canModerate(u)) return { ok: false, error: ERR.NOT_ALLOWED };
    const id = clean(reviewId);
    const all = readRaw();
    let found = null;
    Object.keys(all).forEach(function (k) {
      const r = all[k].find(function (x) { return x.id === id; });
      if (r) { r.hidden = !!hidden; r.hiddenBy = r.hidden ? clean(u.name || u.username) : ''; found = r; }
    });
    if (!found) return { ok: false, error: ERR.NOT_FOUND };
    if (!writeRaw(all)) return { ok: false, error: ERR.STORAGE };
    return { ok: true, review: found };
  }

  function hide(actor, reviewId) { return setHidden(actor, reviewId, true); }
  function unhide(actor, reviewId) { return setHidden(actor, reviewId, false); }

  // A lead deletes any review outright.
  function remove(actor, reviewId) {
    const u = isPlainObject(actor) ? actor : null;
    if (!canModerate(u)) return { ok: false, error: ERR.NOT_ALLOWED };
    const id = clean(reviewId);
    const all = readRaw();
    let found = false;
    Object.keys(all).forEach(function (k) {
      const next = all[k].filter(function (r) { if (r.id === id) { found = true; return false; } return true; });
      if (next.length) all[k] = next; else delete all[k];
    });
    if (!found) return { ok: false, error: ERR.NOT_FOUND };
    if (!writeRaw(all)) return { ok: false, error: ERR.STORAGE };
    return { ok: true };
  }

  // ============================================================
  // DISPLAY HELPERS (pure, no DOM)
  // ============================================================
  // "★★★★☆" — filled stars, then hollow. A score of 0 (or a non-numeric one)
  // means "no rating" and renders all-hollow, not one star.
  function stars(score) {
    const raw = Math.round(parseFloat(score));
    const v = (isFinite(raw) && raw > 0) ? Math.min(raw, MAX_SCORE) : 0;
    let out = '';
    for (let i = 1; i <= MAX_SCORE; i += 1) out += i <= v ? '★' : '☆';
    return out;
  }
  function fmtAverage(n) {
    const v = parseFloat(n);
    return (isFinite(v) && v > 0) ? (Math.round(v * 10) / 10).toFixed(1) : '0.0';
  }
  function fmtCount(n) {
    const v = parseInt(n, 10) || 0;
    return v.toLocaleString('en-IN');
  }
  function fmtDate(ts) {
    const t = parseInt(ts, 10);
    if (!t) return '';
    try { return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  return {
    STORE_KEY, COMPANY_KEY, TYPES, MAX_TEXT, MIN_SCORE, MAX_SCORE, ERR,
    // helpers
    _setStore, isType, subjectKey, clampScore, validScore,
    // reads
    listFor, visibleFor, reviewBy, summary, average, count, feed,
    // authorisation
    me, canModerate, canRate, blockReason,
    // writes
    submit, removeOwn, setHidden, hide, unhide, remove,
    // display
    stars, fmtAverage, fmtCount, fmtDate
  };
});
