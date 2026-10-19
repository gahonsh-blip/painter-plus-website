# Next Steps — Recovery & Roadmap

> **Status: merge conflicts RESOLVED.** Every file in this repository is now
> clean — no Git conflict markers remain, and `js/script.js` parses correctly.
> Sections 1, 2, 3 and 5 are kept as a record of the recovery. Live decisions
> are in section 4; the checklist is in section 6; remaining follow-ups are in
> section 7.

---

## 1. What happened

A merge was started but never finished, leaving two versions of the site side
by side inside each file, separated by Git conflict markers that looked like
this (indented below so tooling does not mistake the example for a real
conflict):

```
 <<<<<<< HEAD
    (HEAD / older version)
 =======
    (incoming / newer version)
 >>>>>>> 6e6b6d... commit hash
```

Browsers and the Pages deploy rendered **both** versions as raw text, so the
site was undeployable. The markers have since been removed and one clean
version chosen per file.

---

## 2. Files that were resolved

| File | Resolution |
|------|------------|
| README.md | HEAD version, updated for the current structure |
| AGENTS.md | new file, never conflicted |
| index.html | HEAD version; Team nav link added |
| about.html | HEAD version; Team nav link added |
| services.html | HEAD version; Team nav link added |
| portfolio.html | HEAD version; Team nav link added |
| contact.html | HEAD version; Team nav link added |
| privacy.html | HEAD version; Team nav link added |
| css/style.css | HEAD version; role colour variables + team/role styles added |
| manifest.json | HEAD version; final domain + icons |
| sw.js | HEAD version; cache v8, team assets + maskable icon added |
| robots.txt | HEAD version; final domain |
| sitemap.xml | HEAD version; final domain + `team.html` entry |
| _headers | HEAD version; security headers kept |
| .gitignore | HEAD version |
| admin.html | HEAD version + Team & Roles tab |
| painter-profile.html | rebuilt as a per-member profile with Head-only role controls |
| team.html | new roster page |
| js/team.js, js/team-page.js, js/profile-page.js | new team/roles modules |
| js/script.js | HEAD version; stray brace removed (section 3) |

Confirm the repository is clean:

```bash
grep -rn "^<<<<<<< HEAD" . || echo "clean"
```

---

## 3. `js/script.js` syntax error — FIXED

A **stray closing brace** `}` sat between the FAQ-toggle block and the
service-worker registration block. It prematurely closed the
`DOMContentLoaded` callback, so theme toggle, menu, animations, FAQ and SW
registration all silently failed.

The stray brace has been deleted, so the SW block sits inside the
`DOMContentLoaded` callback. Validate any time with:

```bash
node --check js/script.js
```

---

## 4. Key decisions (resolved)

Before resolving conflicts, confirm:

1. **Which GitHub account is the source of truth?** ✅ **DECIDED: `gahonsh-blip`**
   → live domain: `https://gahonsh-blip.github.io/painter-plus-website/`
   → HEAD references `gahonsh-blip`; incoming references `gahonsh`. Use HEAD.

2. **Which path style?** ✅ **DECIDED: HEAD convention**
   Use absolute, project-prefixed paths (`/painter-plus-website/...`) for internal
   links and assets, matching the final live domain. Keep canonical/OG/sitemap
   URLs pointing at `https://gahonsh-blip.github.io/painter-plus-website/`.

3. **Contact form approach?** ✅ **DECIDED: Formspree**
   `contact.html` posts to `https://formspree.io/f/xeebvvko`. If the form ID
   changes, update the `action` attribute. Contact details are also shown for
   visitors who prefer phone, email or WhatsApp.

4. **PWA icons?** ✅ **DECIDED: keep the icon entries**
   `images/icon-192.png`, `images/icon-512.png` and
   `images/icon-maskable-512.png` all exist and are referenced by
   `manifest.json`. `sw.js` caches all three, so the service worker install
   cannot fail on a missing asset.

---

## 5. Recovery procedure (completed — kept for reference)

For each conflicted file, choose ONE clean version. **Since the owner confirmed
the account is `gahonsh-blip` and the HEAD path convention, prefer the HEAD
version of each file** (it already uses `gahonsh-blip` and absolute
`/painter-plus-website/...` paths). Then patch in any good content that exists
only on the incoming side (richer meta tags, accessibility attributes) without
switching the account or path style.

Suggested order (dependencies first):

1. **`css/style.css`** — resolve so pages look right.
2. **`js/script.js`** — fix the stray brace (section 3).
3. **`manifest.json`** — pick one version; set final `start_url`/`scope`
   and resolve icons.
