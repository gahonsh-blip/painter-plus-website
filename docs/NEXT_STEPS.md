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
