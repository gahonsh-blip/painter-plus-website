// ============================================================
// PAINTER PLUS – PREMIUM AGENCY JS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ----- THEME TOGGLE (Dark/Light) -----
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        const html = document.documentElement;
        const current = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        html.setAttribute('data-theme', current);
        toggle.innerHTML = current === 'dark' ? '☀️ Light' : '🌙 Dark';
        toggle.addEventListener('click', () => {
            const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
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

    // ----- PAINTER PROFILE PAGE: render saved profile (from admin) -----
    const PROFILE_KEY = 'painterPlusProfile';
    const PROFILE_DEFAULTS = {
        photo: '', name: 'Painter Plus', role: 'Lead Painter & Founder',
        tagline: 'Master painter crafting premium finishes across Jharkhand since 2015.',
        bio: 'A hands-on painting specialist with a decade of on-site experience. From precise surface preparation to the final flawless coat, every project is treated as a signature piece. The belief is simple: great paint is 70% preparation and 100% care.',
        stat1: '10+', stat2: '500+', stat3: '5-yr', stat4: '100%',
        stat1label: 'Years experience', stat2label: 'Projects done', stat3label: 'Warranty', stat4label: 'Free inspection',
        quote: '“Paint is the first thing a room says about itself. I make sure it always says quality.”',
        phone: '+91 8825183628', email: 'gahonsh@gmail.com',
        address: 'Upar Balalong, Arki, Khunti, Jharkhand – 835225',
        note: 'Active since 2015 · 5-year warranty on every project · Free site inspection'
    };
    function ppProfileRead() { try { return Object.assign({}, PROFILE_DEFAULTS, JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); } catch { return Object.assign({}, PROFILE_DEFAULTS); } }
    const ppNameEl = document.getElementById('ppName');
    if (ppNameEl) {
        const p = ppProfileRead();
        const set = (id, text) => { const el = document.getElementById(id); if (el && text) el.textContent = text; };
        set('ppName', p.name); set('ppRole', p.role); set('ppTagline', p.tagline);
        set('ppBio', p.bio); set('ppQuoteText', p.quote);
        set('ppPhoneText', p.phone); set('ppEmailText', p.email);
        set('ppAddress', p.address); set('ppNote', p.note);
        // phone / email / whatsapp links
        const phoneLink = document.getElementById('ppPhone'); if (phoneLink && p.phone) phoneLink.href = 'tel:' + p.phone.replace(/[^+\d]/g, '');
        const emailLink = document.getElementById('ppEmail'); if (emailLink && p.email) emailLink.href = 'mailto:' + p.email;
        const waLink = document.getElementById('ppWhatsapp'); if (waLink && p.phone) waLink.href = 'https://wa.me/' + p.phone.replace(/[^\d]/g, '');
        // stats
        const statsWrap = document.getElementById('ppStats');
        if (statsWrap) {
            const pairs = [[p.stat1, p.stat1label], [p.stat2, p.stat2label], [p.stat3, p.stat3label], [p.stat4, p.stat4label]];
            statsWrap.innerHTML = pairs.map(([num, label]) =>
                '<div class="stat reveal"><span class="stat-num">' + esc(num) + '</span><span class="stat-label">' + esc(label) + '</span></div>').join('');
            const obs = window.__ppRevealObserver;
            if (obs) statsWrap.querySelectorAll('.reveal').forEach(el => obs.observe(el));
        }
        // photo: replace SVG with <img> if a photo URL is set
        const avatar = document.getElementById('ppAvatar');
        if (avatar && p.photo) {
            avatar.innerHTML = '<img class="pp-photo" src="' + esc(p.photo) + '" alt="Painter photo" onerror="this.remove()" />';
        }
    }

    // ----- PORTFOLIO: merge admin-added projects (localStorage) -----
    // Projects added via admin.html are stored locally and shown here so
    // the painter can preview additions instantly. (Static site, no backend.)
    const PP_KEY = 'painterPlusProjects';
    function ppRead() { try { return JSON.parse(localStorage.getItem(PP_KEY)) || []; } catch { return []; } }
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

    // ----- ADMIN PAGE: project manager (localStorage) -----
    const ADMIN_PASSCODE = 'painter123'; // client-side only, not real security
    const admPanel = document.getElementById('admPanel');
    const admGate = document.getElementById('admGate');
    if (admPanel && admGate) {
        const unlockBtn = document.getElementById('admUnlock');
        const passInput = document.getElementById('admPass');
        const gateErr = document.getElementById('admGateErr');
        const SESSION_KEY = 'ppAdminUnlocked';
        const openPanel = () => {
            admGate.hidden = true; admPanel.hidden = false;
            initProfileEditor(); renderList();
        };

        const tryUnlock = () => {
            if (passInput.value === ADMIN_PASSCODE) {
                sessionStorage.setItem(SESSION_KEY, '1');
                openPanel();
            } else {
                gateErr.hidden = false;
                passInput.value = '';
            }
        };
        unlockBtn.addEventListener('click', tryUnlock);
        passInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });

        // ----- Admin tab switching -----
        const tabProfile = document.getElementById('tabProfile');
        const tabProjects = document.getElementById('tabProjects');
        const paneProfile = document.getElementById('paneProfile');
        const paneProjects = document.getElementById('paneProjects');
        const showTab = (which) => {
            const prof = which === 'profile';
            tabProfile.classList.toggle('active', prof); tabProfile.setAttribute('aria-selected', prof);
            tabProjects.classList.toggle('active', !prof); tabProjects.setAttribute('aria-selected', !prof);
            paneProfile.hidden = !prof; paneProjects.hidden = prof;
        };
        tabProfile.addEventListener('click', () => showTab('profile'));
        tabProjects.addEventListener('click', () => showTab('projects'));

        // ===== PAINTER PROFILE EDITOR =====
        function profileRead() { try { return Object.assign({}, profileDefaults(), JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); } catch { return Object.assign({}, profileDefaults()); } }
        function profileSave(p) { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
        function profileDefaults() {
            return {
                photo: '', name: 'Painter Plus', role: 'Lead Painter & Founder',
                tagline: 'Master painter crafting premium finishes across Jharkhand since 2015.',
                bio: 'A hands-on painting specialist with a decade of on-site experience. From precise surface preparation to the final flawless coat, every project is treated as a signature piece. The belief is simple: great paint is 70% preparation and 100% care.',
                stat1: '10+', stat2: '500+', stat3: '5-yr', stat4: '100%',
                stat1label: 'Years experience', stat2label: 'Projects done', stat3label: 'Warranty', stat4label: 'Free inspection',
                quote: '“Paint is the first thing a room says about itself. I make sure it always says quality.”',
                phone: '+91 8825183628', email: 'gahonsh@gmail.com',
                address: 'Upar Balalong, Arki, Khunti, Jharkhand – 835225',
                note: 'Active since 2015 · 5-year warranty on every project · Free site inspection'
            };
        }
        function pfGet(id) { return document.getElementById(id); }
        function pfVal(id) { return (pfGet(id).value || '').trim(); }

        function initProfileEditor() {
            const p = profileRead();
            pfGet('pfPhoto').value = p.photo || '';
            pfGet('pfName').value = p.name || '';
            pfGet('pfRole').value = p.role || '';
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
            if (url) { img.src = url; img.onerror = () => { box.hidden = true; }; box.hidden = false; }
            else { box.hidden = true; }
        }
        document.getElementById('pfPhoto').addEventListener('input', updatePhotoPreview);

        document.getElementById('profileForm').addEventListener('submit', e => {
            e.preventDefault();
            if (!pfVal('pfName')) { alert('Please enter the painter\'s name.'); return; }
            const p = profileRead();
            p.photo = pfVal('pfPhoto');
            p.name = pfVal('pfName');
            p.role = pfVal('pfRole');
            p.tagline = pfVal('pfTagline');
            p.bio = pfVal('pfBio');
            p.stat1 = pfVal('pfStat1'); p.stat2 = pfVal('pfStat2');
            p.stat3 = pfVal('pfStat3'); p.stat4 = pfVal('pfStat4');
            p.quote = pfVal('pfQuote');
            p.phone = pfVal('pfPhone'); p.email = pfVal('pfEmail');
            p.address = pfVal('pfAddress'); p.note = pfVal('pfNote');
            profileSave(p);
            const btn = document.getElementById('pfSave');
            const orig = btn.textContent; btn.textContent = '✅ Saved!';
            setTimeout(() => { btn.textContent = orig; }, 1600);
        });
        document.getElementById('pfReset').addEventListener('click', () => {
            if (!confirm('Reset the profile to the default values? Your saved changes will be cleared.')) return;
            localStorage.removeItem(PROFILE_KEY);
            initProfileEditor();
        });
        document.getElementById('pfClearPhoto').addEventListener('click', () => {
            pfGet('pfPhoto').value = ''; updatePhotoPreview();
        });

        // ===== PORTFOLIO PROJECT MANAGER (existing) =====
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
            localStorage.setItem(PP_KEY, JSON.stringify(list));
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
                localStorage.removeItem(PP_KEY);
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
            localStorage.setItem(PP_KEY, JSON.stringify(list));
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
        if (sessionStorage.getItem(SESSION_KEY) === '1') { openPanel(); }
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
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