4. **`sw.js`** — pick one version; align cache paths with chosen path style.
5. **`robots.txt`** and **`sitemap.xml`** — set final live domain.
6. **`_headers`** — keep the security headers, drop the marker.
7. **HTML pages** (index, about, services, portfolio, contact, privacy):
   - Use relative paths (`./`) for nav, CSS, JS, manifest links.
   - Use absolute canonical/OG URLs to the final live domain.
   - Apply the business details from `AGENTS.md` (phone, email, address).
   - Fix garbled emoji (`??` -> real emoji).
   - For `index.html`: keep the homepage JSON-LD LocalBusiness schema.
   - For `contact.html`: apply the chosen form approach (section 4.3).
8. **Verify** with the checklist in section 6.

### Merge helper commands

```bash
# List files still containing markers
grep -rln "^<<<<<<< HEAD" .

# After editing, confirm none remain
grep -rn "^<<<<<<< HEAD\|^=======$\|^>>>>>>>" . || echo "clean"
```

---

## 6. Verification checklist

- [ ] `grep -rn "^<<<<<<< HEAD" . ` returns nothing.
- [ ] `node --check js/script.js` passes (no syntax error).
- [ ] All pages open with no console errors.
- [ ] Dark/light theme toggle works on every page.
- [ ] Mobile menu opens and closes.
- [ ] Scroll progress bar and reveal-on-scroll animations work.
- [ ] FAQ accordion works (homepage).
- [ ] WhatsApp float link uses `https://wa.me/918825183628`.
- [ ] Contact form submits (if Formspree wired up) or shows details cleanly.
- [ ] Service worker registers; `offline.html` shows when offline.
- [ ] `sitemap.xml`, `robots.txt`, `manifest.json` all reference the final
      live domain consistently.
- [ ] `manifest.json` icon files exist in `images/` (or entries removed).
- [ ] No garbled `??` emoji in visible content.
- [ ] GitHub Pages deploy workflow succeeds.

---

## 7. Optional future improvements (after recovery)

- Add real project photos to `portfolio.html` and `images/`.
- Replace `images/og-image.svg` with a 1200x630 PNG/JPG for better social
  sharing previews.
- ~~Generate proper PWA icons (192/512/maskable).~~ Done — icons are in `images/`.
- Add a lightweight form handler (Formspree / Netlify Forms / Google Forms)
  and spam protection (honeypot field).
- Add structured data (LocalBusiness) to all pages, not just the homepage.
- Improve accessibility: aria labels on all interactive controls, focus
  styles, color-contrast audit.
- Add a sitemap link in the footer and a "skip to content" link.
- Set up Lighthouse/CI checks in the GitHub Actions workflow.

---

## 8. Painter profiles & work gallery (done — 2026-10-18)

The profile page's four hard-coded stats ("10+ years", "500+ projects") were
replaced with an evidence-backed profile. See `docs/PROFILE_GALLERY.md`.

- **`js/gallery.js`** (`window.PPGallery`) — photo CRUD, a whole-crew `feed`,
  and `workRecord()` which *derives* years, projects, square feet, days,
  co-workers and photo count from the work log + ERP + roster.
- **`painter-profile.html` + `js/profile-page.js`** — derived work record, a
  photo gallery with a lightbox, and gated self-editing (a painter claims their
  own profile with `PPTeam.claim`; an Owner/Head can edit anyone).
- **`gallery.html` + `js/gallery-page.js`** — the whole crew's photos, each
  attributed to its painter and project, filterable by both.
- **`team.html`** — roster cards now carry a derived evidence row.
- **`js/team.js`** — added `startYear`, the self-claim helpers and `isManager`;
  cleared the old typed-in stat defaults.
- **Tests** — `node tests/gallery.test.js` (24) plus browser self-tests
  `tests/run-profile-selftest.sh` (25), `tests/run-gallery-selftest.sh` (19),
  `tests/run-team-selftest.sh` (8); all report **ALL OK**.

Still open (future): photo-based square-foot *measurement* — the record reports
what was logged, it does not measure the picture. That is the Color Studio /
`js/measure.js` territory.

---

## 9. Optional future improvements (continued)

---

## 10. ERP hardening & automated browser checks (done — 2026-10-18)

A fourth pass over the ERP/work-log data flow, plus a way to re-run the browser
self-tests automatically. Full detail is in `docs/BUG_AUDIT.md` §25–§28.

- **Bug 25 — a project rate change re-billed an approved day.** An approval's
  fingerprint only covered the *day's own* rates, so changing the linked
  project's rate changed the money but kept the sign-off. `effectiveRates()` is
  now the single source of truth for "which rate applies" and feeds both the
  costing and the fingerprint, so any project-costing change withdraws the
  approval.
