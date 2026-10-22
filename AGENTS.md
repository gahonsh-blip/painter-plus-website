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

11. **Attribute injection via photo URL — FIXED.** The shared `esc()` helper escaped `&`, `<`, `>` but **not** quotes, so a work-log photo URL (`x" onerror="…`) broke out of the `<img src="…">` attribute and injected a live handler. Added `escAttr()` in `js/worklog.js` and quote-escaping to `esc()` in `js/team.js` / `js/script.js`. See §15.

12. **Phantom empty day — FIXED.** Typing then clearing a project on an entry-less date still wrote a day, which showed up in the work-log history as a `0 sq ft` day. `persistDayMeta()` now skips (and removes) such empty shells. See §16.

13. **Project-rate change re-billed an approved day — FIXED.** An approval carries a `sig` fingerprint of the day's cost, but it only covered the *day's own* rates. Changing the linked **project's** rate (or paint rate) changed the money while the old sign-off survived, so the day billed the new rate with no re-approval. `effectiveRates(day, project)` is now the one source of truth for "which rate applies", and `daySignature()` fingerprints it, so any project-costing change withdraws the approval. See §25.

14. **Portfolio-merge injection — FIXED.** `portfolio.html` merges admin-added projects from `localStorage`. A photo URL like `x" onerror="…` broke out of the `<img src="…">` attribute and ran; the `challenge`/`solution`/`result` fields were raw HTML; and the hover image was concatenated into `style="--pf-img:url('…')"`. Every field now goes through `esc()`, and `--pf-img` is set via the CSSOM with quotes/parens/backslashes stripped. See §26.

15. **A failed save reported success — FIXED.** `write()`/`writeAll()`/`writeRaw()` swallowed the exception (correct) but the mutators ignored the returned boolean and reported `ok:true` even when nothing was stored. The storage helpers now return whether the write landed, and every mutator returns `{ ok:false, error: STORAGE_ERROR }` on failure; the page scripts surface it. See §27.

16. **No headless browser test runner — ADDED.** The `run-*.sh` scripts only printed a URL for a human. `tests/run-all-headless.sh` builds every throwaway page, serves once, drives headless Chromium and exits non-zero on any FAIL. See §28.

17. **Real square feet from the photo — ADDED.** The work log could only take a typed length × height; the "square feet from the photo" feature was not implemented (the old photo system had no polygon/measure code and no Firebase — the data lives in `localStorage`). `js/measure.js` now measures a tapped polygon with perspective correction (4-corner calibration → homography → shoelace), and the day carries a labour rate and paint coverage so the area turns into a labour cost and a paint estimate. Geometry is unit-tested in `tests/measure.test.js`.

18. **ERP saves silently did nothing in the browser — FIXED.** `js/erp.js` used the UMD wrapper `(function (root, factory) { const api = factory(); … })(window, function () { … })`, but the factory body reached for `root` (to get `window.localStorage`) and `root` was never passed in, so it was `undefined`. Node tests passed because they inject an in-memory store via `_setStore`, which short-circuits before `root` is touched; in a real browser every `saveProject`/`approveDay`/`addBill` reported `ok: true` yet persisted nothing, because `backing()` returned `null`. The factory now receives `root` (`factory(root)`, `function (root) { … }`), and `tests/erp.test.js` loads the file in a browser-like `vm` context to prove a save reaches `window.localStorage`. `js/measure.js` and `js/photo-studio.js` share the wrapper shape but never reference `root`, so they were unaffected.

19. **Stale approval — FIXED.** An approved day kept its approval after being reopened and edited, so the bill counted the new measurements under the old sign-off. An approval now stores a `sig` fingerprint of the day it signed; `approvalOf()` reports `pending` when the day no longer matches, and `reopenDay()` calls `PPERP.clearApproval()`. See §17.

20. **Invoice id collision — FIXED.** `addBill()` used `Date.now()` alone, so two bills raised in the same millisecond shared an id and deleting one deleted both. The id now appends a random suffix. See §18.

21. **Invoice number reuse — FIXED.** The number came from `list.length`, so deleting `PP-001` made the next bill `PP-002` again. `nextBillNo()` now returns one past the highest number ever used. See §19.

22. **Rejected work counted as pending — FIXED.** `overview()` folded rejected labour into `unbilledLabour`, so the dashboard advertised rejected money as awaiting approval. It now reports `rejectedSqft` / `rejectedLabour` separately. See §20.

23. **Blank project rate zeroed the day's labour — FIXED.** `dayCosting()` used `project ? num(project.rate) : num(day.rate)`, so a project whose *Labour rate* was left blank (normalises to `rate: 0`) discarded the rate the crew had entered on the day — a ₹1,200 day billed as ₹0 the moment it was linked to a rate-less project. It now falls back with `(project && num(project.rate)) || num(day && day.rate)`, exactly as `coverage`/`coats` already did. See §21.

