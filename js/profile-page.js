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
  const A = window.PPAuth;
  if (!T) return;

  const nameEl = document.getElementById('ppName');
  if (!nameEl) return;

  let member = T.memberFromQuery();
  let pendingRole = member ? member.role : 'painter';

  // Set an element's text. An empty value CLEARS the element (and hides it),
  // rather than leaving whatever is in the markup. The page ships with the
  // founder's bio/tagline/quote as static defaults, so skipping empty values
  // would show Gahonsh's personal text on every other painter's profile.
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = text == null ? '' : String(text);
    el.textContent = val;
    el.hidden = !val;
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => T.esc(s);

  // A write may be synchronous (local provider) or a promise (Supabase). Run
  // `done(res)` when the result is known, whichever it is.
  function settle(res, done) {
    if (res && typeof res.then === 'function') { res.then(done).catch((e) => done({ ok: false, error: (e && e.message) || 'Action failed.' })); return; }
    done(res);
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

    // An empty contact detail should drop its whole row, not render a bare
    // icon. The anchor's `hidden` is cleared again only when a value returns.
    const contactItem = (id, value) => { const el = $(id); if (el) el.hidden = !value; };
    contactItem('ppPhone', member.phone);
    contactItem('ppEmail', member.email);
    contactItem('ppAddressItem', member.address);
    contactItem('ppWhatsapp', member.phone);

    const badge = $('ppRoleBadge');
    if (badge) badge.innerHTML = T.roleBadge(member);

    // A member with no favourite quote should not render an empty quote block
    // (the CSS draws a decorative opening quote mark, which would float alone).
    const quoteWrap = $('ppQuote');
    if (quoteWrap) quoteWrap.hidden = !member.quote;

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

  // ------------------------------------------------------------
  // ACCOUNT-AWARE AUTHORISATION
  // ------------------------------------------------------------
  // The account that maps to this roster member (by memberId), if any.
  function accountFor(member) {
    if (!A || !member) return null;
    return A.findByMember(member.id) || null;
  }

  // The signed-in account, if any.
  function meAccount() { return A ? A.currentUser() : null; }

  // True when the signed-in account may edit THIS member's profile.
  // Falls back to the legacy passcode claim when no account system is present
  // (so the page still works if js/auth.js failed to load).
  function canEditThis(member) {
    const me = meAccount();
    if (me) return A.can(me, 'profile.edit', accountFor(member) || { id: null, role: member.role });
    return T.isMe(member.id);
  }

  // True when the signed-in account may change THIS member's privacy.
  function canSetPrivacy(member) {
    const me = meAccount();
    if (!me) return false;
    const acct = accountFor(member);
    return A.can(me, 'self.privacy', acct) || A.can(me, 'account.manage', acct);
  }

  // The roster (display) roles are finer-grained than the account roles. Map a
  // roster role onto the account role it implies, so the same authorisation
  // rule can guard both.
  function rosterToAccountRole(rosterRole) {
    return rosterRole === 'owner' || rosterRole === 'admin' ? 'admin'
      : rosterRole === 'head' ? 'head' : 'painter';
  }

  // Is this member's profile private to a cold visitor?
  function isPrivateProfile(member) {
    if (!A) return false;
    const acct = accountFor(member);
    // A member with no account is a public roster entry (company data).
    if (!acct) return false;
    return !A.isPublic(acct);
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
    // Project / area / day figures only exist once a day is logged. A member
    // with a gallery but no day-book entries must not be shown a row of zeroes
    // ("0 projects · 0 sq ft · 0 days") — the record is evidence, so it stays
    // silent about what has not happened.
    if (r.daysOnSite) {
      cards.push(['🏗️', G.fmtCount(r.projects), r.projects === 1 ? 'Project logged' : 'Projects logged']);
      cards.push(['📐', G.fmtSqft(r.sqft), 'Area painted']);
      cards.push(['📅', G.fmtCount(r.daysOnSite), r.daysOnSite === 1 ? 'Day on site' : 'Days on site']);
    }
    // Work photos = the member's curated gallery (see docs/PROFILE_GALLERY.md),
    // so a painter who has only added photos still shows real evidence.
    if (r.galleryCount) cards.push(['📸', G.fmtCount(r.galleryCount), r.galleryCount === 1 ? 'Work photo' : 'Work photos']);
    if (r.coworkers) cards.push(['👥', G.fmtCount(r.coworkers), 'Co-workers']);
    return cards;
  }

  function renderRecord() {
    const wrap = $('ppRecord');
    if (!wrap) return;
    const r = G.workRecord(member.id);

    // Honest empty state: nothing logged and no gallery photos yet.
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
    const mine = canEditThis(member);
    const body = $('ppEditBody');
    const heading = $('ppEditHeading');
    // Editing needs either a signed-in account that is allowed to edit this
    // member, or the legacy staff passcode claim. Until then the section shows
    // only the sign-in prompt — no edit form, no "This is me" shortcut, so a
    // public visitor can never change a member's details.
    if (body) body.hidden = !mine;
    if (heading) heading.textContent = mine ? '✏️ Edit this profile & gallery' : '🔒 Crew sign-in';
    if (!mine) { renderClaim(); return; }
    fillEditor();
    renderClaim();
    renderEditorGallery();
  }

  function renderClaim() {
    const claimWrap = $('ppClaim');
    if (!claimWrap) return;
    const me = meAccount();
    const isManager = T.isManager();
    const claimed = T.claimedId() === member.id;

    // Signed in with a real account that may edit this profile.
    if (me && canEditThis(member)) {
      const isOwn = me.memberId === member.id;
      claimWrap.innerHTML = '<span class="pp-claim-note">🔑 Signed in as <strong>' + esc(me.name || me.username) +
        '</strong> (' + esc(me.role) + ')' + (isOwn ? ' — this is your profile.' : ' — you may edit this member.') + '</span> ' +
        '<a class="btn-ghost btn-sm" href="./login.html">Account</a> ' +
        '<button type="button" class="btn-ghost btn-sm" id="ppUnclaim">Sign out</button>';
      const un = $('ppUnclaim');
      if (un) un.addEventListener('click', () => { if (A) A.logout(); T.unclaim(); T.lockHead(); renderAll(); });
      return;
    }

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
        '<span class="pp-claim-note">👋 <a href="./login.html">Sign in to your crew account</a>, or enter the crew passcode, to edit this profile and manage its work photos.</span>' +
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

  // ------------------------------------------------------------
  // PRIVACY
  // ------------------------------------------------------------
  function renderPrivacy() {
    const section = $('ppPrivacySection');
    const notice = $('ppPrivateNotice');
    const privateNow = isPrivateProfile(member);
    const viewerCanSee = canEditThis(member) || (meAccount() && A && A.can(meAccount(), 'profile.edit', accountFor(member) || {}));

    // The privacy control is shown to the owner and to Admin/Head.
    if (section) {
      section.hidden = !canSetPrivacy(member);
      if (!section.hidden) {
        const acct = accountFor(member);
        const isPrivate = acct && acct.privacy === 'private';
        const state = $('ppPrivacyState');
        if (state) {
          state.textContent = isPrivate ? '🔒 Private' : '🌍 Public';
          state.classList.toggle('is-private', !!isPrivate);
          state.classList.toggle('is-public', !isPrivate);
        }
        const btn = $('ppPrivacyToggle');
        if (btn) {
          btn.textContent = isPrivate ? 'Make public' : 'Make private';
          btn.onclick = () => {
            const me = meAccount();
            if (!me) return;
            const status = $('ppPrivacyStatus');
            settle(A.setPrivacy(me, acct.id, isPrivate ? 'public' : 'private'), (res) => {
              if (!res.ok) { if (status) { status.textContent = res.error; status.classList.add('is-error'); } return; }
              if (status) { status.textContent = '✅ Profile is now ' + (res.account.privacy === 'private' ? 'private' : 'public') + '.'; status.classList.remove('is-error'); }
              renderAll();
            });
          };
        }
        const hint = $('ppPrivacyHint');
        if (hint) hint.textContent = 'A private profile is hidden from anonymous visitors and search engines. Company contact details and Admin/Head rules stay in force.';
      }
    }

    // A private profile hides the personal sections from everyone but the
    // owner / an authorised Admin or Head.
    const hidePersonal = privateNow && !viewerCanSee;
    if (notice) notice.hidden = !hidePersonal;
    ['ppRecordSection', 'ppGallerySection', 'ppSpecSection', 'ppPhilosophySection', 'ppContactSection', 'ppEditSection'].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = hidePersonal;
    });
    const hero = $('ppHero');
    if (hero) {
      // Keep the name/role visible (it is the roster's public fact) but hide the
      // personal bio/tagline when private — or when the member simply has none.
      const tagline = $('ppTagline'), bio = $('ppBio');
      if (tagline) tagline.hidden = hidePersonal || !tagline.textContent.trim();
      if (bio) bio.hidden = hidePersonal || !bio.textContent.trim();
    }
    if (hidePersonal) {
      const note = $('ppPrivateNote');
      if (note) note.textContent = (member.name || 'This painter') + ' has chosen to keep their profile private. Sign in with a crew account to view it.';
      document.title = 'Private profile | Painter Plus';
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
        if (!canEditThis(member)) { flashEditor('You can only edit your own profile.', true); return; }
        const val = (id) => { const el = $(id); return el ? (el.value || '').trim() : ''; };
        if (!val('ppfName')) { flashEditor('Please enter a name.', true); return; }

        // When a signed-in account is editing, route the write through the
        // account engine so authorisation + the field whitelist are enforced
        // (a painter cannot change role/status/company fields this way).
        const me = meAccount();
        if (me && A) {
          const acct = accountFor(member);
          if (acct && A.can(me, 'profile.edit', acct)) {
            const patch = {
              name: val('ppfName'), title: val('ppfTitle'), tagline: val('ppfTagline'),
              bio: val('ppfBio'), startYear: val('ppfStartYear'), quote: val('ppfQuote')
            };
            if (A.can(me, 'profile.editContact', acct)) {
              patch.phone = val('ppfPhone'); patch.email = val('ppfEmail');
              patch.address = val('ppfAddress'); patch.note = val('ppfNote');
            }
            settle(A.updateProfile(me, acct.id, patch), (res) => {
              if (!res.ok) { flashEditor(res.error, true); return; }
              // Mirror the permitted fields into the roster so the public team
              // page stays in step (the roster is the site's display layer).
              const mirror = Object.assign({}, member, { id: member.id, role: member.role });
              Object.keys(patch).forEach((k) => { if (k !== 'name' || A.can(me, 'profile.edit', acct)) mirror[k] = patch[k]; });
              const rosterRes = T.save(mirror);
              if (rosterRes.ok) member = rosterRes.member;
              renderProfile(); renderRecord(); renderPrivacy(); flashEditor('✅ Profile saved.');
            });
            return;
          }
          // Signed in but not allowed to edit this member.
          flashEditor('You are not allowed to edit this profile.', true);
          return;
        }

        // Legacy passcode path (no account system loaded).
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
  const optionsWrap = $('ppRoleOptions');
  const statusEl = $('ppRoleStatus');

  function renderRoleControls() {
    if (!roleSection) return;
    // Prefer the account-based permission; fall back to the passcode manager.
    const me = meAccount();
    const canManageRoster = me
      ? A.can(me, 'roster.manage', accountFor(member) || null)
      : T.isManager();
    roleSection.hidden = !canManageRoster;
    if (!canManageRoster || !optionsWrap) return;

    optionsWrap.innerHTML = T.ROLES.map(r => {
      // Two reasons a role may be blocked: it would strand the roster without a
      // lead, or the signed-in account is not allowed to grant it (a Head cannot
      // create an Owner/Head/Admin).
      const strands = T.wouldStrandLeads(member.id, r.id);
      const cannotGrant = me ? !A.can(me, 'role.assign', accountFor(member) || { id: null, role: member.role }, rosterToAccountRole(r.id)) : false;
      const blocked = strands || cannotGrant;
      const title = strands ? 'Promote another member to Owner or Head first'
        : cannotGrant ? 'You cannot grant a role at or above your own' : '';
      return '<button type="button" class="pp-role-option' + (r.id === pendingRole ? ' active' : '') +
        '" data-role="' + r.id + '"' + (blocked ? ' disabled title="' + title + '"' : '') + '>' +
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
      const me = meAccount();
      const acct = accountFor(member);
      // The roster role is what the public team page shows, so authorise it
      // exactly like the linked account role — a lead may only move a member to
      // a role strictly below their own. Refuse BEFORE the roster write, so a
      // refused promotion is never left half-applied to the display layer.
      const mapped = rosterToAccountRole(pendingRole);
      const allowed = me
        ? A.can(me, 'role.assign', acct || { id: null, role: member.role }, mapped)
        : T.isManager();
      if (!allowed) { flash('You can only move painters to a role below your own.', true); return; }

      const res = T.setRole(member.id, pendingRole);
      if (!res.ok) { flash(res.error, true); return; }
      member = res.member;
      // Keep the linked account's role in step (only when the signed-in account
      // is allowed to manage accounts).
      if (me && A && acct && A.can(me, 'account.manage', acct)) {
        const acctRole = mapped;
        settle(A.setRole(me, acct.id, acctRole), (r) => {
          if (!r.ok) { flash(r.error, true); renderRoleControls(); return; }
          renderProfile();
          renderRoleControls();
          flash('✅ ' + member.name + ' is now ' + T.roleOf(member.role).label + '.');
        });
        return;
      }
      renderProfile();
      renderRoleControls();
      flash('✅ ' + member.name + ' is now ' + T.roleOf(member.role).label + '.');
    });
  }

  const removeBtn = $('ppRoleRemove');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      const me = meAccount();
      const acct = accountFor(member);
      const allowed = me
        ? A.can(me, 'roster.manage', acct || { id: null, role: member.role })
        : T.isManager();
      if (!allowed) { flash('You can only remove painters you manage.', true); return; }
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
    renderPrivacy();
    renderRoleControls();
  }

  renderAll();
  initEditor();
  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('ppteam:change', renderAll);
  document.addEventListener('ppauth:change', renderAll);
  document.addEventListener('ppgallery:change', () => { renderGallery(); renderRecord(); renderEditorGallery(); });
})();
