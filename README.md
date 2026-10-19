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
├── worklog.html      Daily work log (ERP) — photo, on-photo square feet measure, labour + paint, final submit
├── erp.html          ERP — projects, approvals, billing (approved work only) and daily/project/painter reports
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
│   ├── photo-studio.js  "Paint my photo" — recolour an uploaded wall photo + material estimate (window.PPPhoto)
│   ├── measure.js    Photo measurement (perspective-corrected sq ft) + costing (window.PPMeasure)
│   ├── worklog.js    Daily work log store + page (window.PPWorkLog)
│   ├── erp.js        ERP core — projects, approvals, billing, reports (window.PPERP)
│   └── erp-page.js   ERP page controller for erp.html
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
2. Set the day's **labour rate** (₹ per sq ft) and **paint coverage** (sq ft per
   litre per coat, plus the number of coats) — used for the day's costing.
3. For each finished surface: add the **work photo** (take/choose a file, or
   paste a URL), choose the **area** it is (wall, ceiling, floor, feature wall,
   exterior wall, trim, door/window, cabinet, tile, other), then get its
   **square feet** either way:
   - **Measure it on the photo.** Tap **Set scale**, tap the **4 corners of a
     known rectangle** (the wall, a door, a window, a tile grid) and type its
     real width × height; then tap **Draw area** and tap out the painted
     surface. The area is **perspective-corrected**, so a tilted or angled photo
     still gives the true square feet. Tap **Use this measurement**.
   - Or just type the **length × height**.
4. Every entry adds into **one running total** for the day, with a per-area
   breakdown, a **labour cost** (area × rate) and a **paint estimate** (litres).
5. **Final submit** closes the day (entries lock; **Reopen day** to change
   anything). **Copy summary** copies a plain-text day report.

All days are listed newest-first under *Logged days* (✅ = submitted). Everything
is stored in this browser (`localStorage`, key `painterPlusWorkLog`), behind the
same Owner/Head passcode gate as the Admin page.

### 📐 Measuring square feet from a photo

`js/measure.js` (`window.PPMeasure`) turns a shape drawn on a photo into real
square feet. Because a photo is a perspective view, a plain pixel count is wrong
— the module calibrates against a **known rectangle** (4 corners → homography)
and then measures the tapped polygon with the **shoelace formula**. The
geometry is pure and unit-tested:

```bash
node tests/measure.test.js
```

### 🖼️ Paint my photo (recolour a real wall)

`color-studio.html` has a **Paint my photo** section (`js/photo-studio.js`,
`window.PPPhoto`). The client takes or uploads a photo of their own wall, taps
its **four corners**, picks a **colour**, a **finish** and a **texture**, and the
wall in *their* photo is repainted. Below it, the **wall area** (width × height
in feet) drives a **material estimate**: paint litres, putty kg and primer
litres, each rounded up to the packs a shop actually sells.

- The recolour keeps the photo's own light and shade and rebuilds it in the
  paint's colour, so a shadow still reads as a shadow. The paint keeps its own
  lightness — a navy stays navy, it is not forced to the wall's brightness.
- The texture (roller, orange peel, stucco, sand, stripes) is laid on
  **perspective-correct**: the tapped quad is mapped to the unit square and the
  grain is drawn through that mapping, so it follows the wall's real angle
  instead of lying flat across the photo.
- **Before / after** toggles back to the untouched photo. **Save preview**
  downloads the result.
- The colour maths, material maths and texture generation are pure and
  unit-tested; the canvas editor is exercised in a real browser.

```bash
# pure engine (colour, material, textures, geometry)
node tests/photo-studio.test.js

# browser self-test: writes ok/FAIL into the page
bash tests/run-pmp-selftest.sh 8133   # then open http://localhost:8133/_pmp-selftest.html
```

> Coverage rates are practical on-site figures for Indian walls (interior paint
> ≈ 130 sq ft/L/coat, exterior ≈ 110, putty ≈ 17 sq ft/kg), with 10% wastage.
> They are estimates for a quote, not a guarantee.

## 🧮 ERP — projects, approvals, billing and reports

`erp.html` (`js/erp.js`, `window.PPERP`) is the layer above the work log that
turns measurements into money. It is Owner/Head gated, exactly like `admin.html`
and `worklog.html` (default passcode `painter123`, client-side only).

The chain is deliberately gated:

```
Work log day → Final submit → Owner/Head approval → Bill → Report
                              (pending)   (approved)
```

**The one rule that matters:** a measurement that has not been *approved* never
adds a rupee to a bill. Pending work is shown beside the bill so it is visible,
but kept in its own bucket. `billFor()` returns `totals` (approved, billable) and
`pending` separately — they are never added together.

