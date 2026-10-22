# Bug Audit — Painter Plus Website

Full-site scan of every page, stylesheet, script and PWA asset. Each entry lists
the symptom, the root cause, the fix, and how the fix was verified.

Date of audit: 2026-10-16 (third pass 2026-10-18, fourth pass 2026-10-18, sixth pass 2026-10-18)
Scope: all 15 HTML pages, 12 JS files, `css/style.css`, `manifest.json`, `sw.js`,
`robots.txt`, `sitemap.xml`, `_headers`.

Six passes. The first fixed 9 bugs; the second targeted bug *types* the first
did not (storage failures, CSP, data consistency, HTML validity, links, a11y) and
found 5 more — including a second instance of the same "one unguarded call kills
the whole file" failure shape. The third pass reviewed the ERP/work-log data flow
and found 4 more, the worst being an approval that outlived the work it signed off.
The fourth pass hardened the ERP costing model (a project-rate change must
withdraw an approval), closed an injection hole in the portfolio merge, made a
failed storage write report itself instead of claiming success, and added a
headless runner so every browser self-test can be re-run automatically. The sixth
pass reviewed the ERP billing/reporting path and the Color Studio picker and found
9 more — the crew **id** leaking into every report (and splitting one person into
two rows), "awaiting approval" money that included days still being edited, an
invoice that quoted ₹0 next to a real total, one day billed under two projects,
and a colour swatch that never highlighted.

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
| 23 | Low | Bug 7's `<button type>` fix missed JS-generated buttons | Fixed |
| 24 | Low | Profile self-test failed on a shared tab (test-isolation, not a site bug) | Fixed |
| 25 | **High** | A project rate change silently re-billed an already-approved day | Fixed |
| 26 | **High** | Admin project fields could inject markup/handlers into the portfolio | Fixed |
| 27 | Medium | A failed localStorage write reported `ok:true` ("ok:true is a LIE") | Fixed |
| 28 | Low | No headless way to run the browser self-tests | Fixed |
| 29 | **High** | Reports printed the crew **id** and split one person into two rows | Fixed |
| 30 | **High** | "Awaiting approval" counted days that were never submitted | Fixed |
| 31 | Medium | Invoice printed "Labour rate: ₹0" next to a real total | Fixed |
| 32 | Medium | A day was billed under two projects at once | Fixed |
| 33 | Medium | Color Studio never highlighted the active swatch | Fixed |
| 34 | Low | Two same-name projects in the same millisecond collided | Fixed |
| 35 | Low | `billTotal()` dropped the paint cost | Fixed |
| 36 | Low | A decorative social image was on the critical PWA-install path | Fixed |
| 37 | Low | The work-log copyable summary printed the crew id | Fixed |

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

## 23. Low — bug 7's `<button type>` fix missed JS-generated buttons

**Symptom.** Bug 7 added `type="button"` to every button in the static HTML, but
the buttons the scripts *build* were overlooked: the admin roster's Edit/Delete
buttons (`js/script.js`), and the ERP page's project Edit/Delete, Approve/Reject,
Undo and invoice Delete buttons (`js/erp-page.js`). They relied on the default
`type="submit"`.

**Root cause.** The bug-7 scan only walked the `.html` files; the buttons are
interpolated from JS template strings, so they never appeared in that scan.

**Fix.** Added `type="button"` to all ten JS-generated buttons (4 in
`js/script.js`, 6 in `js/erp-page.js`). The other `createElement('button')`
call sites (`js/color-studio.js`, `js/worklog.js`) already set `.type`.

**Verification.** A browser probe loads `admin.html` signed in, seeds a roster
and counts every `<button>` in the rendered document: **21 buttons, 0 untyped**
(before the fix the roster's four per-row buttons were untyped). The ERP and
work-log browser self-tests still pass (32/32 and all checks).

---

## 24. Low — profile self-test failed on a shared tab (test-isolation)

**Symptom.** `tests/run-profile-selftest.sh` reported
`FAIL an unclaimed visitor sees a "This is me" button` when its page was opened
in a tab where the ERP self-test had already run.

**Root cause.** Not a site bug — a test-isolation bug. The ERP self-test signs
in as Owner/Head, which sets the `ppAdminUnlocked` session flag. On the same
tab the profile page then read `PPTeam.isManager()` as true and, correctly,
rendered the Owner/Head editor instead of the "This is me" button. The profile
harness cleared `ppClaimedMember` but not the head-session flag.

**Fix.** The profile harness now also clears `ppAdminUnlocked` before seeding,
so it always starts as an unclaimed visitor regardless of what ran before in
the tab. Re-running it in the same (previously contaminated) tab now reports
**RESULT: ALL OK**.

---

## 25. High — a project rate change silently re-billed an already-approved day

**Symptom.** Approve a day, then raise the linked **project's** labour rate. The
day stayed `approved` and the bill immediately re-costed at the *new* rate, with
no fresh approval. Reproduced against the real module: *"after approve bill
labour 1200 → after project rate change to 50, bill labour 5000, approval still
'approved'"*.

**Root cause.** An approval carries a `sig` fingerprint of the day's cost
(bug 17), compared at read time so an edited day reverts to pending. But
`daySignature()` only fingerprinted the **day's own** rates. When the ERP costs
a day it uses the **project's** rate when set (else the day's own), so changing
the project rate changed the money while leaving the fingerprint — and therefore
the approval — intact.