24. **ERP vs work log paint divergence — FIXED.** The work log computes litres via `PPMeasure.paintLitres()`; the ERP hardcoded its own `× 1.1`. They agreed only while the shared wastage default stayed `0.1`. `PPERP.dayCosting()` now delegates to `PPMeasure.paintLitres()` (with an identical fallback for Node), so the two can never quote different quantities. See §22.

25. **ERP reports showed crew ids — FIXED.** The work log stores `crew` as the team member **id** (the `#wlCrew` option value), but the ERP printed it raw, so reports read `ramesh-kumar` instead of `Ramesh Kumar`, and the same person stored once as an id and once as a legacy name split into two rows. `PPERP.crewIdentity()`/`crewName()` now resolve through `PPTeam` (id first, then name) and group the painter report by identity; every report, the invoice, the Approvals row and the work-log summary show the name. See `docs/BUG_AUDIT.md` §29.

26. **"Awaiting approval" included open days — FIXED.** `overview().unbilledLabour` was `labour - approved - rejected`, sweeping in days still being edited, and its subtitle ("N day(s) submitted") disagreed with its own money. `bucketDays` now splits `approved` / `pending` (submitted) / `open` / `rejected`; only submitted days are "pending", `unbilledLabour` is the pending sum, and the ERP dashboard gained an "Open (in progress)" KPI. See §30.

27. **More ERP / Color-Studio fixes — see `docs/BUG_AUDIT.md` §31-37.** An invoice that printed `Rs 0/sq ft` next to a real total (`billedRateInfo()` now quotes the rate the work was billed at); a day billed under two projects (an id match fell through to a name match in `dayMatchesProject`); a Color Studio swatch that never highlighted (`hexToRgb` could not parse the browser's `rgb(...)`); a same-millisecond project-id collision (`uniqueProjectId`); `billTotal()` dropping paint; a decorative social image on the all-or-nothing SW-install path (per-asset `precache`); the work-log summary printing the crew id.

28. **Nav header wrapped and clipped — FIXED.** With 11 nav links and a fixed `gap: 28px` and no `flex-wrap`, the header needed two rows from ~769px to ~1100px and the last links (`Contact`, `Admin`, the theme toggle) were clipped or pushed off-screen (header 78px → 121px → 166px as it narrowed). `.nav-links` now wraps (`flex-wrap: wrap; justify-content: center`, gap 18px), `.flex-header` gained `gap: 12px; flex-wrap: wrap`, and a `max-width: 1100px`/`min-width: 769px` block tightens the gap to 12px and type to 0.9rem so the links stay on one row from 800px up. See §38.

29. **Corrupt Color Studio store crashed the render — FIXED.** A hand-edited `pp_studio` (a colour stored as a number, `null`, an object or a non-hex string) made `js/color-studio.js` throw `TypeError: …toUpperCase is not a function` in `selectSurface`, aborting the whole file. A `safeHex(value, fallback)` helper now coerces every stored colour to a real 3/6-digit hex, and it is used at every colour read/write site (`applyColour`, `paintStage`, `selectSurface`, `applyPreset`, `updateHarmony`, `renderSummary`, swatch highlight, quote link, `loadPersisted`). `selectSurface` also falls back when handed a stale surface key from a previous scene. See §39.

30. **Color Studio overflowed a phone — FIXED.** `.studio-advanced` used bare `1.15fr 0.85fr` grid tracks, which refuse to shrink below their content's min-content width, so at 320–560px the right column was pushed off-screen and the page scrolled horizontally. Now `minmax(0, …)` tracks + `min-width: 0`, with `flex-wrap` on `.coverage` and tighter padding under 560px. See §40.

31. **Mascot sat on the WhatsApp button — FIXED.** `.painter-mascot` and `.whatsapp-float` both pinned bottom-right, so the mascot covered the WhatsApp pill at every width. The mascot's `bottom` is now `calc(24px + 55px + 14px)` (the float's offset + height + gap). See §41.

32. **FAQ not keyboard-operable / menu state unannounced / no active nav link — FIXED.** The FAQ question is now a real `<button type="button" class="question" aria-expanded="…">` with the handler on it (was a `<div>` with a click on an inner `+` span); `.mobile-toggle` carries `aria-controls="primary-nav"` and a live `aria-expanded`; every page's `<nav>` gained `id="primary-nav"` + `aria-label`, and each page's own link is `class="active" aria-current="page"`. See §42-44.

