# Bug Audit — Painter Plus Website

Full-site scan of every page, stylesheet, script and PWA asset. Each entry lists
the symptom, the root cause, the fix, and how the fix was verified.

Date of audit: 2026-10-16 (third pass 2026-10-18)
Scope: all 14 HTML pages, 10 JS files, `css/style.css`, `manifest.json`, `sw.js`,
`robots.txt`, `sitemap.xml`, `_headers`.

Three passes. The first fixed 9 bugs; the second targeted bug *types* the first
did not (storage failures, CSP, data consistency, HTML validity, links, a11y) and
found 5 more — including a second instance of the same "one unguarded call kills
the whole file" failure shape. The third pass reviewed the ERP/work-log data flow
and found 4 more, the worst being an approval that outlived the work it signed off.

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
| 10 | **High** | Blocked storage aborts the whole `script.js` handler | Fixed |
| 11 | Medium | CSP would block the contact form's POST to Formspree | Fixed |
| 12 | Low | `color-studio.html` meta description too long | Fixed |
| 13 | Low | `painter-profile.html` missing from the sitemap | Fixed |
| 14 | Low | Honeypot input not hidden from assistive tech | Fixed |
| 15 | **High** | Photo URL could break out of an HTML attribute (injection) | Fixed |
| 16 | Low | Empty day appeared in the work-log history as a phantom 0 sq ft day | Fixed |
| 17 | **High** | An approved day could be edited and still billed at the new amount | Fixed |
| 18 | Medium | Two invoices raised together shared an id — deleting one deleted both | Fixed |
| 19 | Low | A deleted invoice number was reused by the next invoice | Fixed |
| 20 | Low | Rejected work counted as "awaiting approval" on the dashboard | Fixed |
| 21 | **High** | A blank project rate silently zeroed the day's labour (₹1,200 → ₹0) | Fixed |
| 22 | Medium | The ERP and the work log could quote different paint quantities | Fixed |

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

---

## 10. High — blocked storage aborts the entire `script.js` handler

**Symptom.** On a browser where `localStorage` throws — Safari/Firefox private
mode, "block all cookies", or a hardened profile — the whole site went dead:
theme toggle, mobile menu, scroll progress bar, reveal animations, FAQ accordion
and service-worker registration all stopped. The page rendered but did nothing.

**Root cause.** The very first statement inside `DOMContentLoaded` read
`localStorage.getItem('theme')` with no guard. `localStorage` throws
`SecurityError` when storage is unavailable, and because the call sits at the top
of the handler, the throw aborted **everything below it** — the same
failure shape as bug 1: one unguarded access killing unrelated features.

**Fix.** Added a small `store` helper (`get`/`set`/`del`) that wraps every storage
call in `try/catch`, and routed all `localStorage` reads/writes in `script.js`
through it. Also wrapped the `matchMedia` call, which can be absent on old
browsers.

**Verification.** A probe runs `js/script.js` against a DOM and fires
`DOMContentLoaded` twice — once with working storage, once with storage that
throws:

- Before: `storage BLOCKED -> THREW: SecurityError: storage blocked`.
- After: `storage BLOCKED -> handler completed`.

In the browser, the theme toggle still flips light↔dark and persists to
`localStorage` under the key `theme`.

---

## 11. Medium — CSP would block the contact form

**Symptom.** `contact.html` posts to `https://formspree.io/f/xeebvvko`. The
Content-Security-Policy in `_headers` had no `form-action` directive, so form
submissions fell back to `default-src 'self'` and the POST to Formspree would be
**blocked**. Contact messages would silently fail.

**Root cause.** The CSP was written for a fully self-contained site and never
accounted for the one external endpoint the site actually uses.

**Fix.** Added `form-action 'self' https://formspree.io` and
`connect-src ... https://formspree.io`, plus `base-uri 'self'` and
`frame-ancestors 'none'` for defence in depth.

**Note.** GitHub Pages does not serve `_headers` (that is a Netlify/Cloudflare
feature). The file is kept for platforms that do honour it and as documentation
of intent. The fix matters the moment the site is hosted somewhere that reads it
— and the current CSP, if ever honoured as written, would have broken the form.

---

## 12. Low — `color-studio.html` meta description too long

**Symptom.** The description was 251 characters. Search engines truncate around
160, so the tail was cut mid-sentence in results.

**Fix.** Rewrote it to 137 characters, keeping the key terms (live colour
preview, wall/accent colours, finishes, lighting, free quote).

---

## 13. Low — `painter-profile.html` missing from the sitemap

**Symptom.** The per-member profile page was reachable and linked from the roster
but absent from `sitemap.xml`, so it was not submitted for indexing.

**Fix.** Added its `<loc>` entry. `admin.html` and `offline.html` stay out on
purpose — they are `noindex` utility pages.

---

## 14. Low — honeypot input not hidden from assistive tech

**Symptom.** The Formspree spam honeypot (`name="_gotcha"`) is hidden with
`display:none`, but a screen reader could still announce it in some browsing
modes.