**Fix.** Added `effectiveRates(day, project)` — the single source of truth for
"which rate applies" (project rate if set, else the day's) — and used it in both
`dayCosting()` and `daySignature()`. The signature now covers the *effective*
rate, coverage, coats and paint rate, plus the linked project id, so any change
to the project's costing withdraws the sign-off. `setApproval` computes the
signature with the project in hand.

**Verification.** Four new node regressions: changing the project rate (or paint
rate) flips an approved day back to `pending` and drops it from the bill, and
re-approving bills the new rate. The ERP browser self-test now asserts the same
in a real page (`a project paint-rate change withdraws the approval (bug 25)`).

---

## 26. High — admin project fields could inject markup into the portfolio

**Symptom.** `admin.html` stores projects in `localStorage`; `portfolio.html`
merges them into the grid on load. A photo URL like `x" onerror="…` broke out of
the `<img src="…">` attribute and ran a live handler. Free-text fields
(`challenge` / `solution` / `result`) were interpolated as raw HTML, and the
hover image was written straight into a `style="--pf-img:url('…')"` attribute, so
a quote could escape the `url()`.

**Root cause.** The merge in `js/script.js` escaped only the title and tag with
`esc()` and left `src`, the description fields and the CSS `url()` unescaped.
`esc()` (shared, line 546) does escape quotes, but it was not applied to every
value, and a CSS custom property must not be built by string-concatenating an
untrusted URL into an attribute at all.

**Fix.** Every field in the card now goes through `esc()` — including `src`,
the `challenge`/`solution`/`result` text and the meta line. The `--pf-img` value
is set through the CSSOM (`media.style.setProperty('--pf-img', 'url("…")')`)
with quotes, parens, backslashes and newlines stripped from the URL, so it can
never close the `url()` early.

**Verification.** New `tests/portfolio-selftest.js` (+ `run-portfolio-selftest.sh`)
seeds a hostile project *before* `script.js` runs and drives the real page:
12/12 checks pass — the payload does not execute, no element or handler is
injected, the typed `<img>` shows as text, and the `--pf-img` token has exactly
its two wrapping quotes with an inert inner value. Reverting the fix makes the
same test report 9 FAILs, proving it catches the bug.

---

## 27. Medium — a failed save reported success ("ok:true is a LIE")

**Symptom.** When the localStorage write failed (quota full, or storage
blocked), the module still returned `{ ok: true }`. The UI showed "saved" while
nothing was stored. Reproduced: *"ok:true is a LIE: nothing was written;
projects after save: 0"*.

**Root cause.** `write()` / `writeAll()` / `writeRaw()` already swallowed the
exception (correct — a blocked store must not crash), but the mutators ignored
the boolean they returned and reported success unconditionally.

**Fix.** The storage helpers now **return** whether the write reached storage,
and every mutator that performs a real save returns
`{ ok: false, error: STORAGE_ERROR }` when it did not: `saveProject`,
`removeProject`, `setApproval`, `clearApproval`, `addBill`, `removeBill`
(`js/erp.js`); `addEntry`, `removeEntry`, `submitDay`, `reopenDay`, `removeDay`,
`saveDay` (`js/worklog.js`); `save`, `remove` (`js/team.js`); `add`, `remove`,
`clear` (`js/gallery.js`). The page scripts surface the error
(`alert` / `flashEditor` / `hint`), and the ERP "Undo" button now calls
`clearApproval()` instead of writing storage by hand.

**Verification.** New node regressions assert `ok:false` with a storage message
when the store throws, and the previous "blocked store" tests (which asserted
the old `ok:true` behaviour) were corrected. All node suites green
(`erp` 58, `gallery` 24, `measure` 16, `photo-studio` 50).

---

## 28. Low — no headless way to run the browser self-tests

**Symptom.** Every browser self-test (`run-wl-selftest.sh`, `run-erp-selftest.sh`,
the sweep, …) only printed a URL for a human to open. CI and an agent had no way
to run them, so "verified in a browser" could not be reproduced automatically.

**Fix.** Added `tests/run-all-headless.sh`: it builds every throwaway page the
same way the interactive runners do, serves the repo root once, drives headless
Chromium (`--dump-dom`), extracts each `ok` / `FAIL` block and exits non-zero if
any page fails. Added `tests/portfolio-selftest.js` and
`tests/run-portfolio-selftest.sh` for bug 26.

**Verification.** `bash tests/run-all-headless.sh` →
**ALL BROWSER CHECKS PASSED** (work log, ERP, work-log→ERP, team, gallery,
profile, paint-my-photo, portfolio injection, full-site sweep 15/15 clean).

---

## Sixth pass (2026-10-18) — ERP data-consistency and reporting

A focused review of the ERP billing/reporting path and the Color Studio colour
picker. Nine bugs, all reproduced against the real modules or a real headless
page before being fixed. The two most consequential are the crew **id** shown in
reports (bug 29) and "awaiting approval" money that included days still being
edited (bug 30).

## 29. High — reports printed the crew's member **id**, and split one person in two

**Symptom.** The Painter report and the Daily report showed `ramesh-kumar`
instead of `Ramesh Kumar`. Reproduced in a real headless `erp.html`:
*"Painter report crew column: ramesh-kumar days=2 sqft=140"*. A day that stored
a legacy typed name (`"Ramesh Kumar"`) and one that stored the modern id
(`"ramesh-kumar"`) for the **same person** appeared as two separate rows
(`[{crew:"ramesh-kumar",days:1},{crew:"Ramesh Kumar",days:1}]`).

**Root cause.** `js/worklog.js` stores `crew` as the team member's **id** (the
`#wlCrew` option value), but `reportByPainter` / `reportDaily` / `bucketDays`
printed the raw stored value and never resolved it through `PPTeam`.

