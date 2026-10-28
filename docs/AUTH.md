# Painter Plus — Authentication, Accounts & Role-Based Access

This document describes the crew account system: **secure login, professional
painter profiles, self-service editing, profile privacy, and role-based access
control (RBAC)**. It is written for whoever operates or extends the site.

The engine is `js/auth.js` (`window.PPAuth`), configured by `js/auth-config.js`
(`window.PP_AUTH_CONFIG`). The pages that use it are `login.html`
(`js/login-page.js`), `painter-profile.html` (`js/profile-page.js`) and
`admin.html` (`js/accounts-page.js`).

---

## 1. Read this first: two providers, two very different trust levels

`js/auth-config.js` selects the provider:

| `provider` | What it is | Security |
|-----------|------------|----------|
| `'local'` (default) | Accounts are PBKDF2-hashed and kept in **this browser's `localStorage`**. | **Demo / small-crew only.** There is no server, so anyone who can edit the page in their own browser can bypass the client-side gate. Accounts do not sync between devices. |
| `'supabase'` | Supabase Auth for passwords + Postgres tables for profiles and the audit log, with **row-level security (RLS)** enforcing authorisation on the server. | Production. Authorisation is enforced by the database, not by the JavaScript. |

**Do not claim production security for the `local` provider.** It exists so the
site works with no backend at all, exactly like the rest of this static project.
When you need real security, set `provider: 'supabase'` and fill in
`supabase.url` and `supabase.anonKey`.

### What is never done

- A password is **never** stored in plain text. See `hashPassword()` below.
- No secret is ever placed in front-end code. The Supabase `anonKey` is a
  **publishable** key, designed to ship in the browser; the security comes from
  the RLS policies on the tables, never from hiding the key. Never put a
  `service_role` key, a database password or any other secret in
  `js/auth-config.js`.

---

## 2. Password hashing (`local` provider)

`hashPassword(password)` returns:

```js
{ algo: 'PBKDF2-SHA256', iter: 150000, salt: '<base64>', hash: '<base64>' }
```

- **PBKDF2-HMAC-SHA256** via the Web Crypto API (`crypto.subtle`).
- A **unique random 16-byte salt** per account (`crypto.getRandomValues`).
- Default work factor **150,000** iterations, read from
  `PP_AUTH_CONFIG.iterations`.
- Verification is a **constant-time** comparison (`timingSafeEqual`).
- Login always performs a verification, even when no account matches, so a
  missing user and a wrong password take a similar amount of time.

If `crypto.subtle` is unavailable (a plain `file://` page, or an old browser),
hashing fails closed with `ERR.NO_CRYPTO` — no account is created with a weak
hash.

---

## 3. Accounts, statuses and approval

An account is created by **registering** at `login.html`. A new account is
`pending`:

```
status: 'pending' | 'active' | 'suspended' | 'rejected'
role:   'admin' | 'head' | 'painter'
```

- A `pending` account **cannot log in** — the error says it is awaiting approval.
- An Admin or Head **approves** it (status → `active`) from `admin.html` →
  **Accounts & Access**.
- `rejected` and `suspended` accounts cannot log in either.

### Bootstrapping the first Admin

A fresh install has no Admin, and the site deliberately ships **no default
password** (that would be a back door). The first Admin is created with an
**operator passcode**, which is the approval gate for that one account:

1. Set `bootstrapPasscodeSha256` in `js/auth-config.js` to the lowercase
   SHA-256 hex of `pp-auth-bootstrap-v1:<passcode>`:

   ```bash
   node tests/hash-passcode.js --bootstrap "your-operator-passcode"
   ```

   Leaving it blank keeps the path **CLOSED**, which is the safe default.
2. Register through `login.html`, then run `PPAuth.promoteBootstrapAdmin(actor,
   id, passcode)`. The engine refuses unless **all** of these hold: the passcode
   matches the configured digest, no Admin exists yet
   (`needsBootstrapAdmin()`), and the target is not `suspended`/`rejected`.

The passcode is the approval gate, so bootstrap *may* activate a still-`pending`
target — the one intended exception. The path is closed the moment an Admin
exists, so it can never be used to add a *second* Admin behind the operator's
back; from then on, an Admin promotes members from the Accounts pane.

---

## 4. Role-based access control

Authorisation lives in one function, `can(actor, action, target, extra)`. Every
mutator calls it and refuses with `ERR.NOT_AUTHORIZED` when the actor is not
allowed. `extra` carries the action-specific datum — for `role.assign` it is the
**role being granted**. **Hiding a button in the UI is never the security** — the
engine is.

