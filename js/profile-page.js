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

  function reduceMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }

  // ------------------------------------------------------------
  // SPECIALISATIONS — matched to what the member actually does.
  // A helper's strengths are not a painter's, so the same six cards
  // must not be shown for every role. The static HTML carries the
  // painter set as a no-JS fallback; this replaces it per role.
  // ------------------------------------------------------------
  const SPECIALISATIONS = {
    owner: [
      { icon: '🏗️', title: 'Project Direction', text: 'Setting the standard for every site — scope, schedule and the crew that delivers it.' },
      { icon: '🛡️', title: 'Quality Assurance', text: 'Every project ends with a walkthrough and a 5-year warranty backed by free site inspection.' },
      { icon: '📐', title: 'Colour Consultation', text: 'Helping clients choose palettes and finishes that suit light, space, and lifestyle.' },
      { icon: '🖌️', title: 'Interior Finishes', text: 'Matte, eggshell, satin & semi-gloss finishes applied with meticulous cutting-in and even roller work.' },
      { icon: '🏠', title: 'Exterior Coatings', text: 'Weatherproof, UV-resistant exterior systems including elastomeric coatings that flex with the surface.' },
      { icon: '🎨', title: 'Designer Textures', text: 'Hand-troweled stucco, accent walls, and feature textures that add depth and character to any room.' }
    ],
    head: [
      { icon: '🏗️', title: 'Project Direction', text: 'Running the crew day to day — scope, schedule and the standard every site is held to.' },
      { icon: '🛡️', title: 'Quality Assurance', text: 'Every project ends with a walkthrough and a 5-year warranty backed by free site inspection.' },
      { icon: '📐', title: 'Colour Consultation', text: 'Helping clients choose palettes and finishes that suit light, space, and lifestyle.' },
      { icon: '🖌️', title: 'Interior Finishes', text: 'Matte, eggshell, satin & semi-gloss finishes applied with meticulous cutting-in and even roller work.' },
      { icon: '🏠', title: 'Exterior Coatings', text: 'Weatherproof, UV-resistant exterior systems including elastomeric coatings that flex with the surface.' },
      { icon: '🎨', title: 'Designer Textures', text: 'Hand-troweled stucco, accent walls, and feature textures that add depth and character to any room.' }
    ],
    supervisor: [
      { icon: '🛡️', title: 'Quality Assurance', text: 'Checking work against the spec and signing off only when the finish is right.' },
      { icon: '🧰', title: 'Surface Preparation', text: 'Wall putty, crack filling, and priming — the unseen foundation of a finish that lasts for years.' },
      { icon: '🖌️', title: 'Interior Finishes', text: 'Matte, eggshell, satin & semi-gloss finishes applied with meticulous cutting-in and even roller work.' },
      { icon: '🏠', title: 'Exterior Coatings', text: 'Weatherproof, UV-resistant exterior systems including elastomeric coatings that flex with the surface.' },
      { icon: '📋', title: 'Site Coordination', text: 'Sequencing trades and stages so the crew always has a prepared, ready surface to work on.' },
      { icon: '📐', title: 'Colour Consultation', text: 'Helping clients choose palettes and finishes that suit light, space, and lifestyle.' }
    ],
    painter: [
      { icon: '🖌️', title: 'Interior Finishes', text: 'Matte, eggshell, satin & semi-gloss finishes applied with meticulous cutting-in and even roller work.' },
      { icon: '🏠', title: 'Exterior Coatings', text: 'Weatherproof, UV-resistant exterior systems including elastomeric coatings that flex with the surface.' },
      { icon: '🎨', title: 'Designer Textures', text: 'Hand-troweled stucco, accent walls, and feature textures that add depth and character to any room.' },
      { icon: '🧰', title: 'Surface Preparation', text: 'Wall putty, crack filling, and priming — the unseen foundation of a finish that lasts for years.' },
      { icon: '📐', title: 'Colour Consultation', text: 'Helping clients choose palettes and finishes that suit light, space, and lifestyle.' },
      { icon: '🛡️', title: 'Quality Assurance', text: 'Every project ends with a walkthrough and a 5-year warranty backed by free site inspection.' }
    ],
    helper: [
      { icon: '🧰', title: 'Surface Preparation', text: 'Sanding, filling and priming the surface before a single coat goes on.' },
      { icon: '🪣', title: 'Material Handling', text: 'Mixing, measuring and keeping paint, putty and thinner ready and correctly thinned.' },
      { icon: '🧹', title: 'Site Protection', text: 'Masking floors and fittings, then leaving the site clean at the end of every day.' },
      { icon: '🪜', title: 'Access & Setup', text: 'Scaffolding, ladders and platforms set up safely so the painter can reach every edge.' },
      { icon: '🤝', title: 'Crew Support', text: 'Keeping the painter supplied and moving, so the day runs without stopping.' },
      { icon: '🧽', title: 'Tool Care', text: 'Brushes, rollers and trays cleaned and stored, ready for the next coat.' }
    ]
  };

  function renderSpecs() {
    const wrap = $('ppSpecs');
    if (!wrap) return;
    const list = SPECIALISATIONS[member.role] || SPECIALISATIONS.painter;
    set('ppSpecSub', 'What ' + member.name + ' brings to a site — matched to their role as ' +
      T.roleOf(member.role).label + '.');
    wrap.innerHTML = list.map((s) =>
      '<article class="card reveal"><div class="icon">' + s.icon + '</div>' +
      '<h3>' + esc(s.title) + '</h3><p>' + esc(s.text) + '</p></article>').join('');
    observe(wrap);
  }

  // ------------------------------------------------------------
  // SHARE — hand this member's profile to a client or a WhatsApp group.
  // ------------------------------------------------------------
  function renderShare() {
    const wrap = $('ppShare');
    if (!wrap) return;
    const url = location.origin + location.pathname + '?id=' + encodeURIComponent(member.id);
    const msg = 'Meet ' + member.name + ' from the Painter Plus crew — ' + url;
    const wa = 'https://wa.me/?text=' + encodeURIComponent(msg);
    const mail = 'mailto:?subject=' + encodeURIComponent('Painter Plus — ' + member.name) +
      '&body=' + encodeURIComponent(msg);
    wrap.innerHTML =
      '<button type="button" class="btn-ghost btn-sm" id="ppCopy">🔗 Copy profile link</button>' +
      '<a class="btn-ghost btn-sm" href="' + esc(wa) + '" target="_blank" rel="noreferrer">💬 Share on WhatsApp</a>' +
      '<a class="btn-ghost btn-sm" href="' + esc(mail) + '">✉️ Email</a>';
    const copy = $('ppCopy');
    if (copy) copy.addEventListener('click', async () => {
      const note = $('ppShareNote');
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
        await navigator.clipboard.writeText(url);
        if (note) note.textContent = '✅ Link copied.';
      } catch {
        // Clipboard access is blocked on insecure origins and in some
        // browsers; showing the link is the useful fallback.
        if (note) note.textContent = 'Copy this link: ' + url;
      }
    });
  }

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
    const stagger = window.__ppStagger;
    const els = scope.querySelectorAll('.reveal:not(.visible), .reveal-left:not(.visible), .reveal-right:not(.visible)');
    els.forEach(el => {
      if (stagger) stagger(el);
      if (obs) obs.observe(el);
      else el.classList.add('visible');
    });
  }

  // ------------------------------------------------------------
  // WORK RECORD — derived from the work log (evidence, not a claim)
  // ------------------------------------------------------------
  function recordCards(r) {
    const cards = [];
    // Each card carries its derived figure twice: the exact rendered text (what
    // a no-JS or reduced-motion visitor sees) and the raw number + format, so
    // the count-up can animate any card, not only the plain counts.
    if (r.years) cards.push({ icon: '🗓️', text: r.years + '+', count: r.years, fmt: 'years', label: 'Years on the tools' });
    cards.push({ icon: '🏗️', text: G.fmtCount(r.projects), count: r.projects, fmt: 'count',
      label: r.projects === 1 ? 'Project logged' : 'Projects logged' });
    cards.push({ icon: '📐', text: G.fmtSqft(r.sqft), count: r.sqft, fmt: 'sqft', label: 'Area painted' });
    cards.push({ icon: '📅', text: G.fmtCount(r.daysOnSite), count: r.daysOnSite, fmt: 'count',
      label: r.daysOnSite === 1 ? 'Day on site' : 'Days on site' });
    if (r.photos) cards.push({ icon: '📸', text: G.fmtCount(r.photos), count: r.photos, fmt: 'count', label: 'Work photos' });
    if (r.coworkers) cards.push({ icon: '👥', text: G.fmtCount(r.coworkers), count: r.coworkers, fmt: 'count', label: 'Co-workers' });
    return cards;
  }

  function renderRecord() {
    const wrap = $('ppRecord');
    if (!wrap) return;
    const r = G.workRecord(member.id);

    if (!r.daysOnSite && !r.galleryCount) {
      wrap.innerHTML =
        '<p class="pp-record-empty">No work logged yet. Every day the crew records ' +
        'with this member — and every photo added below — is counted here automatically.</p>';
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
        cards.map((c) =>
          '<div class="pp-record-card reveal"><span class="pp-record-ic">' + c.icon + '</span>' +
          '<span class="pp-record-num" data-count-to="' + esc(c.count) + '"' +
            ' data-count-fmt="' + esc(c.fmt) + '" data-count-text="' + esc(c.text) + '">' +
            esc(c.text) + '</span>' +
          '<span class="pp-record-label">' + esc(c.label) + '</span></div>').join('') +
      '</div>' + windowLine + projects;
    observe(wrap);
    animateCounts(wrap);
  }

  // A soft count-up on the derived numbers. The element already holds the true
  // final figure, so a visitor with no JS, reduced motion, or an off-screen
  // section always sees the correct number — the animation only ever replaces
  // it with an intermediate one and puts the exact original text back.
  function countText(n, fmt) {
    if (fmt === 'sqft') return G.fmtSqft(n);
    if (fmt === 'years') return G.fmtCount(n) + '+';
    return G.fmtCount(n);
  }

  function animateCounts(scope) {
    if (reduceMotion()) return;
    scope.querySelectorAll('.pp-record-num[data-count-to]').forEach((el) => {
      const target = parseFloat(el.dataset.countTo) || 0;
      if (target <= 0 || el.dataset.counted === '1') return;
      el.dataset.counted = '1';
      const fmt = el.dataset.countFmt || 'count';
      const finalText = el.dataset.countText || el.textContent;
      const steps = 20;
      let i = 0;
      const tick = () => {
        i++;
        if (i < steps) {
          el.textContent = countText(target * (i / steps), fmt);
          setTimeout(tick, 30);
        } else {
          el.textContent = finalText;
        }
      };
      el.textContent = countText(0, fmt);
      setTimeout(tick, 30);
    });
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
    // Editing needs the staff passcode. Until someone signs in, the section
    // shows only the sign-in prompt — no edit form, no "This is me" shortcut,
    // so a public visitor can never change a member's details.
    if (body) body.hidden = !mine;
    if (heading) heading.textContent = mine ? '✏️ Edit my profile & gallery' : '🔒 Crew sign-in';
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
      claimWrap.innerHTML = '<span class="pp-claim-note">🔑 Signed in as Owner/Head — you can edit any member\'s profile.</span> ' +
        '<button type="button" class="btn-ghost btn-sm" id="ppUnclaim">Sign out</button>';
      const un = $('ppUnclaim');
      if (un) un.addEventListener('click', () => { T.unclaim(); T.lockHead(); renderEditor(); });
    } else if (claimed) {
      claimWrap.innerHTML = '<span class="pp-claim-note">✅ This is your profile.</span> ' +
        '<button type="button" class="btn-ghost btn-sm" id="ppUnclaim">Sign out</button>';
      const un = $('ppUnclaim');
      if (un) un.addEventListener('click', () => { T.unclaim(); T.lockHead(); renderEditor(); });
    } else {
      claimWrap.innerHTML =
        '<span class="pp-claim-note">👋 Enter the crew passcode to edit this profile and manage its work photos.</span>' +
        '<form class="pp-claim-form" id="ppClaimForm">' +
          '<input type="password" id="ppClaimPass" class="form-control" placeholder="Crew passcode" autocomplete="current-password" aria-label="Crew passcode" />' +
          '<button type="submit" class="btn-primary btn-sm">Sign in</button>' +
        '</form>' +
        '<p class="pp-role-status" id="ppClaimErr" role="status" aria-live="polite"></p>';
      const form = $('ppClaimForm');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const pass = $('ppClaimPass');
        if (T.claim(member.id, pass ? pass.value : '')) renderEditor();
        else { const err = $('ppClaimErr'); if (err) { err.textContent = 'Wrong passcode. Try again.'; err.classList.add('is-error'); } }
      });
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
        const r = G.remove(member.id, b.dataset.del);
        if (!r.ok) { flashEditor(r.error, true); return; }
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
        renderProfile(); renderShare(); renderSpecs(); renderRecord(); flashEditor('✅ Profile saved.');
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
  const optionsWrap = $('ppRoleOptions');
  const statusEl = $('ppRoleStatus');

  function renderRoleControls() {
    if (!roleSection) return;
    const isHead = T.isManager();
    roleSection.hidden = !isHead;
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
    // Re-read the member from the store on every render, so a role or name
    // changed elsewhere (the admin page, another tab) is reflected here
    // instead of the page holding a stale copy.
    if (member) member = T.get(member.id) || member;
    else member = T.memberFromQuery();
    if (!member) return;
    pendingRole = member.role;
    renderProfile();
    renderShare();
    renderRecord();
    renderGallery();
    renderSpecs();
    renderEditor();
    renderRoleControls();
  }

  renderAll();
  initEditor();
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppteam:change', renderAll);
  document.addEventListener('ppgallery:change', () => { renderGallery(); renderRecord(); renderEditorGallery(); });
})();
