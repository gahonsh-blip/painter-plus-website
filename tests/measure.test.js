/* ============================================================
   Tests for js/measure.js — run with:  node tests/measure.test.js
   No dependencies; uses Node's built-in assert.
   ============================================================ */
const assert = require('assert');
const M = require('../js/measure.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}
function close(a, b, tol) { assert.ok(Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol), a + ' != ' + b); }

// ---------- shoelace ----------
test('unit square area is 1', () => close(M.polygonArea([[0, 0], [1, 0], [1, 1], [0, 1]]), 1));
test('rectangle 3x4 area is 12', () => close(M.polygonArea([[0, 0], [3, 0], [3, 4], [0, 4]]), 12));
test('winding order does not matter', () => close(M.polygonArea([[0, 1], [1, 1], [1, 0], [0, 0]]), 1));
test('triangle area is half base x height', () => close(M.polygonArea([[0, 0], [4, 0], [0, 3]]), 6));
test('fewer than 3 points is zero', () => close(M.polygonArea([[0, 0], [1, 1]]), 0));

// ---------- axis-aligned calibration ----------
test('flat rectangle calibration recovers w x h', () => {
  const H = M.homographyFromCalibration([[0, 0], [10, 0], [10, 8], [0, 8]], 10, 8);
  assert.ok(H, 'expected a homography');
  close(M.calibratedArea(H, [[0, 0], [10, 0], [10, 8], [0, 8]]), 80, 1e-6);
});
test('half the wall measures half the area', () => {
  const H = M.homographyFromCalibration([[0, 0], [100, 0], [100, 80], [0, 80]], 10, 8);
  close(M.calibratedArea(H, [[0, 0], [100, 0], [100, 40], [0, 40]]), 40, 1e-6);
});
test('degenerate corners return null', () => {
  assert.strictEqual(M.homographyFromCalibration([[0, 0], [1, 1], [2, 2], [3, 3]], 10, 8), null);
});

// ---------- perspective correction ----------
// A camera projects the real plane through a projective transform. Build one,
// project the real rectangle's corners into the image, then check the module
// recovers the true area from the skewed picture.
function projective() {
  // Fixed, well-conditioned transform (skew + perspective tilt).
  return [
    [1.3, 0.4, 20],
    [0.15, 1.1, 15],
    [0.004, 0.006, 1]
  ];
}
function project(H, p) { return M.applyH(H, p); }

test('skewed photo: full wall still measures 80 sq ft', () => {
  const P = projective();
  const imgCorners = [[0, 0], [10, 0], [10, 8], [0, 8]].map(p => project(P, p));
  const H = M.homographyFromCalibration(imgCorners, 10, 8);
  assert.ok(H);
  const drawn = [[0, 0], [10, 0], [10, 8], [0, 8]].map(p => project(P, p));
  close(M.calibratedArea(H, drawn), 80, 1e-3);
});
test('skewed photo: a 5x4 patch measures 20 sq ft', () => {
  const P = projective();
  const imgCorners = [[0, 0], [10, 0], [10, 8], [0, 8]].map(p => project(P, p));
  const H = M.homographyFromCalibration(imgCorners, 10, 8);
  const patch = [[2, 2], [7, 2], [7, 6], [2, 6]].map(p => project(P, p));
  close(M.calibratedArea(H, patch), 20, 1e-3);
});
test('skewed photo: a triangle measures correctly', () => {
  const P = projective();
  const imgCorners = [[0, 0], [10, 0], [10, 8], [0, 8]].map(p => project(P, p));
  const H = M.homographyFromCalibration(imgCorners, 10, 8);
  // Real triangle (0,0)-(10,0)-(0,8): area 40.
  const tri = [[0, 0], [10, 0], [0, 8]].map(p => project(P, p));
  close(M.calibratedArea(H, tri), 40, 1e-3);
});

// ---------- flat (uncalibrated) ----------
test('flat scale multiplies by feet-per-pixel squared', () => {
  close(M.flatArea([[0, 0], [50, 0], [50, 40], [0, 40]], 0.2), 80, 1e-6);
});
test('no calibration means no measurement', () => {
  close(M.calibratedArea(null, [[0, 0], [1, 0], [1, 1]]), 0);
});

// ---------- costing ----------
test('labour cost = area x rate', () => close(M.labourCost(80, 12), 960, 1e-6));
test('paint litres for 80 sq ft, 2 coats, 130 coverage, 10% wastage', () => {
  close(M.paintLitres(80, { coats: 2, coverage: 130, wastage: 0.1 }), (80 * 2 / 130) * 1.1, 1e-9);
});
test('zero area costs nothing', () => {
  close(M.labourCost(0, 12), 0);
  close(M.paintLitres(0), 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
