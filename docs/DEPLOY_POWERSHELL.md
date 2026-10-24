# Deploying Painter Plus from Windows (PowerShell)

This is the practical run-book for pulling the code with `git` on Windows and
publishing the site from a PowerShell terminal.

Read the two warnings first — they are the only ways this deploy goes wrong.

> **Warning 1 — never upload the whole repository.**
> `AGENTS.md`, `README.md`, `docs/` and `tests/` document the staff passcode and
> the entire internal architecture. On GitHub Pages this was already a real leak
> (the files were served live at `/AGENTS.md` and `/README.md`) until the deploy
> workflow started staging a public-only folder. Copy **only** the public set
> listed in Step 3.

> **Warning 2 — GitHub Pages is locked, not broken.**
> The `gahonsh-blip` account is locked on a billing issue, so GitHub will not
> start a runner: every deploy fails in ~3 s with 0 steps and the site stays
> frozen at its 2026-08-15 build. Pushing to `main` does nothing until the lock
> clears. Use Netlify / Cloudflare Pages (Step 4b) meanwhile.

---

## Step 0 — Prerequisites

| Tool | Why | Check |
|------|-----|-------|
| Git for Windows | clone the repo | `git --version` |
| Python 3 | local preview only (`http.server`) | `py --version` |

No Node, npm, or build step is needed. The site is plain HTML + CSS + vanilla JS.

---

## Step 1 — Clone the repository

The repository is **public**, so the clone needs no login:

```powershell
cd C:\
git clone https://github.com/gahonsh-blip/painter-plus-website.git
cd C:\painter-plus-website
```

Confirm you have the merged fixes (the `hidden`-attribute fix, `v29` cache):

```powershell
git log --oneline -3
Select-String -Path sw.js -Pattern "CACHE_NAME"
```

Expected: top commit is the merge of PR #17, and the cache line reads
`painter-plus-v29`. If you see an older cache version, run `git pull`.

---

## Step 2 — Preview locally before publishing

`file://` will not work — the service worker and `fetch` need a real HTTP
server. Start one:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000/>. Check the homepage, `color-studio.html`,
`team.html`, `gallery.html`. Press `Ctrl+C` in the terminal to stop.

---

## Step 3 — Stage the public files (the safe copy)

This mirrors exactly what the GitHub Actions workflow stages. Run it as-is:

```powershell
$src = "C:\painter-plus-website"
$out = "C:\painter-plus-deploy"

Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $out | Out-Null

Copy-Item "$src\css", "$src\js", "$src\images" -Destination $out -Recurse -Force
Copy-Item "$src\*.html" -Destination $out -Force
Copy-Item "$src\manifest.json", "$src\sw.js", "$src\robots.txt", `
          "$src\sitemap.xml", "$src\_headers" -Destination $out -Force
```

Verify nothing internal slipped in:

```powershell
$bad = Get-ChildItem $out -Recurse -File |
       Where-Object { $_.Name -in @('AGENTS.md','README.md') -or
                      $_.Name -like '*.test.js' -or
                      $_.Name -like '*-selftest.js' -or
                      $_.Name -like 'run-*.sh' }