**Fix.** Added `crewIdentity(value)` / `crewName(value)` to `js/erp.js`: resolve
by id first, then by exact name, through `window.PPTeam` when it is loaded, and
group the painter report by that identity. All report and invoice call sites
(`reportByPainter`, `reportDaily`, `bucketDays`, `invoiceText`), the ERP
Approvals row and the work-log copyable summary now show the name. Falls back to
the raw value if the roster is unavailable, so nothing disappears.

**Verification.** New node regression loads `erp.js` in a `vm` with a stub
`PPTeam` and proves an id day and a name day collapse into **one** row named
`Ramesh Kumar`; the ERP browser self-test now asserts the report shows
`Gahonsh` and does **not** contain `gahonsh`.

## 30. High — "Awaiting approval" counted days that were never submitted

**Symptom.** With one submitted day (100 sq ft) and one **open** day (40 sq ft),
the dashboard advertised `₹1,680` of "awaiting approval" money while its own
subtitle read "1 day(s) submitted", and the bill callout said "2 day(s)
awaiting approval, 140 sq ft". The dashboard and the bill disagreed.

**Root cause.** `overview().unbilledLabour` was `labour − approved − rejected`,
so it swept in **open** days (still being edited). `bucketDays` pushed every
non-approved, non-rejected day into `pending`, mixing open and submitted work.

**Fix.** Split the buckets: only **submitted** days go to `pending`; open days
go to a new `open` bucket (exposed as `billFor().open` and
`overview().openDays/openSqft/openLabour`). `unbilledLabour` is now the sum of
the pending bucket, so it agrees with `pendingDays`. The ERP dashboard gained an
"Open (in progress)" KPI and the billing page an open-days callout.

**Verification.** New node regression asserts `unbilledLabour === 1400` (the two
submitted days only), `openLabour === 300`, and that the bill's `pending.count`
(1) and `open.count` (1) are separate. The ERP browser self-test now expects
"1 day(s) awaiting approval" + "1 day(s) still open".

## 31. Medium — the invoice printed "Labour rate: ₹0 per sq ft" next to a real total

**Symptom.** A project with an unset (₹0) rate but a day rate of ₹12 produced an
invoice reading *"Labour rate: ₹0 per sq ft"* / *"Labour total: ₹1,200"*, and the
coat count came from the project, not the day. Reproduced against the module.

