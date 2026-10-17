# Painter Plus – Premium Painting Services Website

A fully static, premium business website for a painting services company. Built with plain HTML, CSS, and JavaScript — no backend, no databases, no frameworks. Ready to deploy on GitHub Pages.

> ⚠️ **CURRENT STATE — READ BEFORE WORKING**
> The repository was previously in a broken, undeployable state (unresolved Git merge-conflict markers in almost every file, and a syntax error in `js/script.js`). **This has now been fixed** (see "Recovery status" below). The site renders correctly, all conflicts are resolved, and the JS is valid. The notes below document the issues that were found and how they were resolved.
> Any developer or AI agent starting work here should still skim [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) for the recovery history and remaining optional items.

### Recovery status (fixed)
- ✅ All merge-conflict markers removed from every source file. The cleaner, richer "incoming" version was kept as the base for all pages, with `gahonsh` → `gahonsh-blip` corrected in all canonical/OG URLs.
- ✅ `js/script.js` syntax error (stray `}` brace) fixed and validated with `node --check`.
- ✅ Path style standardized on **relative `./`** for internal links/assets (works on any GitHub Pages subpath); canonical/OG/sitemap URLs point at `https://gahonsh-blip.github.io/painter-plus-website/`.
- ✅ `contact.html` restored with a working Formspree form (`https://formspree.io/f/xeebvvko`) plus clean contact details; garbled emoji fixed.
- ✅ `terms.html` rebuilt to match the other pages (relative paths, full meta tags, consistent contact info, no dead links to non-existent `faq.html`/`testimonials.html`).
- ✅ `offline.html` "Go Home" link made relative.
- ✅ PWA icons generated (`images/icon-192.png`, `images/icon-512.png`, `images/icon-maskable-512.png`) and wired into `manifest.json`.
- ✅ `sw.js` improved with a correct BASE_PATH, offline fallback to `offline.html`, cache cleanup on activate, and icon caching.
- ✅ `sitemap.xml` and `robots.txt` point at the final live domain `https://gahonsh-blip.github.io/painter-plus-website/`.
- ✅ JSON-LD `LocalBusiness` schema added to the homepage.
- ✅ Verified: all pages return HTTP 200, theme toggle works, form fields present, internal links resolve to existing files.

### Remaining / optional (see docs/NEXT_STEPS.md section 7)
- The Formspree endpoint `xeebvvko` is from the original HEAD version — confirm it is the owner's real form ID, or replace it.
- Replace placeholder `images/og-image.svg` and Unsplash portfolio images with real photography.
- Improve accessibility and add Lighthouse/CI checks.

## 🏢 Business information

| Field | Value |
|-------|-------|
| Business name | Painter Plus |
| Phone | +91 8825183628 (`tel:+918825183628`) |
| WhatsApp | https://wa.me/918825183628 |
| Email | gahonsh@gmail.com |
| Address | Upar Balalong, Arki, Khunti, Jharkhand, India – 835225 |
| Area served | Arki, Ranchi, Khunti (Jharkhand, India) |
| Warranty | 5-year warranty on all work, free site inspection |
| Services | Interior painting, Exterior painting, Wall putty, Texture finishes |
| Since | 2015 |

## 📁 Project structure

```
painter-plus-website/
├── index.html        Homepage — hero, services, process, portfolio preview, testimonials, FAQ, CTA
├── about.html        About — mission, vision, values
├── services.html     Detailed service cards (interior, exterior, putty, texture)
├── portfolio.html    Project gallery with case studies
├── contact.html      Contact form + business info (see note below)
├── team.html         Our Team — crew roster with roles (Owner/Head/Supervisor/Painter/Helper)
├── painter-profile.html  Per-member profile (?id=slug) + Owner/Head role changer
├── admin.html        Owner/Head login: Team & Roles, profile, portfolio projects
├── worklog.html      Daily work log (ERP) — photo + area square feet per entry, one day total, final submit
├── privacy.html      Privacy policy
├── terms.html        Terms of service
├── offline.html      Shown by the service worker when offline
├── css/
│   └── style.css     All styles — dark/light theme, responsive, animations
├── js/
│   ├── script.js     Theme toggle, mobile menu, progress bar, reveal-on-scroll, FAQ, admin, PWA registration
│   ├── team.js       Shared team roster + roles (window.PPTeam)
│   ├── team-page.js  Renders the roster on team.html
│   ├── profile-page.js  Renders one member on painter-profile.html
│   ├── color-studio.js  Color Studio live paint preview
│   └── worklog.js    Daily work log store + page (window.PPWorkLog)
├── images/
│   └── og-image.svg  Open Graph / social share image (placeholder)
├── manifest.json     PWA manifest
├── sw.js             Service worker (offline caching)
├── robots.txt        SEO crawl rules + sitemap reference
├── sitemap.xml       SEO sitemap
├── _headers          Security headers (X-Frame-Options, CSP, etc.)
└── .github/workflows/static.yml   GitHub Pages deploy workflow
```

## 🚀 Deployment (GitHub Pages)

1. Push all files to the GitHub repository.
2. Go to **Settings → Pages**.
3. Source: **GitHub Actions** (the workflow in `.github/workflows/static.yml` deploys the repository root).
4. The site goes live at your GitHub Pages URL.

