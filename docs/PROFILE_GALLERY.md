# Painter Profiles, Work Gallery & the Verified Work Record

How a Painter Plus crew member gets a professional, evidence-backed profile, and
why the numbers on it can be trusted.

Date: 2026-10-18

## The problem this solves

A painter's old profile page carried four hard-coded numbers — "10+ years",
"500+ projects", "5-yr warranty", "100% inspection". Every painter showed the
same four, and none of them were true of that painter. A client could not tell a
first-week helper from a fifteen-year veteran, and the Owner/Head had no single
place that showed who actually did the work.

This feature replaces the typed-in claims with two things:

1. a **gallery** the painter curates themselves — real photos of real work, with
   what/where/when; and
2. a **work record** the site *computes* from the day book — years, projects,
   square feet, days on site, co-workers, photos.

The gallery is a claim; the work record is evidence. The design keeps the two
visually and conceptually separate so a client always knows which is which.

## The idea, in one line

> Numbers a painter types are a claim. Numbers the site computes from the work
> log are evidence. Show both, and label them.

## Who it is for

| Role | What they get |
|------|---------------|
| **Painter / helper** | A profile they own. They add their own photos and edit their own details from their phone — no login, no passcode. |
| **Client / visitor** | A gallery of real, attributed work and a record that cannot be faked by typing, so a first-time visitor can judge the crew on proof. |
| **Owner / Head** | One screen per member showing real output, plus the ability to edit anyone's profile. |

## Pages and files

| Concern | File |
|---------|------|
| Gallery + work-record engine (pure, tested) | `js/gallery.js` |
| One member's profile page | `painter-profile.html` + `js/profile-page.js` |
| Whole-crew gallery | `gallery.html` + `js/gallery-page.js` |
| Team roster (with derived stats per card) | `team.html` + `js/team-page.js` |
| Roster model + self-claim helpers | `js/team.js` |
| Admin (roster, profile editor) | `admin.html` + `js/script.js` |
| Tests | `tests/gallery.test.js`, `tests/profile-selftest.js`, `tests/gallery-selftest.js`, `tests/team-selftest.js` |

## The work record — derived, never typed

`PPGallery.workRecord(memberId)` computes, from `painterPlusWorkLog`,
`painterPlusERP` and `painterPlusTeam`:

| Figure | How it is computed |
|--------|--------------------|
| **Years on the tools** | The member's declared `startYear` (set by the painter or an Owner/Head), else the earliest day on record. `currentYear − startYear`. |
| **Projects logged** | Distinct projects (`projectId` or `project` name) the member has a logged day on, resolved to a friendly name through the ERP projects. |
| **Area painted** | Sum of the member's *credited* square feet across all days. An entry tagged with a specific crew member counts for that member, not for the whole day's owner — so two people on one day each get their own share. |
| **Days on site** | Number of logged days the member appears on. |
| **Co-workers** | Everyone who logged on any project the member worked, across the crew. |
| **Work photos** | Number of photos in the member's gallery. |

Because these are recomputed on every render from the same store the ERP and
work log already use, the profile can never drift from the books. If a day is
edited, reopened or removed, the record follows.

### Why "credited entries" matters

The subtle bug caught by the tests: a day has an owner (`crew`) but individual
entries can be tagged to a different person. Naïvely summing the whole day for
the owner double-counts a shared day. `PPGallery.creditedEntries` /
`creditFor` split a day by entry tag, falling back to the day owner for
untagged entries. This is why the record shows 120 sq ft for a painter who
logged 100 sq ft and whose colleague logged 40 sq ft on the same day.

## The gallery — curated by the painter

`PPGallery` (in `js/gallery.js`) stores photos under `painterPlusGallery`,
keyed by member id:

```json
{
  "ramesh-kumar": [
    { "id": "…", "title": "Living room repaint", "photo": "data:image/jpeg;base64,…",
      "label": "Interior wall", "location": "Ranchi", "year": "2026",
      "finish": "Matte", "project": "Sharma House", "sqft": 120, "note": "", "at": "…" }
  ]
}
```

- A photo is either a **downscaled data-URL** (file upload, ≤1024px JPEG, same
  limit as the work log, so it fits the localStorage quota) or an **http(s)
  URL**.
- Public API: `list`, `get`, `count`, `add`, `remove`, `removeAll`, `feed`
  (every photo across the crew, newest first), plus the pure derivation helpers.
- Every attribute interpolation (`src`, `alt`, `data-id`, option `value`) goes
  through the local `escAttr()` — the shared text `esc()` does **not** escape
  quotes, and a photo URL is attacker-influenced data.

## Self-service: "this is me"