33. **A corrupt store crashed 7 of 15 pages — FIXED.** It is not enough to guard a stored *value*; the stored *shape* is untrusted too. A `null`/scalar where an array or object belongs (`projects: [null]`, `entries: "nope"`, a member's gallery that is a string, a `null` work-log day) threw an uncaught `TypeError` and aborted the page script. Every store reader now normalises once at the boundary and **drops** anything that is not a plain object (or, for a per-member map, anything that is not an array): `erp.js read()`/`readWorkLog()`, `gallery.js readRaw()`/`sortItems()`/`count()`/`feed()`/`objectList()`, `script.js ppRead()`, `worklog.js getDay()`/`totals()`, `team.js read()`. Verified by the new `tests/run-corrupt-sweep.sh` (seed in `tests/corrupt-seed.js`), which reports **7 pages with errors** against the old modules and **all clean** against the fix. See §45.

34. **Approved work could be invoiced twice — FIXED.** `billFor()` returned *all* of a project's approved days every time it was called, and a bill recorded only an amount — never *which* days it covered. So "Record this bill" could be clicked again and the same measurements were invoiced (and paid) twice. An invoice now records the work-log `dates` it covers (`addBill()` derives them from `bucketDays(project).unbilled`, never trusting the caller), `bucketDays()` splits approved days into `unbilled`/`billed` via `billedDateSet()`, and `billFor().totals` is the **unbilled** set. The Billing tab disables the button when nothing is unbilled and names the already-invoiced work; the dashboard gained an **Invoiced** KPI. See §46.

35. **Deleting a project orphaned its approvals — FIXED.** `removeProject()` dropped the project and its invoices but left every approval keyed by date. Because `dayMatchesProject()` falls back to a name match, those days — and their stale sign-offs — were re-attributed to any *other* project sharing the name and billed there. `removeProject()` now deletes each of the project's days' approvals first, so a sign-off dies with the site it covered. See §47.

36. **Report/invoice project-resolution mismatch — FIXED.** `reportDaily()`/`reportByPainter()` used their own lookup (`getProject(projectId) || name-match`), which fell through to a name match when the id was stale — the *opposite* of the billing rule (`dayMatchesProject()` treats an explicit id as authoritative). A day with a stale id showed one project in the daily report while billing under none. `projectForDay()` now delegates to `dayMatchesProject()` and every report uses it, so there is exactly one rule. See §48.

37. **Invoice numbers were unique per project, not per business — FIXED.** `nextBillNo()` scanned only the current project's list, so two projects each issued `PP-001`. It now scans every project's bills. See §49.

38. **Stored invoice amounts were un-rounded — FIXED.** `money()` rounded for *display* only, so an amount like `95.89999999999999` was stored raw and later sums drifted. `addBill()` runs every amount through `round2()`; `money()` uses it too. See §50. **And** an empty bill no longer claims a "(day rate)" label (`billedRateInfo().fromDay` is now `rates.length > 0`). See §51.

**Money-path gotcha:** the ERP's job is to *not* charge the wrong amount. Three invariants must hold and each has a test that fails if it breaks: (1) unapproved work is never billed; (2) approved work is billed **once** — a bill must record the dates it covers; (3) a report and an invoice must resolve a day's project by the *same* rule (`dayMatchesProject`, id authoritative). Also round money at *storage* (`round2`), not only at display.



**Pattern to watch for:** this codebase loads page-specific scripts site-wide (`color-studio.js` on `index.html`). Any unguarded top-level access — a missing DOM id, a throwing `localStorage` call — aborts the *entire file* and silently kills unrelated features. Always guard, and prefer feature-detection over assuming the DOM or storage is present. Also: `esc()` is for text nodes — inside a quoted attribute you must escape quotes too (`escAttr`). And a stored value that is an **id** must be resolved to a display name through `PPTeam` before it is shown to a person — never print the raw id. And a UMD wrapper must actually pass its global into the factory: `factory()` with a body that uses `root` passes in Node (where the in-memory store hides it) and fails silently in the browser. And a value read from `localStorage` is untrusted input — a colour must be coerced to a real hex (`safeHex`) before it reaches the DOM, or a hand-edited store crashes the render.

**Untrusted-shape gotcha (see `docs/BUG_AUDIT.md` §45):** it is not enough to guard a stored *value* — the stored *shape* is untrusted too. A `null` or a scalar where an array/object belongs (`projects: [null]`, `entries: "nope"`, a member's gallery that is a string, a `null` work-log day) used to crash **7 of 15 pages** on `null.name` / `.forEach is not a function` / `img.replace`. Every store reader now normalises its data once at the boundary and **drops** anything that is not a plain object (or, for a per-member map, anything that is not an array): `erp.js read()`/`readWorkLog()`, `gallery.js readRaw()`/`sortItems()`/`count()`/`feed()`/`objectList()`, `script.js ppRead()`, `worklog.js getDay()`/`totals()`, `team.js read()`. When you add a new stored collection, filter its elements there — do not assume the array holds objects. Verify with `bash tests/run-corrupt-sweep.sh` (seed in `tests/corrupt-seed.js`), which loads all 15 pages against a hostile store.

**Layout gotcha:** a bare `fr` grid track refuses to shrink below its content's min-content width. A grid whose children contain a wide fixed-ratio box (the Color Studio stage) overflows its container on a phone unless the tracks are `minmax(0, …)` and the children get `min-width: 0`.

**Canvas gotcha:** `ctx.createImageData(w, h)` returns *transparent black*, not a copy of what is on the canvas. A repaint loop that writes only the pixels it changes (as `js/photo-studio.js` does) must first `out.data.set(baseData.data)`, or everything outside the edited region is wiped. `js/photo-studio.js` also keeps every per-pixel access inside a `try/catch`, because a `file://` page taints the canvas and `getImageData` throws.

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
| Pages | `index.html`, `about.html`, `services.html`, `portfolio.html`, `gallery.html`, `painter-profile.html`, `contact.html`, `privacy.html`, `terms.html`, `offline.html` |
| Color Studio | `color-studio.html` + `js/color-studio.js` — live room/exterior paint preview, finishes, lighting, and the **area & square-feet estimator** |
| Paint my photo | `js/photo-studio.js` (`window.PPPhoto`) — recolour an uploaded wall photo (tap 4 corners, pick colour/finish/texture) + paint/putty/primer estimate; the section lives in `color-studio.html` |
| Team roster | `team.html` (roster page, cards show a derived evidence row), `painter-profile.html` (per-member profile + gallery + self-edit), `js/team.js` (shared data + roles + self-claim) |
| Crew work gallery | `gallery.html` + `js/gallery-page.js` — every member's work photos in one place, attributed to painter and project, filterable |
| Gallery + work-record engine | `js/gallery.js` (`window.PPGallery`) — photo CRUD, crew `feed`, and the **derived work record** (years, projects, sq ft, days, co-workers) |
| Admin | `admin.html` (Owner/Head login: Team & Roles, profile, Portfolio projects) |
| Daily work log | `worklog.html` + `js/worklog.js` — each day the crew adds a photo entry per painted surface, **measures its square feet on the photo** (or types length × height), sees one running day total plus labour and paint, then does a **Final submit** |
| ERP | `erp.html` + `js/erp.js` (`window.PPERP`) + `js/erp-page.js` — the layer above the work log: projects, approvals, billing (**approved work only, billed once**) and daily/project/painter reports |
| Photo measurement | `js/measure.js` (`window.PPMeasure`) — perspective-corrected area from a photo (4-corner calibration + shoelace), and the paint/labour maths |
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
  gate — client-side only, not real security). The passcode itself is **not** in
  the source: `js/team.js` holds a salted SHA-256 digest (`PASSCODE_SHA256`) and
  `tests/hash-passcode.js` prints a digest for a new passcode.
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
- **Stored colours are untrusted input.** `pp_studio` can be hand-edited or
  corrupted, so every colour read out of it goes through `safeHex(value,
  fallback)` — which returns a real 3/6-digit hex or the scene default — before
  it reaches `.toUpperCase()`, `.replace()`, `style.backgroundColor` or the
  quote link. `selectSurface` also falls back to the scene's first surface when
  handed a stale key from a previous scene. Never call string methods on
  `colours[scene][key]` directly. See `docs/BUG_AUDIT.md` §39.
- **Layout:** `.studio-advanced` uses `minmax(0, …)` grid tracks with
  `min-width: 0` on the children, because a bare `fr` track will not shrink
  below the stage's min-content width and overflows a phone. See §40.
- Test: `bash tests/run-cs-selftest.sh` (or the `COLOR STUDIO selftest` step of
  `tests/run-all-headless.sh`) seeds a corrupt `pp_studio` from `<head>` before
  any page script runs and asserts nothing throws and no raw value reaches the
  DOM.

## Daily work log (ERP) — `worklog.html` + `js/worklog.js`

The on-site day book. Where the Color Studio is for the *client* to preview a
room, the work log is for the *crew* to record the work actually done.

- One day per date. `window.PPWorkLog` (in `js/worklog.js`) stores everything in
  `localStorage` under `painterPlusWorkLog`, keyed by `YYYY-MM-DD`.
- Each **photo entry** is one painted surface: a work photo (file upload,
  downscaled to ≤1024px JPEG, or a URL), the **area** it is (`AREAS` — wall,
  ceiling, floor, feature wall, exterior wall, trim, door/window, cabinet, tile,
  other), and an optional note. Its square feet come from **either**:
  - **measured on the photo** (`js/measure.js`, see below) — perspective is
    corrected, so a tilted photo still gives the true area; or
  - **length × height** typed by hand.
  Saving records which one was used (`entry.method`: `'measured'` or `'manual'`).
- All entries of the day sum into **one running total** (`PPWorkLog.totals`),
  shown as *Total area today* plus a per-area breakdown (`PPWorkLog.breakdown`).
- The day also carries a **labour rate** (`#wlRate`, ₹ per sq ft), a **paint
  coverage** (`#wlCoverage`, sq ft/litre/coat) and **coats** (`#wlCoats`).
  `PPWorkLog.costing(day)` turns the total square feet into a **labour cost**
  and a **paint estimate** (litres, incl. 10% wastage), shown under the totals.
- **Final submit** closes the day (`status: 'submitted'`): entries lock, and a
  **Reopen day** button appears. `PPWorkLog.summary` produces a copyable text
  report (area, breakdown, labour and paint); **Copy summary** copies it.
- Every logged day is listed newest-first in *Logged days* (✅ = submitted).
- The page reuses the shared Owner/Head passcode gate (`PPTeam.unlockHead`) and
  can attribute the day to a crew member (`#wlCrew`, filled from `PPTeam.list`).
- Key ids: `#wlApp`, `#wlGate`/`#wlPanel`, `#wlDate`, `#wlProject`, `#wlCrew`,
  `#wlRate`, `#wlCoverage`, `#wlCoats`, `#wlArea`, `#wlW`, `#wlH`, `#wlSqft`,
  `#wlSqftSrc`, `#wlPhotoFile`/`#wlPhotoUrl`, the measurement ids (`#wlMeasurePanel`,
  `#wlCanvas`, `#wlCalibBtn`/`#wlDrawBtn`/`#wlUndoBtn`/`#wlClearBtn`/`#wlMeasureReset`,
  `#wlCalibW`/`#wlCalibH`, `#wlMeasuredSqft`, `#wlMeasureMode`, `#wlMeasureHint`,
  `#wlUseMeasured`), `#wlItems`, `#wlTotals`, `#wlSubmit`, `#wlReopen`, `#wlHistory`.
- It is `noindex, nofollow` (like `admin.html`) and therefore **not** in
  `sitemap.xml`. Its public API: `getDay`, `listDays`, `saveDay`, `hasDay`,
  `removeDay`, `addEntry`, `removeEntry`, `submitDay`, `reopenDay`, `totals`,
  `breakdown`, `costing`, `summary`, `sqft`, `fmt`, `money`, `fmtLitres`,
  `DEFAULTS`.
- The form's day rates are read **live** from the inputs via `liveDay()` so the
  totals cost correctly before the first entry is saved, without persisting an
  empty day. A date with no entry and no project/crew is never stored (no
  phantom `0 sq ft` day); the rates are captured onto the day when the first
  entry is saved.
- Attribute values (photo `src`, `alt`, `data-id`, option `value`) go through the
  local `escAttr()` — **not** the text `esc()` — because the shared `esc()` does
  not escape quotes. Never interpolate a stored value into an attribute with `esc()`.

## Photo measurement — `js/measure.js` (`window.PPMeasure`)

The module that turns a shape drawn on a photo into real square feet. It has a
pure-geometry half (no DOM, unit-testable in Node) and a browser editor half.

- A photo is a **perspective projection**, so a raw pixel count is wrong: a wall
  photographed at an angle covers fewer pixels than it does face-on. The tool
  therefore asks the painter to tap the **four corners of a known rectangle**
  (the wall, a door, a window, a tile grid) and type its real **width × height**.
  Those four point pairs define a **homography** (projective map from image
  pixels to feet). Applying it to the drawn polygon and measuring that with the
  **shoelace formula** gives the true area even on a skewed, tilted photo.
- Geometry API: `polygonArea(pts)` (shoelace), `homographyFromCalibration(corners, w, h)`,
  `calibratedArea(H, pts)`, `flatArea(pts, ftPerPx)`, `homographyFromQuad`,
  `applyH`, `transformPoints`, `distance`, `solve`. `homographyFromCalibration`
  returns `null` for collinear/degenerate corners.
- Costing API: `paintLitres(sqft, { coats, coverage, wastage })` (defaults
  130 sq ft/L/coat, 2 coats, +10% wastage), `labourCost(sqft, ratePerSqft)`.
- Editor API: `createEditor({ canvas, hintEl, buttons, onChange })` →
  `loadImage(src)`, `setMode('calib'|'draw')`, `undo()`, `clear()`, `reset()`,
  `setCalibSize(w, h)`, `setInitial(savedMeasure)`, `getResult()`. The result is
  `{ ok, sqft, calibrated, method, calib: { corners, w, h }, points, canvas }` —
  stored on the entry as `entry.measure` so the overlay can be restored on edit.
- The editor guards everything: if `window.PPMeasure` or `#wlCanvas` is missing,
  the work log silently falls back to plain length × height entry.
- Workflow in the UI: choose a photo → **Set scale** (tap 4 corners, type the
  known size) → **Draw area** (tap the painted surface) → **Use this measurement**.
- Tests: `node tests/measure.test.js` (16 checks) covers the shoelace, flat
  calibration and perspective recovery (a skewed photo of a 10×8 ft wall must
  still measure 80 sq ft), plus the costing maths. The browser harness
  `tests/run-wl-selftest.sh` drives the real work-log editor end to end (load a
  synthetic perspective photo → tap calibration corners → tap the area → save),
  and asserts the measured square feet, labour and paint figures.
- **Storage is `localStorage`, not Firestore.** There is no Firebase or any
  backend — this is a deliberately backend-less static site. Keys:
  `painterPlusWorkLog`, `painterPlusERP`, `painterPlusGallery`, `painterPlusTeam`.
  Beware of external documents claiming a Firestore store or a "minimum 5 photos
  before submit" rule; neither exists (see `docs/PHOTO_AREA_MEASUREMENT.md`).

## ERP — `erp.html` + `js/erp.js` (`window.PPERP`) + `js/erp-page.js`

The money layer above the work log. Owner/Head gated like `admin.html` and
`worklog.html`. Data lives in `localStorage` under `painterPlusERP`; the work log
it reads stays under `painterPlusWorkLog`.

Data shape:

```
{
  projects: [ { id, name, client, phone, address, rate, coverage, coats,
                paintRate, startDate, status: "active"|"closed", note } ],
  approvals: { "YYYY-MM-DD": { status: "approved"|"rejected", by, at, note,
                               sig } },   # sig = daySignature() at approval time
  bills: { "<projectId>": [ { id, no, date, note, amount, sqft, litres,
                              paintCost, labour, createdAt } ] }
}
```

`paintRate` is ₹ per litre. With it set, `dayCosting()` returns a paint
quantity (`litres`, via `PPMeasure.paintLitres`), a material cost (`paintCost =
litres × paintRate`) and a grand `total` (`labour + paintCost`); `billFor()`,
`invoiceText()`, `overview()` and all three reports carry them through. A project
left at `paintRate: 0` bills labour only — the paint quantity is still shown.

**The one rule, do not break it:** a measurement that has not been *approved*
never adds a rupee to a bill. `billFor()` returns `totals` (approved, billable)
and `pending` in **separate** fields; they are never summed. `billFor()` and
`invoiceText()` read only approved days. There is a block of `THE RULE:` tests in
`tests/erp.test.js` that fails if this ever regresses.

**The second rule, also do not break it:** approved work is billed **once**. An
invoice records the work-log `dates` it covers (`addBill()` derives them from
`bucketDays(project).unbilled` — never trust a caller to pass them), and
`bucketDays()` splits the approved days into `unbilled` and `billed` using
`billedDateSet()`. `billFor().totals` is the **unbilled** set (what a new invoice
would cover); the already-invoiced work is reported separately as
`billedTotals`/`billedLines`. Without this, "Record this bill" could be clicked
twice and the same measurements invoiced (and paid) twice — see §46. A new day
approved after a bill is genuinely new work and *is* billable; deleting an
invoice releases its days again. The `REG:` tests in `tests/erp.test.js` fail if
this regresses.

- A day can only be approved once it is **final-submitted** (`canApprove(day)`
  checks `day.status === 'submitted'`) — an open day is still being edited.
- **An approval is bound to the measurements it signed.** `setApproval()` stores a `sig` fingerprint of the day (`daySignature()`); `approvalOf()` returns `pending` (with `stale: true`) whenever the day no longer matches — i.e. it was reopened and edited after approval. `PPWorkLog.reopenDay()` also calls `PPERP.clearApproval(date)`. Never remove this: without it, an approved day could be edited and the *old* sign-off would still bill the *new* amount. (An approval with no `sig` — written before this existed — is honoured as-is.)
- **A sign-off dies with its project.** `removeProject()` deletes every approval for that project's days (`daysForProject`). Otherwise, because `dayMatchesProject()` falls back to a name match, those days and their stale approvals would be re-attributed to any *other* project sharing the name and billed there. See §47.
- **Invoice ids and numbers must stay unique.** `addBill()` appends a random suffix to the id, and `nextBillNo()` derives the number from the highest `PP-nnn` ever used **across every project** (never the list length), so deleting an invoice neither collides nor frees its number for reuse. A per-project counter issued two `PP-001`s (§49).
- **Money is rounded at storage, not just display.** `addBill()` runs every amount through `round2()`. `money()` only rounds for display, so a raw float (`95.89999999999999`) used to be stored and every later sum drifted (§50).
- A day links to a project by `day.projectId` **first**, then by the free-text
  `day.project` name (`dayMatchesProject`), so days logged before projects
  existed still appear in a project's bill and reports. **One rule only:**
  `projectForDay()`, the reports and billing all go through `dayMatchesProject()`
  — an explicit `projectId` is authoritative and a stale one matches nothing
  (never fall back to the name when an id is set, or a day is billed twice — §32
  — or the report and the invoice disagree — §48).
- A project's `rate`/`coats`/`coverage`/`paintRate` override the day's own
  values (`dayCosting(day, project)`), so changing the project rate re-prices the
  bill. A project figure of `0` means *"not set yet"* and falls back to the
  day's own — never treat `0` as a real override, or a blank project rate zeroes
  the crew's entered labour (see §21).
- Reports: `reportDaily` (newest first, with approval state), `reportByProject`
  (approved vs pending vs rejected), `reportByPainter` (attributed by `day.crew`,
  `'Unassigned'` when missing), `overview` (whole-operation KPIs).
- The work log's day bar has a project picker (`#wlProjectPick`, filled from
  `PPERP.listProjects()`); picking one names the site and copies the project's
  rates into the day. `js/worklog.js` reads the approval state from `PPERP` to
  badge each submitted day in *Logged days*.