The deploy workflow runs automatically on every push to `main`.

## 🔗 Path convention (resolved)

The unresolved merge left two URL-path conventions in the files. This is now settled:

- **Final GitHub account: `gahonsh-blip`** → live domain:
  `https://gahonsh-blip.github.io/painter-plus-website/`
- **Internal links and assets use relative paths** (`./about.html`,
  `./css/style.css`). These resolve correctly under the
  `/painter-plus-website/` project prefix on GitHub Pages *and* under a plain
  local server (`python3 -m http.server 8000`), so the site previews the same
  way it deploys.
- **Canonical, Open Graph and sitemap URLs use the absolute live domain**,
  `https://gahonsh-blip.github.io/painter-plus-website/...`, because search
  engines and social crawlers need a full origin.

Do not reintroduce absolute `/painter-plus-website/...` paths for internal
links: they break local preview.

## ✉️ Contact form

The HEAD version of `contact.html` references a **Formspree** form. To make the form live:

1. Create a form at https://formspree.io and copy your form ID.
2. In `contact.html`, set the form `action` to `https://formspree.io/f/your-form-id`.
3. Verify the field names (`name`, `phone`, `_replyto`, `message`) match what Formspree expects.

The incoming version currently has **no working form** — only contact details. Choose one approach and apply it consistently (see `docs/NEXT_STEPS.md`).

## 👑 Team roles

The crew roster is shared across `team.html`, `painter-profile.html` and
`admin.html` via `js/team.js` (`window.PPTeam`).

| Role | Meaning |
|------|---------|
| `owner` | Founder-owner of Painter Plus. May change anyone's role. |
| `head` | Runs the crew day to day. May change anyone's role. |
| `supervisor` | Supervises site work, checks quality, signs off finished jobs. |
| `painter` | Applies the paint, putty and finishes on site. |
| `helper` | Assists the painter with surface preparation and materials. |

`gahonsh` is the Head; everyone else starts as a Painter. A signed-in Owner or
Head can re-role any member to Painter / Helper / Supervisor / Head / Owner,
from that member's profile page or the Admin **Team & Roles** tab. The roster
always keeps at least one Owner or Head — the last lead cannot be demoted or
removed.

## 🧾 Daily work log (ERP)

`worklog.html` (`js/worklog.js`, `window.PPWorkLog`) is the on-site day book —
the site's ERP. The crew logs the day's work photo by photo:

1. Pick the **date** and the **project / site** (and, optionally, who is logging).
2. For each finished surface: add the **work photo** (take/choose a file, or
   paste a URL), choose the **area** it is (wall, ceiling, floor, feature wall,
   exterior wall, trim, door/window, cabinet, tile, other), and type its
   **length × height**. The **square feet** appear live and are saved with the
   photo.
3. Every entry adds into **one running total** for the day, with a per-area
   breakdown — so it is clear how many square feet were completed.
4. **Final submit** closes the day (entries lock; **Reopen day** to change
   anything). **Copy summary** copies a plain-text day report.

All days are listed newest-first under *Logged days* (✅ = submitted). Everything
is stored in this browser (`localStorage`, key `painterPlusWorkLog`), behind the
same Owner/Head passcode gate as the Admin page.

## 🎨 Customisation

- Replace business name, phone, email, and address in all HTML files (use the values in the table above).
- Manage the crew on the **Admin → Team & Roles** tab: `gahonsh` is the Head, everyone else starts as a Painter, and an Owner/Head can re-role anyone (Painter / Helper / Supervisor / Head / Owner). See the Team roles section above.
- Replace `images/og-image.svg` and any placeholder images with real photography.
- Update the Formspree endpoint in `contact.html`.
- Adjust colors via the CSS custom properties at the top of `css/style.css` (`--primary`, `--bg`, etc.).
- Update `sitemap.xml`, `robots.txt`, and `manifest.json` with the final live domain.

## 📱 PWA

The site is installable and works offline:

- `manifest.json` — app name, theme color, icons, display mode.
- `sw.js` — caches core pages/CSS/JS for offline use, falls back to `offline.html`.
- `js/script.js` registers the service worker.

> Note: the HEAD `manifest.json` references icon files (`icon-192.png`, `icon-512.png`) that do **not** exist in `images/` yet. Either add these icons or remove the icon entries.

## 🔧 Local development

No build step needed. It's plain static files. To preview locally:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve
```

Then open http://localhost:8000.

## 🧪 Before you finish

Before considering the site fixed, verify:

- [ ] No merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) remain in any file.
- [ ] `js/script.js` has no syntax error (the stray `}` brace is removed).
- [ ] All pages load with no console errors.
- [ ] Dark/light theme toggle works.
- [ ] Mobile menu opens/closes.
- [ ] Contact form submits (if Formspree is configured).
- [ ] Service worker registers and offline page works.
- [ ] `sitemap.xml` and `robots.txt` point at `https://gahonsh-blip.github.io/painter-plus-website/`.
- [ ] `manifest.json` icons exist in `images/`.

See [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) for the detailed recovery checklist and roadmap.

---
Built with ❤️ by Painter Plus
