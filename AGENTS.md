# AGENTS.md — Painter Plus Website (Agent Knowledge Base)

This file gives AI agents and contributors the essential context needed to work on this repository safely and correctly. Humans should read `README.md` and `docs/NEXT_STEPS.md` first. `docs/BUG_AUDIT.md` records the full-site bug scan and the fixes applied to it.

## Project summary

A fully static marketing website for "Painter Plus", a painting-services business in Jharkhand, India. Plain HTML + CSS + vanilla JS. No build step, no backend, no package manager. Deploys to GitHub Pages via a GitHub Actions workflow.

## Critical issues (all resolved — kept for history)

1. **Merge conflicts — RESOLVED.** Every conflict marker has been removed and one clean version chosen per file. The site is deployable. `docs/NEXT_STEPS.md` keeps the recovery record.

2. **`js/script.js` syntax error — FIXED.** The stray closing `}` brace between the FAQ-toggle block and the service-worker registration block was removed, so the `DOMContentLoaded` handler runs. Verify with `node --check js/script.js`.

3. **Two URL-path conventions coexist — RESOLVED.**
   - HEAD version: absolute, project-prefixed — `/painter-plus-website/about.html`
   - Incoming version: relative — `./about.html`
   **Decision: internal links and assets use relative paths** (`./...`), which
   resolve both locally and under the Pages project prefix. Canonical/OG/sitemap
   URLs use the absolute live domain `https://gahonsh-blip.github.io/painter-plus-website/`.

4. **Two GitHub accounts referenced — RESOLVED.** HEAD uses `gahonsh-blip`, incoming uses `gahonsh`. **The final account is `gahonsh-blip`**, live at `https://gahonsh-blip.github.io/painter-plus-website/`. All references (canonical URLs, sitemap, robots.txt, manifest, service worker cache paths, OG image URLs) now use `gahonsh-blip`.

5. **PWA icons — RESOLVED.** `images/icon-192.png`, `images/icon-512.png` and `images/icon-maskable-512.png` all exist and are referenced by `manifest.json` and cached by `sw.js`.

6. **Emoji / encoding — RESOLVED.** The garbled `??` emoji from the merge were replaced with real emoji in visible content (logo, phone/email labels, footer). All files are valid UTF-8.

7. **`color-studio.js` homepage crash — FIXED.** `index.html` loads `js/color-studio.js` for its hero painter scene but has none of the Color Studio widget ids, so `buildPalette()` threw on a `null` `#palette` and aborted the whole file — killing the painter animation. `init()` now returns early unless the studio widgets exist, and `playScene()` guards its own elements. See `docs/BUG_AUDIT.md` §1.

8. **Full-site audit — see `docs/BUG_AUDIT.md`.** It lists every bug found and fixed (missing `<h1>`s, undefined `--shadow-sm`, missing `apple-touch-icon`, `admin.html` OG tags, the `offline.html` head, un-typed buttons, the `NEXT_STEPS.md` duplicate heading, and the stale service-worker cache), plus the items investigated and confirmed *not* to be bugs.

9. **Blocked-storage crash — FIXED.** `js/script.js` read `localStorage` unguarded at the very top of its `DOMContentLoaded` handler. Where storage throws (private mode, "block all cookies"), the throw aborted the whole handler — killing the theme toggle, mobile menu, reveal animations, FAQ and service-worker registration. All storage access now goes through a `try/catch` `store` helper. See `docs/BUG_AUDIT.md` §10.

10. **CSP blocked the contact form — FIXED.** `_headers` had no `form-action`, so the `contact.html` POST to Formspree fell back to `default-src 'self'` and would be blocked. Added `form-action`/`connect-src` for `https://formspree.io`, plus `base-uri` and `frame-ancestors`. Note GitHub Pages ignores `_headers`; it matters on hosts that honour it. See §11.

**Pattern to watch for:** this codebase loads page-specific scripts site-wide (`color-studio.js` on `index.html`). Any unguarded top-level access — a missing DOM id, a throwing `localStorage` call — aborts the *entire file* and silently kills unrelated features. Always guard, and prefer feature-detection over assuming the DOM or storage is present.

## Business details (source of truth)

Use these exact values when fixing contact info across all pages:

- Name: Painter Plus
- Phone: +91 8825183628 (tel link: `tel:+918825183628`)
- WhatsApp: https://wa.me/918825183628
- Email: gahonsh@gmail.com
- Address: Upar Balalong, Arki, Khunti, Jharkhand, India – 835225
- Services: Interior painting, Exterior painting, Wall putty, Texture finishes
- Warranty: 5-year warranty, free site inspection
- Active since: 2015

## Tech stack & conventions

- HTML5, hand-written. Each page links `./css/style.css` and `./js/script.js`.
- CSS uses custom properties (`--primary`, `--bg`, etc.) for theming. Dark/light via `data-theme` attribute on `<html>`, toggled by `#theme-toggle`.
- Vanilla JS in `js/script.js`: theme toggle, mobile menu, scroll progress bar, parallax hero glow, IntersectionObserver reveal animations, FAQ accordion, service-worker registration.
- PWA: `manifest.json` + `sw.js` (cache-first for core assets).
- No `package.json`, no npm. Local preview: `python3 -m http.server 8000`.

## Where things live

| Concern | File(s) |
|--------|---------|
| Pages | `index.html`, `about.html`, `services.html`, `portfolio.html`, `contact.html`, `privacy.html`, `terms.html`, `offline.html` |
| Color Studio | `color-studio.html` + `js/color-studio.js` — live room/exterior paint preview, finishes, lighting, and the **area & square-feet estimator** |
| Team roster | `team.html` (roster page), `painter-profile.html` (per-member profile), `js/team.js` (shared data + roles) |
| Admin | `admin.html` (Owner/Head login: Team & Roles, profile, Portfolio projects) |
| Daily work log | `worklog.html` + `js/worklog.js` — the site's **ERP**: each day the crew adds a photo entry per painted surface, measures its square feet, sees one running day total, then does a **Final submit** |
| Styles | `css/style.css` |
| Scripts | `js/script.js` |
| PWA | `manifest.json`, `sw.js` |
| SEO | `robots.txt`, `sitemap.xml`, per-page `<meta>` + JSON-LD on homepage |
| Security headers | `_headers` |
| Deploy | `.github/workflows/static.yml` |

## Team roles

The crew roster lives in `js/team.js` (`window.PPTeam`) and is shared by
`team.html`, `painter-profile.html` and `admin.html`. Five roles exist,
highest first:

| Role | Meaning |
|------|---------|
| `owner` | Founder-owner of Painter Plus. **May change anyone's role.** |
| `head` | Runs the crew. **May change anyone's role.** |
| `supervisor` | Supervises site work, checks quality, signs off finished jobs. |
| `painter` | Applies the paint, putty and finishes on site. |
| `helper` | Assists the painter with surface preparation and materials. |

- **`gahonsh` is the Head.** Everyone else starts as a **Painter**.
- An Owner or Head can re-role any member to Painter / Helper / Supervisor /
  Head / Owner, from either the member's profile page or the Admin page's
  **Team & Roles** tab.
- Role changes are guarded: the roster must always keep at least one
  Owner **or** Head, so the last lead can be neither demoted nor removed.
  `PPTeam.wouldStrandLeads(id, role)` reports this for the UI, which disables
  the offending option.
- The role controls only render for a signed-in Owner/Head (session passcode
  gate, default `painter123` — client-side only, not real security).
- `list()` sorts by `roleRank()` (owner → helper), so the Owner/Head always
  lead the roster; `head()` returns the Owner if there is one, else the Head.

## Color Studio — area & square-feet estimator