- The picker is refreshed when the gate opens (`openPanel`) and on window
  `focus`, and the history is re-rendered on `focus` too — a project added on
  `erp.html`, or a day approved there, shows up when the crew returns to this
  tab without a manual reload.
- Pure engine: everything except the small storage helpers is DOM-free and
  unit-tested. Tests: `node tests/erp.test.js` (78 checks, incl. the `THE RULE:`
  and `REG:` blocks that pin "approved work is billed once").
- Browser self-tests (need a real browser; both runners cache-bust their scripts
  and drop the service worker, which caches cache-first and would otherwise serve
  a stale `js` file while iterating):
  - `bash tests/run-erp-selftest.sh` → `tests/erp-selftest.js`: unlock, create a
    project, seed days, approve, bill, report, reject.
  - `bash tests/run-wl-erp-selftest.sh` → `tests/wl-erp-selftest.js`: log a day
    against an ERP project and confirm it reaches that project's bill.

## Painter profiles, work gallery & verified work record — `js/gallery.js` (`window.PPGallery`)

Gives each crew member a professional profile built on evidence. Full write-up:
`docs/PROFILE_GALLERY.md`. Two surfaces, two natures:

- **Gallery** — hand-curated photos (`painterPlusGallery`, keyed by member id).
  `photo` is a downscaled data-URL (≤1024px JPEG, like the work log) or an
  http(s) URL. Public API: `list`, `get`, `count`, `add`, `remove`, `removeAll`,
  `feed` (every photo across the crew, newest first).
