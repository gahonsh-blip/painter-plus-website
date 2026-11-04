/* ============================================================
   RATINGS & REVIEWS — PAGE RENDERER (window.PPReviewsUI)
   ------------------------------------------------------------
   Mounts the Google-reviews-style widgets that js/reviews.js
   (window.PPReviews) provides the data for. Any element carrying
   `data-reviews` becomes a widget:

     <section data-reviews="company"></section>
     <div data-reviews="painter" data-review-key="ramesh-kumar"></div>
     <div data-reviews="painter" data-review-key="profile"></div>   <!-- current profile -->
     <div data-reviews="project" data-review-key="<projectId>"></div>

   Each widget shows the average, the star histogram, the list of
   reviews and — only for a signed-in account that is allowed to rate —
   a star picker + text box. An anonymous visitor sees the ratings but
   no form. A lead additionally gets Hide / Delete controls.

   The renderer re-runs on `ppreviews:change`, `ppauth:change` and
   `ppteam:change`, so a rating appears the moment it is saved and the
   profile widget follows the member in the URL.

   `data-reviews` is a hint, not a security boundary: every write still
   goes through PPReviews.submit(), which checks the account again.
   ============================================================ */
(function () {
  'use strict';

  const R = window.PPReviews;
  if (!R) return;

  const A = window.PPAuth;
  const T = window.PPTeam;

  // ------------------------------------------------------------
  // Object-safe escaping. A stored value where text belongs must never
  // render as the literal "[object Object]"; a non-primitive becomes ''.
  // ------------------------------------------------------------
  function textOf(s) { return (s == null || typeof s === 'object') ? '' : String(s); }
  function esc(s) {
    return textOf(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return textOf(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function me() { return R.me(); }
  function isLead() { return R.canModerate(me()); }

  // Resolve a widget's subject. `profile` means "the member named in ?id=".
  function resolveSubject(el) {
    const type = R.isType(el.getAttribute('data-reviews')) ? el.getAttribute('data-reviews') : '';
    if (!type) return null;
    let key = el.getAttribute('data-review-key') || '';
    if (type === 'company') key = R.COMPANY_KEY;
    else if (key === 'profile') {
      const m = T && typeof T.memberFromQuery === 'function' ? T.memberFromQuery() : null;
      key = m ? m.id : '';
    }
    if (!key) return null;
    return { type: type, key: key };
  }

  // A friendly name for the subject, used in headings and the form label.
  function subjectName(type, key) {
    if (type === 'company') return 'Painter Plus';
    if (type === 'painter' && T && typeof T.get === 'function') {
      const m = T.get(key);
      if (m) return m.name;
    }
    return key;
  }

  let uid = 0;
  function nextId() { uid += 1; return 'rvw' + uid; }

  // ------------------------------------------------------------
  // SUB-VIEWS
  // ------------------------------------------------------------
  function summaryHtml(type, key, name) {
    const s = R.summary(type, key);
    const dist = s.dist;
    const bars = [5, 4, 3, 2, 1].map(function (star) {
      const n = dist[star] || 0;
      const pct = s.count ? Math.round((n / s.count) * 100) : 0;
      return '<div class="rv-bar" aria-hidden="true">' +
          '<span class="rv-bar-label">' + star + ' ★</span>' +
          '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="rv-bar-num">' + R.fmtCount(n) + '</span>' +
        '</div>';
    }).join('');

    const avgLabel = s.count
      ? R.fmtAverage(s.average) + ' out of 5'
      : 'No ratings yet';
    const countLabel = s.count
      ? R.fmtCount(s.count) + (s.count === 1 ? ' rating' : ' ratings')
      : 'Be the first to rate';

    return '<div class="rv-summary">' +
        '<div class="rv-score">' +
          '<span class="rv-avg">' + R.fmtAverage(s.average) + '</span>' +
          '<span class="rv-stars" role="img" aria-label="' + escAttr(avgLabel) + '">' + R.stars(s.average) + '</span>' +
          '<span class="rv-count">' + esc(countLabel) + '</span>' +
        '</div>' +
        '<div class="rv-dist">' + bars + '</div>' +
      '</div>';
  }

  function reviewItemHtml(r, name) {
    const mine = me() && me().id === r.authorId;
    const edited = r.editedAt ? ' · edited' : '';
    const meta = R.fmtDate(r.at) + edited;
    const hiddenBadge = r.hidden ? '<span class="rv-hidden-badge">Hidden</span>' : '';

    let controls = '';
    if (isLead()) {
      controls = '<div class="rv-item-admin">' +
          '<button type="button" class="btn-ghost btn-sm" data-rv-hide="' + escAttr(r.id) + '">' +
            (r.hidden ? '👁 Unhide' : '🙈 Hide') + '</button>' +
          '<button type="button" class="btn-ghost btn-sm adm-danger" data-rv-del="' + escAttr(r.id) + '">🗑 Delete</button>' +
        '</div>';
    } else if (mine) {
      controls = '<div class="rv-item-admin">' +
          '<button type="button" class="btn-ghost btn-sm" data-rv-edit="1">✏️ Edit</button>' +
          '<button type="button" class="btn-ghost btn-sm adm-danger" data-rv-remove="1">🗑 Remove</button>' +
        '</div>';
    }

    return '<li class="rv-item' + (r.hidden ? ' is-hidden' : '') + '">' +
        '<div class="rv-item-head">' +
          '<span class="rv-item-avatar" aria-hidden="true">' + esc(initials(r.author)) + '</span>' +
          '<span class="rv-item-who"><strong>' + esc(r.author || 'Crew member') + '</strong>' + hiddenBadge +
            '<span class="rv-item-meta">' + esc(meta) + '</span></span>' +
          '<span class="rv-item-stars" role="img" aria-label="' + escAttr(r.score + ' out of 5') + '">' + R.stars(r.score) + '</span>' +
        '</div>' +
        (r.text ? '<p class="rv-item-text">' + esc(r.text) + '</p>' : '') +
        controls +
      '</li>';
  }

  function initials(name) {
    const parts = textOf(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '🎨';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function formHtml(type, key, name) {
    const u = me();
    const wrapId = nextId();
    if (!u) {
      return '<div class="rv-form rv-form-guest">' +
          '<p class="rv-form-note">👋 <a href="./login.html">Sign in to your crew account</a> to rate ' +
          esc(name) + '.</p>' +
        '</div>';
    }
    if (!R.canRate(u, type, key)) {
      const why = R.blockReason(u, type, key) || '';
      return '<div class="rv-form rv-form-guest"><p class="rv-form-note">' + esc(why) + '</p></div>';
    }

    const existing = R.reviewBy(u.id, type, key);
    const current = existing ? existing.score : 0;
    const stars = [1, 2, 3, 4, 5].map(function (n) {
      const id = wrapId + '-s' + n;
      return '<input class="rv-star-input" type="radio" name="' + wrapId + '-score" id="' + id + '" value="' + n + '"' +
          (current === n ? ' checked' : '') + ' />' +
        '<label class="rv-star-label" for="' + id + '" title="' + n + ' star' + (n > 1 ? 's' : '') + '">★</label>';
    }).join('');

    return '<form class="rv-form" data-rv-form="1">' +
        '<p class="rv-form-title">' + (existing ? 'Update your rating' : 'Rate ' + esc(name)) + '</p>' +
        '<div class="rv-star-picker" role="radiogroup" aria-label="Star rating">' + stars + '</div>' +
        '<label class="rv-form-text-label" for="' + wrapId + '-text">Your review (optional)</label>' +
        '<textarea class="form-control rv-text" id="' + wrapId + '-text" rows="3" maxlength="' + R.MAX_TEXT + '" ' +
          'placeholder="Share what the work was like…">' + esc(existing ? existing.text : '') + '</textarea>' +
        '<div class="rv-form-actions">' +
          '<button type="submit" class="btn-primary btn-sm">' + (existing ? '💾 Update review' : '⭐ Submit review') + '</button>' +
          (existing ? '<button type="button" class="btn-ghost btn-sm" data-rv-remove="1">Remove</button>' : '') +
          '<span class="rv-form-status" role="status" aria-live="polite"></span>' +
        '</div>' +
      '</form>';
  }

  function listHtml(type, key, name) {
    // A lead sees hidden reviews too (badged), so they can unhide them;
    // everyone else sees only the visible set.
    const list = isLead() ? R.listFor(type, key) : R.visibleFor(type, key);
    if (!list.length) {
      return '<p class="rv-empty">No reviews yet — ratings from the crew and clients will appear here.</p>';
    }
    return '<ul class="rv-list">' + list.map(function (r) { return reviewItemHtml(r, name); }).join('') + '</ul>';
  }

  // ------------------------------------------------------------
  // COMPACT BADGE — a small avg+count chip for a card corner.
  // Links to the detailed panel via the hash (#rv-<type>-<key>).
  // ------------------------------------------------------------
  function compactHtml(sub) {
    const s = R.summary(sub.type, sub.key);
    const anchor = '#rv-' + sub.type + '-' + encodeURIComponent(sub.key);
    if (!s.count) {
      return '<a class="rv-badge rv-badge-empty" href="' + escAttr(anchor) + '">' +
        '<span class="rv-badge-stars" aria-hidden="true">☆☆☆☆☆</span>' +
        '<span class="rv-badge-text">Not rated yet — be first</span></a>';
    }
    const label = R.fmtAverage(s.average) + ' out of 5 from ' + R.fmtCount(s.count) + (s.count === 1 ? ' rating' : ' ratings');
    return '<a class="rv-badge" href="' + escAttr(anchor) + '" aria-label="' + escAttr(label) + '">' +
      '<span class="rv-badge-stars" aria-hidden="true">' + R.stars(s.average) + '</span>' +
      '<span class="rv-badge-text"><strong>' + R.fmtAverage(s.average) + '</strong> (' + R.fmtCount(s.count) + ')</span></a>';
  }

  // A widget flagged `data-reviews-follow-hash` takes its subject from the URL
  // hash (#rv-<type>-<key>) so one detailed panel can serve many compact badges.
  function applyHashSubject(el) {
    if (!el.hasAttribute('data-reviews-follow-hash')) return;
    const m = /^#rv-(painter|project|company)-(.+)$/.exec(String(location.hash || ''));
    if (!m) return;
    const type = m[1];
    let key;
    try { key = decodeURIComponent(m[2]); } catch (e) { key = m[2]; }
    if (type === 'company') key = R.COMPANY_KEY;
    if (!R.isType(type) || !key) return;
    el.setAttribute('data-reviews', type);
    el.setAttribute('data-review-key', key);
  }

  // ------------------------------------------------------------
  // RENDER ONE WIDGET
  // ------------------------------------------------------------
  function renderWidget(el) {
    applyHashSubject(el);
    const sub = resolveSubject(el);
    if (!sub) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;

    if (el.hasAttribute('data-reviews-compact')) {
      el.innerHTML = compactHtml(sub);
      return;
    }

    const name = subjectName(sub.type, sub.key);
    const heading = el.getAttribute('data-reviews-title');
    el.innerHTML =
      (heading ? '<h3 class="rv-heading">' + esc(heading) + '</h3>' : '') +
      summaryHtml(sub.type, sub.key, name) +
      formHtml(sub.type, sub.key, name) +
      listHtml(sub.type, sub.key, name);
    bind(el, sub);
  }

  function status(el, text, isError) {
    const s = el.querySelector('.rv-form-status');
    if (!s) return;
    s.textContent = text || '';
    s.classList.toggle('is-error', !!isError);
  }

  function bind(el, sub) {
    const form = el.querySelector('[data-rv-form]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const checked = form.querySelector('.rv-star-input:checked');
        if (!checked) { status(el, 'Please choose a rating from 1 to 5 stars.', true); return; }
        const body = form.querySelector('.rv-text');
        const res = R.submit(me(), sub.type, sub.key, parseInt(checked.value, 10), body ? body.value : '');
        if (!res.ok) { status(el, res.error, true); return; }
        // ppreviews:change re-renders the widget; nothing else to do here.
      });
    }

    el.querySelectorAll('[data-rv-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Remove your review?')) return;
        const res = R.removeOwn(me(), sub.type, sub.key);
        if (!res.ok) { status(el, res.error, true); }
      });
    });

    el.querySelectorAll('[data-rv-hide]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-rv-hide');
        const rev = R.feed().find(function (r) { return r.id === id; });
        const res = rev && rev.hidden ? R.unhide(me(), id) : R.hide(me(), id);
        if (res && !res.ok) { status(el, res.error, true); }
      });
    });

    el.querySelectorAll('[data-rv-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this review permanently?')) return;
        const res = R.remove(me(), btn.getAttribute('data-rv-del'));
        if (!res.ok) { status(el, res.error, true); }
      });
    });

    el.querySelectorAll('[data-rv-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const form2 = el.querySelector('[data-rv-form]');
        if (form2) {
          form2.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const t = form2.querySelector('.rv-text');
          if (t) t.focus();
        }
      });
    });
  }

  function renderAll() {
    document.querySelectorAll('[data-reviews]').forEach(renderWidget);
  }

  // Expose a manual mount so a page can build a widget dynamically.
  window.PPReviewsUI = { renderAll: renderAll, render: renderWidget };

  renderAll();
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppreviews:change', renderAll);
  document.addEventListener('ppauth:change', renderAll);
  document.addEventListener('ppteam:change', renderAll);
})();
