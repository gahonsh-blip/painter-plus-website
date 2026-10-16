# AGENTS.md — Painter Plus Website (Agent Knowledge Base)

This file gives AI agents and contributors the essential context needed to work on this repository safely and correctly. Humans should read `README.md` and `docs/NEXT_STEPS.md` first.

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
| Team roster | `team.html` (roster page), `painter-profile.html` (per-member profile), `js/team.js` (shared data + roles) |
| Admin | `admin.html` (Owner/Head login: Team & Roles, profile, Portfolio projects) |
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