- **Work record** — `PPGallery.workRecord(memberId)` **derives** years, projects,
  square feet, days on site, co-workers and photo count from the work log + ERP +
  roster on every render. Never typed in, so it can never drift from the books.

**Why derive:** a number a painter types is a claim; a number the site computes
from the day book is evidence. The profile's old hard-coded "500+ projects"
stats were removed (`stat1..stat4` cleared in `js/team.js`) and replaced by this.

- **Credit, not ownership.** A day has an owner (`crew`) but entries can be
  tagged to another member. `creditedEntries`/`creditFor` split a day by entry
  tag (falling back to the owner), so a shared day is not double-counted. This
  is the semantics the tests pin down.
- **Self-service, behind the staff gate.** `PPTeam.claim(id, passcode)` now
  requires the staff passcode; on success it stores the member id in
  `sessionStorage` (`ppClaimedMember`) and opens the Owner/Head session.
  `PPTeam.isMe(id)` is true for that member only while the session is active, or
  for anyone when an Owner/Head is signed in. There is **no anonymous edit
  path** — a public visitor sees a passcode prompt on `painter-profile.html`,
  never an edit form. Role changes still need the Owner/Head gate, and the roster
  still guards the last lead.
- **Attribute safety.** Every interpolated attribute (`src`, `alt`, `data-id`,
  option `value`) goes through `escAttr()` — the shared text `esc()` does not
  escape quotes, and a photo URL is attacker-influenced data.
