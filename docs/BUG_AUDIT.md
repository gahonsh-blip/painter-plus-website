# Bug Audit — Painter Plus Website

Full-site scan of every page, stylesheet, script and PWA asset. Each entry lists
the symptom, the root cause, the fix, and how the fix was verified.

Date of audit: 2026-10-16
Scope: all 12 HTML pages, 5 JS files, `css/style.css`, `manifest.json`, `sw.js`,
`robots.txt`, `sitemap.xml`.

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | Critical | `js/color-studio.js` crash on the homepage | Fixed |
| 2 | Medium | 7 pages had no `<h1>` | Fixed |
| 3 | Medium | `--shadow-sm` never defined (broken dark mode) | Fixed |
| 4 | Low | `apple-touch-icon` missing on every page | Fixed |
| 5 | Low | `admin.html` missing Open Graph / Twitter meta | Fixed |
| 6 | Low | `offline.html` had no real document head | Fixed |
| 7 | Low | Un-typed `<button>` elements | Fixed |
| 8 | Low | Duplicated heading in `docs/NEXT_STEPS.md` | Fixed |
| 9 | Low | Service-worker cache never invalidated | Fixed |

---

## 1. Critical — `color-studio.js` crashed on the homepage

**Symptom.** The hero "painter at work" animation on `index.html` never played.
It stayed frozen on the first frame for every visitor.

**Root cause.** `index.html` loads `js/color-studio.js` (for the painter scene in
its second IIFE) but does **not** contain any of the Color Studio widget markup
(`#stage`, `#palette`, `#surfaceTabs`, `#presetTabs`, `#finishNote`, `#harmony`,
`#coverage`, …). Those widgets live only on `color-studio.html`.

`init()` ran unconditionally and called `buildPalette()`, which did
`paletteEl.appendChild(...)` on a `null` element. That threw a `TypeError`.

Because the studio code and the painter-scene code share **one file**, the throw
aborted the whole script before the painter IIFE could run. So one missing
element on the wrong page killed an unrelated feature.

**Fix.**
- Added an early return at the top of `init()` that bails out unless every studio
  widget it needs is present.
- Added a matching guard in `playScene()` so the hero scene exits cleanly when
  its markup is absent (e.g. if the script is ever loaded elsewhere).

**Verification.** Executed the real file against a DOM built from `index.html`'s
actual element ids:

- Before: `TypeError: Cannot read properties of null (reading 'appendChild')`,
  0 timers scheduled → scene dead.
- After: 11 timers scheduled, caption advances from
  `"Our painter arrives with his brush and paint…"` to
  `"Watch our painter transform a home…"` → scene alive.

---

## 2. Medium — seven pages had no `<h1>`

**Symptom.** `about.html`, `services.html`, `portfolio.html`, `contact.html`,
`privacy.html`, `terms.html` and `admin.html` used
`<h2 class="section-title">` as their top-level heading and contained no `<h1>`.
This hurts SEO and screen-reader navigation (a page must have exactly one `<h1>`).

**Root cause.** The heading level was chosen for visual size, but the styling is
driven by the `.section-title` **class**, not the tag.

**Fix.** Promoted each page's top heading from `<h2 class="section-title">` to
`<h1 class="section-title">`. The remaining section headings stay `<h2>`/`<h3>`,
so the outline is now correct.

**Verification.** Every page now reports exactly one `<h1>`. Because the CSS is
class-based (no bare `h1`/`h2` rule exists except `.hero h1`), rendering is
unchanged.

---

## 3. Medium — `--shadow-sm` used but never defined

**Symptom.** The `.stat` cards fell back to a hard-coded light-mode shadow, so in
dark mode they kept a shadow designed for a white background.

**Root cause.** `css/style.css` referenced `var(--shadow-sm, 0 6px 18px rgba(0,0,0,.06))`
but never declared `--shadow-sm` in either the light or dark theme block.

**Fix.** Defined `--shadow-sm` in both theme blocks with values that suit each
theme, and dropped the now-redundant inline fallback.

**Verification.** The CSS audit now reports no undefined custom properties other
than `--pf-img` (see note below). Brace count stays balanced (585/585).

---

## 4. Low — `apple-touch-icon` missing on every page