**Root cause.** The costing correctly falls back to the day rate
(`effectiveRates`), but `invoiceText` printed `project.rate` and `project.coats`
unconditionally.

**Fix.** Added `billedRateInfo(project, rows)` to `js/erp.js` — the single
rate/coverage/coats the approved work was costed at, flagging `fromDay` and
`mixed` — and used it in `invoiceText` and the ERP billing summary (new
`rateLabel()` helper). An unset project rate now quotes the day rate with a
"(day rate)" note; genuinely mixed day rates say "per day (see lines)".

**Verification.** New node regression with a ₹0 project rate and a ₹12 day rate:
the invoice contains `Labour rate: ₹12` and "day rate", never `₹0`, and quotes
the day's `(3 coats)`.

## 32. Medium — a day was billed under **two** projects at once

**Symptom.** A day whose `projectId` pointed at Site A but whose free-text
`project` name equalled Site B's name matched **both**: *"day matches A? true /
day matches B? true"*, and each project's bill showed the same 100 sq ft / ₹1,200.

**Root cause.** `dayMatchesProject` returned `true` on an id match, then **fell
through** to the name match instead of stopping — so a name-twin also matched.

**Fix.** When a day carries a `projectId`, that id is now authoritative: the
function returns `day.projectId === project.id` and never falls through to a
name match. The legacy name path still applies to days with no id.

**Verification.** New node regression: a day with `projectId:'a'` and
`project:'Site B'` matches A (`true`) and **not** B (`false`); billing A shows
100 sq ft and billing B shows 0.

## 33. Medium — the Color Studio never highlighted the active swatch

**Symptom.** In a real headless `color-studio.html`, after restoring a saved
scheme whose surface colour was the palette red `#c0392b`, `customHex=#C0392B`
but `activeSwatches=0` — no swatch was highlighted.

**Root cause.** `hexToRgb` parsed only `#rrggbb`, but `markActiveSwatch` feeds it
the browser's computed `el.style.backgroundColor`, which is always
`"rgb(232, 227, 216)"`. The regex failed, so `hexToRgb` returned its hard-coded
fallback `[230,227,216]` → `#e6e3d8`, which can never equal a palette colour, so
`markActiveSwatch(null)` never matched anything.

**Fix.** `hexToRgb` now parses `rgb()` / `rgba()` as well as `#rgb` / `#rrggbb`.

**Verification.** The same headless probe now reports `activeSwatches=1`.

## 34. Low — two same-name projects saved in the same millisecond collided

**Symptom.** Saving `Test Site` twice within one millisecond produced the same
id (`test-site-mvf1bo7i`); the second `saveProject` overwrote the first, leaving
only one project.

**Root cause.** `slugId` is `name + '-' + Date.now().toString(36)` with no
uniqueness check.

**Fix.** Added `uniqueProjectId(name, projects)`: it loops until the id is not
already in use, appending a short random suffix if needed.

**Verification.** New node regression saves two `Twin Site` projects and asserts
distinct ids and that both survive.

## 35. Low — `billTotal()` dropped the paint cost

**Symptom.** `billTotal()` returned `totals.labour` only, ignoring the material
cost, while the module's rule is that a bill is labour **+** paint.

**Fix.** `billTotal()` now returns `totals.total`.

**Verification.** New node regression with a paint rate: `billTotal ===
totals.total` and `> totals.labour`.

## 36. Low — a decorative social image was on the critical PWA-install path

**Symptom.** `sw.js` precached with `cache.addAll(ASSETS)`, which is
all-or-nothing. `images/og-image.svg` (a social-sharing meta image, not part of
the app shell) was in the list, so if it were ever missing or renamed the whole
install would reject and the site would silently lose offline support.

**Root cause.** An all-or-nothing precache that included a non-essential asset.

**Fix.** Replaced `cache.addAll` with a per-asset `precache()` that swallows a
single failure (`cache.add(url).catch(() => null)`), and dropped the decorative
`og-image.svg` from the shell list. Bumped the cache name to `painter-plus-v24`.

**Verification.** `node --check sw.js`; the full-site sweep and the headless
runner still pass, and every remaining cached asset exists.

## 37. Low — the work-log copyable summary printed the crew id

**Symptom.** **Copy summary** on `worklog.html` wrote `Crew: gahonsh` (the id)
rather than the person's name.

**Fix.** `PPWorkLog.summary()` now resolves the crew through `PPTeam.get` and
prints the name, falling back to the stored value.