- **Honest empty state.** No logged work ⇒ the record shows an empty-state
  message, never a zero-figure boast; a roster card with no data shows no row.
- Pages: `painter-profile.html` + `js/profile-page.js` (record, gallery, gated
  self-edit, role controls), `gallery.html` + `js/gallery-page.js` (whole crew,
  filter by painter/project), `team.html` + `js/team-page.js` (roster cards with
  the derived row). Member field added: `startYear`.
- Tests: `node tests/gallery.test.js` (pure engine) plus three browser
  self-tests: `tests/run-profile-selftest.sh`, `tests/run-gallery-selftest.sh`,
  `tests/run-team-selftest.sh`.

## Working rules for agents

- Read `docs/NEXT_STEPS.md` and resolve merge conflicts BEFORE any new work.
- Never leave conflict markers in committed files.
- Internal links and assets use **relative paths** (`./about.html`, `./css/style.css`) so they work both locally and under the `/painter-plus-website/` Pages prefix. Canonical, OG and sitemap URLs use the absolute live domain `https://gahonsh-blip.github.io/painter-plus-website/`.
- Do not introduce a build step, bundler, or framework unless the owner asks.
- Do not add new dependencies; there is no package manager in this project.
- Preserve the PWA behavior (service worker + manifest) when editing. **Bump
  `CACHE_NAME` in `sw.js` whenever you change a cached asset** (`js/*.js`,
  `css/style.css`) — otherwise the cache-first worker serves the old file and a
  returning visitor never sees the fix.
