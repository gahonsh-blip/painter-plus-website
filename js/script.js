document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    const savedTheme = localStorage.getItem('theme');
    const preferredTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    html.setAttribute('data-theme', preferredTheme);
    toggle.textContent = preferredTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
    toggle.addEventListener('click', () => {
      const nextTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', nextTheme);
      localStorage.setItem('theme', nextTheme);
      toggle.textContent = nextTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
    });
  }

  const menuBtn = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-links');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const progress = document.createElement('div');
  progress.className = 'progress-bar';
  document.body.prepend(progress);
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = height > 0 ? `${(scrollTop / height) * 100}%` : '0%';
  });

  const heroGlow = document.querySelector('.hero .bg-glow');
  if (heroGlow) {
    document.addEventListener('mousemove', (event) => {
      const x = (event.clientX / window.innerWidth) * 20 - 10;
      const y = (event.clientY / window.innerHeight) * 20 - 10;
      heroGlow.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  const revealItems = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.15 });
  revealItems.forEach((item) => observer.observe(item));

  document.querySelectorAll('.faq-item').forEach((item) => {
    const toggleBtn = item.querySelector('.toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        item.classList.toggle('open');
        toggleBtn.textContent = item.classList.contains('open') ? '−' : '+';
      });
    }
  });

  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  if (contactForm && formStatus) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = contactForm.querySelector('[name="name"]').value.trim();
      const email = contactForm.querySelector('[name="email"]').value.trim();
      const message = contactForm.querySelector('[name="message"]').value.trim();
      if (!name || !email || !message) {
        formStatus.textContent = 'Please fill in your name, email, and message.';
        return;
      }
      formStatus.textContent = `Thanks ${name}! Your request has been prepared. We will contact you shortly.`;
      contactForm.reset();
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      console.log('Service Worker registration failed.');
    });
  }
});
