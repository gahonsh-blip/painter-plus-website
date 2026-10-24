/* ============================================================
   Tests for what the PUBLIC site exposes to a visitor.
   Run with:  node tests/exposure.test.js
   No dependencies; uses Node's built-in assert + fs.

   These lock in the fix for a real problem: the public marketing
   pages linked straight to the staff tools (Work Log / ERP / Admin),
   the gate copy printed the passcode, and the deploy workflow
   published the whole repository (AGENTS.md, README.md, docs/, tests/)
   to the live site.

   A failure here means a visitor can see or reach something they
   should not. These are cheap, static checks on the source files.
   ============================================================ */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Public marketing pages — a visitor with no passcode sees these.
const PUBLIC_PAGES = [
  'index.html', 'about.html', 'services.html', 'portfolio.html',
  'color-studio.html', 'team.html', 'gallery.html', 'contact.html',
  'privacy.html', 'terms.html', 'painter-profile.html'
];
// Staff-only pages — they may link to each other.
const STAFF_PAGES = ['admin.html', 'worklog.html', 'erp.html'];

const PASSCODE = 'painter123';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}

// ---------- no plaintext passcode anywhere a visitor can read ----------
test('the passcode appears in no page served to visitors', () => {
  const offenders = PUBLIC_PAGES.concat(STAFF_PAGES).filter((f) => read(f).indexOf(PASSCODE) !== -1);
  assert.deepStrictEqual(offenders, [], 'passcode printed in: ' + offenders.join(', '));
});

test('the passcode appears in no served JavaScript', () => {
  const jsDir = path.join(ROOT, 'js');
  const offenders = fs.readdirSync(jsDir).filter((f) => read('js/' + f).indexOf(PASSCODE) !== -1);
  assert.deepStrictEqual(offenders, [], 'passcode found in: ' + offenders.join(', '));
});

// ---------- the public pages link to no staff tool ----------
test('no public page links to the staff tools', () => {
  const staff = ['./admin.html', './worklog.html', './erp.html'];
  const offenders = [];
  for (const f of PUBLIC_PAGES) {
    const html = read(f);
    for (const link of staff) {
      // Allow the string inside a JS template that is only rendered for staff,
      // but not a plain <a href> in the served markup.
      const re = new RegExp('<a[^>]+href="' + link.replace('.', '\\.') + '"', 'g');
      const hits = html.match(re);
      if (hits) offenders.push(f + ' -> ' + link + ' (' + hits.length + ')');
    }
  }
  assert.deepStrictEqual(offenders, [], 'public pages link to staff tools:\n      ' + offenders.join('\n      '));
});

test('no public page nav lists Work Log / ERP / Admin', () => {
  const offenders = [];
  for (const f of PUBLIC_PAGES) {
    const html = read(f);
    const navMatch = html.match(/<nav class="nav-links"[^>]*>[\s\S]*?<\/nav>/);
    if (!navMatch) continue;
    const nav = navMatch[0];
    for (const label of ['Work Log', 'ERP', 'Admin']) {
      if (new RegExp('>' + label + '<').test(nav)) offenders.push(f + ' nav has "' + label + '"');
    }
  }
  assert.deepStrictEqual(offenders, [], offenders.join('\n      '));
});

// ---------- JS loaded by public pages must not hardcode a staff link ----------
test('public-page JavaScript hardcodes no staff link', () => {
  // team-page.js is allowed: it creates the admin link only for a signed-in
  // Owner/Head. erp-page.js is allowed: it is only loaded on the staff erp.html.
  const allowed = new Set(['team-page.js', 'erp-page.js']);
  const jsDir = path.join(ROOT, 'js');
  const offenders = [];
  for (const f of fs.readdirSync(jsDir)) {
    if (!f.endsWith('.js') || allowed.has(f)) continue;
    const src = read('js/' + f);
    for (const link of ['./worklog.html', './erp.html', './admin.html']) {
      if (src.indexOf(link) !== -1) offenders.push(f + ' -> ' + link);
    }
  }
  assert.deepStrictEqual(offenders, [], 'staff links hardcoded in JS:\n      ' + offenders.join('\n      '));
});

// ---------- staff pages stay out of search engines ----------
test('the staff pages are marked noindex', () => {
  for (const f of STAFF_PAGES) {
    assert.ok(/name="robots"[^>]*noindex/.test(read(f)), f + ' is not marked noindex');
  }
});

test('no staff page is listed in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const f of STAFF_PAGES) {
    assert.ok(sitemap.indexOf(f) === -1, f + ' is listed in sitemap.xml');
  }
});

// ---------- the deploy publishes only the public site ----------
test('the deploy workflow does not upload the whole repository', () => {
  const wf = read('.github/workflows/static.yml');
  assert.ok(!/path:\s*['"]?\.['"]?\s*$/m.test(wf),
    "the workflow still uploads path: '.' (the whole repo, including AGENTS.md and README.md)");
  assert.ok(/path:\s*['"]?_site['"]?/.test(wf), 'the workflow does not upload a staged _site directory');
});

test('the deploy stages the public assets and nothing internal', () => {
  const wf = read('.github/workflows/static.yml');
  for (const needed of ['css', 'js', 'images', 'manifest.json', 'sw.js', 'sitemap.xml']) {
    assert.ok(wf.indexOf(needed) !== -1, 'the deploy stage does not copy ' + needed);
  }
  // The leak guard must name the internal files it refuses to ship.
  for (const guarded of ['AGENTS.md', 'README.md']) {
    assert.ok(wf.indexOf(guarded) !== -1, 'the deploy leak guard does not mention ' + guarded);
  }
});

// ---------- internal docs must not be reachable as site content ----------
test('robots.txt does not advertise internal paths', () => {
  const robots = read('robots.txt');
  for (const internal of ['AGENTS.md', 'README.md', 'docs/', 'tests/']) {
    assert.ok(robots.indexOf(internal) === -1, 'robots.txt mentions ' + internal);
  }
});

// ---------- a `hidden` element must actually be hidden ----------
// The UA sheet's `[hidden]{display:none}` loses to any author `display` rule,
// so `<div hidden class="wl-measure">` (display:flex) or
// `<button hidden class="btn-ghost">` (display:inline-block) render anyway and
// the author's intent is ignored. In the tenth audit pass this left the
// work-log and ERP login gate on screen after a successful unlock. The global
// `[hidden]{display:none !important}` rule in css/style.css fixes it; these
// checks fail if that rule is weakened or removed.
test('css/style.css restores the [hidden] default with !important', () => {
  const css = read('css/style.css');
  assert.ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css),
    'the global [hidden]{display:none !important} rule is missing from css/style.css');
});

test('the hidden-attribute audit harness exists', () => {
  const js = read('tests/hidden-audit.js');
  assert.ok(js.indexOf("querySelectorAll('[hidden]')") !== -1,
    'tests/hidden-audit.js no longer inspects [hidden] elements');
  const runner = read('tests/run-all-headless.sh');
  assert.ok(runner.indexOf('hidden-audit.js') !== -1,
    'run-all-headless.sh does not run the hidden-attribute audit');
  assert.ok(runner.indexOf('_hidden.html') !== -1,
    'run-all-headless.sh does not check the hidden-audit index page');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