- After edits, run the verification checklist in `README.md` and `docs/NEXT_STEPS.md`.
- **What a visitor must never see.** The public pages (`index`, `about`,
  `services`, `portfolio`, `color-studio`, `team`, `gallery`, `contact`,
  `privacy`, `terms`, `painter-profile`) must not link to the staff tools
  (`admin.html`, `worklog.html`, `erp.html`), must not print the staff passcode,
  and must not ship an edit form a signed-out visitor can submit. The staff
  pages stay `noindex` and out of `sitemap.xml`. The deploy workflow stages a
  `_site` directory of public assets only — **never** `path: '.'`, which used to
  publish `AGENTS.md` and `README.md` (both document the passcode and the whole
  internal architecture) to the live site. `tests/exposure.test.js` enforces all
  of this.
- **The staff passcode is never in the source.** `js/team.js` stores a salted
  SHA-256 digest (`PASSCODE_SHA256`). To set a new passcode run
  `node tests/hash-passcode.js "new-passcode"` and paste the digest in.
  `tests/passcode.test.js` fails if the plaintext ever reappears.

## Verification

Prefer running code over inspection. Two layers:

- **Node unit tests** (pure, no browser): `tests/*.test.js` — `node tests/erp.test.js` etc.
- **Browser self-tests**: each `tests/run-*-selftest.sh` builds a throwaway copy
  of a real page with the harness appended and serves it; open the printed URL
  and read the `ok …` / `FAIL …` lines. `tests/run-page-sweep.sh` loads **every**
  page in a reused iframe and reports uncaught JS errors per page.

