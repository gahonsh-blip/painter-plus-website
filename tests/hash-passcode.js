/* ============================================================
   HASH A STAFF PASSCODE FOR js/team.js
   ------------------------------------------------------------
   js/team.js does not store the staff passcode in plain text — it
   stores a salted SHA-256 digest and compares digests on unlock.
   To change the passcode:

     node tests/hash-passcode.js "my-new-passcode"

   then paste the printed digest into PASSCODE_SHA256 in js/team.js
   (keep PASSCODE_SALT as it is, or the old digest stops matching).

   No dependencies: Node's built-in crypto.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Keep this in sync with PASSCODE_SALT in js/team.js.
const DEFAULT_SALT = 'painter-plus::v1::';

function digest(passcode, salt) {
  return crypto.createHash('sha256').update((salt || DEFAULT_SALT) + String(passcode), 'utf8').digest('hex');
}

function main() {
  const passcode = process.argv[2];
  if (!passcode) {
    console.error('Usage: node tests/hash-passcode.js "your-new-passcode"');
    process.exit(1);
  }
  // Read the salt straight out of js/team.js so this tool can never drift
  // from the file it is meant to update.
  let salt = DEFAULT_SALT;
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'team.js'), 'utf8');
    const m = src.match(/PASSCODE_SALT\s*=\s*'([^']*)'/);
    if (m) salt = m[1];
  } catch (e) { /* fall back to the default salt */ }

  const hex = digest(passcode, salt);
  console.log('salt    : ' + salt);
  console.log('digest  : ' + hex);
  console.log('');
  console.log('Paste this into js/team.js:');
  console.log("  const PASSCODE_SHA256 = '" + hex + "';");
}

if (require.main === module) main();

module.exports = { digest, DEFAULT_SALT };
