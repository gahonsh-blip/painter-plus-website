# Ratings & Reviews — `js/reviews.js` (`window.PPReviews`)

A Google-reviews-style rating layer that sits on top of the account system
(`js/auth.js`). Signed-in crew members and clients can rate and review three
kinds of subject:

| Subject type | `subjectKey` | Who it belongs to |
|--------------|--------------|-------------------|
| `painter` | `painter:<rosterMemberId>` | a crew member (`js/team.js`) |
| `project` | `project:<projectId>` | an ERP / portfolio project |
| `company` | `company:painter-plus` | Painter Plus itself (fixed key) |

The engine is DOM-free and unit-tested (`tests/reviews.test.js`); the renderer
(`js/reviews-page.js`) mounts the widgets; the CSS lives in the
"RATINGS & REVIEWS" block at the end of `css/style.css`.

## The rules (why a rating is worth something)

A rating is only useful if it cannot be gamed. The engine enforces:

1. **Signed-in and active only.** An anonymous visitor can read every rating
   but can never submit one. A `pending` / `suspended` / `rejected` account
   cannot rate (`ERR.NOT_ACTIVE`).
2. **One review per account per subject.** A second submit **edits** the first,
   so a member can change their mind but cannot stuff the ballot.
3. **No self-review.** A painter cannot rate their own profile
   (`ERR.SELF`). A member's own member id is `account.memberId`.
4. **The score is clamped** to a whole 1–5; the text is length-capped
   (`MAX_TEXT`).
5. **An Admin/Head moderates.** They may hide (and unhide) or delete any
   review. A **hidden** review stays in the store but is excluded from the
   public average and from `visibleFor()`. An edited review is re-shown
   automatically.

Every write goes through `submit()` / `removeOwn()` / `setHidden()` / `remove()`
which re-check the account — the renderer only *hides* controls, it is never the
security.

## Data shape (key: `painterPlusReviews`)

```js
{
  "<subjectType>:<subjectKey>": [
    { id, type, key, author, authorId, score, text, at, editedAt,
      hidden, hiddenBy }
  ]
}
```

`authorId` is the account id; `author` is a display-name snapshot so a review
survives the account being removed. `at`/`editedAt` are epoch millis.

## Public API

```js
PPReviews.summary(type, key)   // { count, average, sum, dist:{1..5}, hidden }
PPReviews.average(type, key)   // number, 1 dp
PPReviews.count(type, key)     // visible reviews
PPReviews.listFor(type, key)   // every review (incl. hidden), newest first
PPReviews.visibleFor(type, key)// hidden removed
PPReviews.reviewBy(accountId, type, key)
PPReviews.feed()               // every review across every subject

PPReviews.me()                 // the signed-in account, or null
PPReviews.canRate(actor, type, key)
PPReviews.canModerate(actor)   // Admin/Head
PPReviews.blockReason(actor, type, key) // why a write is refused, or null

PPReviews.submit(actor, type, key, score, text) // add or edit
PPReviews.removeOwn(actor, type, key)
PPReviews.setHidden(actor, id, bool) / hide() / unhide()
PPReviews.remove(actor, id)    // lead only

PPReviews.stars(score)         // "★★★★☆"
PPReviews.fmtAverage(n)        // "4.3"
PPReviews.fmtCount(n)          // "1,234"
PPReviews.fmtDate(ts)
```

## Where the widgets appear (and when)

| Page | Widget | Subject | Notes |
|------|--------|---------|-------|
| `index.html` | detailed panel | `company` | the public "Ratings & reviews" section |
| `portfolio.html` | compact badge per card | `project` | static project slugs; links to the panel |
| `portfolio.html` | detailed panel (`data-reviews-follow-hash`) | the project named in `#rv-project-<key>` | one panel serves every card |
| `painter-profile.html` | compact badge in the hero + detailed panel | `painter` (`data-review-key="profile"` → the member in `?id=`) | hidden when the profile is private |
| `team.html` | rating chip on each crew card | `painter` | shown only when there is ≥ 1 rating |

Any element with `data-reviews="<type>"` becomes a widget. `data-review-key`
sets the subject (`profile` = the member named in the profile URL). Add
`data-reviews-compact` for the small avg+count chip, or
`data-reviews-follow-hash` to take the subject from `#rv-<type>-<key>`.

`data-reviews` is a **hint, not a boundary**: a widget with a missing or junk
subject hides itself, and every write still goes through `PPReviews.submit()`,
which re-checks the account.

## Untrusted storage

`painterPlusReviews` is `localStorage`, which is untrusted input. The engine
normalises the whole map at the boundary (`normaliseAll`) and drops anything
that is not a review object; an object/array where a string belongs becomes `''`
(never the literal `"[object Object]"`). The renderer's escapers are
object-safe for the same reason. The corrupt-store sweep
(`tests/corrupt-seed.js` → `run-corrupt-sweep.sh`) seeds a hostile reviews store
and fails if any page throws or prints `[object Object]`.

## Tests

- `node tests/reviews.test.js` — 17 checks: subject keys, score clamping,
  signed-in-only, one-per-account, no-self-review, average/distribution,
  moderation (hide/delete), display helpers, and the hostile-store behaviour.
- `bash tests/run-reviews-selftest.sh` — drives the real profile page in a
  browser (anonymous view, sign-in, submit, edit, self-review block, lead
  moderation, hostile store). Also run by `tests/run-all-headless.sh`.