`color-studio.html` (`js/color-studio.js`) lets a client pick a scene (living
room, bedroom, kitchen, bathroom, dining, office, kids' room, exterior), click a
surface in the picture, choose a colour/finish/lighting, and **measure that
surface**.

- Selecting a surface (tab or click in the picture) loads its stored
  **length × height** into `#areaW` / `#areaH` and shows its **square feet**
  (`#areaSurfaceSqft`).
- The selected surface's size and square feet, plus the scene totals, also
  appear on the picture itself in the stage HUD (`#stageHud`, `#hudSurfaceName`,
  `#hudSurfaceDim`, `#hudSurfaceSqft`, `#hudTotal`), so the figure is visible
  where the client clicks. `updateHud()` mirrors the panel and is called from
  `syncAreaInputs()` and `renderArea()`.
- `#areaList` lists every surface of the current scene with its dimensions,
  its square feet, and a checkbox to include/exclude it from the paint total.
  Floors, sky and ground are excluded by default (`NOT_PAINTED`).
- `#areaTotal` shows two figures: **total area (all surfaces)** and **paint area
  (N coats)**. `#paintEstimate` shows the litres needed, using
  `SQFT_PER_LITRE_PER_COAT = 130` and `WASTAGE = 0.1`.
- Sizes are per scene, persisted in `localStorage` (`pp_studio.areas`), and
  carried into the quote link (`?colors=…&sqft=…&coats=…&litres=…`).
- `DEFAULT_SIZES` holds typical room dimensions so the panel is useful before
  the client types anything; **Reset sizes** restores them.
- The stage art is proportional, not to scale — the estimator sums the sizes the
  client types, it does not measure the picture.

## Daily work log (ERP) — `worklog.html` + `js/worklog.js`

The on-site day book. Where the Color Studio is for the *client* to preview a
room, the work log is for the *crew* to record the work actually done.

- One day per date. `window.PPWorkLog` (in `js/worklog.js`) stores everything in
  `localStorage` under `painterPlusWorkLog`, keyed by `YYYY-MM-DD`.
- Each **photo entry** is one painted surface: a work photo (file upload,
  downscaled to ≤1024px JPEG, or a URL), the **area** it is (`AREAS` — wall,
  ceiling, floor, feature wall, exterior wall, trim, door/window, cabinet, tile,
  other), its **length × height**, and an optional note. Saving computes that
  photo's **square feet** on the spot.
- All entries of the day sum into **one running total** (`PPWorkLog.totals`),
  shown as *Total area today* plus a per-area breakdown (`PPWorkLog.breakdown`).
- **Final submit** closes the day (`status: 'submitted'`): entries lock, and a
  **Reopen day** button appears. `PPWorkLog.summary` produces a copyable text
  report; **Copy summary** copies it.
- Every logged day is listed newest-first in *Logged days* (✅ = submitted).
- The page reuses the shared Owner/Head passcode gate (`PPTeam.unlockHead`) and
  can attribute the day to a crew member (`#wlCrew`, filled from `PPTeam.list`).
- Key ids: `#wlApp`, `#wlGate`/`#wlPanel`, `#wlDate`, `#wlProject`, `#wlCrew`,
  `#wlArea`, `#wlW`, `#wlH`, `#wlSqft`, `#wlPhotoFile`/`#wlPhotoUrl`,
  `#wlItems`, `#wlTotals`, `#wlSubmit`, `#wlReopen`, `#wlHistory`.
- It is `noindex, nofollow` (like `admin.html`) and therefore **not** in
  `sitemap.xml`. Its public API: `getDay`, `listDays`, `addEntry`, `removeEntry`,
  `submitDay`, `reopenDay`, `totals`, `breakdown`, `summary`, `sqft`, `fmt`.

## Working rules for agents

- Read `docs/NEXT_STEPS.md` and resolve merge conflicts BEFORE any new work.
- Never leave conflict markers in committed files.
- Internal links and assets use **relative paths** (`./about.html`, `./css/style.css`) so they work both locally and under the `/painter-plus-website/` Pages prefix. Canonical, OG and sitemap URLs use the absolute live domain `https://gahonsh-blip.github.io/painter-plus-website/`.
- Do not introduce a build step, bundler, or framework unless the owner asks.
- Do not add new dependencies; there is no package manager in this project.
- Preserve the PWA behavior (service worker + manifest) when editing.
- After edits, run the verification checklist in `README.md` and `docs/NEXT_STEPS.md`.

## Useful commands

```bash
# Find remaining conflict markers across the repo
grep -rn "^<<<<<<<\|^=======\|^>>>>>>>" .

# Quick syntax check of the JS (requires node)
node --check js/script.js

# Local preview
python3 -m http.server 8000
```

## Deploy

Deploys run via `.github/workflows/static.yml` on every push to `main`, which
uploads the repo root to GitHub Pages (`build_type: workflow`).

**Known blocker (as of 2026-10-16):** the `gahonsh-blip` account is **locked due
to a billing issue**, so no Actions runner will start — every deploy run since
2026-09-18 fails in ~4s with 0 steps and the annotation *"The job was not started
because your account is locked due to a billing issue."* The live site is
therefore frozen at its 2026-08-15 build. This is an account-level setting, not a
code problem: fix the billing issue at <https://github.com/settings/billing>, then
re-run the workflow (Actions → *Deploy static content to Pages* → *Re-run*).
Until then, merging to `main` is enough — the site updates on the next successful
deploy.
