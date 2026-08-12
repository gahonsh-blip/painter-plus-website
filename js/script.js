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

