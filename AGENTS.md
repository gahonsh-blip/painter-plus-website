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

13. **Real square feet from the photo — ADDED.** The work log could only take a typed length × height; the "square feet from the photo" feature was not implemented (the old photo system had no polygon/measure code and no Firebase — the data lives in `localStorage`). `js/measure.js` now measures a tapped polygon with perspective correction (4-corner calibration → homography → shoelace), and the day carries a labour rate and paint coverage so the area turns into a labour cost and a paint estimate. Geometry is unit-tested in `tests/measure.test.js`.

14. **ERP saves silently did nothing in the browser — FIXED.** `js/erp.js` used the UMD wrapper `(function (root, factory) { const api = factory(); … })(window, function () { … })`, but the factory body reached for `root` (to get `window.localStorage`) and `root` was never passed in, so it was `undefined`. Node tests passed because they inject an in-memory store via `_setStore`, which short-circuits before `root` is touched; in a real browser every `saveProject`/`approveDay`/`addBill` reported `ok: true` yet persisted nothing, because `backing()` returned `null`. The factory now receives `root` (`factory(root)`, `function (root) { … }`), and `tests/erp.test.js` loads the file in a browser-like `vm` context to prove a save reaches `window.localStorage`. `js/measure.js` and `js/photo-studio.js` share the wrapper shape but never reference `root`, so they were unaffected.

15. **Stale approval — FIXED.** An approved day kept its approval after being reopened and edited, so the bill counted the new measurements under the old sign-off. An approval now stores a `sig` fingerprint of the day it signed; `approvalOf()` reports `pending` when the day no longer matches, and `reopenDay()` calls `PPERP.clearApproval()`. See §17.

16. **Invoice id collision — FIXED.** `addBill()` used `Date.now()` alone, so two bills raised in the same millisecond shared an id and deleting one deleted both. The id now appends a random suffix. See §18.

17. **Invoice number reuse — FIXED.** The number came from `list.length`, so deleting `PP-001` made the next bill `PP-002` again. `nextBillNo()` now returns one past the highest number ever used. See §19.

18. **Rejected work counted as pending — FIXED.** `overview()` folded rejected labour into `unbilledLabour`, so the dashboard advertised rejected money as awaiting approval. It now reports `rejectedSqft` / `rejectedLabour` separately. See §20.

19. **Blank project rate zeroed the day's labour — FIXED.** `dayCosting()` used `project ? num(project.rate) : num(day.rate)`, so a project whose *Labour rate* was left blank (normalises to `rate: 0`) discarded the rate the crew had entered on the day — a ₹1,200 day billed as ₹0 the moment it was linked to a rate-less project. It now falls back with `(project && num(project.rate)) || num(day && day.rate)`, exactly as `coverage`/`coats` already did. See §21.

20. **ERP vs work log paint divergence — FIXED.** The work log computes litres via `PPMeasure.paintLitres()`; the ERP hardcoded its own `× 1.1`. They agreed only while the shared wastage default stayed `0.1`. `PPERP.dayCosting()` now delegates to `PPMeasure.paintLitres()` (with an identical fallback for Node), so the two can never quote different quantities. See §22.


**Pattern to watch for:** this codebase loads page-specific scripts site-wide (`color-studio.js` on `index.html`). Any unguarded top-level access — a missing DOM id, a throwing `localStorage` call — aborts the *entire file* and silently kills unrelated features. Always guard, and prefer feature-detection over assuming the DOM or storage is present. Also: `esc()` is for text nodes — inside a quoted attribute you must escape quotes too (`escAttr`). And a UMD wrapper must actually pass its global into the factory: `factory()` with a body that uses `root` passes in Node (where the in-memory store hides it) and fails silently in the browser.

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
| ERP | `erp.html` + `js/erp.js` (`window.PPERP`) + `js/erp-page.js` — the layer above the work log: projects, approvals, billing (**approved work only**) and daily/project/painter reports |
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
- Tests: `node tests/measure.test.js` covers the shoelace, flat calibration and
  perspective recovery (a skewed photo of a 10×6 ft wall must still measure
  60 sq ft), plus the costing maths.

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

- A day can only be approved once it is **final-submitted** (`canApprove(day)`
  checks `day.status === 'submitted'`) — an open day is still being edited.
- **An approval is bound to the measurements it signed.** `setApproval()` stores a `sig` fingerprint of the day (`daySignature()`); `approvalOf()` returns `pending` (with `stale: true`) whenever the day no longer matches — i.e. it was reopened and edited after approval. `PPWorkLog.reopenDay()` also calls `PPERP.clearApproval(date)`. Never remove this: without it, an approved day could be edited and the *old* sign-off would still bill the *new* amount. (An approval with no `sig` — written before this existed — is honoured as-is.)
- **Invoice ids and numbers must stay unique.** `addBill()` appends a random suffix to the id, and `nextBillNo()` derives the number from the highest `PP-nnn` ever used (never the list length), so deleting an invoice neither collides nor frees its number for reuse.
- A day links to a project by `day.projectId` **first**, then by the free-text
  `day.project` name (`dayMatchesProject`), so days logged before projects
  existed still appear in a project's bill and reports.
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
  unit-tested. Tests: `node tests/erp.test.js`.
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
- **Self-service, not security.** `PPTeam.claim(id)` stores the member id in
  `sessionStorage` (`ppClaimedMember`); `PPTeam.isMe(id)` is true for that
  member, or for anyone when an Owner/Head is signed in. A painter edits their
  own profile from their phone with no passcode; role changes still need the
  Owner/Head gate, and the roster still guards the last lead.
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
- Preserve the PWA behavior (service worker + manifest) when editing.
- After edits, run the verification checklist in `README.md` and `docs/NEXT_STEPS.md`.

## Useful commands

```bash
# Find remaining conflict markers across the repo
grep -rn "^<<<<<<<\|^=======\|^>>>>>>>" .

# Quick syntax check of the JS (requires node)
node --check js/script.js

# Pure unit tests (no dependencies)
node tests/gallery.test.js && node tests/erp.test.js && node tests/measure.test.js && node tests/photo-studio.test.js

# Browser self-tests (open the printed URL, read the ok/FAIL lines)
bash tests/run-profile-selftest.sh 8132
bash tests/run-gallery-selftest.sh 8133
bash tests/run-team-selftest.sh 8134

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
