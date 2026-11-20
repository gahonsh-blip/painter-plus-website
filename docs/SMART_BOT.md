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

Replies follow the question's script: Devanagari → Hindi, otherwise English.
Hinglish keywords work in both modes ("kitna kaam", "mera paisa").

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

Pages load `js/smart-bot.js?v=N`. Raise `N` after changing the file so browsers
pick up the new build.