**Verification.** Covered by the work-log and work-log→ERP headless self-tests
(which drive the real page and assert on the rendered text).

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
- **Pages deploy failure** — caused by a GitHub **account billing lock**, not by
  site code. Verified 2026-10-19: the deploy job for the merge commit
  `1c92b32` failed in 3s with 0 steps, and GitHub's own annotation reads *"The job
  was not started because your account is locked due to a billing issue."* The
  live site is frozen at its 2026-08-15 build and `erp.html` / `gallery.html` 404
  live though they exist in the repo. The lock comes from a failed payment
  authorization hold, so it persists even on the Free plan with $0 usage; only the
  account owner (via Billing settings or GitHub Support) can clear it. Nothing in
  this repository can fix it. See `AGENTS.md` → *Deploy* for the full fix path.

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

### Fourth pass (2026-10-18)

19. `node tests/erp.test.js` 54/54, `gallery.test.js` 24/24, `measure.test.js`
    16/16, `photo-studio.test.js` 50/50 — all green.
20. Real-browser full-site runtime sweep (`tests/run-page-sweep.sh`) — **15/15
    pages load with zero uncaught JS errors** (about, admin, color-studio,
    contact, erp, gallery, index, offline, painter-profile, portfolio, privacy,
    services, team, terms, worklog).
21. Real-browser ERP self-test — **32/32 checks pass** (project CRUD, the
    approval rule, invoice numbering, the three reports, paint line + grand
    total).
22. Real-browser work-log self-test — all checks pass (scale calibration,
    draw-area, measured badge, labour + paint in the totals and the summary,
    submit locks / reopen, no phantom day).
23. Real-browser profile self-test — **RESULT: ALL OK** (derived record 8+ yrs /
    1 project / 120 sq ft / 1 co-worker, the claim flow, a profile save, a
    gallery add with sq-ft caption, the lightbox, removal). Verified to pass even
    on a tab previously used by the ERP self-test (bug 24 fix).
24. Real-browser gallery self-test — **RESULT: ALL OK** (cards, attribution to
    painter and project, both filters, newest-first, empty state).
25. Real-browser team self-test — **RESULT: ALL OK** (derived stats match
    `PPGallery.workRecord`; a member with no data shows no invented figures).
26. Real-browser paint-my-photo self-test — **30/30 checks pass** (demo scenes,
    repaint, gloss/stucco, corner selection, tap-to-fill, area readout, material
    table, the quote link carrying the area).
27. Button-type probe on the live `admin.html` — **21 buttons, 0 untyped**
    (bug 23 fix).
28. Service-worker cache bumped `painter-plus-v20` → `v21` so returning
    visitors get the corrected scripts.


### Fifth pass (2026-10-18)

29. `node tests/erp.test.js` — **58/58 pass**, including four new regressions for
    bug 25 (a project rate or paint-rate change withdraws an approved day; the
    withdrawn day is not billed; re-approving bills the new rate) and one for
    bug 27 (a failed write reports `ok:false`, not a false `ok:true`).
30. `node tests/gallery.test.js` **24/24**, `measure.test.js` **16/16**,
    `photo-studio.test.js` **50/50** — green after the storage-error change.
31. `node --check` on every JS file — all parse.
32. `bash tests/run-all-headless.sh` — **ALL BROWSER CHECKS PASSED**: work log,
    ERP (**34/34**, now including *a project paint-rate change withdraws the
    approval*), work-log→ERP, team, gallery, profile, paint-my-photo, portfolio
    injection (**12/12**) and the full-site sweep (**15/15 pages clean**).
33. The new portfolio injection test was run against the *pre-fix* `js/script.js`
    and reported **9 FAILs** (the payload executed, handlers and elements were
    injected, the `url()` token broke out) — proving the test catches bug 26, not
    just that the fixed code happens to pass.
34. Service-worker cache bumped `painter-plus-v21` → `v22` so returning visitors
    get the corrected scripts.

### Sixth pass (2026-10-18)

35. `node tests/erp.test.js` — **64/64 pass**. Seven existing tests were updated
    to the corrected bucket model (open days are no longer "pending"), and six
    new regressions were added for bugs 29–35: the crew id collapses to a name
    and merges the legacy form (loaded in a `vm` with a stub `PPTeam`), awaiting
    approval excludes open days, the invoice quotes the billed rate, a day with a
    `projectId` matches only that project, same-name projects get distinct ids,
    and `billTotal` includes paint.
36. `node tests/gallery.test.js` **24/24**, `measure.test.js` **16/16**,
    `photo-studio.test.js` **50/50** — green.
