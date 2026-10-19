/* ============================================================
   MEMBER PROFILE PAGE
   ------------------------------------------------------------
   Renders one team member from the shared PPTeam store (js/team.js)
   and adds a professional, evidence-backed work profile:

     1. A WORK RECORD whose numbers are DERIVED from the work log
        (js/gallery.js workRecord) — years, projects, square feet,
        days on site, photos and co-workers. Nothing is typed in, so
        the client sees evidence rather than a claim.
     2. A GALLERY of the member's work photos (js/gallery.js), shown
        in a lightbox.
     3. SELF-EDITING: when this is "me" (the member claimed this
        browser, or an Owner/Head is signed in) the member can edit
        their own profile and add/remove gallery photos from here.

   Role changes stay Owner/Head-only (the passcode gate) and are
   rendered separately.
   ============================================================ */
(function () {
  'use strict';

  const T = window.PPTeam;
  const G = window.PPGallery;
  if (!T) return;

  const nameEl = document.getElementById('ppName');
  if (!nameEl) return;

  let member = T.memberFromQuery();
  let pendingRole = member ? member.role : 'painter';

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => T.esc(s);

  // ------------------------------------------------------------
  // PROFILE HEADER
  // ------------------------------------------------------------
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

    const badge = $('ppRoleBadge');
    if (badge) badge.innerHTML = T.roleBadge(member);

    document.title = member.name + ' | Painter Plus';

    const phoneLink = $('ppPhone');
    if (phoneLink && member.phone) phoneLink.href = 'tel:' + member.phone.replace(/[^+\d]/g, '');
    const emailLink = $('ppEmail');
    if (emailLink && member.email) emailLink.href = 'mailto:' + member.email;
    const waLink = $('ppWhatsapp');
    if (waLink && member.phone) waLink.href = 'https://wa.me/' + member.phone.replace(/[^\d]/g, '');

    const avatar = $('ppAvatar');
    if (avatar && member.photo) {
      avatar.innerHTML = '<img class="pp-photo" src="' + esc(member.photo) +
        '" alt="' + esc(member.name) + '" onerror="this.remove()" />';
    }
  }

  function observe(scope) {
    const obs = window.__ppRevealObserver;
    if (obs) scope.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
    else scope.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  // ------------------------------------------------------------
  // WORK RECORD — derived from the work log (evidence, not a claim)
  // ------------------------------------------------------------
  function recordCards(r) {
    const cards = [];
    if (r.years) cards.push(['🗓️', r.years + '+', 'Years on the tools']);
    cards.push(['🏗️', G.fmtCount(r.projects), r.projects === 1 ? 'Project logged' : 'Projects logged']);
    cards.push(['📐', G.fmtSqft(r.sqft), 'Area painted']);
    cards.push(['📅', G.fmtCount(r.daysOnSite), r.daysOnSite === 1 ? 'Day on site' : 'Days on site']);
    if (r.photos) cards.push(['📸', G.fmtCount(r.photos), 'Work photos']);
    if (r.coworkers) cards.push(['👥', G.fmtCount(r.coworkers), 'Co-workers']);
    return cards;
  }

  function renderRecord() {
    const wrap = $('ppRecord');
    if (!wrap) return;
    const r = G.workRecord(member.id);

    if (!r.daysOnSite && !r.galleryCount) {
      wrap.innerHTML =
        '<p class="pp-record-empty">No work logged yet. Every day added on the ' +
        '<a href="./worklog.html">Work Log</a> with this member as the crew — and every photo ' +
        'added below — is counted here automatically.</p>';
      return;
    }

    const cards = recordCards(r);
    const projects = r.projectLabels.length
      ? '<div class="pp-record-projects"><h3>Projects on record</h3><ul>' +
        r.projectLabels.map(p => '<li>🏗️ ' + esc(p.name) + '</li>').join('') + '</ul></div>'
      : '';

    const windowLine = (r.firstDate && r.lastDate)
      ? '<p class="pp-record-window">On the record from <strong>' + esc(r.firstDate) +
        '</strong> to <strong>' + esc(r.lastDate) + '</strong>.</p>'
      : '';

    wrap.innerHTML =
      '<div class="pp-record-grid">' +
        cards.map(([icon, val, label]) =>
          '<div class="pp-record-card reveal"><span class="pp-record-ic">' + icon + '</span>' +
          '<span class="pp-record-num">' + esc(val) + '</span>' +
          '<span class="pp-record-label">' + esc(label) + '</span></div>').join('') +
      '</div>' + windowLine + projects;
    observe(wrap);
  }

  // ------------------------------------------------------------
  // GALLERY
  // ------------------------------------------------------------
  function galleryMeta(it) {
    return [it.label, it.location, it.year, it.finish, it.sqft ? G.fmtSqft(it.sqft) : '']
      .filter(Boolean).join(' · ');
  }

  function renderGallery() {
    const wrap = $('ppGallery');
    if (!wrap) return;
    const items = G.list(member.id);

    if (!items.length) {
      wrap.innerHTML = '<p class="pp-gallery-empty">' +
        (T.isMe(member.id)
          ? 'Your gallery is empty. Add your first work photo in <strong>Edit my profile</strong> below.'
          : 'No work photos yet.') + '</p>';
      return;
    }

    wrap.innerHTML = '<div class="pp-gallery-grid">' + items.map((it, i) => {
      const media = it.photo
        ? '<img loading="lazy" src="' + esc(it.photo) + '" alt="' + esc(it.title || 'Work photo') + '" onerror="this.remove()" />'
        : '<span class="pp-gallery-noimg">🎨</span>';
      const meta = galleryMeta(it);
      return '<button type="button" class="pp-gallery-card reveal" data-idx="' + i + '">' +
        '<span class="pp-gallery-media">' + media + '</span>' +
        '<span class="pp-gallery-body">' +
          '<strong>' + esc(it.title || 'Work photo') + '</strong>' +
          (meta ? '<span class="pp-gallery-meta">' + esc(meta) + '</span>' : '') +
        '</span>' +
      '</button>';
    }).join('') + '</div>';

    wrap.querySelectorAll('.pp-gallery-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const list = G.list(member.id).map((it) => ({ photo: it.photo, title: it.title, meta: galleryMeta(it) }));
        G.openLightbox(list, parseInt(btn.dataset.idx, 10));
      });
    });
    observe(wrap);
  }

  // ------------------------------------------------------------
  // SELF-EDIT (profile + gallery) — only for "me"
  // ------------------------------------------------------------
  function fillEditor() {
    const v = (id, val) => { const el = $(id); if (el) el.value = val == null ? '' : val; };
    v('ppfName', member.name);
    v('ppfTitle', member.title);
    v('ppfTagline', member.tagline);
    v('ppfBio', member.bio);
    v('ppfStartYear', member.startYear);
    v('ppfQuote', member.quote);
    v('ppfPhone', member.phone);
    v('ppfEmail', member.email);
    v('ppfAddress', member.address);
    v('ppfNote', member.note);
  }

  function flashEditor(text, isError) {
    const el = $('ppEditStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  function renderEditor() {
    const section = $('ppEditSection');
    if (!section) return;
    const mine = T.isMe(member.id);
    const body = $('ppEditBody');
    const heading = $('ppEditHeading');
    // The section (and its "This is me" prompt) is always visible so a painter
    // can claim their own profile; the edit form only appears once it is "me".
    if (body) body.hidden = !mine;
    if (heading) heading.textContent = mine ? '✏️ Edit my profile & gallery' : '🧑‍🎨 Is this your profile?';
    if (!mine) { renderClaim(); return; }
    fillEditor();
    renderClaim();
    renderEditorGallery();
  }

  function renderClaim() {
    const claimWrap = $('ppClaim');
    if (!claimWrap) return;
    const isManager = T.isManager();
    const claimed = T.claimedId() === member.id;
    if (isManager) {
      claimWrap.innerHTML = '<span class="pp-claim-note">🔑 Signed in as Owner/Head — you can edit any member\'s profile.</span>';
    } else if (claimed) {
      claimWrap.innerHTML = '<span class="pp-claim-note">✅ This is your profile.</span> ' +
        '<button type="button" class="btn-ghost btn-sm" id="ppUnclaim">Not me — sign out of this profile</button>';
      const un = $('ppUnclaim');
      if (un) un.addEventListener('click', () => { T.unclaim(); renderEditor(); });
    } else {
      claimWrap.innerHTML = '<span class="pp-claim-note">👋 Tap below if this is you — then you can edit your own profile and add your work photos on this device.</span> ' +
        '<button type="button" class="btn-ghost btn-sm" id="ppClaimBtn">This is me</button>';
      const c = $('ppClaimBtn');
      if (c) c.addEventListener('click', () => { if (T.claim(member.id)) renderEditor(); });
    }
  }

  function renderEditorGallery() {
    const wrap = $('ppGalleryList');
    if (!wrap) return;
    const items = G.list(member.id);
    wrap.innerHTML = items.length
      ? '<ul class="pp-glist">' + items.map((it) =>
          '<li class="pp-glist-item">' +
            (it.photo ? '<img src="' + esc(it.photo) + '" alt="" onerror="this.remove()" />' : '<span class="pp-glist-noimg">🎨</span>') +
            '<span class="pp-glist-body"><strong>' + esc(it.title || 'Work photo') + '</strong>' +
              (it.sqft ? '<span>' + esc(G.fmtSqft(it.sqft)) + '</span>' : '') + '</span>' +
            '<button type="button" class="pp-glist-del" data-del="' + esc(it.id) + '" aria-label="Remove">🗑</button>' +
          '</li>').join('') + '</ul>'
      : '<p class="pp-gallery-empty">No photos yet — add one above.</p>';
    wrap.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!confirm('Remove this photo from your gallery?')) return;
        G.remove(member.id, b.dataset.del);
        renderEditorGallery(); renderGallery(); renderRecord();
      });
    });
  }

  function initEditor() {
    const form = $('ppEditForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!T.isMe(member.id)) { flashEditor('You can only edit your own profile.', true); return; }
        const val = (id) => { const el = $(id); return el ? (el.value || '').trim() : ''; };
        if (!val('ppfName')) { flashEditor('Please enter a name.', true); return; }
        const res = T.save(Object.assign({}, member, {
          id: member.id,
          name: val('ppfName'),
          role: member.role,
          title: val('ppfTitle'),
          tagline: val('ppfTagline'),
          bio: val('ppfBio'),
          startYear: val('ppfStartYear'),
          quote: val('ppfQuote'),
          phone: val('ppfPhone'),
          email: val('ppfEmail'),
          address: val('ppfAddress'),
          note: val('ppfNote')
        }));
        if (!res.ok) { flashEditor(res.error, true); return; }
        member = res.member;
        renderProfile(); renderRecord(); flashEditor('✅ Profile saved.');
      });
    }

    // Gallery photo: file (downscaled) or URL, plus the caption fields.
    let pendingPhoto = '';
    const fileInput = $('ppgFile');
    const urlInput = $('ppgUrl');
    const preview = $('ppgPreview');
    const previewImg = $('ppgPreviewImg');

    function showPreview(data) {
      pendingPhoto = data || '';
      if (!preview || !previewImg) return;
      if (pendingPhoto) { previewImg.src = pendingPhoto; preview.hidden = false; }
      else preview.hidden = true;
    }
    if (fileInput) fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      G.downscaleFile(f, (data) => {
        if (!data) { flashEditor('Could not read that image — try a URL instead.', true); return; }
        if (urlInput) urlInput.value = '';
        showPreview(data);
      });
    });
    if (urlInput) urlInput.addEventListener('input', () => { if (urlInput.value.trim()) showPreview(urlInput.value.trim()); });

    const addBtn = $('ppgAdd');
    if (addBtn) addBtn.addEventListener('click', () => {
      const val = (id) => { const el = $(id); return el ? (el.value || '').trim() : ''; };
      const title = val('ppgTitle');
      const url = val('ppgUrl');
      const photo = url || pendingPhoto;
      if (!title && !photo) { flashEditor('Add a title or a photo first.', true); return; }
      const res = G.add(member.id, {
        title: title, photo: photo, label: val('ppgLabel'),
        location: val('ppgLocation'), year: val('ppgYear'), finish: val('ppgFinish'),
        sqft: val('ppgSqft'), note: val('ppgNote')
      });
      if (!res.ok) { flashEditor(res.error, true); return; }
      ['ppgTitle', 'ppgLabel', 'ppgLocation', 'ppgYear', 'ppgFinish', 'ppgSqft', 'ppgNote'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
      if (urlInput) urlInput.value = '';
      if (fileInput) fileInput.value = '';
      showPreview('');
      flashEditor('✅ Photo added to your gallery.');
      renderEditorGallery(); renderGallery(); renderRecord();
    });
  }

  // ------------------------------------------------------------
  // ROLE CONTROLS (Owner/Head only)
  // ------------------------------------------------------------
  const roleSection = $('ppRoleSection');
  const lockedSection = $('ppRoleLocked');
  const optionsWrap = $('ppRoleOptions');
  const statusEl = $('ppRoleStatus');

  function renderRoleControls() {
    if (!roleSection) return;
    const isHead = T.isManager();
    roleSection.hidden = !isHead;
    if (lockedSection) lockedSection.hidden = isHead;
    if (!isHead || !optionsWrap) return;

    optionsWrap.innerHTML = T.ROLES.map(r => {
      const blocked = T.wouldStrandLeads(member.id, r.id);
      return '<button type="button" class="pp-role-option' + (r.id === pendingRole ? ' active' : '') +
        '" data-role="' + r.id + '"' + (blocked ? ' disabled title="Promote another member to Owner or Head first"' : '') + '>' +
        '<span class="pro-ic">' + r.icon + '</span>' +
        '<span class="pro-label">' + esc(r.label) + '</span>' +
        '<span class="pro-desc">' + esc(r.desc) + '</span>' +
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

  const saveBtn = $('ppRoleSave');
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

  const removeBtn = $('ppRoleRemove');
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
    renderRecord();
    renderGallery();
    renderEditor();
    renderRoleControls();
  }

  renderAll();
  initEditor();
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppteam:change', renderAll);
  document.addEventListener('ppgallery:change', () => { renderGallery(); renderRecord(); renderEditorGallery(); });
})();