if ($bad) { Write-Error "LEAK: internal files staged"; $bad.FullName }
else      { "clean - no internal files staged" }
```

You should see `clean - no internal files staged`. `C:\painter-plus-deploy`
should contain 15 `.html` files, plus `css\`, `js\`, `images\`, `manifest.json`,
`sw.js`, `robots.txt`, `sitemap.xml`, `_headers`.

---

## Step 4 — Publish

### 4a. Netlify Drop (fastest, no account needed to start)

1. Open <https://app.netlify.com/drop>.
2. Drag the **`C:\painter-plus-deploy`** folder onto the page.
3. Netlify gives you a URL in a few seconds.
4. Claim the site (sign in) if you want to keep it and set a custom domain.

Netlify **honours `_headers`**, so the CSP, `X-Frame-Options` and
`nosniff` security headers take effect (GitHub Pages ignores that file).

### 4b. Cloudflare Pages

1. <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** →
   **Pages** → **Upload assets**.
2. Name the project, upload the contents of `C:\painter-plus-deploy`.
3. `_headers` is honoured here too.

### 4c. GitHub Pages (once the billing lock clears)

Do **not** drag files into the repo. The existing workflow already does the
right thing — push to `main` and let it stage the public folder:

```powershell
cd C:\painter-plus-website
git push origin main
```

Then **Actions → "Deploy static content to Pages" → Re-run all jobs**. A green
run publishes to <https://gahonsh-blip.github.io/painter-plus-website/>.

---

## Step 5 (optional) — Point the site at its new domain

Canonical URLs, Open Graph tags and `sitemap.xml` currently name the GitHub
Pages domain. If you deploy on Netlify/Cloudflare and want correct SEO, rewrite
them in the **staged copy** (never in the repo) before uploading:

```powershell
$newHost = "https://your-site.netlify.app"   # <- edit this
Get-ChildItem $out -Recurse -File -Include *.html, *.xml, *.txt |
  ForEach-Object {
    $t = Get-Content $_.FullName -Raw
    $t = $t -replace 'https://gahonsh-blip\.github\.io/painter-plus-website', $newHost
    Set-Content -Path $_.FullName -Value $t -NoNewline
  }
```

Skip this step for a quick preview — the site works fine with the old canonical
URL; only search-engine metadata points elsewhere.

---

## Step 6 — Verify the deploy

Open the new URL and check:

- [ ] Homepage loads with styling (not a bare HTML page).
- [ ] `color-studio.html` — pick a surface, type a size, see the square feet.
- [ ] `team.html` and `gallery.html` load (these 404 on the frozen live site).
- [ ] `worklog.html` and `erp.html` show the **"🔒 Crew login"** card.
- [ ] DevTools → Console has **no** red errors on any page.
- [ ] `robots.txt`, `sitemap.xml`, `manifest.json` return 200.
- [ ] `/AGENTS.md` and `/README.md` return **404** (proof the leak is closed).

Quick header/status check from PowerShell:

```powershell
$site = "https://your-site.netlify.app"   # <- edit this
foreach ($p in @('', 'team.html', 'gallery.html', 'worklog.html',
                 'erp.html', 'manifest.json', 'AGENTS.md', 'README.md')) {
  $r = Invoke-WebRequest "$site/$p" -SkipHttpErrorCheck
  "{0,3}  /{1}" -f $r.StatusCode, $p
}
```

Expected: `200` for every real page, `404` for `AGENTS.md` and `README.md`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bare page, no CSS | `css/` not copied | re-run Step 3 |
| `team.html` 404 on the **live GitHub** site | deploy frozen at 2026-08-15 | billing lock — Step 4a/4b |
| GitHub Action fails in ~3 s, 0 steps | account billing lock | clear it, or deploy elsewhere |
| Old colours/code after a redeploy | service-worker cache-first | bump `CACHE_NAME` in `sw.js`, or hard-reload (`Ctrl+Shift+R`) |
| `/AGENTS.md` returns 200 | whole repo uploaded | **fix immediately** — use Step 3 staging |
| Page blank in `file://` | SW/fetch need HTTP | use `py -m http.server` |

---

## What must never be published

- `AGENTS.md`, `README.md` — document the staff passcode and internals.
- `docs/` — `BUG_AUDIT.md`, `NEXT_STEPS.md`, `PHOTO_AREA_MEASUREMENT.md`,
  `PROFILE_GALLERY.md`.
- `tests/` — harnesses, the passcode hash helper, the corrupt-store seed.
- `.github/` — the workflow.

The staged folder from Step 3 excludes all of these by construction. The
`if ($bad)` check in Step 3 is the backstop — never skip it.
