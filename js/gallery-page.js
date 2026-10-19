/* ============================================================
   CREW WORK GALLERY PAGE
   ------------------------------------------------------------
   Shows every gallery photo across the whole crew (js/gallery.js
   feed), each tagged with the painter who did it and the project it
   belongs to. Filters by painter and by project, opens a lightbox,
   and links each photo back to that painter's profile.
   ============================================================ */
(function () {
  'use strict';

  const T = window.PPTeam;
  const G = window.PPGallery;
  if (!T || !G) return;

  const grid = document.getElementById('cgGrid');
  const filtersWrap = document.getElementById('cgFilters');
  const projectSel = document.getElementById('cgProject');
  const empty = document.getElementById('cgEmpty');
  if (!grid) return;

  let activeMember = 'all';
  let activeProject = 'all';

  const esc = (s) => T.esc(s);

  function memberName(id) {
    const m = T.get(id);
    return m ? m.name : (id || 'Unassigned');
  }

  function itemMeta(it) {
    return [it.label, it.location, it.year, it.finish, it.sqft ? G.fmtSqft(it.sqft) : '']
      .filter(Boolean).join(' · ');
  }

  function projectOf(it) {
    return String(it.project || it.projectId || '').trim();
  }

  function renderFilters() {
    if (!filtersWrap) return;
    // Only show painters who actually have photos.
    const ids = [];
    G.feed().forEach((it) => { if (ids.indexOf(it.memberId) === -1) ids.push(it.memberId); });
    const options = [{ id: 'all', name: 'All painters', icon: '👥' }].concat(
      ids.map((id) => {
        const m = T.get(id);
        return { id: id, name: memberName(id), icon: m ? T.roleOf(m.role).icon : '🎨' };
      })
    );
    filtersWrap.innerHTML = options.map((o) =>
      '<button type="button" class="tm-filter' + (o.id === activeMember ? ' active' : '') + '" data-member="' + esc(o.id) + '">' +
        o.icon + ' ' + esc(o.name) +
      '</button>').join('');
    filtersWrap.querySelectorAll('.tm-filter').forEach((btn) => {
      btn.addEventListener('click', () => { activeMember = btn.dataset.member; render(); });
    });
  }

  function renderProjectOptions() {
    if (!projectSel) return;
    const seen = [];
    G.feed().forEach((it) => { const p = projectOf(it); if (p && seen.indexOf(p) === -1) seen.push(p); });
    projectSel.innerHTML = '<option value="all">All projects</option>' +
      seen.map((p) => '<option value="' + esc(p) + '"' + (p === activeProject ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
  }

  function card(it) {
    const media = it.photo
      ? '<img loading="lazy" src="' + esc(it.photo) + '" alt="' + esc(it.title || 'Work photo') + '" onerror="this.remove()" />'
      : '<span class="cg-noimg">🎨</span>';
    const meta = itemMeta(it);
    const proj = projectOf(it);
    return '<figure class="cg-card reveal">' +
      '<button type="button" class="cg-media" data-open="' + esc(it.id) + '" data-member="' + esc(it.memberId) + '">' + media + '</button>' +
      '<figcaption class="cg-body">' +
        '<strong>' + esc(it.title || 'Work photo') + '</strong>' +
        (meta ? '<span class="cg-meta">' + esc(meta) + '</span>' : '') +
        '<span class="cg-by">' +
          '🎨 <a href="./painter-profile.html?id=' + encodeURIComponent(it.memberId) + '">' + esc(memberName(it.memberId)) + '</a>' +
          (proj ? ' · 🏗️ ' + esc(proj) : '') +
        '</span>' +
      '</figcaption>' +
    '</figure>';
  }

  function render() {
    const feed = G.feed().filter((it) =>
      (activeMember === 'all' || it.memberId === activeMember) &&
      (activeProject === 'all' || projectOf(it) === activeProject));
    grid.innerHTML = feed.map(card).join('');
    if (empty) empty.hidden = feed.length > 0;
    renderFilters();
    renderProjectOptions();

    grid.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const memberId = btn.dataset.member;
        const list = G.list(memberId).map((it) => ({ photo: it.photo, title: it.title, meta: itemMeta(it) }));
        const idx = G.list(memberId).findIndex((it) => it.id === btn.dataset.open);
        G.openLightbox(list, idx < 0 ? 0 : idx);
      });
    });
    observe(grid);
  }

  function observe(scope) {
    const obs = window.__ppRevealObserver;
    if (obs) scope.querySelectorAll('.reveal:not(.visible)').forEach((el) => obs.observe(el));
    else scope.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
  }

  if (projectSel) projectSel.addEventListener('change', () => { activeProject = projectSel.value; render(); });

  render();
  document.addEventListener('DOMContentLoaded', render);
  document.addEventListener('ppgallery:change', render);
})();
