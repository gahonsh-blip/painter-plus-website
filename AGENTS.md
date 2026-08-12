# AGENTS.md — Painter Plus Website (Agent Knowledge Base)

This file gives AI agents and contributors the essential context needed to work on this repository safely and correctly. Humans should read `README.md` and `docs/NEXT_STEPS.md` first.

## Project summary

A fully static marketing website for "Painter Plus", a painting-services business in Jharkhand, India. Plain HTML + CSS + vanilla JS. No build step, no backend, no package manager. Deploys to GitHub Pages via a GitHub Actions workflow.

## Critical known issues (as of last update)

1. **Unresolved merge conflicts everywhere.** Almost every file still contains conflict markers (`<<<<<<< HEAD` / `=======` / `>>>>>>>...`). The site is currently broken and undeployable. The FIRST task for any agent is to resolve these. See `docs/NEXT_STEPS.md` for the exact file list and recovery procedure.

2. **`js/script.js` has a syntax error.** There is a stray closing `}` brace between the FAQ-toggle block and the service-worker registration block, which breaks the entire `DOMContentLoaded` handler. It must be removed.

3. **Two URL-path conventions coexist.**
   - HEAD version: absolute, project-prefixed — `/painter-plus-website/about.html`
   - Incoming version: relative — `./about.html`
   **Decision (confirmed by owner): use the HEAD convention** — absolute, project-prefixed `/painter-plus-website/...` paths, matching the final live domain `https://gahonsh-blip.github.io/painter-plus-website/`. Prefer the HEAD version of each file when resolving conflicts.

4. **Two GitHub accounts referenced.** HEAD uses `gahonsh-blip`, incoming uses `gahonsh`. **Decision (confirmed by owner): the final account is `gahonsh-blip`**, live at `https://gahonsh-blip.github.io/painter-plus-website/`. Use the HEAD path convention (absolute, project-prefixed `/painter-plus-website/...`) and make all references consistent (canonical URLs, sitemap, robots.txt, manifest, service worker cache paths, OG image URLs). Prefer the HEAD version of each file when resolving conflicts.

5. **Missing PWA icons.** HEAD `manifest.json` references `images/icon-192.png` and `images/icon-512.png` that do not exist. Only `images/og-image.svg` exists. Either generate/add the icons or remove the icon entries.

6. **Broken emoji / encoding in source.** Several HTML files contain garbled emoji (rendered as `??`) due to the merge. Fix emoji where they appear in visible content (logo, phone/email labels, footer).

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
| Styles | `css/style.css` |
| Scripts | `js/script.js` |
| PWA | `manifest.json`, `sw.js` |
| SEO | `robots.txt`, `sitemap.xml`, per-page `<meta>` + JSON-LD on homepage |
| Security headers | `_headers` |
| Deploy | `.github/workflows/static.yml` |

## Working rules for agents

- Read `docs/NEXT_STEPS.md` and resolve merge conflicts BEFORE any new work.
- Never leave conflict markers in committed files.
- Keep paths using the HEAD convention (absolute, project-prefixed `/painter-plus-website/...`) for internal links and assets; canonical/OG/sitemap URLs point at `https://gahonsh-blip.github.io/painter-plus-website/`. Prefer the HEAD version of each conflicted file.
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
