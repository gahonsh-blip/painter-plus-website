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
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.15 });
    revealElements.forEach(el => observer.observe(el));

    // ----- FAQ TOGGLE -----
    document.querySelectorAll('.faq-item').forEach(item => {
        const toggleBtn = item.querySelector('.toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                item.classList.toggle('open');
                toggleBtn.textContent = item.classList.contains('open') ? '−' : '+';
            });
        }
    });

    }

    // ----- SERVICE WORKER REGISTRATION (PWA) -----
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            console.log('Service Worker registration failed.');
        });
    }

});