| Action | Painter | Head | Admin |
|--------|---------|------|-------|
| `self.edit` (own permitted fields) | ✅ | ✅ | ✅ |
| `self.privacy` (own public/private flag) | ✅ | ✅ | ✅ |
| `profile.edit` (another member's profile) | ❌ | painters only | ✅ anyone |
| `profile.editContact` (company phone/email/address) | own, only if granted the `contact` right | painters | ✅ |
| `account.manage` (approve/reject/role/rights) | ❌ | painters only (never a peer Head or an Admin) | ✅ anyone |
| `role.assign` (grant role X to a target) | ❌ | only a role strictly below `head` | ✅ anyone |
| `roster.manage` (public roster role) | ❌ | painters only | ✅ anyone |
| `audit.view` | ❌ | ✅ | ✅ |

Guarantees the tests pin down:

- A painter **cannot edit another painter**, cannot change a role or a status,
  and cannot change another painter's privacy or password.
- A crafted `updateProfile()` call **cannot smuggle a role or status** through —
  only the fields `editableFields()` allows are applied; everything else in the
  patch is ignored.
- A Head **cannot manage an Admin** account, **nor a peer Head**, and **cannot
  grant the `head` or `admin` role** — a lead may only hand out a role strictly
  below their own (`role.assign` checks the granted role, not just the target).
- A Head who tries to re-role a peer is refused **before** the roster write, so
  a refused promotion is never half-applied to the public team page.
- The **last active Admin cannot be demoted or suspended** (`ERR.LAST_ADMIN`),
  so the site is never left unadministrable.

### Field groups

- `SELF_FIELDS` — what a painter owns about themselves: `name`, `title`,
  `tagline`, `bio`, `photo`, `startYear`, `quote`.
- `COMPANY_FIELDS` — company-authoritative contact details: `phone`, `email`,
  `address`, `note`. A painter may only change these when an Admin/Head grants
  the `contact` edit right, so the company's own contact information stays
  correct.
- `ADMIN_FIELDS` — `role`, `status`, `editRights`, `memberId`. Only an Admin/Head
  may set these, and never through the profile path.

---

## 5. Privacy

Each account has `privacy: 'public' | 'private'`.

- The owner (or an Admin/Head in scope) toggles it; `setPrivacy()` is
  authorisation-checked like every other write.
- `isPublic(account)` is the one rule: an account is visible to a cold visitor
  only when `status === 'active'` **and** `privacy !== 'private'`.
- A `pending`, `suspended` or `rejected` account is **never** public, whatever
  its privacy flag says.
- On `painter-profile.html`, a private profile hides the personal sections
  (bio, gallery, work record) from everyone but the owner and an Admin/Head.

Company-required information and Admin/Head-set rules always apply — privacy
controls the painter's own presentation, not the company's records.

---

## 6. Password change, recovery and sessions

- **Change password** (`changePassword`): requires the current password, then
  validates and re-hashes the new one. Available from `login.html` once signed
  in. The person who changes it **stays signed in** (their own session is
  re-issued against the new password).
- **Session invalidation.** Every account carries `pwAt` (the password's change
  time) and the session copies it. A password **change or reset bumps `pwAt`**,
  so any session issued before it is refused at the next check — a lead who
  resets a member's password logs that member out on every device at once.
- **Recovery is issued by a lead, not by the form.** `requestRecovery(email)`
  always answers the same way and returns **no code**, so the form can never
  reveal which accounts exist and an attacker cannot mint a code for themselves.
  Only `issueRecoveryCode(actor, targetId)` — a lead who outranks the target —
  produces one. The code is stored **hashed** (salted SHA-256), is **single-use**,
  is **burnt after `RECOVERY_MAX_TRIES` wrong attempts**, and only works on an
  `active` account. `resetWithCode(email, code, next)` consumes it and logs the
  member out everywhere.
- **Login throttling.** Repeated failed logins for one account lock it for a
  cool-off window (`ERR.THROTTLED`, "too many attempts"); a correct password is
  refused while the lock stands, and the counter clears on a successful login.
- **Admin reset** (`resetPassword`): an Admin/Head may set a member's password
  directly (local provider). It also bumps `pwAt` and kills that member's live
  sessions.

In **Supabase** mode these route to Supabase's own flows: recovery sends a real
email, and there is deliberately **no** client-side "Admin sets another user's
password" (that needs a service role, which never ships to the browser).

---

## 7. Audit log

Every mutating action appends to an append-only log (`painterPlusAudit` locally,
`pp_audit_log` in Supabase): `register`, `login`, `logout`, `profile.update`,
`account.update`, `privacy.set`, `password.change`, `password.reset`,
`recovery.request`, `recovery.reset`, `account.bootstrap-admin`.

The log is capped at the most recent 500 entries and is readable by an Admin or
Head only (`audit.view`). `admin.html` → **Accounts & Access** shows it.

---

## 8. Supabase setup

1. Create a Supabase project.
2. Create the tables (names come from `js/auth-config.js`):

```sql
create table pp_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  email       text not null,
  name        text not null default '',
  phone       text default '',
  role        text not null default 'painter',
  status      text not null default 'pending',
  member_id   text,
  photo       text default '',
  title       text default '',
  tagline     text default '',
  bio         text default '',
  start_year  text default '',
  quote       text default '',
  privacy     text not null default 'public',
  edit_rights jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table pp_audit_log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  action text not null,
  actor  text,
  target text,
  detail text
);
```

3. Enable **row-level security** on both tables. The policies are what actually
   authorise a request; the JavaScript only mirrors them for a clear error
   message. A representative set:

```sql
alter table pp_profiles enable row level security;

-- A signed-in user reads their own row.
create policy "own profile read" on pp_profiles for select
  using (auth.uid() = id);

-- Anyone may read an ACTIVE, PUBLIC profile (the public team/profile pages).
create policy "public profile read" on pp_profiles for select
  using (status = 'active' and privacy = 'public');

-- A user may update only the presentation fields of their own row, and may NOT
-- change role/status/edit_rights (that is how a member would escalate).
create policy "own profile update" on pp_profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role   = (select p.role   from pp_profiles p where p.id = auth.uid())
    and status = (select p.status from pp_profiles p where p.id = auth.uid())
    and edit_rights = (select p.edit_rights from pp_profiles p where p.id = auth.uid())
  );

-- An Admin/Head may read and manage every row.
create policy "manager manage" on pp_profiles for all
  using (exists (select 1 from pp_profiles p
                 where p.id = auth.uid() and p.role in ('admin','head') and p.status = 'active'));

-- The audit log: insertable by anyone acting, readable by managers only.
alter table pp_audit_log enable row level security;
create policy "audit insert" on pp_audit_log for insert with check (true);
create policy "audit read" on pp_audit_log for select
  using (exists (select 1 from pp_profiles p
                 where p.id = auth.uid() and p.role in ('admin','head') and p.status = 'active'));
```

4. Put the project URL and the **anon** (publishable) key in `js/auth-config.js`
   and set `provider: 'supabase'`.

> In Postgres, a subquery inside a `with check` on the same table reads the
> **pre-update** row, so `role = (select role from pp_profiles where id = auth.uid())`
> means "the new role must equal the old role". Managers are unaffected because
> the separate `manager manage` policy is permissive and ORs with this one.
>
> Refine the policies to your own rules before going live. If you would rather
> keep `role`/`status` off the user-updatable row entirely, move them to a
> manager-only table. The `audit insert` policy above trusts the client to write
> honest rows — tighten it (e.g. a `SECURITY DEFINER` function) if audit
> integrity must be tamper-proof.

---

## 9. Tests

| Test | What it proves |
|------|----------------|
| `node tests/auth.test.js` (45 checks) | The engine: real PBKDF2 hashing, the pending-approval gate, RBAC (a painter cannot edit another painter; a Head cannot escalate to Admin or touch a peer Head), the passcode-gated bootstrap, single-use recovery, login throttling, session invalidation on password change, privacy, the last-Admin guard, and that a hostile store never throws. |
| `node tests/supabase-auth.test.js` (9 checks) | The Supabase provider with a fake `fetch`: signup → pending row, login → token, a refused write **and a refused Head→Admin escalation** never reach the network, and nothing is written to `localStorage`. |
| `bash tests/run-auth-selftest.sh` | Browser end-to-end on `login.html`: register, approve, log in, wrong-password rejection, the Head privilege boundary, the bootstrap gate, privacy survives sign-out. |
| `bash tests/run-admin-selftest.sh` | Browser end-to-end on `admin.html`: the Accounts pane refuses without a signed-in Admin, a Painter sees no controls, an Admin approves / sets role / sets edit rights / reads the audit log. |

All of the above run as part of `bash tests/run-all-headless.sh`.

> **Headless note.** Chromium's `--virtual-time-budget` (used by the runner)
> never resolves real WebCrypto, so PBKDF2 hangs. The browser self-tests
> therefore swap in a deterministic, salt-sensitive KDF stand-in — the flow is
> driven end to end, while the *real* PBKDF2 round-trip is covered by
> `tests/auth.test.js` in Node.

---

## 10. Where things live

| Concern | File |
|---------|------|
| Auth engine (`window.PPAuth`) | `js/auth.js` |
| Provider + password policy config | `js/auth-config.js` |
| Login / register / recover UI | `login.html`, `js/login-page.js` |
| Painter profile (public view, self-edit, privacy, role controls) | `painter-profile.html`, `js/profile-page.js` |
| Admin "Accounts & Access" (approve, role, edit rights, audit) | `admin.html`, `js/accounts-page.js` |
| Shared Owner/Head passcode gate | `js/team.js` (`unlockHead`, `isManager`, `claim`) |
| Styles | `css/style.css` (`.auth-*`, `.acct-*`, `.audit-*`) |
