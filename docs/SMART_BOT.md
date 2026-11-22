# Smart Bot (client + painter modes)

Floating assistant on the public pages. One script, no dependencies:
`js/smart-bot.js`. It reads the site's **live** data on every message — there is
no copied knowledge base, so nothing it says can go stale.

## Two modes

**👤 Client (default)** — no code, no login. Answers from live data:

| Question | Source |
| --- | --- |
| Services, warranty, experience, process | site content + `PPTeam.ownerDefaults()` |
| Phone, email, address, WhatsApp | `PPTeam.ownerDefaults()` / head member |
| Team size and roles | `PPTeam.list()` |
| Portfolio count + recent titles | `painterPlusProjects`, `PPERP.listProjects()` |
| Review average and count | `painterPlusReviews` |
| Colour studio, gallery, booking | page links |

Rates are never invented: the bot explains that pricing follows a free site
inspection and a written quote, then hands over contact details.

**🎨 Painter** — the guest taps "Painter", enters their **painter code** (the
member id, e.g. `gahonsh`), then the **staff passcode**. Only then:

- profile (name, role, phone, start year, profile link)
- work log: total days, submitted vs open, total sqft, recent days
- earnings: approved / awaiting approval / invoiced (from `PPERP.reportByPainter`)
- assigned projects
- pending days awaiting submission or approval

### Why the passcode step exists

A member id is public — it is in profile URLs. Showing earnings or attendance
to anyone who types `gahonsh` would leak private data. The passcode check uses
the same digest gate as the rest of the staff pages (`PPTeam.unlockHead`), so no
second secret is introduced and no passcode is ever stored by the bot.

## Live data, not a snapshot

Every answer calls the readers again:

```
PPTeam.list() / get() / roleOf() / ownerDefaults()
PPWorkLog.listDays()          → falls back to localStorage 'painterPlusWorkLog'
PPERP.listProjects() / reportByPainter() → falls back to 'painterPlusERP'
localStorage: painterPlusProjects, painterPlusReviews
```

Because this is a static site with no backend, the data a painter sees is the
data in **their own browser's** localStorage. A painter who has never opened the
admin/worklog pages on that device will see an empty work log — that is a
storage model limitation, not a bot bug. Real cross-device data needs a backend.

## Language

The reply language follows the question, message by message:

- **Devanagari** → Hindi reply.
- **Roman Hindi / Hinglish** (`kya`, `hai`, `kitna`, `kahan`, `paisa`, `kaam`,
  `din`, `chahiye` …) → Hindi reply.
- **Everything else** → English reply.

Only unambiguous Hindi markers are used, so an English question containing
"do", "me", "to" or "par" still gets an English answer. `detectLang()` is the
single decision point, and `tests/smart-bot.test.mjs` covers Devanagari,
Hinglish, English and mixed input.

Follow-ups such as "aur batao" / "more details" reuse the previous topic
instead of being treated as an unknown question.

## Unknown questions

The bot never guesses. It says the information is not in the system, offers the
phone/WhatsApp, and logs the question to `localStorage["ppBotGaps"]`
(last 200). Read or clear it from the console:

```js
PPBot.gaps(); PPBot.clearGaps();
```

## Console helpers

```js
PPBot.ask('warranty?')        // client-mode answer object
PPBot.members()               // live roster
PPBot.painter('gahonsh')      // { member, days } or null
PPBot._internals.session()    // current mode/step
```

## Fixed during the build

- **Keyword substring bug** — `"gold paint"` matched the `old` keyword and
  answered the experience question. Keywords now match on word boundaries.
- **Plural chips fell through** — `kwHit()` required an exact word, so the
  **"My earnings"** / **"My projects"** chips (plural) matched no intent and
  returned the generic summary. English keywords now accept a plural `s`/`es`.
- **"My earnings" never found the row** — `painterReport()` looked for
  `key/id/memberId/painter`, but `PPERP.reportByPainter()` exposes `crewId` (the
  id) and `crew` (the name). Every painter was told nothing was recorded. It now
  checks `crewId` first, case-insensitively.
- **The money fields were wrong** — the bot read `approvedTotal` /
  `pendingLabour` / `invoicedTotal`, which the report never returned. The report
  now exposes `pendingTotal` / `invoicedTotal` (and per-field labour + paint),
  and the bot sums labour + paint when no pre-summed total is present — so a
  paint-only job is no longer reported as ₹0.
- **The button covered WhatsApp** — both the assistant and the WhatsApp pill
  were pinned bottom-right. The assistant (button and panel) now lives
  bottom-left, so neither covers the other.
- **Dead link** — the reviews answer pointed at `reviews.html`, which does not
  exist; it now points at the home page's reviews section.
- **Confusing passcode prompt** — a full question typed at the passcode step
  was answered with "wrong passcode"; it now asks for the passcode first.
- **Empty-state answers** — a missing roster/work log/ERP now degrades to an
  honest "not recorded yet" instead of a blank bubble.

## Tests

`node tests/smart-bot.test.mjs` (stubs the DOM, storage and the PP modules)
covers client intents, the full painter unlock flow, the no-passcode leak guard,
and the gap log.

## Bumping the widget

Pages load `js/smart-bot.js` unversioned, and the service worker precaches it.
After changing the file, bump `CACHE_NAME` in `sw.js` (currently
`painter-plus-v38`) so a returning visitor gets the new build. If a page ever
adds a `?v=N` query again, raise `N` as well.
