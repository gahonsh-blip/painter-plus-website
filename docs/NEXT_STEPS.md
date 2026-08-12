# Next Steps — Recovery & Roadmap

> **Read this first.** The repository is currently broken: almost every file
> contains unresolved Git merge-conflict markers, and `js/script.js` has a
> syntax error. This document lists every affected file and gives a
> step-by-step recovery plan that any developer or AI agent can follow.

---

## 1. Why the site is broken

A merge was started but never finished. Two versions of the site were left
side by side inside each file, separated by conflict markers:

```
<<<<<<< HEAD
   (HEAD / older version)
=======
   (incoming / newer version)
>>>>>>> 6e6b6d... commit hash
```

Browsers and the Pages deploy show **both** versions as raw text, so the site
is undeployable. Until every marker is removed and a single clean version is
chosen, no other work matters.

---

## 2. Affected files (verified)

The following files contain conflict markers and must be resolved:

| File | Conflict lines (approx) |
|------|--------------------------|
| README.md | already fixed |
| AGENTS.md | new file, no conflict |
| index.html | 1 / 202 / 447 |
| about.html | 1 / 67 / 175 |
| services.html | 1 / 64 / 190 |
| portfolio.html | 88 / 214 |
| contact.html | 1 / 99 / 203 |
| privacy.html | 1 / 55 / 152 |
| css/style.css | 1 / 432 / 709 |
| manifest.json | whole file |
| sw.js | whole file |
| robots.txt | whole file |
| sitemap.xml | whole file |
| _headers | top marker |

Files that are **clean** (no conflicts):
- terms.html
- offline.html
- js/script.js (but has a syntax error — see section 3)
- .github/workflows/static.yml
- images/og-image.svg

### Find them yourself

```bash
grep -rln "^<<<<<<< HEAD" .
```

---

## 3. `js/script.js` syntax error (separate from conflicts)

There is a **stray closing brace** `}` between the FAQ-toggle block and the
service-worker registration block. It prematurely closes the
`DOMContentLoaded` callback, so theme toggle, menu, animations, FAQ, and SW
registration all silently fail.

Current (broken) structure:

```js
    // ----- FAQ TOGGLE -----
    document.querySelectorAll('.faq-item').forEach(item => { ... });

    }   // <-- THIS stray brace must be removed

    // ----- SERVICE WORKER REGISTRATION (PWA) -----
    if ('serviceWorker' in navigator) { ... }
```

Fix: delete the standalone `}` line so the SW block sits inside the
`DOMContentLoaded` callback. Then validate:

```bash
node --check js/script.js
```

---

## 4. Key decisions to make (ask the owner)

Before resolving conflicts, confirm:

1. **Which GitHub account is the source of truth?** ✅ **DECIDED: `gahonsh-blip`**
   → live domain: `https://gahonsh-blip.github.io/painter-plus-website/`
   → HEAD references `gahonsh-blip`; incoming references `gahonsh`. Use HEAD.

2. **Which path style?** ✅ **DECIDED: HEAD convention**
   Use absolute, project-prefixed paths (`/painter-plus-website/...`) for internal
   links and assets, matching the final live domain. Keep canonical/OG/sitemap
   URLs pointing at `https://gahonsh-blip.github.io/painter-plus-website/`.

3. **Contact form approach?** ⏳ STILL OPEN
   - HEAD version: Formspree form (needs a real form ID).
   - Incoming version: no form, only contact details.
   Decide whether to wire up Formspree or just show contact details.

4. **PWA icons?** ⏳ STILL OPEN
   Add `images/icon-192.png` and `images/icon-512.png`, or drop the icon entries
   from `manifest.json`.

---

## 5. Step-by-step recovery procedure

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
- Generate proper PWA icons (192/512/maskable).
- Add a lightweight form handler (Formspree / Netlify Forms / Google Forms)
  and spam protection (honeypot field).
- Add structured data (LocalBusiness) to all pages, not just the homepage.
- Improve accessibility: aria labels on all interactive controls, focus
  styles, color-contrast audit.
- Add a sitemap link in the footer and a "skip to content" link.
- Set up Lighthouse/CI checks in the GitHub Actions workflow.
