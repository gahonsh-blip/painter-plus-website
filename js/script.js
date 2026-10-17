// ============================================================
// PAINTER PLUS – PREMIUM AGENCY JS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // localStorage/sessionStorage can throw in private mode or when storage is
    // blocked. Every access goes through these helpers so one failure can never
    // abort the whole DOMContentLoaded handler.
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
        del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
    };

    // ----- THEME TOGGLE (Dark/Light) -----
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        const html = document.documentElement;
        let prefersDark = false;
        try { prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { /* unsupported */ }
        const current = store.get('theme') || (prefersDark ? 'dark' : 'light');
        html.setAttribute('data-theme', current);
        toggle.innerHTML = current === 'dark' ? '☀️ Light' : '🌙 Dark';
        toggle.addEventListener('click', () => {
            const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            store.set('theme', next);
            toggle.innerHTML = next === 'dark' ? '☀️ Light' : '🌙 Dark';
        });
    }

    // ----- MOBILE MENU -----
    const menuBtn = document.querySelector('.mobile-toggle');
    const nav = document.querySelector('.nav-links');
    if (menuBtn && nav) {
        menuBtn.addEventListener('click', () => nav.classList.toggle('open'));
    }

    // ----- PROGRESS BAR -----
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    document.body.prepend(progress);
    window.addEventListener('scroll', () => {
        const top = window.scrollY;
        const height = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = height ? (top / height) * 100 + '%' : '0%';
    });

    // ----- PARALLAX GLOW (mouse follow) -----
    const glow = document.querySelector('.hero .bg-glow');
    if (glow) {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 30 - 15;
            const y = (e.clientY / window.innerHeight) * 30 - 15;
            glow.style.transform = `translate(${x}px, ${y}px)`;
        });
    }

    // ----- REVEAL ON SCROLL (Intersection Observer) -----
    // Reveals elements and triggers paint-roller image reveals as they enter view.
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .roller-reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.15 });
    revealElements.forEach(el => observer.observe(el));
    window.__ppRevealObserver = observer;

    // ----- PROCESS LINE: fills as the process section enters view -----
    // Visualises the project journeying from step 1 to step 3 (CSS handles the fill).
    const processLine = document.querySelector('.process-line');
    if (processLine) {
        const lineObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                processLine.classList.toggle('visible', entry.isIntersecting);
            });
        }, { threshold: 0.4 });
        lineObserver.observe(processLine);
    }

    // ----- FAQ TOGGLE -----
    // The +/− toggle rotates (see CSS) instead of swapping text, so the
    // open/closed state stays instantly legible.
    document.querySelectorAll('.faq-item').forEach(item => {
        const toggleBtn = item.querySelector('.toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                item.classList.toggle('open');
            });
        }
    });

    // ----- PORTFOLIO FILTER -----
    // Filters project cards by category with a soft fade transition.
    const pfGrid = document.getElementById('pfGrid');
    const pfFilterBtns = document.querySelectorAll('.pf-filter-btn');
    if (pfGrid && pfFilterBtns.length) {
        pfFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                pfFilterBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                const filter = btn.dataset.filter;
                pfGrid.classList.add('filtering');
                setTimeout(() => {
                    pfGrid.querySelectorAll('.pf-card').forEach(card => {
                        const show = filter === 'all' || card.dataset.category === filter;
                        card.style.display = show ? '' : 'none';
                    });
                    pfGrid.classList.remove('filtering');
                }, 250);
            });
        });
    }

    // ----- TEAM ROSTER -----
    // The roster lives in js/team.js (window.PPTeam) so the admin page, the
    // team page and every member profile share one source of truth.
    const Team = window.PPTeam;

    // ----- PORTFOLIO: merge admin-added projects (localStorage) -----
    // Projects added via admin.html are stored locally and shown here so
    // the painter can preview additions instantly. (Static site, no backend.)
    const PP_KEY = 'painterPlusProjects';
    function ppRead() { try { return JSON.parse(store.get(PP_KEY)) || []; } catch { return []; } }
    const pfGridMerge = document.getElementById('pfGrid');
    if (pfGridMerge) {
        const added = ppRead();
        if (Array.isArray(added) && added.length) {
            added.forEach(p => {
                const card = document.createElement('article');
                card.className = 'card pf-card reveal';
                card.dataset.category = p.category || 'interior';
                card.dataset.user = '1';
                const img = p.image || '';
                const meta = [p.location && '📍 ' + p.location, p.year, p.finish].filter(Boolean).join(' · ');
                const desc = [p.challenge && '<strong>Challenge:</strong> ' + p.challenge,
                              p.solution && '<strong>Solution:</strong> ' + p.solution,
                              p.result && '<strong>Result:</strong> ' + p.result].filter(Boolean).join('<br>');
                card.innerHTML =
                    '<div class="pf-media"' + (img ? ' style="--pf-img:url(\'' + img.replace(/'/g, "\\'") + '\')"' : '') + '>' +
                      '<img class="pf-img" loading="lazy" src="' + (img || '') + '" alt="' + esc(p.title) + '" />' +
                      '<span class="pf-badge user">' + esc(capital(p.category || 'interior')) + '</span>' +
                      (p.tag ? '<span class="pf-tag">' + esc(p.tag) + '</span>' : '') +
                    '</div>' +
                    '<div class="pf-body">' +
                      '<h3>' + esc(p.title) + '</h3>' +
                      (meta ? '<p class="pf-meta">' + esc(meta) + '</p>' : '') +
                      (desc ? '<p>' + desc + '</p>' : '<p>Added via admin.</p>') +
                    '</div>';
                pfGridMerge.appendChild(card);
            });
            // observe the new cards so the reveal observer picks them up
            const obs = window.__ppRevealObserver;
            if (obs) { pfGridMerge.querySelectorAll('.pf-card.reveal:not(.visible)').forEach(c => obs.observe(c)); }
        }
    }

    // ----- ADMIN PAGE: team, roles, Head profile & portfolio projects -----
    // Everything is localStorage-based (static site, no backend). The roster
    // itself lives in js/team.js so admin, the team page and member profiles
    // all read and write the same data.
    const admPanel = document.getElementById('admPanel');
    const admGate = document.getElementById('admGate');
    if (admPanel && admGate && Team) {
        const unlockBtn = document.getElementById('admUnlock');
        const passInput = document.getElementById('admPass');
        const gateErr = document.getElementById('admGateErr');
        const openPanel = () => {
            admGate.hidden = true; admPanel.hidden = false;
            renderTeamList(); initProfileEditor(); renderList();
        };

        const tryUnlock = () => {
            if (Team.unlockHead(passInput.value)) {
                openPanel();
            } else {
                gateErr.hidden = false;
                passInput.value = '';
            }
        };
        unlockBtn.addEventListener('click', tryUnlock);
        passInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });

        // ----- Admin tab switching (Team & Roles / Painter Profile / Projects) -----
        const TABS = [
            ['tabTeam', 'paneTeam'],
            ['tabProfile', 'paneProfile'],
            ['tabProjects', 'paneProjects']
        ].map(([tabId, paneId]) => ({ tab: document.getElementById(tabId), pane: document.getElementById(paneId) }))
         .filter(t => t.tab && t.pane);

        const showTab = (active) => {
            TABS.forEach(t => {
                const on = t === active;
                t.tab.classList.toggle('active', on);
                t.tab.setAttribute('aria-selected', on);
                t.pane.hidden = !on;
            });
        };
        TABS.forEach(t => t.tab.addEventListener('click', () => showTab(t)));

        // ===== TEAM & ROLES MANAGER =====
        const tmForm = document.getElementById('tmForm');
        const tmFields = ['tmId', 'tmName', 'tmRole', 'tmTitle', 'tmPhoto', 'tmTagline', 'tmBio', 'tmPhone', 'tmEmail', 'tmAddress'];
        const tmGet = id => document.getElementById(id);
        const tmVal = id => { const el = tmGet(id); return el ? (el.value || '').trim() : ''; };
        let editingMember = null;

        const tmRoleSelect = tmGet('tmRole');
        if (tmRoleSelect) tmRoleSelect.innerHTML = Team.roleOptions('painter');

        function updateTmPhotoPreview() {
            const url = tmVal('tmPhoto');
            const box = document.getElementById('tmPhotoPreview');
            const img = document.getElementById('tmPhotoPreviewImg');
            if (!box || !img) return;
            if (url) { img.src = url; img.onerror = () => { box.hidden = true; }; box.hidden = false; }
            else { box.hidden = true; }
        }
        const tmPhotoInput = tmGet('tmPhoto');
        if (tmPhotoInput) tmPhotoInput.addEventListener('input', updateTmPhotoPreview);

        if (tmForm) tmForm.addEventListener('submit', e => {
            e.preventDefault();
            if (!tmVal('tmName')) { alert('Please enter the member\'s name.'); return; }
            const res = Team.save(Object.assign({}, editingMember || {}, {
                id: tmVal('tmId'),
                name: tmVal('tmName'),
                role: tmVal('tmRole') || 'painter',
                title: tmVal('tmTitle'),
                photo: tmVal('tmPhoto'),
                tagline: tmVal('tmTagline'),
                bio: tmVal('tmBio'),
                phone: tmVal('tmPhone'),
                email: tmVal('tmEmail'),
                address: tmVal('tmAddress')
            }));
            if (!res.ok) { alert(res.error); return; }
            resetMemberForm();
            renderTeamList();
            const btn = document.getElementById('tmSave');
            const orig = btn.textContent; btn.textContent = '✅ Saved!';
            setTimeout(() => { btn.textContent = orig; }, 1600);
        });

        const tmResetBtn = document.getElementById('tmReset');
        if (tmResetBtn) tmResetBtn.addEventListener('click', resetMemberForm);

        function resetMemberForm() {
            editingMember = null;
            tmFields.forEach(id => { const el = tmGet(id); if (el) el.value = ''; });
            if (tmRoleSelect) tmRoleSelect.value = 'painter';
            const heading = document.getElementById('tmFormTitle');
            if (heading) heading.textContent = '➕ Add a team member';
            updateTmPhotoPreview();
        }

        function renderTeamList() {
            const ul = document.getElementById('tmItems');
            if (!ul) return;
            const empty = document.getElementById('tmEmpty');
            const members = Team.list();
            ul.innerHTML = '';
            if (!members.length) { if (empty) empty.hidden = false; return; }
            if (empty) empty.hidden = true;

            members.forEach(m => {
                const li = document.createElement('li');
                li.className = 'adm-item';
                // Disable roles that would strand the roster without an Owner/Head.
                const roleOpts = Team.ROLES.map(r =>
                    '<option value="' + r.id + '"' + (r.id === m.role ? ' selected' : '') +
                    (Team.wouldStrandLeads(m.id, r.id) ? ' disabled' : '') + '>' +
                    r.icon + ' ' + r.label + '</option>').join('');
                li.innerHTML =
                    '<span class="adm-item-avatar">' + esc(Team.initials(m.name)) + '</span>' +
                    '<div class="adm-item-body">' +
                      '<div class="adm-item-title">' + esc(m.name) + Team.roleBadge(m) + '</div>' +
                      '<div class="adm-item-meta">' + esc([m.title, m.email, m.phone].filter(Boolean).join(' · ')) + '</div>' +
                    '</div>' +
                    '<div class="adm-item-actions">' +
                      '<select class="adm-role-select" data-id="' + esc(m.id) + '" aria-label="Role for ' + esc(m.name) + '">' +
                        roleOpts +
                      '</select>' +
                      '<a class="edit" href="./painter-profile.html?id=' + encodeURIComponent(m.id) + '">👤 Profile</a>' +
                      '<button class="edit" data-id="' + esc(m.id) + '">✏️ Edit</button>' +
                      '<button class="del" data-id="' + esc(m.id) + '">🗑</button>' +
                    '</div>';
                ul.appendChild(li);
            });

            ul.querySelectorAll('.adm-role-select').forEach(sel => {
                sel.addEventListener('change', () => {
                    const res = Team.setRole(sel.dataset.id, sel.value);
                    if (!res.ok) {
                        alert(res.error);
                        const current = Team.get(sel.dataset.id);
                        if (current) sel.value = current.role;
                        return;
                    }
                    renderTeamList();
                });
            });
            ul.querySelectorAll('button.edit').forEach(b => b.addEventListener('click', () => editMember(b.dataset.id)));
            ul.querySelectorAll('button.del').forEach(b => b.addEventListener('click', () => delMember(b.dataset.id)));
        }

        function editMember(id) {
            const m = Team.get(id);
            if (!m) return;
            editingMember = m;
            tmGet('tmId').value = m.id;
            tmGet('tmName').value = m.name || '';
            tmGet('tmRole').value = m.role || 'painter';
            tmGet('tmTitle').value = m.title || '';
            tmGet('tmPhoto').value = m.photo || '';
            tmGet('tmTagline').value = m.tagline || '';
            tmGet('tmBio').value = m.bio || '';
            tmGet('tmPhone').value = m.phone || '';
            tmGet('tmEmail').value = m.email || '';
            tmGet('tmAddress').value = m.address || '';
            const heading = document.getElementById('tmFormTitle');
            if (heading) heading.textContent = '✏️ Editing: ' + m.name;
            updateTmPhotoPreview();
            tmForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function delMember(id) {
            const m = Team.get(id);
            if (!m) return;
            if (!confirm('Remove ' + m.name + ' from the team?')) return;
            const res = Team.remove(id);
            if (!res.ok) { alert(res.error); return; }
            if (editingMember && editingMember.id === id) resetMemberForm();
            renderTeamList();
        }

        const tmExport = document.getElementById('tmExport');
        if (tmExport) tmExport.addEventListener('click', () => {
            const box = document.getElementById('tmExportBox');
            const ta = document.getElementById('tmExportText');
            box.hidden = false; ta.value = JSON.stringify(Team.list(), null, 2);
            ta.select();
            try { document.execCommand('copy'); } catch {}
        });

        const tmResetAll = document.getElementById('tmResetAll');
        if (tmResetAll) tmResetAll.addEventListener('click', () => {
            if (!confirm('Restore the default roster? All team changes in this browser will be cleared.')) return;
            store.del(Team.STORE_KEY);
            Team.list(); // re-seeds the defaults and notifies listeners
            resetMemberForm(); renderTeamList(); initProfileEditor();
        });

        // ===== HEAD PROFILE EDITOR =====
        // The single-profile editor now edits the Head member of the roster,
        // so the Head's details stay in one place.
        const pfGet = id => document.getElementById(id);
        const pfVal = id => { const el = pfGet(id); return el ? (el.value || '').trim() : ''; };

        function initProfileEditor() {
            const p = Team.get(Team.OWNER_ID) || Team.head();
            if (!p) return;
            pfGet('pfPhoto').value = p.photo || '';
            pfGet('pfName').value = p.name || '';
            pfGet('pfRole').value = p.title || '';
            pfGet('pfTagline').value = p.tagline || '';
            pfGet('pfBio').value = p.bio || '';
            pfGet('pfStat1').value = p.stat1 || '';
            pfGet('pfStat2').value = p.stat2 || '';
            pfGet('pfStat3').value = p.stat3 || '';
            pfGet('pfStat4').value = p.stat4 || '';
            pfGet('pfQuote').value = p.quote || '';
            pfGet('pfPhone').value = p.phone || '';
            pfGet('pfEmail').value = p.email || '';
            pfGet('pfAddress').value = p.address || '';
            pfGet('pfNote').value = p.note || '';
            updatePhotoPreview();
        }
        function updatePhotoPreview() {
            const url = pfVal('pfPhoto');
            const box = document.getElementById('pfPhotoPreview');
            const img = document.getElementById('pfPhotoPreviewImg');
            if (!box || !img) return;
            if (url) { img.src = url; img.onerror = () => { box.hidden = true; }; box.hidden = false; }
            else { box.hidden = true; }
        }
        const pfPhotoInput = document.getElementById('pfPhoto');
        if (pfPhotoInput) pfPhotoInput.addEventListener('input', updatePhotoPreview);

        document.getElementById('profileForm').addEventListener('submit', e => {
            e.preventDefault();
            if (!pfVal('pfName')) { alert('Please enter the painter\'s name.'); return; }
            const head = Team.get(Team.OWNER_ID) || Team.head();
            const res = Team.save(Object.assign({}, head, {
                id: head.id,
                name: pfVal('pfName'),
                role: head.role,
                title: pfVal('pfRole'),
                photo: pfVal('pfPhoto'),
                tagline: pfVal('pfTagline'),
                bio: pfVal('pfBio'),
                stat1: pfVal('pfStat1'), stat2: pfVal('pfStat2'),
                stat3: pfVal('pfStat3'), stat4: pfVal('pfStat4'),
                quote: pfVal('pfQuote'),
                phone: pfVal('pfPhone'), email: pfVal('pfEmail'),
                address: pfVal('pfAddress'), note: pfVal('pfNote')
            }));
            if (!res.ok) { alert(res.error); return; }
            renderTeamList();
            const btn = document.getElementById('pfSave');
            const orig = btn.textContent; btn.textContent = '✅ Saved!';
            setTimeout(() => { btn.textContent = orig; }, 1600);
        });
        document.getElementById('pfReset').addEventListener('click', () => {
            if (!confirm('Reset the Head profile to the default values? Your saved changes will be cleared.')) return;
            const head = Team.get(Team.OWNER_ID) || Team.head();
            Team.save(Object.assign(Team.ownerDefaults(), { id: head.id, role: head.role }));
            initProfileEditor(); renderTeamList();
        });
        document.getElementById('pfClearPhoto').addEventListener('click', () => {
            pfGet('pfPhoto').value = ''; updatePhotoPreview();
        });

        // ===== PORTFOLIO PROJECT MANAGER =====
        const form = document.getElementById('admForm');
        const fields = ['admId','admTitle','admCategory','admTag','admLocation','admYear','admFinish','admImage','admChallenge','admSolution','admResult'];
        const get = id => document.getElementById(id);
        const val = id => (get(id).value || '').trim();

        form.addEventListener('submit', e => {
            e.preventDefault();
            if (!val('admTitle') || !val('admImage')) { alert('Please fill in at least the title and image URL.'); return; }
            const project = {
                id: val('admId') || ('p' + Date.now()),
                title: val('admTitle'),
                category: val('admCategory'),
                tag: val('admTag'),
                location: val('admLocation'),
                year: val('admYear'),
                finish: val('admFinish'),
                image: val('admImage'),
                challenge: val('admChallenge'),
                solution: val('admSolution'),
                result: val('admResult')
            };
            const list = ppRead();
            const idx = list.findIndex(x => x.id === project.id);
            if (idx >= 0) { list[idx] = project; } else { list.push(project); }
            store.set(PP_KEY, JSON.stringify(list));
            resetForm();
            renderList();
        });

        document.getElementById('admReset').addEventListener('click', resetForm);

        document.getElementById('admExport').addEventListener('click', () => {
            const list = ppRead();
            const txt = JSON.stringify(list, null, 2);
            const box = document.getElementById('admExportBox');
            const ta = document.getElementById('admExportText');
            box.hidden = false; ta.value = txt;
            ta.select();
            try { document.execCommand('copy'); } catch {}
        });

        document.getElementById('admClearAll').addEventListener('click', () => {
            if (ppRead().length === 0) return;
            if (confirm('Delete ALL saved projects? This cannot be undone.')) {
                store.del(PP_KEY);
                renderList(); resetForm();
            }
        });

        function renderList() {
            const list = ppRead();
            const ul = document.getElementById('admItems');
            const empty = document.getElementById('admEmpty');
            ul.innerHTML = '';
            if (!list.length) { empty.hidden = false; return; }
            empty.hidden = true;
            list.forEach(p => {
                const li = document.createElement('li');
                li.className = 'adm-item';
                li.innerHTML =
                    '<img src="' + esc(p.image || '') + '" alt="" onerror="this.style.opacity=0.3" />' +
                    '<div class="adm-item-body">' +
                      '<div class="adm-item-title">' + esc(p.title) +
                        '<span class="adm-item-cat">' + esc(capital(p.category)) + '</span>' +
                      '</div>' +
                      '<div class="adm-item-meta">' + esc([p.location, p.year, p.finish].filter(Boolean).join(' · ')) + '</div>' +
                    '</div>' +
                    '<div class="adm-item-actions">' +
                      '<button class="edit" data-id="' + esc(p.id) + '">✏️ Edit</button>' +
                      '<button class="del" data-id="' + esc(p.id) + '">🗑 Delete</button>' +
                    '</div>';
                ul.appendChild(li);
            });
            ul.querySelectorAll('.edit').forEach(b => b.addEventListener('click', () => editProject(b.dataset.id)));
            ul.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => delProject(b.dataset.id)));
        }

        function editProject(id) {
            const p = ppRead().find(x => x.id === id);
            if (!p) return;
            get('admId').value = p.id;
            get('admTitle').value = p.title || '';
            get('admCategory').value = p.category || 'interior';
            get('admTag').value = p.tag || '';
            get('admLocation').value = p.location || '';
            get('admYear').value = p.year || '';
            get('admFinish').value = p.finish || '';
            get('admImage').value = p.image || '';
            get('admChallenge').value = p.challenge || '';
            get('admSolution').value = p.solution || '';
            get('admResult').value = p.result || '';
            document.getElementById('admFormTitle').textContent = '✏️ Editing: ' + p.title;
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function delProject(id) {
            if (!confirm('Delete this project?')) return;
            const list = ppRead().filter(x => x.id !== id);
            store.set(PP_KEY, JSON.stringify(list));
            if (get('admId').value === id) resetForm();
            renderList();
        }

        function resetForm() {
            fields.forEach(id => { const el = get(id); if (el) el.value = ''; });
            get('admCategory').value = 'interior';
            document.getElementById('admFormTitle').textContent = '➕ Add a new project';
        }

        // Auto-unlock if already unlocked in this session (placed last so all
        // consts/functions above are initialized before openPanel runs).
        if (Team.isActingHead()) { openPanel(); }
    }

    // Escapes text AND the quote characters so it is safe in quoted HTML
    // attributes too (member/project ids, names and photo URLs are
    // interpolated into attributes in the admin lists below).
    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function capital(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

    // ----- LINE-ART PAINTER MASCOT (on every page) -----
    // Injects a small Google-doodle style line-drawn painter in the corner
    // so the brand mascot shows on all pages, not just the homepage hero.
    if (!document.querySelector('.hero-painter')) {
        const mascot = document.createElement('div');
        mascot.className = 'painter-mascot';
        mascot.setAttribute('aria-hidden', 'true');
        mascot.innerHTML =
            '<svg viewBox="0 0 220 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A line-drawn cartoon painter">' +
              '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect class="paint-band" x="150" y="40" width="40" height="190" rx="4" fill="#ffd24d" stroke="none" />' +
                '<g class="painter-body">' +
                  '<line x1="148" y1="36" x2="148" y2="244" stroke-width="2" opacity="0.45" />' +
                  '<line x1="93" y1="206" x2="93" y2="266" />' +
                  '<line x1="111" y1="206" x2="111" y2="266" />' +
                  '<path d="M79 270 q4 8 14 8 q10 0 14 -8" />' +
                  '<path d="M97 270 q4 8 14 8 q10 0 14 -8" />' +
                  '<path d="M70 138 q0 -14 30 -14 q30 0 30 14 l4 70 q0 10 -34 10 q-34 0 -34 -10 z" stroke="#2563eb" />' +
                  '<line x1="87" y1="124" x2="87" y2="148" stroke="#2563eb" />' +
                  '<line x1="113" y1="124" x2="113" y2="148" stroke="#2563eb" />' +
                  '<rect x="90" y="160" width="22" height="18" rx="3" stroke="#2563eb" />' +
                  '<line class="arm" x1="120" y1="148" x2="128" y2="150" />' +
                  '<line class="arm" x1="128" y1="150" x2="140" y2="150" />' +
                  '<line x1="103" y1="120" x2="103" y2="128" />' +
                  '<circle cx="103" cy="104" r="22" />' +
                  '<path d="M81 92 q22 -18 44 0" />' +
                  '<line x1="80" y1="92" x2="126" y2="92" />' +
                  '<path d="M81 92 q-6 -2 -8 4" />' +
                  '<circle cx="96" cy="104" r="2.4" fill="currentColor" stroke="none" />' +
                  '<circle cx="110" cy="104" r="2.4" fill="currentColor" stroke="none" />' +
                  '<path d="M97 112 q6 6 12 0" stroke-width="2.4" />' +
                  '<rect x="60" y="150" width="26" height="10" rx="2" stroke="#9ca3af" />' +
                  '<line x1="60" y1="150" x2="64" y2="158" stroke="#9ca3af" stroke-width="2" />' +
                  '<rect x="64" y="146" width="18" height="6" rx="2" fill="#ffd24d" stroke="none" />' +
                '</g>' +
                '<g class="roller-arm">' +
                  '<line class="roller-handle" x1="140" y1="44" x2="140" y2="150" stroke="#8b5a2b" stroke-width="4" />' +
                  '<g class="roller">' +
                    '<rect x="150" y="34" width="40" height="20" rx="6" />' +
                    '<rect x="150" y="40" width="40" height="9" rx="3" fill="#ffd24d" stroke="none" class="roller-ink" />' +
                  '</g>' +
                '</g>' +
                '<circle class="drip" cx="170" cy="56" r="3.2" fill="#ffd24d" stroke="none" />' +
              '</g>' +
            '</svg>';
        document.body.appendChild(mascot);
    }

    // ----- SERVICE WORKER REGISTRATION (PWA) -----
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {
            console.log('Service Worker registration failed.');
        });
    }

});

