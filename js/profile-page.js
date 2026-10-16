/* ============================================================
   MEMBER PROFILE PAGE — renders one team member from the shared
   PPTeam store (js/team.js) and, when the Head is signed in, shows
   the role changer so the Head can set the member's role
   (Painter ⇄ Helper ⇄ Supervisor ⇄ Head).
   ============================================================ */
(function () {
  'use strict';

  const T = window.PPTeam;
  if (!T) return;

  const nameEl = document.getElementById('ppName');
  if (!nameEl) return;

  let member = T.memberFromQuery();
  let pendingRole = member ? member.role : 'painter';

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  };

  function renderProfile() {
    set('ppName', member.name);
    set('ppRole', member.title || T.roleOf(member.role).label);
    set('ppTagline', member.tagline);
    set('ppBio', member.bio);
    set('ppQuoteText', member.quote);
    set('ppPhoneText', member.phone);
    set('ppEmailText', member.email);
    set('ppAddress', member.address);
    set('ppNote', member.note);

    const badge = document.getElementById('ppRoleBadge');
    if (badge) badge.innerHTML = T.roleBadge(member);

    document.title = member.name + ' | Painter Plus';

    const phoneLink = document.getElementById('ppPhone');
    if (phoneLink && member.phone) phoneLink.href = 'tel:' + member.phone.replace(/[^+\d]/g, '');
    const emailLink = document.getElementById('ppEmail');
    if (emailLink && member.email) emailLink.href = 'mailto:' + member.email;
    const waLink = document.getElementById('ppWhatsapp');
    if (waLink && member.phone) waLink.href = 'https://wa.me/' + member.phone.replace(/[^\d]/g, '');

    const statsWrap = document.getElementById('ppStats');
    if (statsWrap) {
      const pairs = [[member.stat1, member.stat1label], [member.stat2, member.stat2label],
                     [member.stat3, member.stat3label], [member.stat4, member.stat4label]];
      statsWrap.innerHTML = pairs.map(([num, label]) =>
        '<div class="stat reveal"><span class="stat-num">' + T.esc(num) + '</span>' +
        '<span class="stat-label">' + T.esc(label) + '</span></div>').join('');
      observe(statsWrap);
    }

    const avatar = document.getElementById('ppAvatar');
    if (avatar && member.photo) {
      avatar.innerHTML = '<img class="pp-photo" src="' + T.esc(member.photo) +
        '" alt="' + T.esc(member.name) + '" onerror="this.remove()" />';
    }
  }

  function observe(scope) {
    const obs = window.__ppRevealObserver;
    if (obs) scope.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
    else scope.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  // ----- Head-only role controls -----
  const roleSection = document.getElementById('ppRoleSection');
  const lockedSection = document.getElementById('ppRoleLocked');
  const optionsWrap = document.getElementById('ppRoleOptions');
  const statusEl = document.getElementById('ppRoleStatus');

  function renderRoleControls() {
    if (!roleSection) return;
    const isHead = T.isActingHead();
    roleSection.hidden = !isHead;
    if (lockedSection) lockedSection.hidden = isHead;
    if (!isHead || !optionsWrap) return;

    const isSelf = member.id === T.head().id;
    optionsWrap.innerHTML = T.ROLES.map(r => {
      // Demoting the only Head would leave the crew without one.
      const blocked = isSelf && r.id !== 'head' && T.countHeads() === 1;
      return '<button type="button" class="pp-role-option' + (r.id === pendingRole ? ' active' : '') +
        '" data-role="' + r.id + '"' + (blocked ? ' disabled title="Promote another member to Head first"' : '') + '>' +
        '<span class="pro-ic">' + r.icon + '</span>' +
        '<span class="pro-label">' + T.esc(r.label) + '</span>' +
        '<span class="pro-desc">' + T.esc(r.desc) + '</span>' +
        '</button>';
    }).join('');

    optionsWrap.querySelectorAll('.pp-role-option').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingRole = btn.dataset.role;
        optionsWrap.querySelectorAll('.pp-role-option').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  }

  function flash(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  const saveBtn = document.getElementById('ppRoleSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (pendingRole === member.role) { flash('This member is already ' + T.roleOf(member.role).label + '.'); return; }
      const res = T.setRole(member.id, pendingRole);
      if (!res.ok) { flash(res.error, true); return; }
      member = res.member;
      renderProfile();
      renderRoleControls();
      flash('✅ ' + member.name + ' is now ' + T.roleOf(member.role).label + '.');
    });
  }

  const removeBtn = document.getElementById('ppRoleRemove');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      if (!confirm('Remove ' + member.name + ' from the team?')) return;
      const res = T.remove(member.id);
      if (!res.ok) { flash(res.error, true); return; }
      window.location.href = './team.html';
    });
  }

  function renderAll() {
    if (!member) member = T.memberFromQuery();
    if (!member) return;
    pendingRole = member.role;
    renderProfile();
    renderRoleControls();
  }

  renderAll();
  // Re-render after script.js builds the reveal observer, and after any
  // role change made elsewhere in this browser.
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppteam:change', renderAll);
})();