37. `node --check` on every JS file and `sw.js` — all parse.
38. `bash tests/run-all-headless.sh` — **ALL BROWSER CHECKS PASSED**: work log,
    ERP (now asserting *the report shows `Gahonsh`, not `gahonsh`* and *the open
    day is called out, not counted as pending*), work-log→ERP, team, gallery,
    profile, paint-my-photo (**30/30**), portfolio injection (**12/12**) and the
    full-site sweep (**15/15 pages clean**).
39. The Color Studio swatch fix was verified in real headless Chromium: the probe
    went from `activeSwatches=0` (pre-fix) to `activeSwatches=1` (post-fix) for a
    palette colour restored from storage.
40. The ERP fixes were verified in real headless Chromium: the KPI now reads
    *"Awaiting approval money = 1200, sub = 1 day(s) submitted"* with the bill
    callout agreeing (*"1 day(s) awaiting approval, 100 sq ft, ₹1,200"*), and the
    Painter report shows *"Ramesh Kumar days=2 sqft=140"* with no id leak.
41. Service-worker cache bumped `painter-plus-v23` → `v24` (the precache also
    moved to per-asset, bug 36).

---

## Seventh pass — 2026-10-22 (development-only review)

Focused on layout/responsive behaviour, UI consistency and accessibility, with a
green baseline first and every fix re-verified against the existing suites.

### 38. High — the nav header wrapped and clipped at intermediate widths

**Symptom.** With 11 nav links the header needed two rows between roughly 769px
and 1100px. `.nav-links` had a fixed `gap: 28px` and no `flex-wrap`, so the links
overflowed the header box and the last ones (`Contact`, `Admin`, the theme
toggle) were clipped or pushed off-screen. Header height jumped from 78px to
121px to 166px as the viewport narrowed.

**Root cause.** `.flex-header` and `.nav-links` were both unwrapped flex rows
with generous gaps; nothing told them they could wrap, and the nav never shrank.

**Fix.** `.nav-links` gained `flex-wrap: wrap; justify-content: center` and its
gap dropped 28px → 18px; `.flex-header` gained `gap: 12px; flex-wrap: wrap`. A
new `@media (max-width: 1100px) and (min-width: 769px)` block tightens the gap to
12px and the type to 0.9rem so all 11 links stay on one row from 800px up, and
wrap cleanly (never clip) below that.

**Verification.** Measured header height and nav row count at 769/800/850/900/
950/1000/1024/1100/1280/1440px in headless Chromium: one row from 800px up,
header 78px on desktop, nothing clipped at any width.

### 39. High — a corrupt Color Studio store crashed the scene render

**Symptom.** A hand-edited or corrupted `pp_studio` in `localStorage` (a colour
stored as a number, `null`, an object, or a non-hex string) made
`js/color-studio.js` throw `TypeError: …toUpperCase is not a function` during
`selectSurface`, aborting the rest of the file — the stage stopped repainting and
every control after that point stopped responding.

**Root cause.** `colours[scene][key]` was treated as a hex string everywhere and
handed straight to `.toUpperCase()` / `.replace()`, with no validation of what
`loadPersisted()` had read.

**Fix.** A `safeHex(value, fallback)` helper coerces any stored value to a real
3/6-digit hex (falling back to the scene default), and every read/write of a
colour now goes through it — `applyColour`, `paintStage`, `selectSurface`,
`applyPreset`, `updateHarmony`, `renderSummary`, the swatch highlighting, the
quote link and `loadPersisted()`. A separate guard in `selectSurface` also
handles a surface tab captured from a *previous* scene, whose key no longer
exists in the current one.

**Verification.** New `tests/color-studio-selftest.js` (+ `tests/cs-seed.js`)
seeds a corrupt store from `<head>` before any page script runs and asserts that
nothing throws, that no raw stored value reaches the DOM or the quote link, and
that the stage still paints. Against the *original* `color-studio.js` it reports
4 FAILs (`cur.toUpperCase is not a function`); against the fix it is all-green.

### 40. Medium — the Color Studio stage and controls overflowed a phone

**Symptom.** At 320–560px the studio's right-hand column was pushed off-screen;
the page scrolled horizontally and the "Request quote" button was partly
unreachable.

**Root cause.** `.studio-advanced` used `grid-template-columns: 1.15fr 0.85fr`.
A bare `fr` track refuses to shrink below its content's min-content width, so the
stage (a wide `aspect-ratio` box) forced the grid wider than its container.

