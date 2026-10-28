/* ============================================================
   PAINTER PLUS — AUTH CONFIGURATION
   ------------------------------------------------------------
   This file holds NO secrets. It only names which authentication
   provider the site should use and the password policy.

   provider: 'local'      → the built-in, backend-less provider in
                            js/auth.js. It is a DEMO / small-crew
                            provider: credentials are PBKDF2-hashed
                            and stored in this browser's localStorage,
                            so every account lives only on the device
                            that created it. It is NOT production
                            security and does not sync between phones.
   provider: 'supabase'   → real, server-side authentication and
                            storage. Set `supabase.url` and
                            `supabase.anonKey` below and the same
                            js/auth.js switches to Supabase Auth +
                            Postgres (row-level security enforces
                            authorisation on the server).

   The Supabase `anonKey` is a PUBLISHABLE key, not a secret — it is
   designed to ship in front-end code. Security comes from the
   row-level-security policies on the tables (see docs/AUTH.md),
   never from hiding the key. Never put a Supabase `service_role`
   key, a database password, or any other secret in this file.
   ============================================================ */
(function () {
  'use strict';

  const existing = (typeof window !== 'undefined' && window.PP_AUTH_CONFIG) || {};

  window.PP_AUTH_CONFIG = Object.assign({
    provider: 'local',

    supabase: {
      // Example: 'https://abcdefgh.supabase.co'  — leave blank to stay local.
      url: '',
      // Publishable ("anon") key only. Blank to stay local.
      anonKey: '',
      // Tables created by docs/AUTH.md.
      profilesTable: 'pp_profiles',
      auditTable: 'pp_audit_log'
    },

    password: {
      minLength: 8,
      requireLetter: true,
      requireNumber: true
    },

    // How long a signed-in session stays valid, in minutes.
    sessionMinutes: 480,

    // Operator passcode for creating the FIRST Admin on a fresh install.
    // This is NOT the staff passcode used by js/team.js. Set it to the
    // lowercase SHA-256 hex of `pp-auth-bootstrap-v1:<passcode>` — generate it
    // with:  node tests/hash-passcode.js --bootstrap "your-passcode"
    // Leave blank to keep the bootstrap path CLOSED (the safe default); an
    // existing Admin can still promote members from the Accounts pane.
    bootstrapPasscodeSha256: '',

    // PBKDF2 work factor for the local provider. Raising it makes a
    // stolen hash slower to brute-force at the cost of login time.
    iterations: 150000
  }, existing);
})();
