/* ============================================================
   Unit tests for js/photo-studio.js (the pure half).
   Run:  node tests/photo-studio.test.js
   No dependencies — plain assertions, exit code 1 on failure.
   ============================================================ */
const P = require('../js/photo-studio.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol); }

console.log('\nphoto-studio: colour maths');
ok('hexToRgb expands shorthand', JSON.stringify(P.hexToRgb('#abc')) === JSON.stringify([170, 187, 204]));
ok('hexToRgb rejects junk', P.hexToRgb('nope') === null);
ok('rgbToHex round-trips', P.rgbToHex([37, 99, 235]) === '#2563eb');
ok('white luminance is 1', near(P.luminance([255, 255, 255]), 1, 1e-4));
ok('black luminance is 0', near(P.luminance([0, 0, 0]), 0, 1e-6));
ok('srgb<->linear round-trips', near(P.linearToSrgb(P.srgbToLinear(128)), 128, 0.02));

console.log('\nphoto-studio: shadeTarget');
{
  // shadeTarget returns `hex` (the colour to SHOW as the swatch) and `lin`
  // (the linear-light target the pixels are rebuilt toward). The paint keeps
  // its own lightness; the finish only nudges brightness.
  const lumOfLin = (t) => 0.2126 * t.lin[0] + 0.7152 * t.lin[1] + 0.0722 * t.lin[2];
  const mid = P.shadeTarget('#808080', 'matte');
  ok('mid grey keeps its own luminance', near(lumOfLin(mid), P.luminance([128, 128, 128]), 0.01));
  ok('swatch hex is the chosen colour', mid.hex === '#808080');
  const navy = P.shadeTarget('#1e2a38', 'matte');
  ok('dark navy stays dark (regression: was forced to wall lightness)', lumOfLin(navy) < 0.05, lumOfLin(navy).toFixed(3));
  const white = P.shadeTarget('#f7f4ee', 'matte');
  ok('white paint stays light', lumOfLin(white) > 0.7, lumOfLin(white).toFixed(3));
  const gloss = P.shadeTarget('#2563eb', 'gloss');
  const matte = P.shadeTarget('#2563eb', 'matte');
  ok('gloss target sits brighter than matte', lumOfLin(gloss) >= lumOfLin(matte));
  ok('bad hex returns null', P.shadeTarget('zzz', 'matte') === null);
}

console.log('\nphoto-studio: recolourPixel keeps shading');
{
  const target = P.shadeTarget('#2563eb', 'matte');
  const targetLum = 0.2126 * target.lin[0] + 0.7152 * target.lin[1] + 0.0722 * target.lin[2];
  const dark = P.recolourPixel([60, 60, 60], target, 0.3);   // a shadow pixel
  const light = P.recolourPixel([200, 200, 200], target, 0.3); // a lit pixel
  ok('shadow pixel stays darker than lit pixel', P.luminance(dark) < P.luminance(light));
  // The recoloured pixel should carry the target hue: blue channel highest.
  ok('recoloured pixel takes the target hue (blue dominant)', light[2] > light[0] && light[2] > light[1]);
  // A pixel exactly at the wall mean maps to the target's own luminance.
  const flat = P.recolourPixel([128, 128, 128], target, P.luminance([128, 128, 128]));
  ok('pixel at mean lightness maps to target luminance', near(P.luminance(flat), targetLum, 0.05));
  // A near-black pixel must not drag the whole wall to black: the ratio clamp
  // lifts it well above what an unclamped scale would give.
  const rel = P.luminance([2, 2, 2]) / 0.3;
  const unclamped = [0, 1, 2].map(i => P.linearToSrgb(target.lin[i] * rel));
  const clamped = P.recolourPixel([2, 2, 2], target, 0.3);
  ok('near-black pixel is clamped well above the unclamped result',
    P.luminance(clamped) > P.luminance(unclamped) * 10,
    P.luminance(clamped).toFixed(4) + ' vs ' + P.luminance(unclamped).toFixed(4));
}

console.log('\nphoto-studio: seeded noise is deterministic + tiles');
{
  const a = P.rng(42), b = P.rng(42);
  ok('rng is deterministic', a() === b() && a() === b());
  const n1 = P.valueNoise(7, 8), n2 = P.valueNoise(7, 8);
  ok('valueNoise deterministic', n1(3.3, 4.7) === n2(3.3, 4.7));
  ok('valueNoise tiles at the period', near(n1(3.3, 4.7), n1(3.3 + 8, 4.7), 1e-9));
  const f = P.fbm(7, 8, 4);
  let lo = 1, hi = 0;
  for (let i = 0; i < 500; i++) { const v = f(i * 0.37, i * 0.61); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  ok('fbm stays in 0..1', lo >= 0 && hi <= 1);
  ok('fbm actually varies', hi - lo > 0.2);
}

console.log('\nphoto-studio: texture tiles');
{
  const smooth = P.textureTile('smooth', 1, 32);
  ok('smooth texture is fully transparent', smooth.data.every((v, i) => i % 4 !== 3 || v === 0));
  const stucco = P.textureTile('stucco', 1, 64);
  ok('stucco tile has correct size', stucco.data.length === 64 * 64 * 4);
  // relief must live in RGB around the overlay-neutral 128, and be opaque
  let lo = 255, hi = 0, opaque = true;
  for (let i = 0; i < stucco.data.length; i += 4) {
    lo = Math.min(lo, stucco.data[i]); hi = Math.max(hi, stucco.data[i]);
    if (stucco.data[i + 3] !== 255) opaque = false;
  }
  ok('stucco tile is opaque', opaque);
  ok('stucco relief sits around mid-grey 128', lo < 128 && hi > 128, lo + '..' + hi);
  ok('texture is deterministic', P.textureTile('stucco', 5, 32).data.join() === P.textureTile('stucco', 5, 32).data.join());
}

console.log('\nphoto-studio: triAffine');
{
  const src = [[0, 0], [10, 0], [0, 10]];
  const dst = [[100, 50], [140, 50], [100, 90]];
  const m = P.triAffine(src, dst);
  ok('matrix maps src vertex 0 to dst vertex 0', P.applyAffine(m, src[0]).every((v, i) => near(v, dst[0][i], 1e-6)));
  ok('matrix maps src vertex 1 to dst vertex 1', P.applyAffine(m, src[1]).every((v, i) => near(v, dst[1][i], 1e-6)));
  ok('matrix maps src vertex 2 to dst vertex 2', P.applyAffine(m, src[2]).every((v, i) => near(v, dst[2][i], 1e-6)));
  ok('degenerate triangle returns null', P.triAffine([[0, 0], [1, 1], [2, 2]], dst) === null);
}

console.log('\nphoto-studio: material estimate');
{
  // 500 sq ft interior, 2 coats @ 130 sq ft/L, +10% wastage = 8.46 L -> 1×10 L tin.
  const m = P.computeMaterial(500, 'interior');
  ok('paint litres ~ 8.5', near(m.paint.litres, 8.5, 0.1));
  ok('paint packs to one 10 L tin', m.paint.pack === '1 × 10' && m.paint.packTotal === 10);
  // putty: 500 × 2 / 14 = 71.4 kg -> 2 × 40 kg bags
  ok('putty kg ~ 71.4', near(m.putty.kg, 71.4, 0.2));
  ok('putty packs to 2 × 40 kg', m.putty.pack === '2 × 40' && m.putty.packTotal === 80);
  // primer: 500 × 1 / 130 = 3.85 L -> 1 × 4 L tin
  ok('primer packs to one 4 L tin', m.primer.pack === '1 × 4');

  const ext = P.computeMaterial(500, 'exterior');
  ok('exterior paint coverage is lower (more litres)', ext.paint.litres > m.paint.litres);
  ok('exterior areaType label', ext.areaType === 'Exterior');

  const none = P.computeMaterial(0, 'interior');
  ok('zero area -> zero packs', none.paint.packs === 0 && none.putty.packs === 0);
  ok('unknown area type falls back to interior', P.computeMaterial(100, 'roof').areaType === 'Interior');
  const c1 = P.computeMaterial(300, 'interior', { coats: 1 });
  ok('coats override lowers litres', c1.paint.litres < P.computeMaterial(300, 'interior').paint.litres);
}

console.log('\nphoto-studio: packUp');
{
  ok('0 -> nothing', P.packUp(0, [1, 4, 10]).count === 0);
  ok('2.5 -> one 4 L', P.packUp(2.5, [1, 4, 10]).label === '1 × 4');
  ok('25 -> 3 × 10 L', P.packUp(25, [1, 4, 10]).label === '3 × 10');
  ok('exact pack size uses one pack', P.packUp(10, [1, 4, 10]).label === '1 × 10');
  ok('putty 41 kg -> 2 bags', P.packUpKg(41, 40).count === 2);
  ok('putty 40 kg -> 1 bag', P.packUpKg(40, 40).count === 1);
}

console.log('\nphoto-studio: palette + textures are well-formed');
{
  ok('palette entries all valid hex', P.PALETTE.every(p => P.hexToRgb(p.hex)));
  ok('palette entries all named', P.PALETTE.every(p => p.name && p.name.length > 0));
  ok('six textures offered', P.TEXTURES.length === 6);
  ok('finish gains ordered matte<gloss', P.FINISH_GAIN.matte < P.FINISH_GAIN.gloss);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