Caveats learned the hard way:

- **Cache-bust the scripts in a harness.** The service worker is cache-first, so
  a harness that loads `./js/x.js` unversioned can test stale code. The runners
  append `?v=<timestamp>`; do the same in any new one.
- **`sessionStorage` leaks between harnesses in one tab.** The Owner/Head gate
  flag is `ppAdminUnlocked` and the self-service flag is `ppClaimedMember`. A
  harness that asserts a *non-manager* view (e.g. the profile "This is me"
  button) must clear `ppAdminUnlocked` first, or a prior ERP test in the same
  tab makes `isManager()` true and the view renders differently.
- **`type="button"` applies to JS-generated buttons too.** Adding a button in a
  template string (`'<button class="x">…'`) must include `type="button"`; only
  the static HTML was swept in the original fix.


## Useful commands

```bash
# Find remaining conflict markers across the repo
grep -rn "^<<<<<<<\|^=======\|^>>>>>>>" .

# Quick syntax check of the JS (requires node)
node --check js/script.js

# Pure unit tests (no dependencies)
node tests/gallery.test.js && node tests/erp.test.js && node tests/measure.test.js && node tests/photo-studio.test.js

# Browser self-tests, headless — builds every page, runs chromium, exits non-zero on any FAIL
bash tests/run-all-headless.sh 8170

# Browser self-tests (interactive: open the printed URL, read the ok/FAIL lines)
bash tests/run-profile-selftest.sh 8132
bash tests/run-gallery-selftest.sh 8133
bash tests/run-team-selftest.sh 8134
bash tests/run-erp-selftest.sh 8135
bash tests/run-wl-selftest.sh 8136
bash tests/run-cs-selftest.sh 8139     # Color Studio vs a corrupt pp_studio store
bash tests/run-portfolio-selftest.sh 8138
bash tests/run-page-sweep.sh 8137   # every page, uncaught-JS-error sweep
bash tests/run-corrupt-sweep.sh 8172  # every page vs a hostile localStorage/sessionStorage seed

# Local preview
python3 -m http.server 8000
```

## Deploy

Deploys run via `.github/workflows/static.yml` on every push to `main`, which
uploads the repo root to GitHub Pages (`build_type: workflow`).

**Known blocker (verified 2026-10-19):** the `gahonsh-blip` account is **locked
due to a billing issue**, so no Actions runner will start — every deploy run since
2026-09-18 fails in ~3s with 0 steps and GitHub's own annotation *"The job was not
started because your account is locked due to a billing issue."* The live site is
therefore frozen at its 2026-08-15 build (`last-modified: Sat, 15 Aug 2026`), and
`erp.html` / `gallery.html` return 404 live although they exist in the repo.

This is an account-level lock, **not a code problem** — nothing in this repository
can fix it. It is also **not** a workflow/Pages misconfiguration: the workflow is
valid, the repo is public, and Pages is set to `build_type: workflow` on `main`.

**Why the billing page can look clean while the account is still locked.** A lock
is raised when a **payment authorization hold fails** — most often when a Copilot
free trial ends and the card is declined. Once `billing.lock` is set, GitHub
refuses to start hosted runners *even for a public repo on the Free plan with
$0 usage and 0 minutes consumed*. So "Payment history: —" and "$0 billable" are
consistent with a lock, not proof against one. (Same symptom reported in
community discussions #184077, #188932, #208297, #176249.)

**Fix path (account owner only):**
1. Settings → Billing and plans → Payment information: remove any frozen/invalid
   card, then add a valid one. If the page will not save, contact your bank to
   approve GitHub's authorization hold.
2. Settings → Billing and plans → Budgets: make sure the Actions budget is not
   pinned to $0 with "Stop usage" (that alone blocks Actions).
3. If the lock persists, open <https://support.github.com> → category *Billing*,
   include the username, this repo, the failed-run link, the exact error
   *"authorization hold failed"* + *"account is locked due to a billing issue"*,
   and note you are on the Free plan with no balance owed, so Support can clear
   `billing.lock`.
4. After the lock clears, re-run the workflow (Actions → *Deploy static content
   to Pages* → *Re-run all jobs*) or push a trivial commit to `main`.

**Workarounds that do NOT help:** switching Pages to *Deploy from a branch* — that
still runs on GitHub's Actions infrastructure and hits the same lock. Until the
lock clears, merging to `main` is enough — the site updates on the next successful
deploy. A local preview (`python3 -m http.server 8000`) or another host (Netlify /
Cloudflare Pages) can serve the site meanwhile.