The roster is shared in `localStorage`, so any painter can claim their own
profile on their own device and edit it — no passcode.

- **Claim** stores the member id in `sessionStorage` (`ppClaimedMember`).
  `PPTeam.isMe(id)` is true for the claimed member.
- An **Owner/Head** signed in (the passcode gate) is "me" for *everyone*, so
  they can edit any profile.
- Claiming is a **convenience marker, not security**. Role changes still require
  the Owner/Head passcode, and the roster still guards against stranding the
  last lead. This matches the project's existing client-side-only model; the
  real protection is that the site is static and the roster is per-device.

The profile page shows the edit form only once this is "me"; otherwise it shows
a "This is me" prompt. The section heading changes accordingly
("Is this your profile?" vs "Edit my profile & gallery").

## The three surfaces

### 1. Member profile — `painter-profile.html?id=<memberId>`

- **Hero**: name, role badge, title, tagline, bio, contact links, avatar.
- **Work record**: the derived card band + date window + project chips.
- **Work gallery**: the member's photos in a grid; click opens a lightbox.
- **Painter tools**: the claim prompt and, once claimed, the profile editor and
  the photo adder, plus a list of the member's photos with remove buttons.
- **Role controls**: Owner/Head only (unchanged from before).

### 2. Crew gallery — `gallery.html`

Every photo across the whole crew, each captioned with its painter (linked back
to their profile) and its project. Filter by painter and by project. Newest
first. A closing call-to-action links to the quote form.

### 3. Team roster — `team.html`

Each member card now shows a derived evidence row, e.g.
`🗓️ 8+ yrs · 🏗️ 1 project · 📐 120 sq ft · 📸 1`. A member with no logged work
shows no row at all — the page never invents a number. A **Crew gallery** button
sits in the toolbar.

## Privacy and honesty guardrails

- The site never states a number a member did not earn. If the work log is
  empty, the record shows an empty-state message, not a zero-figure boast.
- Only the painter (or an Owner/Head) can add photos to a profile, and the
  profile page makes that relationship visible.
- `gallery.html` is public and in `sitemap.xml`. `painter-profile.html` is public
  (it is linked from the roster); the roster itself is per-device, so a public
  visitor sees the shipped default roster plus whatever they added locally.

## Verification

Everything is verified by running code, not by inspection.

Unit tests (Node, no dependencies):

```bash
node tests/gallery.test.js     # 24 passed — CRUD, feed, workRecord, creditFor
node tests/erp.test.js         # 54 passed
node tests/measure.test.js     # 16 passed
node tests/photo-studio.test.js# 50 passed
```

Browser self-tests (real DOM, real localStorage) — each script builds a
throwaway copy of the page with the harness appended, serves it, and prints a
URL; open it and read the `ok …` / `FAIL …` lines at the bottom:

```bash
bash tests/run-profile-selftest.sh 8132   # 25 checks — record + claim + edit + gallery + lightbox
bash tests/run-gallery-selftest.sh 8133   # 21 checks — cards, attribution, filters, lightbox, empty state
bash tests/run-team-selftest.sh    8134   #  9 checks — derived stats on roster cards
```

All three suites report **RESULT: ALL OK**. The profile suite confirms the
derived record (8+ yrs, 1 project, 120 sq ft, 1 co-worker), the claim flow, a
profile save, a gallery add with its sq-ft caption, the lightbox open/close and
the photo removal. The gallery suite confirms attribution to painter and
project, both filters, newest-first ordering and the empty state. The team suite
confirms the derived row matches `PPGallery.workRecord` and that a member with
no data shows no invented figures.

## Data model quick reference

`PPGallery` keys:

| Key | Contents |
|-----|----------|
| `painterPlusGallery` | `{ "<memberId>": [ item, … ] }` — the photos. |
| `painterPlusWorkLog` | The day book (owned by `js/worklog.js`). |
| `painterPlusERP` | Projects, approvals, bills (owned by `js/erp.js`). |
| `painterPlusTeam` | The roster (owned by `js/team.js`). |
| `ppClaimedMember` (session) | The member id this device is acting as. |

Member fields added by this work: `startYear` (a four-digit year string).

## What this does not do

- It does not measure square feet from a photo. That is the Color Studio
  estimator's job (`js/color-studio.js`), which sums typed dimensions; the work
  log's per-entry sq ft is entered or measured there and *this* feature only
  reports what was logged. Photo-based auto-measurement remains future work (see
  `docs/NEXT_STEPS.md`).
- It does not sync across devices. The roster and gallery live in the browser's
  `localStorage`; the shipped defaults are what a first-time visitor sees. This
  is the project's existing, documented model — no backend, no accounts.