**Fix.** `grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr)` plus
`min-width: 0` on the tracks, `flex-wrap` on `.coverage` with a shrinkable range
input, and tighter `padding` on `.stage-wrap` / `.controls` below 560px.

**Verification.** A per-width sweep of `color-studio.html` at 320/360/375/414/
480/560/768/900px: zero elements past the right edge and `scrollWidth ==
clientWidth` at every width (previously 30+ overflowing elements at 320px).

### 41. Medium — the painter mascot sat on top of the WhatsApp button

**Symptom.** The fixed `.painter-mascot` and the fixed `.whatsapp-float` both
pinned to the bottom-right corner, so the mascot covered the WhatsApp pill at
every width (320–1440px).

**Fix.** The mascot's `bottom` is now `calc(24px + 55px + 14px)` — the float's
own 24px offset plus its 55px height plus a 14px gap — so it sits above the pill.

**Verification.** An overlap probe at 320/375/480/700/1024/1280/1440px reports
`OVERLAP=false` and the mascot fully on-screen at every width (previously
`OVERLAP=true` everywhere).

### 42. Medium — the FAQ was not keyboard-operable

**Symptom.** Each FAQ question was a `<div>` with a click handler on an inner
`+` span, so it could not be reached or toggled with the keyboard and had no
accessible open/closed state.

**Fix.** The question is now a real `<button type="button" class="question"
aria-expanded="…">`, the handler moved to it, and `aria-expanded` tracks the
visual state. CSS neutralises the button chrome and adds a `:focus-visible`
ring; the `+`→`×` rotation is unchanged.

### 43. Low — the mobile menu did not report its state

**Fix.** `.mobile-toggle` now carries `aria-controls="primary-nav"` and an
`aria-expanded` that flips with the menu; every page's `<nav>` gained
`id="primary-nav"` and `aria-label="Main navigation"`.

### 44. Low — the current page was not marked in the nav

**Fix.** Each page's own link now has `class="active" aria-current="page"`, with
a CSS rule that colours it and underlines it, so the visitor can see where they
are. (`erp.html` already had this; it is now consistent site-wide.)

**Verification (38–44).** New `tests/ui-selftest.js` drives the real
`index.html` and asserts the FAQ button semantics and toggle, the mobile-menu
`aria-expanded` round-trip, and the active-link marking. Wired into
`tests/run-all-headless.sh` as *PAGE UI selftest*. All-green at 375/768/1024/
1440px.

### Seventh-pass verification summary

- `node tests/erp.test.js` **64/64**, `gallery.test.js` **24/24**,
  `measure.test.js` **16/16**, `photo-studio.test.js` **50/50** — green.
- `bash tests/run-all-headless.sh` — **ALL BROWSER CHECKS PASSED**: work log, ERP,
  work-log→ERP, team, gallery, profile, paint-my-photo (**30/30**), Color Studio
  (new), Page UI (new), portfolio injection, and the full-site sweep (**15/15
  pages clean**).
- Full-page horizontal-scroll sweep across all 15 pages × 11 widths
  (320→1440px), with entry animations settled: **0 pages can scroll
  horizontally**. (An earlier raw `getBoundingClientRect` pass flagged
  `.reveal-right` / `.bg-glow`; both are transient animation/decoration state,
  not real overflow — `body { overflow-x: hidden }` and the settled layout
  measure clean.)
- Service-worker cache bumped `painter-plus-v24` → `v25` (this pass changed
  `css/style.css`, `js/script.js`, `js/color-studio.js` and the pages, all
  precached).

---

## Eighth pass — 2026-10-22 (untrusted-storage hardening)

**Theme.** Every previous pass hardened the *values* the site stores (a colour
must be a hex, an id must resolve to a name). This pass hardens the *shape* of
the store itself. `localStorage` is untrusted input: it can be hand-edited in
DevTools, truncated by a failed save, or left behind by an older build. The site
loads page scripts site-wide, so one unguarded access on a malformed store
aborts the whole file and silently kills unrelated features.

**How it was found.** A throwaway harness seeded *every* storage key the site
reads (`painterPlusTeam`, `painterPlusWorkLog`, `painterPlusERP`,
`painterPlusGallery`, `painterPlusProjects`, `pp_studio`, `painterPlusProfile`,
plus the two `sessionStorage` flags) with hostile data — `null`s and scalars
where arrays and objects belong, a non-array `entries`, a `null` work-log day, a
`null` project, a non-array member gallery — and loaded all 15 pages. **7 pages
threw.** After the fixes, all 15 are clean; the harness is now a permanent test
(§45).