- **Dashboard** — billable vs awaiting-approval money, total measured, paint
  needed, latest days.
- **Projects** — name, client, phone, site, labour rate, coats, coverage,
  paint rate (₹ per litre, optional), status.
- **Approvals** — only a *final-submitted* day can be approved or rejected (an
  open day is still being edited, so its numbers are not final). Decisions can be
  undone.
- **Billing** — pick a project and the bill lists approved days only, with a
  "not included" callout for pending work. Each approved day shows its area, its
  paint quantity and — when the project has a paint rate — its material cost.
  The bill foots to a **grand total** (labour + paint). **Record this bill** saves
  a numbered invoice (`PP-001`, `PP-002`, …); **Copy invoice** produces a
  pasteable text bill that lists the paint line and the grand total.
- **Reports** — daily, project-wise and painter-wise, each showing approved vs
  pending area, labour **and paint litres**.

The work log links a day to a project through a picker on the day bar
(`#wlProjectPick`); the free-text site name is still there for one-off jobs, and
the ERP matches a day to a project by **id first, then by name**, so days logged
before projects existed still appear. The logged-days list shows each submitted
day's approval state (⏳ approval / ✅ approved / ⛔ rejected).

Data lives in `localStorage` under `painterPlusERP`; the work log it reads stays
under `painterPlusWorkLog`. Everything is pure except the small storage helpers,
so the costing and the approval gate are unit-tested:

```bash
node tests/erp.test.js
```

`tests/erp.test.js` includes a block of `THE RULE:` tests that prove unapproved
and rejected work never reaches a bill total, plus regression tests for the
fixes: an approval is bound to the measurements it signed (editing an approved
day withdraws it), invoice ids stay unique, a deleted invoice number is never
reused, rejected work is not counted as pending, a blank project rate never
zeroes the day's labour, the ERP quotes the same paint litres as
`js/measure.js`, only final-submitted days count as "awaiting approval" (open
days are their own bucket), a day with a `projectId` is billed under exactly one
project, same-name projects get distinct ids, the invoice quotes the rate the
work was actually billed at, the painter report shows a crew **name** and merges
an id with a legacy name, and `billTotal()` includes the paint cost.

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

## 🧪 Tests

The measurement geometry is pure and unit-tested (Node, no dependencies):

```bash
node tests/measure.test.js
```

It checks the shoelace area, flat calibration, and **perspective recovery** — a
skewed photo of a 10 × 6 ft wall must still measure 60 sq ft — plus the labour
and paint maths.

The ERP costing, approval gate and reports are pure and unit-tested too:

```bash
node tests/erp.test.js
```

Its `THE RULE:` block proves unapproved and rejected work never reaches a bill
total, that approving a pending day moves it into the bill, and that a day with
no decision reads as pending.

The photo-recolour engine and the Color Studio material maths are pure and
unit-tested as well:

```bash
node tests/photo-studio.test.js
```

The work-log UI itself is checked by a browser harness (the measurement tool
draws on a `<canvas>`, so it needs a real browser):

```bash
bash tests/run-wl-selftest.sh 8130
# then open http://localhost:8130/_selftest.html
```

It unlocks the page, loads a synthetic perspective photo of a 10 × 6 ft wall,
taps the calibration corners and the painted area, saves the entry, and prints
`ok` / `FAIL` lines for the measured square feet, the labour cost, editing,
submit/reopen and the day summary.

The ERP page and the work-log → ERP link each have a browser harness too:

```bash
bash tests/run-erp-selftest.sh 8131        # then open http://localhost:8131/_erp-selftest.html
bash tests/run-wl-erp-selftest.sh 8132     # then open http://localhost:8132/_wl-erp-selftest.html
```

`run-erp-selftest.sh` unlocks `erp.html`, creates a project through the real
form, seeds a submitted and an open day, and checks the dashboard, approvals,
billing (₹0 before approval, ₹960 after), the invoice and all three reports. It
then sets a paint rate and proves the bill gains a paint quantity, a material
cost and a grand total (labour + paint), and that the paint litres reach the
painter report.
`run-wl-erp-selftest.sh` proves a day logged in `worklog.html` is stamped with
the chosen ERP project and then appears in that project's bill once approved.
Both runners cache-bust their scripts and drop the service worker, which caches
cache-first and would otherwise serve a stale `js` file.

## 🧪 Before you finish

Before considering the site fixed, verify:

- [ ] No merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) remain in any file.
- [ ] `js/script.js` has no syntax error (the stray `}` brace is removed).
- [ ] `node tests/measure.test.js` passes (photo measurement geometry + costing).
- [ ] `node tests/erp.test.js` passes (ERP costing + the approval gate + the browser-global binding).
- [ ] `node tests/photo-studio.test.js` passes (photo recolour + material maths).
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
