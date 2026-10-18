/* ============================================================
   PHOTO STUDIO — "Paint My Photo"
   ------------------------------------------------------------
   The client uploads (or shoots) a photo of their own wall, taps the
   four corners of the wall, picks a colour / finish / texture, and
   sees that wall repainted in the photo — plus how much paint, putty
   and primer the job needs. It reuses the geometry in js/measure.js
   (homography + shoelace) so the same area drives both the preview
   and the material estimate.

   Three pieces, in one file:

   1. COLOUR (pure)  Recolour a wall without flattening it. A plain
      fill looks like a sticker; instead we keep the photo's own
      shading and only shift its colour. For each pixel we take the
      lightness relative to the wall's average lightness and rebuild
      the pixel as target_hue at that same relative lightness, so
      shadows stay shadows and highlights stay highlights.

   2. TEXTURE (pure generator + browser warp)  Procedural textures
      (smooth, roller, orange-peel, stucco, sand, stripes) drawn into
      a tile, then warped onto the wall quad with the wall's own
      homography (inverse-map, per-cell affine) so the pattern runs
      along the wall instead of sitting flat over it.

   3. MATERIAL (pure)  Square feet -> litres of paint, kg of putty,
      litres of primer, rounded up to the pack sizes actually sold in
      India (1/4/10/20 L tins, 40 kg putty bags).

   Everything pure is unit-tested in tests/photo-studio.test.js; the
   browser-only editor is guarded so a missing canvas cannot throw.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPPhoto = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ============================================================
  // PALETTE + COLOUR MATHS (pure)
  // ============================================================

  // Curated wall colours, grouped so the picker is easy to scan.
  const PALETTE = [
    { hex: '#f7f4ee', name: 'Ivory White' },
    { hex: '#efe9dd', name: 'Warm Linen' },
    { hex: '#e4d9c6', name: 'Sand Dune' },
    { hex: '#d8cfc0', name: 'Pebble' },
    { hex: '#cfd8cf', name: 'Sage Mist' },
    { hex: '#a8c3a0', name: 'Eucalyptus' },
    { hex: '#7d9b76', name: 'Forest Calm' },
    { hex: '#cfe0e8', name: 'Sky Breath' },
    { hex: '#9dc3dc', name: 'Coastal Blue' },
    { hex: '#5b8fb0', name: 'Denim Blue' },
    { hex: '#2f4858', name: 'Deep Slate' },
    { hex: '#1e2a38', name: 'Midnight' },
    { hex: '#f3d9d0', name: 'Blush Clay' },
    { hex: '#e0b0a4', name: 'Rosewood' },
    { hex: '#c06c61', name: 'Terracotta' },
    { hex: '#c0392b', name: 'Brick Red' },
    { hex: '#8d5524', name: 'Walnut Spice' },
    { hex: '#f0d79b', name: 'Soft Honey' },
    { hex: '#d4af37', name: 'Golden Accent' },
    { hex: '#9b8fb0', name: 'Muted Plum' },
    { hex: '#b9b3a6', name: 'Greige' },
    { hex: '#8a8f96', name: 'Cool Grey' }
  ];

  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  // sRGB <-> linear light, so mixing and scaling behave like real light.
  function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(l) {
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, s * 255));
  }

  // Rec.709 relative luminance, 0..1.
  function luminance(rgb) {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
  }

  // The colour to aim each wall pixel at. The paint keeps its OWN lightness —
  // a navy stays navy, a white stays white — so the client sees the real tone
  // they are buying. The finish only nudges overall brightness a little, to
  // suggest sheen; the wall's own light/dark shading is applied separately, per
  // pixel, by recolourPixel. Working in linear light keeps mid-tones honest.
  const FINISH_GAIN = { matte: 1.0, eggshell: 1.02, satin: 1.05, gloss: 1.1 };

  function shadeTarget(hex, finish) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const gain = FINISH_GAIN[finish] || 1.0;
    return {
      hex: rgbToHex(rgb),
      lin: [
        clamp01(srgbToLinear(rgb[0]) * gain),
        clamp01(srgbToLinear(rgb[1]) * gain),
        clamp01(srgbToLinear(rgb[2]) * gain)
      ],
      gain: gain
    };
  }

  // Recolour one pixel: keep the photo's own shading and rebuild it in the
  // paint's colour. `rel` is how bright this pixel is relative to the wall's
  // average (1 = average, <1 = a shadow, >1 = a highlight), clamped so a single
  // blown-out or near-black pixel cannot distort the result. `alpha` lets the
  // caller blend the painted pixel over the original.
  function recolourPixel(rgb, target, meanLum) {
    const l = luminance(rgb);
    let rel = meanLum > 1e-6 ? l / meanLum : 1;
    if (rel < 0.1) rel = 0.1; else if (rel > 2.2) rel = 2.2;
    return [
      linearToSrgb(clamp01(target.lin[0] * rel)),
      linearToSrgb(clamp01(target.lin[1] * rel)),
      linearToSrgb(clamp01(target.lin[2] * rel))
    ];
  }

  // ============================================================
  // TEXTURE GENERATION (pure) + WARP (browser)
  // ============================================================

  // A texture is just a tile of noise. We generate it deterministically from
  // a seed so the same wall always looks the same, and so it can be tested.
  const TEXTURES = [
    { id: 'smooth', name: 'Smooth', note: 'Flat finish, no grain' },
    { id: 'roller', name: 'Roller', note: 'Faint roller streaks' },
    { id: 'orangepeel', name: 'Orange peel', note: 'Fine spray texture' },
    { id: 'stucco', name: 'Stucco', note: 'Coarse plaster relief' },
    { id: 'sand', name: 'Sand', note: 'Very fine grit' },
    { id: 'stripes', name: 'Stripes', note: 'Subtle decor lines' }
  ];

  // Deterministic PRNG (mulberry32) — same seed, same wall, every time.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seeded 2D value noise with smoothstep interpolation, tiling over `period`
  // so the generated tile joins seamlessly when repeated.
  function valueNoise(seed, period) {
    const rand = rng(seed);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const at = (x, y) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
    const smooth = (t) => t * t * (3 - 2 * t);
    return function (x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = smooth(x - x0), fy = smooth(y - y0);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
  }

  // Fractal noise: several octaves of value noise summed, so coarse blobs and
  // fine grain appear together (that is what makes plaster look like plaster).
  function fbm(seed, basePeriod, octaves) {
    const oct = octaves || 4;
    const layers = [];
    let period = basePeriod;
    for (let o = 0; o < oct; o++) { layers.push({ n: valueNoise(seed + o * 7919, period), amp: 1 / Math.pow(2, o) }); period *= 2; }
    const norm = layers.reduce((s, l) => s + l.amp, 0);
    return function (x, y) {
      let v = 0;
      for (const l of layers) v += l.n(x, y) * l.amp;
      return v / norm;
    };
  }

  // Build a texture tile. RGB is mid-grey (128) shifted by the relief, so
  // compositing it with 'overlay' genuinely lightens the peaks and darkens the
  // valleys without tinting the chosen colour (128 is overlay's neutral point).
  // Alpha is opaque; the caller controls strength with globalAlpha.
  function textureTile(kind, seed, size) {
    const S = size || 128;
    const data = new Uint8ClampedArray(S * S * 4);
    const s = (seed >>> 0) || 12345;
    const shade = (i, amount) => {
      const v = 128 + Math.round(amount * 46);
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
      data[i + 3] = 255;
    };
    if (kind === 'smooth') {
      // fully transparent tile -> overlay changes nothing
      for (let i = 3; i < data.length; i += 4) data[i] = 0;
      return { size: S, data };
    }
    if (kind === 'stripes') {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const band = Math.sin(x / S * Math.PI * 12);
          shade(i, band > 0.82 ? 0.55 : band < -0.82 ? -0.35 : 0);
        }
      }
      return { size: S, data };
    }
    const noise = kind === 'sand' ? fbm(s, 64, 2)
      : kind === 'roller' ? fbm(s, 8, 2)
        : kind === 'stucco' ? fbm(s, 10, 5)
          : fbm(s, 20, 4); // orangepeel
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        // stretch the noise horizontally into roller streaks
        const n = kind === 'roller' ? noise(x / 6, y / 1.2) : noise(x, y);
        shade(i, (n - 0.5) * 2); // signed relief around mid-grey
      }
    }
    return { size: S, data };
  }

  // Affine matrix that maps triangle (src) onto triangle (dst). Exposed so the
  // warp can be tested: feeding the three src vertices through the matrix must
  // land exactly on the three dst vertices.
  function triAffine(src, dst) {
    const [sx0, sy0] = src[0], [sx1, sy1] = src[1], [sx2, sy2] = src[2];
    const [dx0, dy0] = dst[0], [dx1, dy1] = dst[1], [dx2, dy2] = dst[2];
    const denom = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0;
    if (Math.abs(denom) < 1e-12) return null;
    const m11 = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom;
    const m12 = (sy1 * dy2 + sy0 * (dy1 - dy2) - sy2 * dy1 + (sy2 - sy1) * dy0) / denom;
    const m21 = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / denom;
    const m22 = -(sx1 * dy2 + sx0 * (dy1 - dy2) - sx2 * dy1 + (sx2 - sx1) * dy0) / denom;
    const tx = (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / denom;
    const ty = (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom;
    return [m11, m12, m21, m22, tx, ty];
  }

  // Apply a triAffine matrix to a point.
  function applyAffine(m, p) {
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  }

  // ============================================================
  // MATERIAL ESTIMATE (pure)
  // ============================================================

  // Practical coverage for Indian walls (a tin's "theoretical" figure is
  // optimistic on real plaster, so we use the conservative on-site rate).
  const RATES = {
    interior: {
      label: 'Interior',
      paint: { coverage: 130, coats: 2, wastage: 0.10, name: 'Emulsion paint', unit: 'L', packs: [1, 4, 10, 20], packLabel: 'L tin' },
      putty: { coveragePerKg: 14, coats: 2, name: 'Wall putty', unit: 'kg', pack: 40, packLabel: 'kg bag' },
      primer: { coverage: 130, coats: 1, name: 'Primer', unit: 'L', packs: [1, 4, 10, 20], packLabel: 'L tin' }
    },
    exterior: {
      label: 'Exterior',
      paint: { coverage: 120, coats: 2, wastage: 0.12, name: 'Exterior emulsion', unit: 'L', packs: [1, 4, 10, 20], packLabel: 'L tin' },
      putty: { coveragePerKg: 12, coats: 2, name: 'Wall putty', unit: 'kg', pack: 40, packLabel: 'kg bag' },
      primer: { coverage: 110, coats: 1, name: 'Exterior primer', unit: 'L', packs: [1, 4, 10, 20], packLabel: 'L tin' }
    }
  };

  function round1(n) { return Math.round((n || 0) * 10) / 10; }

  // Pick whole packs to buy: the smallest single pack that covers the amount,
  // or whole multiples of the largest pack when it does not fit in one.
  function packUp(value, packs) {
    const v = value || 0;
    if (!(v > 0)) return { count: 0, size: 0, total: 0, label: '0' };
    const sorted = (packs || []).slice().sort((a, b) => a - b);
    for (const p of sorted) {
      if (v <= p) return { count: 1, size: p, total: p, label: '1 × ' + p };
    }
    const big = sorted[sorted.length - 1];
    const count = Math.ceil(v / big);
    return { count: count, size: big, total: count * big, label: count + ' × ' + big };
  }

  function packUpKg(kg, bagSize) {
    const bag = bagSize || 40;
    if (!(kg > 0)) return { count: 0, size: bag, total: 0, label: '0' };
    const count = Math.ceil(kg / bag);
    return { count: count, size: bag, total: count * bag, label: count + ' × ' + bag };
  }

  // Turn square feet into what to buy. `areaType` picks interior or exterior
  // rates; `opts.coats` overrides the paint coats.
  function computeMaterial(sqft, areaType, opts) {
    const o = opts || {};
    const area = Math.max(0, sqft || 0);
    const set = RATES[areaType] || RATES.interior;
    const coats = o.coats > 0 ? o.coats : set.paint.coats;
    const coverage = o.coverage > 0 ? o.coverage : set.paint.coverage;
    const paintRaw = area * coats / coverage * (1 + set.paint.wastage);
    const puttyRaw = area * set.putty.coats / set.putty.coveragePerKg;
    const primerRaw = area * set.primer.coats / set.primer.coverage;
    const paint = packUp(paintRaw, set.paint.packs);
    const putty = packUpKg(puttyRaw, set.putty.pack);
    const primer = packUp(primerRaw, set.primer.packs);
    return {
      area: round1(area), areaType: set.label, coats: coats, coverage: coverage,
      paint: { name: set.paint.name, litres: round1(paintRaw), unit: 'L', pack: paint.label, packTotal: paint.total, packs: paint.count, packSize: paint.size },
      putty: { name: set.putty.name, kg: round1(puttyRaw), unit: 'kg', pack: putty.label, packTotal: putty.total, packs: putty.count },
      primer: { name: set.primer.name, litres: round1(primerRaw), unit: 'L', pack: primer.label, packTotal: primer.total, packs: primer.count, packSize: primer.size }
    };
  }

  // ============================================================
  // EDITOR (browser only)
  // ============================================================
  // The on-photo tool: load a photo, tap four wall corners, choose colour /
  // finish / texture, and repaint that wall. It reuses PPMeasure's homography
  // so the same geometry that measures the wall also warps the texture onto it.

  const MAX_EDGE = 1400; // cap the working photo so the canvas stays light

  // A built-in demo photo, drawn (not photographed) so the feature works with
  // no upload at all — a big button the client can press on the spot. Returns
  // a data URL. `scene` is 'interior' or 'exterior'.
  function demoScene(scene) {
    if (typeof document === 'undefined') return '';
    const W = 1000, H = 700;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    if (scene === 'exterior') {
      // sky gradient
      const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
      sky.addColorStop(0, '#9fc9e8'); sky.addColorStop(1, '#dceaf2');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // ground
      g.fillStyle = '#6f7f4a'; g.fillRect(0, H * 0.78, W, H * 0.22);
      // house body: a front wall + a side wall, both slightly off-white
      g.fillStyle = '#cfc7b4'; g.fillRect(150, 250, 700, 300);   // front wall
      g.fillStyle = '#b9b1a0'; g.fillRect(60, 300, 90, 250);     // side wall
      // roof
      g.fillStyle = '#7a4a2b';
      g.beginPath(); g.moveTo(120, 255); g.lineTo(500, 90); g.lineTo(880, 255); g.closePath(); g.fill();
      // windows + door
      g.fillStyle = '#5b7f96'; g.fillRect(240, 330, 120, 110); g.fillRect(640, 330, 120, 110);
      g.strokeStyle = '#f3efe6'; g.lineWidth = 8; g.strokeRect(240, 330, 120, 110); g.strokeRect(640, 330, 120, 110);
      g.fillStyle = '#6b4a2f'; g.fillRect(455, 400, 110, 150);
      g.fillStyle = '#8a8577'; g.fillRect(150, 545, 700, 20);    // plinth
    } else {
      // A simple interior: back wall (the paintable one) with a floor, a side
      // wall, a window and a skirting so the wall reads as a real wall.
      g.fillStyle = '#efe8dc'; g.fillRect(0, 0, W, H);
      // side wall (darker, receding)
      g.fillStyle = '#ddd3c4'; g.beginPath();
      g.moveTo(0, 60); g.lineTo(150, 120); g.lineTo(150, 560); g.lineTo(0, 640); g.closePath(); g.fill();
      // back wall
      g.fillStyle = '#f0ebe0'; g.fillRect(150, 120, 700, 440);
      // soft vignette so the wall has real shading (that is what we preserve)
      const vig = g.createRadialGradient(500, 330, 60, 500, 330, 560);
      vig.addColorStop(0, 'rgba(255,255,255,0.20)');
      vig.addColorStop(1, 'rgba(60,50,40,0.22)');
      g.fillStyle = vig; g.fillRect(150, 120, 700, 440);
      // floor
      g.fillStyle = '#8a6238'; g.fillRect(0, 560, W, H - 560);
      for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(i * 80, 560); g.lineTo(i * 80 - 60, H); g.stroke(); }
      // window
      g.fillStyle = '#bcd8ea'; g.fillRect(720, 200, 110, 140);
      g.strokeStyle = '#f3efe6'; g.lineWidth = 8; g.strokeRect(720, 200, 110, 140);
      g.beginPath(); g.moveTo(775, 200); g.lineTo(775, 340); g.stroke();
      // skirting
      g.fillStyle = '#f7f4ee'; g.fillRect(150, 540, 700, 20);
    }
    try { return c.toDataURL('image/jpeg', 0.85); } catch (e) { return ''; }
  }

  // The four corners of the paintable wall in each demo scene, as fractions of
  // the canvas, so a demo can pre-fill the wall corners for one tap.
  const DEMO_CORNERS = {
    interior: [[0.15, 120 / 700], [0.85, 120 / 700], [0.85, 560 / 700], [0.15, 560 / 700]],
    exterior: [[0.15, 250 / 700], [0.85, 250 / 700], [0.85, 550 / 700], [0.15, 550 / 700]]
  };

  function createEditor(opts) {
    const o = opts || {};
    const canvas = o.canvas;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const hintEl = o.hintEl || null;
    const buttons = o.buttons || {};
    const onChange = typeof o.onChange === 'function' ? o.onChange : function () {};

    let baseData = null;      // the original pixels of the working canvas
    let corners = [];         // tapped wall corners (canvas pixels)
    let mode = 'corners';     // 'corners' | 'colour'
    let hover = null;
    let style = { hex: '#e4d9c6', finish: 'matte', texture: 'smooth', opacity: 1, showBefore: false };
    let wallStats = null;     // { meanLum, target } for the current corners
    let textureCache = {};    // kind -> HTMLCanvasElement tile

    const M = (typeof window !== 'undefined' && window.PPMeasure) ? window.PPMeasure : null;

    function setHint(msg) { if (hintEl) hintEl.textContent = msg || ''; }

    // ---- photo loading ----
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        if (!src) { baseData = null; clear(); resolve(false); return; }
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => {
          const MAX = MAX_EDGE;
          let w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          if (w >= h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          canvas.width = w; canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          // A tainted canvas (cross-origin photo, or some file:// setups) throws
          // on getImageData. Reject the promise so the caller can show a message
          // instead of an uncaught error.
          try {
            ctx.drawImage(im, 0, 0, w, h);
            baseData = ctx.getImageData(0, 0, w, h);
          } catch (e) { reject(e); return; }
          recomputeWall();
          render();
          resolve(true);
        };
        im.onerror = () => reject(new Error('image failed to load'));
        im.src = src;
      });
    }

    // A demo pre-fills the wall corners (scaled to the working canvas).
    function setDemoCorners(which) {
      const frac = DEMO_CORNERS[which] || DEMO_CORNERS.interior;
      corners = frac.map(p => [p[0] * canvas.width, p[1] * canvas.height]);
      recomputeWall();
      render();
    }

    // ---- wall statistics (mean lightness) ----
    // Sampling the pixels inside the tapped quad tells us how light the wall
    // is, which is what keeps the recolour from looking like a flat sticker.
    function recomputeWall() {
      wallStats = null;
      if (!baseData || corners.length !== 4 || !M) return;
      const d = baseData.data, W = canvas.width;
      const minX = Math.max(0, Math.floor(Math.min.apply(null, corners.map(c => c[0]))));
      const maxX = Math.min(W - 1, Math.ceil(Math.max.apply(null, corners.map(c => c[0]))));
      const minY = Math.max(0, Math.floor(Math.min.apply(null, corners.map(c => c[1]))));
      const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max.apply(null, corners.map(c => c[1]))));
      let sum = 0, n = 0;
      for (let y = minY; y <= maxY; y += 2) {
        for (let x = minX; x <= maxX; x += 2) {
          if (!inQuad(corners, [x, y])) continue;
          const i = (y * W + x) * 4;
          sum += luminance([d[i], d[i + 1], d[i + 2]]);
          n++;
        }
      }
      if (!n) return;
      const meanLum = Math.max(0.02, sum / n);
      wallStats = { meanLum: meanLum, target: shadeTarget(style.hex, style.finish) };
    }

    function inQuad(quad, p) {
      // point-in-convex-quad via consistent cross-product signs
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        if (cross === 0) continue;
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
      }
      return true;
    }

    // ---- texture tiles ----
    function tileFor(kind) {
      if (kind === 'smooth') return null;
      if (textureCache[kind]) return textureCache[kind];
      const t = textureTile(kind, 20261018, 160);
      const c = document.createElement('canvas');
      c.width = t.size; c.height = t.size;
      const cg = c.getContext('2d');
      const id = cg.createImageData(t.size, t.size);
      id.data.set(t.data);
      cg.putImageData(id, 0, 0);
      textureCache[kind] = c;
      return c;
    }

    // ---- the actual repaint ----
    // For every pixel inside the wall quad: read the original colour, rebuild
    // it in the target hue at the same relative lightness, then lay the texture
    // on top. Pixels outside the quad are left untouched.
    function render() {
      if (!baseData) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      ctx.putImageData(baseData, 0, 0);
      if (style.showBefore || corners.length !== 4 || !wallStats || !wallStats.target) {
        drawCorners();
        emit();
        return;
      }
      const W = canvas.width, H = canvas.height;
      // Start from a copy of the photo, not a blank ImageData: createImageData
      // yields transparent black, which would erase everything outside the wall.
      const out = ctx.createImageData(W, H);
      out.data.set(baseData.data);
      const src = baseData.data, dst = out.data;
      const target = wallStats.target, meanLum = wallStats.meanLum;
      const alpha = style.opacity;
      const minX = Math.max(0, Math.floor(Math.min.apply(null, corners.map(c => c[0]))));
      const maxX = Math.min(W - 1, Math.ceil(Math.max.apply(null, corners.map(c => c[0]))));
      const minY = Math.max(0, Math.floor(Math.min.apply(null, corners.map(c => c[1]))));
      const maxY = Math.min(H - 1, Math.ceil(Math.max.apply(null, corners.map(c => c[1]))));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!inQuad(corners, [x, y])) continue;
          const i = (y * W + x) * 4;
          const painted = recolourPixel([src[i], src[i + 1], src[i + 2]], target, meanLum);
          dst[i] = src[i] + (painted[0] - src[i]) * alpha;
          dst[i + 1] = src[i + 1] + (painted[1] - src[i + 1]) * alpha;
          dst[i + 2] = src[i + 2] + (painted[2] - src[i + 2]) * alpha;
          dst[i + 3] = src[i + 3];
        }
      }
      ctx.putImageData(out, 0, 0);

      // Texture overlay, perspective-correct. The wall quad maps to the unit
      // square through H; we subdivide that square into N×N cells and draw the
      // matching slice of a pre-tiled pattern through each cell's own affine.
      // Because every cell is placed by H, the grain follows the wall's real
      // perspective instead of lying flat across the photo.
      const tile = tileFor(style.texture);
      if (tile) drawWarpedTexture(tile);
      drawCorners();
      emit();
    }

    // Pre-tile the texture `rep` times so a sub-rect of it can be drawn per cell.
    function buildPattern(tile, rep) {
      const T = tile.width;
      const c = document.createElement('canvas');
      c.width = c.height = T * rep;
      const cg = c.getContext('2d');
      for (let y = 0; y < rep; y++) for (let x = 0; x < rep; x++) cg.drawImage(tile, x * T, y * T);
      return c;
    }

    function drawWarpedTexture(tile) {
      if (!M || !M.homographyFromQuad || !M.applyH) return;
      const H = M.homographyFromQuad([[0, 0], [1, 0], [1, 1], [0, 1]], corners);
      if (!H) return;
      const REP = 6, N = 12;
      const pat = buildPattern(tile, REP);
      const cell = pat.width / N;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(corners[k][0], corners[k][1]);
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.55;
      for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
          const u0 = ix / N, v0 = iy / N, u1 = (ix + 1) / N, v1 = (iy + 1) / N;
          const p00 = M.applyH(H, [u0, v0]);
          const p10 = M.applyH(H, [u1, v0]);
          const p01 = M.applyH(H, [u0, v1]);
          const p11 = M.applyH(H, [u1, v1]);
          const sx = ix * cell, sy = iy * cell;
          const A = triAffine([[sx, sy], [sx + cell, sy], [sx, sy + cell]], [p00, p10, p01]);
          if (!A) continue;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p00[0], p00[1]);
          ctx.lineTo(p10[0], p10[1]);
          ctx.lineTo(p11[0], p11[1]);
          ctx.lineTo(p01[0], p01[1]);
          ctx.closePath();
          ctx.clip();
          ctx.setTransform(A[0], A[1], A[2], A[3], A[4], A[5]);
          ctx.drawImage(pat, sx, sy, cell, cell, sx, sy, cell, cell);
          ctx.restore();
        }
      }
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function drawCorners() {
      if (!corners.length) return;
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      if (corners.length === 4) ctx.closePath();
      ctx.stroke();
      corners.forEach(p => {
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = '#16a34a'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.restore();
    }

    // ---- interaction ----
    function toCanvas(ev) {
      const r = canvas.getBoundingClientRect();
      return [
        (ev.clientX - r.left) * canvas.width / r.width,
        (ev.clientY - r.top) * canvas.height / r.height
      ];
    }
    function onDown(ev) {
      if (!baseData || mode !== 'corners') return;
      ev.preventDefault();
      const p = toCanvas(ev);
      if (corners.length >= 4) corners = [];
      corners.push(p);
      if (corners.length === 4) {
        recomputeWall();
        setHint('Wall selected. Now pick a colour below.');
        if (buttons.corners) buttons.corners.classList.remove('active');
        mode = 'colour';
      } else {
        setHint('Tap corner ' + (corners.length + 1) + ' of 4.');
      }
      render();
    }
    function onMove(ev) { if (mode === 'corners' && corners.length && corners.length < 4) { hover = toCanvas(ev); render(); } }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);

    function setMode(m) {
      if (m === 'corners') { corners = []; wallStats = null; }
      mode = m;
      setHint(m === 'corners' ? 'Tap the four corners of the wall.' : 'Pick a colour.');
      if (buttons.corners) buttons.corners.classList.toggle('active', m === 'corners');
      render();
    }
    function setStyle(patch) {
      Object.assign(style, patch || {});
      if (wallStats) wallStats.target = shadeTarget(style.hex, style.finish);
      render();
    }
    function toggleBefore(on) { style.showBefore = !!on; render(); }
    function clear() { corners = []; wallStats = null; hover = null; render(); }
    function state() {
      return {
        mode: mode, corners: corners.slice(), style: Object.assign({}, style),
        ready: corners.length === 4 && !!wallStats,
        meanLum: wallStats ? wallStats.meanLum : null
      };
    }
    function emit() { onChange(state()); }
    function hasImage() { return !!baseData; }
    function toDataURL() { try { return canvas.toDataURL('image/jpeg', 0.9); } catch (e) { return ''; } }

    render();
    return {
      loadImage, setDemoCorners, setMode, setStyle, toggleBefore, clear,
      state, render, hasImage, toDataURL,
      getCorners: () => corners.slice()
    };
  }

  // ============================================================
  // PAGE CONTROLLER (browser only, guarded)
  // ============================================================
  // Wires the Paint-my-photo section. Runs only when its canvas exists, so
  // loading this file on any other page is a no-op.
  function initPage() {
    if (typeof document === 'undefined') return;
    const $ = (id) => document.getElementById(id);
    const canvas = $('pmpCanvas');
    if (!canvas) return;

    const editor = createEditor({
      canvas: canvas,
      hintEl: $('pmpHint'),
      buttons: { corners: $('pmpCornersBtn') },
      onChange: () => { if ($('pmpEmpty')) $('pmpEmpty').hidden = editor.hasImage(); }
    });
    if (!editor) return;

    const state = {
      hex: '#e4d9c6', finish: 'matte', texture: 'smooth',
      areaType: 'interior', coats: 2, wallW: 0, wallH: 0
    };

    function fmtSqft(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('en-IN') + ' sq ft'; }
    function fmtNum(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('en-IN'); }

    // ---- colour palette ----
    const palEl = $('pmpPalette');
    if (palEl) {
      palEl.innerHTML = PALETTE.map(p =>
        '<button type="button" class="pmp-swatch" data-hex="' + p.hex + '" title="' + p.name + '" aria-label="' + p.name + '" style="--sw:' + p.hex + '"></button>'
      ).join('');
      palEl.addEventListener('click', (e) => {
        const b = e.target.closest('.pmp-swatch');
        if (!b) return;
        setHex(b.dataset.hex);
      });
    }
    function markSwatch() {
      if (!palEl) return;
      palEl.querySelectorAll('.pmp-swatch').forEach(b => b.classList.toggle('active', b.dataset.hex.toLowerCase() === state.hex.toLowerCase()));
    }
    function setHex(hex) {
      const rgb = hexToRgb(hex);
      if (!rgb) return;
      state.hex = '#' + hex.replace(/^#/, '').toLowerCase();
      const custom = $('pmpCustom'), hexIn = $('pmpHex');
      if (custom) custom.value = state.hex;
      if (hexIn) hexIn.value = state.hex;
      markSwatch();
      editor.setStyle({ hex: state.hex });
    }

    // ---- custom colour ----
    const custom = $('pmpCustom'), hexIn = $('pmpHex');
    if (custom) custom.addEventListener('input', () => setHex(custom.value));
    if (hexIn) hexIn.addEventListener('change', () => setHex(hexIn.value));
    markSwatch();

    // ---- finishes ----
    const finEl = $('pmpFinishes');
    if (finEl) finEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pmp-finish');
      if (!b) return;
      state.finish = b.dataset.finish;
      finEl.querySelectorAll('.pmp-finish').forEach(x => x.classList.toggle('active', x === b));
      editor.setStyle({ finish: state.finish });
    });

    // ---- textures ----
    const texEl = $('pmpTextures');
    if (texEl) {
      texEl.innerHTML = TEXTURES.map(t =>
        '<button type="button" class="pmp-tex' + (t.id === 'smooth' ? ' active' : '') + '" data-tex="' + t.id + '" title="' + t.note + '">' + t.name + '</button>'
      ).join('');
      texEl.addEventListener('click', (e) => {
        const b = e.target.closest('.pmp-tex');
        if (!b) return;
        state.texture = b.dataset.tex;
        texEl.querySelectorAll('.pmp-tex').forEach(x => x.classList.toggle('active', x === b));
        const t = TEXTURES.find(x => x.id === state.texture);
        if ($('pmpTextureNote') && t) $('pmpTextureNote').textContent = t.name + ': ' + t.note + '.';
        editor.setStyle({ texture: state.texture });
      });
    }

    // ---- opacity ----
    const opac = $('pmpOpacity');
    if (opac) opac.addEventListener('input', () => {
      if ($('pmpOpacityVal')) $('pmpOpacityVal').textContent = opac.value + '%';
      editor.setStyle({ opacity: Math.max(0, Math.min(1, opac.value / 100)) });
    });

    // ---- area + material ----
    const wIn = $('pmpWallW'), hIn = $('pmpWallH');
    const typeEl = $('pmpAreaType'), coatsEl = $('pmpCoats');

    function wallSqft() {
      const w = parseFloat(wIn && wIn.value) || 0;
      const h = parseFloat(hIn && hIn.value) || 0;
      return w > 0 && h > 0 ? w * h : 0;
    }
    function renderMaterial() {
      const sq = wallSqft();
      if ($('pmpAreaSqft')) $('pmpAreaSqft').textContent = fmtSqft(sq);
      const box = $('pmpMaterial');
      if (!box) return;
      if (!sq) {
        box.innerHTML = '<p class="pmp-note">Enter the wall width and height to see the paint, putty and primer needed.</p>';
        return;
      }
      const m = computeMaterial(sq, state.areaType, { coats: state.coats });
      const row = (ic, label, amount, pack) =>
        '<div class="pmp-mat-row"><span class="pmp-mat-ic">' + ic + '</span>' +
        '<span class="pmp-mat-label">' + label + '</span>' +
        '<span class="pmp-mat-amt">' + amount + '</span>' +
        '<span class="pmp-mat-pack">' + pack + '</span></div>';
      box.innerHTML =
        row('🎨', m.paint.name, fmtNum(m.paint.litres) + ' L', 'buy ' + m.paint.pack + ' L') +
        row('🧱', m.putty.name, fmtNum(m.putty.kg) + ' kg', 'buy ' + m.putty.pack + ' kg') +
        row('🖌️', m.primer.name, fmtNum(m.primer.litres) + ' L', 'buy ' + m.primer.pack + ' L') +
        '<p class="pmp-note">' + m.coats + ' coats · ' + m.coverage + ' sq ft/L · ' + m.areaType + ' walls</p>';
      updateQuote(m);
    }
    function updateQuote(m) {
      const a = $('pmpQuote');
      if (!a) return;
      const sq = wallSqft();
      if (!sq) { a.href = './contact.html'; return; }
      const q = '?colors=' + encodeURIComponent(state.hex) +
        '&sqft=' + encodeURIComponent(Math.round(sq)) +
        '&coats=' + encodeURIComponent(state.coats) +
        '&litres=' + encodeURIComponent(fmtNum(m.paint.litres)) +
        '&finish=' + encodeURIComponent(state.finish) +
        '&texture=' + encodeURIComponent(state.texture) +
        '&area=' + encodeURIComponent(state.areaType);
      a.href = './contact.html' + q;
    }
    if (wIn) wIn.addEventListener('input', renderMaterial);
    if (hIn) hIn.addEventListener('input', renderMaterial);
    if (typeEl) typeEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pmp-atype');
      if (!b) return;
      state.areaType = b.dataset.type;
      typeEl.querySelectorAll('.pmp-atype').forEach(x => x.classList.toggle('active', x === b));
      renderMaterial();
    });
    if (coatsEl) coatsEl.addEventListener('input', () => {
      state.coats = parseInt(coatsEl.value, 10) || 2;
      if ($('pmpCoatsVal')) $('pmpCoatsVal').textContent = state.coats;
      renderMaterial();
    });

    // ---- photo sources ----
    const fileIn = $('pmpFile');
    if (fileIn) fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      downscale(f, (data) => {
        editor.loadImage(data).then((ok) => {
          if (ok) { editor.setMode('corners'); if ($('pmpHint')) $('pmpHint').textContent = 'Now tap the four corners of the wall.'; }
        }).catch(() => { if ($('pmpHint')) $('pmpHint').textContent = 'That image could not be loaded. Try another.'; });
      });
    });
    // Downscale an uploaded file to a workable JPEG data URL (same idea as the
    // work log) so a 12 MP phone photo does not choke the canvas.
    function downscale(file, cb) {
      const reader = new FileReader();
      reader.onload = () => {
        const im = new Image();
        im.onload = () => {
          const MAX = 1400;
          let w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          if (w >= h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(im, 0, 0, w, h);
            cb(c.toDataURL('image/jpeg', 0.82));
          } catch (e) { cb(reader.result); }
        };
        im.onerror = () => cb(reader.result);
        im.src = reader.result;
      };
      reader.onerror = () => cb('');
      reader.readAsDataURL(file);
    }

    function loadDemo(which) {
      const src = demoScene(which);
      if (!src) return;
      editor.loadImage(src).then((ok) => {
        if (!ok) return;
        editor.setDemoCorners(which);
        editor.setStyle({ hex: state.hex, finish: state.finish, texture: state.texture });
        if ($('pmpHint')) $('pmpHint').textContent = 'Wall selected. Pick a colour, finish and texture to repaint it.';
      }).catch(() => {});
    }
    const dI = $('pmpDemoInterior'), dE = $('pmpDemoExterior');
    if (dI) dI.addEventListener('click', () => loadDemo('interior'));
    if (dE) dE.addEventListener('click', () => loadDemo('exterior'));

    // ---- tools ----
    const cBtn = $('pmpCornersBtn'), bBtn = $('pmpBeforeBtn'), sBtn = $('pmpSaveBtn'), clBtn = $('pmpClearBtn');
    if (cBtn) cBtn.addEventListener('click', () => editor.setMode('corners'));
    if (bBtn) {
      let before = false;
      bBtn.addEventListener('click', () => {
        before = !before;
        editor.toggleBefore(before);
        bBtn.classList.toggle('active', before);
        bBtn.textContent = before ? '🎨 Show painted' : '👁️ Before / after';
      });
    }
    if (sBtn) sBtn.addEventListener('click', () => {
      const url = editor.toDataURL();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url; a.download = 'painter-plus-preview.jpg';
      document.body.appendChild(a); a.click(); a.remove();
    });
    if (clBtn) clBtn.addEventListener('click', () => { editor.clear(); editor.setMode('corners'); });

    renderMaterial();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage);
    else initPage();
  }

  return { PALETTE, clamp01, hexToRgb, rgbToHex, srgbToLinear, linearToSrgb, luminance, shadeTarget, recolourPixel, FINISH_GAIN,
    TEXTURES, rng, valueNoise, fbm, textureTile, triAffine, applyAffine,
    RATES, packUp, packUpKg, computeMaterial, round1,
    demoScene, DEMO_CORNERS, createEditor, initPage, MAX_EDGE };
});