### 45. High — a corrupt store crashed 7 of 15 pages

**Symptom.** With malformed data in `localStorage`, the page scripts threw an
uncaught `TypeError` and aborted mid-render:

| Page | Error |
|------|-------|
| `admin.html` | `Cannot read properties of null (reading 'image')` |
| `erp.html` | `Cannot read properties of null (reading 'name')` |
| `worklog.html` | `Cannot read properties of null (reading 'name')` |
| `gallery.html` | `(d[memberId] \|\| []).forEach is not a function` |
| `team.html`, `painter-profile.html` | `Cannot read properties of null (reading 'at')` |
| `portfolio.html` | `img.replace is not a function` |

**Root cause.** Each module's store reader trusted the *shape* of the parsed
JSON. `read()`/`readRaw()`/`getDay()`/`readAll()` checked that the top level was
an object but not that the members of the stored arrays were objects, or that a
per-member value was an array at all:

- `js/erp.js` `read()` returned `data.projects` as-is, so a `null` in the array
  reached `listProjects()`'s `a.name.localeCompare(...)`; `readWorkLog()`
  returned a `null` day, which `reportDaily()` read `day.status` off.
- `js/gallery.js` `readRaw()` returned the raw object, so a member whose value
  was a string (`"nope"`) reached `(d[memberId] || []).forEach` in `feed()`; a
  `null` inside a member's array reached `sortItems()`'s `b.at`.
- `js/script.js` `ppRead()` returned `JSON.parse(...) || []` — an array of
  anything — so a `null` project reached `renderList()`'s `p.image`, and a
  non-string `image` reached `img.replace(...)` in the portfolio merge.
- `js/worklog.js` `getDay()` only guarded the top level, so a `null` inside
  `entries` reached `totals()`'s `e.sqft`.
- `js/team.js` `read()` mapped the raw roster, so a `null` member reached
  `Object.assign(blankMember(m.role), m)`.

**Fix.** Each reader now normalises its data *once*, at the boundary, and drops
anything that is not a plain object (or, for a per-member map, anything that is
not an array):

- `js/erp.js` — `read()` filters `projects` to plain objects and coerces
  `approvals`/`bills` to objects, filtering each project's bill list; `readWorkLog()`
  keeps only object days; `dayTotals()`/`daySignature()` treat `entries` as a real
  array of objects.
- `js/gallery.js` — `readRaw()` keeps only array-of-object member entries;
  `sortItems()`, `count()`, `feed()` and the new `entryList()` drop malformed
  members/items/entries; the `worklogDays`/`erpProjects`/`roster` fallbacks go
  through a new `objectList()`.
- `js/script.js` — `ppRead()` returns a filtered array of objects; the portfolio
  merge coerces `p.image` to a string.
- `js/worklog.js` — `getDay()` filters `entries`; `totals()`/`breakdown()` guard
  each entry.
- `js/team.js` — `read()` filters non-object roster members.

**Why "drop", not "repair":** a `null` project has no id, name or rate, so there
is nothing to repair it from; showing it would print `undefined` in the UI. The
readers keep every well-formed row and discard only the impossible ones, so a
half-corrupt store still shows all the real data.

**Verification.** New `tests/corrupt-seed.js` holds the hostile seed and
`tests/run-corrupt-sweep.sh` (plus a `CORRUPT STORE sweep` step in
`tests/run-all-headless.sh`) loads all 15 pages with it in place, failing on any
uncaught error. Against the *original* modules the sweep reports **7 pages with
errors**; against the fix it is **all pages clean**. Node-level regression tests
were added to `tests/erp.test.js` (3) and `tests/gallery.test.js` (3), which fail
if any reader starts trusting the stored shape again.

### Eighth-pass verification summary

- `node tests/erp.test.js` **67/67**, `gallery.test.js` **27/27**,
  `measure.test.js` **16/16**, `photo-studio.test.js` **50/50**,
  `passcode.test.js` **13/13**, `exposure.test.js` **10/10** — green.
- `bash tests/run-all-headless.sh` — **ALL BROWSER CHECKS PASSED**, including the
  new *CORRUPT STORE sweep* (**15/15 pages clean**) and the unchanged full-site
  sweep (**15/15 pages clean**).
- Service-worker cache bumped `painter-plus-v26` → `v27` (this pass changed
  `js/erp.js`, `js/gallery.js`, `js/script.js`, `js/team.js`, `js/worklog.js`,
  all precached).