**Fix.** Added `aria-hidden="true"`. It is already `tabindex="-1"`, so it stays
unreachable by keyboard.

---

## 15. High — photo URL could break out of an HTML attribute (injection)

**Symptom.** The work log renders each entry's photo as
`<img src="…" alt="…">`. The shared `esc()` helper escapes `&`, `<` and `>` but
**not** the quote characters — correct for text nodes, unsafe inside a quoted
attribute. A photo URL such as
`x" onerror="window.__pwned=1` closed the `src` attribute early and injected a
live `onerror` handler onto the element. A URL typed into the work log (or a
member's photo URL on the team/admin pages) could therefore run script when the
entry was rendered.

**Fix.** Added a dedicated `escAttr()` in `js/worklog.js` that also escapes `"`
and `'`, and used it for every attribute-context value (photo `src`, `alt`,
`data-id`, option `value`). The same quote-escaping was added to the shared
`esc()` in `js/team.js` and `js/script.js`, so the team, profile, admin and
portfolio lists are covered too. The fix is verified in both directions: the
injected `onerror` attribute no longer appears, and the raw URL still round-trips
unchanged through `src`.

---

## 16. Low — empty day showed up in the work-log history

**Symptom.** Typing a project name and then clearing it on a date with no photo
entries still wrote a day record. It then appeared in *Logged days* as a phantom
`0 sq ft` day with no photos.

**Fix.** `persistDayMeta()` in `js/worklog.js` now skips the write when the day
has no entries and no project/crew, and removes the stored day if such a shell
already exists. A real day (with entries) is never dropped. Added `hasDay()` and
`removeDay()` to the `PPWorkLog` API to support this.

---

## 17. High — an approved day could be edited and still billed

**Symptom.** The ERP deliberately bills **approved work only**. But a day was
approved *as a snapshot*: the sign-off was stored as a plain
`{status, by, at}` with no record of *what* it covered. Reopening the day in the
work log, adding or changing measurements, and submitting again left the old
approval in place — so the bill silently counted the **new** figures under the
**old** sign-off.

```
approved 80 sq ft  ->  bill ₹960
reopen, add 120 sq ft, resubmit
                        bill ₹2,400   <-- never re-approved
```

Worse, `reopenDay()` did not touch the approval at all, so the day could sit
"approved" while openly being edited.

**Fix (two layers).**
1. `js/erp.js` — an approval now stores a **signature** of the day it signed
   (`daySignature()`: total sq ft, entry count, ids, per-entry sq ft, rate,
   coverage, coats, project). `approvalOf()` compares the stored signature with
   the day's current one and reports `pending` (with `stale: true`) when they
   differ. An edited-after-approval day therefore reverts to *pending* on its
   own and cannot reach a bill until it is reviewed again.
2. `js/worklog.js` — `reopenDay()` calls the new `PPERP.clearApproval(date)`, so
   reopening a day also deletes the stored decision instead of leaving it to
   rot. Approvals written before signatures existed have no `sig` and are
   honoured as-is, so old data keeps working.

---

## 18. Medium — deleting one invoice deleted two

**Symptom.** `addBill()` built the invoice id as `'b' + Date.now().toString(36)`
— **millisecond** precision and nothing else. Two invoices raised in the same
millisecond (double-clicking *Record this bill*, or a scripted raise) shared an
id. `removeBill()` filters by id, so deleting one deleted **both**.

**Fix.** The id now appends `Math.random().toString(36).slice(2, 6)`, the same
collision-proofing `worklog.js` already used for entry ids.

---

## 19. Low — a deleted invoice number was reused

**Symptom.** The invoice number came from the list length:
`'PP-' + (list.length + 1)`. Delete `PP-001` and the next invoice was numbered
`PP-002` again — two live invoices sharing a number.

**Fix.** `nextBillNo()` now scans the existing invoices and returns one past the
**highest** `PP-nnn` ever used, so a number is never handed out twice.

---

## 20. Low — rejected work was counted as "awaiting approval"

**Symptom.** The dashboard's *Awaiting approval* KPI is
`labour − approvedLabour`. A **rejected** day is neither approved nor waiting,
but it was not subtracted, so rejected money was advertised as pending money —
and its day count landed in "day(s) submitted".

**Fix.** `overview()` now reports `rejectedSqft` / `rejectedLabour` separately
and excludes them from `unbilledLabour`; the dashboard renders a distinct red
*Rejected* KPI (new `.erp-kpi-bad` style) only when there is rejected work.

---

## 21. High — a blank project rate silently zeroed the day's labour

**Symptom.** `dayCosting()` read `project ? num(project.rate) : num(day.rate)`.
A project whose *Labour rate* was left blank normalises to `rate: 0`, and `0`
is a real value — so the ternary picked the project's `0` and **discarded the
rate the crew had entered on the day**. A day worth 80 sq ft × ₹15 = ₹1,200
billed as **₹0**, with no warning, the moment it was linked to a project that
had no rate yet. (Reproduced in Node: `bill labour = 0`, expected 1200.)

**Fix.** `dayCosting()` now uses `(project && num(project.rate)) || num(day && day.rate)`,
so a project rate of `0` means *"not set yet"* and falls back to the day's own
rate. The same fallback already protected `coverage` and `coats`; the rate was
the one figure that was not protected.

---

## 22. Medium — the ERP and the work log quoted different paint quantities

**Symptom.** The work log computes litres through `PPMeasure.paintLitres()`
(the single source of the coverage/wastage maths), but the ERP's `dayCosting()`
hardcoded its own `(sqft × coats / coverage) × 1.1`. The two happened to agree
*only while the wastage factor stayed 0.1*; any change to the shared default
would make the same day show one figure in the work log and another in the
bill. It was a latent divergence, not yet a visible wrong number.

**Fix.** The ERP now delegates to `PPMeasure.paintLitres()` when it is present
and falls back to the identical formula in Node, so the two can never disagree.
A regression test loads `erp.js` in a browser-like VM with `window.PPMeasure`
present and asserts the ERP's litres equal the measure module's.

---

## Second-pass audit — categories checked and clean

The follow-up pass covered bug *types* the first pass did not:

| Category | Result |
|----------|--------|
| Duplicate `id` within a page | clean |
| Broken internal `href` (file targets) | all resolve |
| Broken anchor links (`#id`) | all resolve |
| XSS — dynamic `innerHTML` without `esc()` | clean (one static SVG literal, false positive) |
| Accessibility — `<img>` alt, `aria-hidden` conflicts, unlabelled inputs | fixed the honeypot; rest clean |
| Data consistency — phone, email, account name | consistent (the "variants" reported were the canonical number with/without `+91`) |
| Forms — action/method | contact form OK; admin forms are JS-only and `preventDefault()` |
| Meta/SEO — title & description length, duplicates | fixed the one long description |
| Sitemap coverage | fixed the missing profile page |
| Manifest ↔ real files | all 3 icons exist |
| Service-worker asset list | all 24 cached files exist |
| HTML tag balance | balanced on all pages |
| Duplicate/nested meta tags | clean |
| `<html lang>`, charset, viewport | present on every page |
| `target="_blank"` without `rel` | none |
| JSON-LD validity | valid `LocalBusiness` |
| Local asset references | all resolve |
| External origins vs CSP | fixed the form-action gap |


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
   from that page's own element ids, then fires `DOMContentLoaded` — **12/12 pages
   clean** (up from 11/12; `offline.html` is now covered too).
3. A scene probe proving the homepage painter animation schedules and advances.
4. A storage probe running `script.js` with `localStorage` that throws — the
   handler now completes instead of aborting.
5. A functional test of the `PPTeam` role API — 14/14 pass (defaults, promote,
   demote, last-lead guard, lock).
6. A studio probe proving `color-studio.html` still builds all 18 swatches and 6
   surface tabs (the bug-1 guard does not trip there).
7. Meta, heading, structure, JSON-LD, CSS custom-property, link, anchor,
   duplicate-id, HTML-balance, manifest, sitemap and CSP audits.
8. Every page and every referenced asset requested over HTTP — all return 200.
9. Browser check: theme toggle flips light↔dark and persists to `localStorage`.
10. Work-log functional test — 17/17 pass (unlock, live square feet, per-entry
    square feet, running day total, delete/re-add, breakdown, submit locks the
    day, reopen, summary).
11. Work-log bug probes — the attribute-injection payload no longer injects an
    `onerror`, and browsing dates / clearing a project leaves no phantom day.
12. Site-wide re-run after the `esc()` hardening — 13/13 pages clean and no page
    double-escapes visible text.

### Third pass (2026-10-18)

13. `node tests/erp.test.js` — **54/54 pass**, including six regression tests
    covering bugs 17–20 (edit-after-approval withdraws the sign-off, re-approval
    bills the new amount, distinct invoice ids, no reused invoice number, a
    rejected day is not pending) and seven covering bugs 21–22 and the paint
    quantity / material cost feature (a blank project rate keeps the day rate,
    a paint rate adds a material cost, no paint rate means labour only, the ERP
    matches `PPMeasure`, the invoice shows the paint line and grand total, the
    painter report carries litres, a paint-rate change withdraws a stale
    approval).
14. `node tests/measure.test.js` 16/16, `node tests/photo-studio.test.js` 50/50 —
    unchanged by the ERP fixes.
15. Real-browser run of `tests/run-wl-erp-selftest.sh` — **16/16 checks pass**,
    including *reopen withdraws the ERP approval* and *an edited day is not
    billed on the old approval*.
16. Real-browser run of `tests/run-erp-selftest.sh` — **32/32 checks pass**;
    the dashboard still shows the correct billable / pending split, now with a
    separate Rejected KPI and a Paint KPI, and the bill shows the paint quantity,
    material cost and grand total.
17. A page-load probe of all 14 pages — every page loads with no JS errors and
    no missing element ids.
18. `node --check` on every JS file — all parse.