**Symptom.** When the site was added to an iOS home screen, iOS fell back to a
screenshot instead of the app icon.

**Root cause.** No page declared `rel="apple-touch-icon"`, even though
`images/icon-192.png` exists and is a valid 192×192 PNG.

**Fix.** Added
`<link rel="apple-touch-icon" href="./images/icon-192.png" />` to all 12 pages,
placed next to the manifest link.

**Verification.** Meta audit reports the tag present on every page.

---

## 5. Low — `admin.html` missing Open Graph / Twitter meta

**Symptom.** Sharing the admin URL produced a bare, unbranded link preview.

**Root cause.** `admin.html` had `title`/`description`/`canonical` but none of the
`og:*` or `twitter:card` tags that every other page has.

**Fix.** Added `og:title`, `og:description`, `og:type`, `og:url`, `og:image` and
`twitter:card`, matching the pattern used site-wide. `noindex, nofollow` is kept.

**Verification.** Meta audit reports `admin.html` complete.

---

## 6. Low — `offline.html` had no real document head

**Symptom.** The offline fallback page had no `lang` attribute, no `theme-color`,
no description, no favicon, and used an inline `<style>` that bypassed the shared
theme (so it ignored dark mode and the site's design tokens).

**Root cause.** The file was a minimal stub that was never brought up to the
standard of the other pages.

**Fix.** Rebuilt the head with `lang`, viewport, title, description,
`theme-color`, `noindex`, favicon and a link to `./css/style.css`, then styled the
card with the site's own classes and custom properties.

**Verification.** Page returns 200, has exactly one `<h1>`, and inherits the theme.

---

## 7. Low — un-typed `<button>` elements

**Symptom.** Interactive buttons relied on the default `type="submit"`. Any button
that ever ends up inside a `<form>` would submit the form and reload the page.

**Root cause.** `type="button"` was omitted.

**Fix.** Added `type="button"` to every `<button>` that lacked a type, across all
pages. Verified no element ended up with a duplicate `type` attribute.

**Verification.** A scan of all pages reports zero un-typed buttons and no
duplicated `type` attributes.

---

## 8. Low — duplicated heading in `docs/NEXT_STEPS.md`

**Symptom.** Line 81 read
`## 4. Key decisions (resolved)## 4. Key decisions to make (ask the owner)` —
two headings fused into one line.

**Root cause.** A leftover artifact from the earlier merge-conflict recovery.

**Fix.** Collapsed it to the single, correct heading
`## 4. Key decisions (resolved)`.

---

## 9. Low — service-worker cache never invalidated

**Symptom.** Returning visitors could keep serving the pre-fix files from cache,
so the bug fixes would not reach them.

**Root cause.** `CACHE_NAME` was still `painter-plus-v9`; the install handler only
deletes caches whose name differs from the current one, so an unchanged name keeps
the stale cache alive.

**Fix.** Bumped `CACHE_NAME` to `painter-plus-v10`. The activate handler now drops
`v9` on the next visit.

---

## Investigated and confirmed NOT bugs

- **`#texture` anchor** — the link target exists in `services.html`; the audit's
  naive matcher simply missed it.
- **`--pf-img`** — set inline by JavaScript per portfolio card, so it is
  legitimately absent from the stylesheet.
- **`target="_blank"` links** — every one already carries `rel="noreferrer"`.
- **`js/script.js` null-ID references** — each admin/team lookup is guarded before
  use; the runtime probe confirms no page throws.
- **Garbled emoji / encoding** — every file is valid UTF-8 and no `??` placeholders
  remain.
- **Missing PWA icons** — `images/icon-192.png`, `icon-512.png` and
  `icon-maskable-512.png` all exist and are valid PNGs of the right size.
- **Pages deploy failure** — caused by a GitHub billing lock on the account, not
  by site code. Nothing in this repository can fix it.

## How the fixes were verified

1. `node --check` on every JS file — all parse.
2. A runtime probe that runs each page's real script bundle against a DOM built
   from that page's own element ids — 11/11 pages clean.
3. A scene probe proving the homepage painter animation schedules and advances.
4. Meta, heading, structure, JSON-LD and CSS custom-property audits.
5. Every page and every referenced asset requested over HTTP — all return 200.
