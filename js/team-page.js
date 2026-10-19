/* ============================================================
   TEAM PAGE — renders the roster from the shared PPTeam store
   (js/team.js). Members can be filtered by role and every card
   links to that member's profile page.
   ============================================================ */
(function () {
  'use strict';

  const T = window.PPTeam;
  if (!T) return;

  const grid = document.getElementById('tmGrid');
  const rolesWrap = document.getElementById('tmRoles');
  const filtersWrap = document.getElementById('tmFilters');
  const empty = document.getElementById('tmEmpty');
  if (!grid) return;

  let activeRole = 'all';

  function renderRoles() {
    if (!rolesWrap) return;
    rolesWrap.innerHTML = T.ROLES.map(r => {
      const count = T.list().filter(m => m.role === r.id).length;
      return '<div class="tm-role-card reveal">' +
        '<div class="tm-role-ic">' + r.icon + '</div>' +
        '<h3>' + T.esc(r.label) + '</h3>' +
        '<p>' + T.esc(r.desc) + '</p>' +
        '<span class="tm-role-count">' + count + (count === 1 ? ' member' : ' members') + '</span>' +
        '</div>';
    }).join('');
    observe(rolesWrap);
  }

  function renderFilters() {
    if (!filtersWrap) return;
    const options = [{ id: 'all', label: 'All', icon: '👥' }].concat(T.ROLES);
    filtersWrap.innerHTML = options.map(r =>
      '<button type="button" class="tm-filter' + (r.id === activeRole ? ' active' : '') + '" data-role="' + r.id + '">' +
        r.icon + ' ' + T.esc(r.label) +
      '</button>').join('');
    filtersWrap.querySelectorAll('.tm-filter').forEach(btn => {
      btn.addEventListener('click', () => { activeRole = btn.dataset.role; render(); });
    });
  }

  function memberCard(m) {
    const role = T.roleOf(m.role);
    const media = m.photo
      ? '<img class="tm-photo" loading="lazy" src="' + T.esc(m.photo) + '" alt="' + T.esc(m.name) + '" onerror="this.remove()" />'
      : '<span class="tm-initials" aria-hidden="true">' + T.esc(T.initials(m.name)) + '</span>';

    // Derived evidence row: years, projects, sq ft and photos come from the
    // work log + gallery (js/gallery.js), never from a typed-in claim.
    let stats = '';
    if (window.PPGallery) {
      const r = window.PPGallery.workRecord(m.id);
      const bits = [];
      if (r.years) bits.push('🗓️ ' + r.years + '+ yrs');
      if (r.projects) bits.push('🏗️ ' + r.projects + (r.projects === 1 ? ' project' : ' projects'));
      if (r.sqft) bits.push('📐 ' + window.PPGallery.fmtSqft(r.sqft));
      if (r.galleryCount) bits.push('📸 ' + r.galleryCount);
      if (bits.length) stats = '<span class="tm-stats">' + bits.map(b => T.esc(b)).join(' · ') + '</span>';
    }

    return '<a class="card tm-card reveal role-' + T.esc(role.id) + '" href="./painter-profile.html?id=' + encodeURIComponent(m.id) + '">' +
      '<div class="tm-media">' + media + T.roleBadge(m) + '</div>' +
      '<h3>' + T.esc(m.name) + '</h3>' +
      (m.title ? '<p class="tm-title-line">' + T.esc(m.title) + '</p>' : '') +
      (m.tagline ? '<p class="tm-tagline">' + T.esc(m.tagline) + '</p>' : '') +
      stats +
      '<span class="tm-link">View profile →</span>' +
      '</a>';
  }

  function render() {
    const members = T.list().filter(m => activeRole === 'all' || m.role === activeRole);
    grid.innerHTML = members.map(memberCard).join('');
    if (empty) empty.hidden = members.length > 0;
    observe(grid);
  }

  function observe(scope) {
    const obs = window.__ppRevealObserver;
    if (obs) scope.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
    else scope.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  function renderAll() { renderRoles(); renderFilters(); render(); }

  renderAll();
  // script.js creates the reveal observer on DOMContentLoaded; re-render then
  // so freshly built cards get observed and animate in.
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppteam:change', renderAll);
})();