- **Bug 26 — portfolio-merge injection.** Admin-typed project fields reached
  `portfolio.html` unescaped (photo URL broke out of the `<img>` attribute; the
  description fields were raw HTML; the hover image was concatenated into a CSS
  `url()`). Every field now goes through `esc()`, and `--pf-img` is set through
  the CSSOM with quotes/parens/backslashes stripped.
- **Bug 27 — a failed save claimed success.** The storage helpers already
  swallowed a blocked/full write; now they *return* whether it landed, and every
  mutator returns `{ ok:false, error: STORAGE_ERROR }` so the UI can say so.
- **Bug 28 — headless runner.** `tests/run-all-headless.sh` builds every
  throwaway page, serves the repo once, drives headless Chromium and exits
  non-zero on any FAIL. `tests/portfolio-selftest.js` +
  `run-portfolio-selftest.sh` cover bug 26 and were shown to fail (9 FAILs) on
  the pre-fix code.

Verification: `node` suites green (erp 58, gallery 24, measure 16,
photo-studio 50) and `bash tests/run-all-headless.sh` →
**ALL BROWSER CHECKS PASSED**. Service-worker cache bumped `v21` → `v22`.

### Sixth pass (2026-10-18) — ERP reporting + Color Studio

Nine more bugs, all reproduced before fixing; see `docs/BUG_AUDIT.md` §29–37.

- **Bug 29 — crew ids in reports.** The work log stores `crew` as the member
  **id**; the ERP printed it raw, so reports showed `ramesh-kumar` and split one
  person (id vs legacy name) into two rows. `PPERP.crewIdentity()`/`crewName()`
  resolve through `PPTeam`; the painter report groups by identity.
- **Bug 30 — "awaiting approval" counted open days.** The KPI money swept in
  days still being edited and disagreed with its own subtitle. Days now split
  `approved` / `pending` (submitted) / `open` / `rejected`; only submitted days
  are pending, and the dashboard gained an "Open (in progress)" KPI.
- **Bug 31 — invoice printed `₹0/sq ft`.** `billedRateInfo()` now quotes the rate
  the work was actually costed at (project rate, else day rate).
- **Bug 32 — a day billed under two projects.** `dayMatchesProject` no longer
  falls through to a name match when a `projectId` is present.
- **Bug 33 — Color Studio swatch never highlighted.** `hexToRgb` now parses the
  browser's `rgb(...)`; a saved palette colour highlights its swatch again.
- **Bug 34 — same-millisecond project-id collision.** `uniqueProjectId()` loops
  until the id is free.
- **Bug 35 — `billTotal()` dropped paint.** It now returns `totals.total`.
- **Bug 36 — decorative image on the SW-install path.** `sw.js` precaches
  per-asset so one missing file cannot reject the whole install.
- **Bug 37 — work-log summary printed the crew id.** It now shows the name.

Verification: `node tests/erp.test.js` **64/64** (six new regressions + seven
existing tests updated to the corrected bucket model), gallery 24, measure 16,
photo-studio 50, and `bash tests/run-all-headless.sh` →
**ALL BROWSER CHECKS PASSED**. The Color Studio and ERP fixes were each confirmed
in real headless Chromium (`activeSwatches` 0 → 1; the KPI and Painter report now
agree and show names). Service-worker cache bumped `v23` → `v24`.

### Deploy status (verified 2026-10-19)

The merge to `main` succeeded, but **deploy is still blocked by the account's
billing lock** — not by code. Proof pulled from GitHub's own API today:

- The deploy job for merge commit `1c92b32` (run #31) failed in **3 s with 0
  steps** and the annotation *"The job was not started because your account is
  locked due to a billing issue."*
- The live site's `last-modified` is **Sat, 15 Aug 2026** (frozen), and both
  `erp.html` and `gallery.html` return **404** live though they exist in the repo.
- The repo is public, Pages is `build_type: workflow` on `main`, and the workflow
  is valid — so this is **not** a workflow/Pages misconfiguration.

The lock is raised by a **failed payment authorization hold** (typically a Copilot
trial ending with a declined card), so it persists even on the Free plan with $0
usage and 0 minutes — a clean billing page does not rule it out. Only the account
owner can clear it: Billing → Payment information (remove the frozen card, add a
valid one), check the Actions budget is not pinned to $0, then — if it persists —
open a Billing ticket at <https://support.github.com>. After it clears, re-run the
workflow or push a trivial commit. Switching Pages to *Deploy from a branch* will
**not** help: that still uses GitHub's Actions infrastructure. Full detail in
`AGENTS.md` → *Deploy*.
