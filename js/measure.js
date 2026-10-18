/* ============================================================
   PAINTER PLUS — PHOTO MEASUREMENT & COSTING
   ------------------------------------------------------------
   Two jobs, in one file:

   1. GEOMETRY (pure, no DOM — unit-testable in Node)
      Turn a shape drawn on a photo into real square feet.

      A photo is a perspective projection of the wall, so a plain
      pixel count is not enough: the same wall photographed at an
      angle covers fewer pixels than it does face-on. To correct
      for that we ask the painter to tap the FOUR corners of a
      rectangle whose real size is known (the wall itself, a door,
      a window, a row of tiles) and type its real width × height.
      Those four point pairs define a homography — a projective
      map from image pixels to real feet. Applying it to the drawn
      polygon and measuring that with the shoelace formula gives
      the true area even for a skewed, tilted photo.

   2. EDITOR (browser only)
      A small canvas tool: load the work photo, tap the four
      calibration corners, then tap out the painted area. It
      reports the square feet live as the polygon grows.

   Costing helpers (labour per sq ft, litres of paint) live here
   too so the same numbers are used by the page and by any test.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PPMeasure = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ============================================================
  // PURE GEOMETRY
  // ============================================================

  // Shoelace formula. Accepts [[x,y], …] and returns the unsigned area.
  function polygonArea(pts) {
    if (!Array.isArray(pts) || pts.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (!a || !b) return 0;
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  }

  function distance(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Gaussian elimination with partial pivoting. Solves A·x = b for an
  // n×n A. Returns the solution vector, or null if A is singular.
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) return null;
      const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp;
      const pv = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= pv;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map(row => row[n]);
  }

  // Homography (projective transform) mapping four source points onto
  // four destination points, both in order. Returns a 3×3 matrix, or
  // null when the source quad is degenerate (collinear corners).
  function homographyFromQuad(src, dst) {
    if (!src || !dst || src.length !== 4 || dst.length !== 4) return null;
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const x = src[i][0], y = src[i][1];
      const u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const h = solve(A, b);
    if (!h) return null;
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  function applyH(H, p) {
    const d = H[2][0] * p[0] + H[2][1] * p[1] + H[2][2];
    if (Math.abs(d) < 1e-12) return [0, 0];
    return [
      (H[0][0] * p[0] + H[0][1] * p[1] + H[0][2]) / d,
      (H[1][0] * p[0] + H[1][1] * p[1] + H[1][2]) / d
    ];
  }

  function transformPoints(H, pts) {
    return (pts || []).map(p => applyH(H, p));
  }

  // Build the homography for the calibration rectangle: four tapped
  // corners (in image pixels) → a real rectangle of w × h feet.
  function homographyFromCalibration(corners, w, h) {
    if (!corners || corners.length !== 4 || !(w > 0) || !(h > 0)) return null;
    return homographyFromQuad(corners, [[0, 0], [w, 0], [w, h], [0, h]]);
  }

  // Real square feet of a drawn polygon under a calibration.
  function calibratedArea(H, pts) {
    if (!H || !pts || pts.length < 3) return 0;
    return polygonArea(transformPoints(H, pts));
  }

  // Flat scale (no perspective correction): feet per image pixel.
  function flatArea(pts, ftPerPx) {
    if (!(ftPerPx > 0)) return 0;
    return polygonArea(pts) * ftPerPx * ftPerPx;
  }

  // ============================================================
  // COSTING
  // ============================================================
  const DEFAULT_COVERAGE = 130; // sq ft one litre covers, one coat
  const DEFAULT_COATS = 2;
  const DEFAULT_WASTAGE = 0.1;  // +10% for touch-ups and absorption

  // Litres of paint for an area, including wastage.
  function paintLitres(sqft, opts) {
    const o = opts || {};
    const area = num(sqft);
    const coats = num(o.coats) || DEFAULT_COATS;
    const coverage = num(o.coverage) || DEFAULT_COVERAGE;
    const wastage = o.wastage === undefined ? DEFAULT_WASTAGE : num(o.wastage);
    if (!area) return 0;
    return (area * coats / coverage) * (1 + wastage);
  }

  // Labour cost = measured area × rate per square foot.
  function labourCost(sqft, ratePerSqft) {
    return num(sqft) * num(ratePerSqft);
  }

  function num(n) { const v = parseFloat(n); return isFinite(v) && v > 0 ? v : 0; }

  // ============================================================
  // EDITOR (browser only)
  // ============================================================
  // Interactive canvas: the painter taps four calibration corners,
  // then taps out the painted area. Everything is kept in canvas
  // pixel space; the homography converts it to feet on demand.
  const MAX_EDGE = 1600; // cap the working image so the canvas stays light

  function createEditor(opts) {
    const o = opts || {};
    const canvas = o.canvas;
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    const onChange = typeof o.onChange === 'function' ? o.onChange : function () {};
    const hintEl = o.hintEl || null;
    const buttons = o.buttons || {};

    let img = null;
    let mode = 'idle';        // 'idle' | 'calib' | 'draw'
    let corners = [];         // calibration corners, canvas px (max 4)
    let calibW = 0, calibH = 0; // real size of the calibration rectangle, feet
    let poly = [];            // drawn polygon, canvas px
    let H = null;             // homography: canvas px -> feet
    let hover = null;

    function setHint(msg) { if (hintEl) hintEl.textContent = msg || ''; }

    function recompute() {
      H = homographyFromCalibration(corners, calibW, calibH);
      return H;
    }

    function measured() {
      if (!H || poly.length < 3) return 0;
      return calibratedArea(H, poly);
    }

    // ---- drawing ----
    function toCanvas(ev) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return [0, 0];
      const x = (ev.clientX - r.left) * (canvas.width / r.width);
      const y = (ev.clientY - r.top) * (canvas.height / r.height);
      return [
        Math.max(0, Math.min(canvas.width, x)),
        Math.max(0, Math.min(canvas.height, y))
      ];
    }

    function drawHandle(p, colour) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }

    function drawPolyline(pts, colour, close) {
      if (!pts.length) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (close) ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = colour;
      ctx.stroke();
      ctx.restore();
    }

    function label(text, at, colour) {
      ctx.save();
      ctx.font = '600 15px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 16;
      const h = 26;
      const x = Math.max(4, Math.min(canvas.width - w - 4, at[0] - w / 2));
      const y = Math.max(4, Math.min(canvas.height - h - 4, at[1] - h / 2));
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 7) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 8, y + h / 2 + 1);
      ctx.restore();
    }

    function centroid(pts) {
      let x = 0, y = 0;
      pts.forEach(p => { x += p[0]; y += p[1]; });
      return [x / pts.length, y / pts.length];
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Calibration quad
      if (corners.length) {
        if (corners.length === 4) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(corners[0][0], corners[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
          ctx.closePath();
          ctx.fillStyle = 'rgba(22,163,74,0.16)';
          ctx.fill();
          ctx.restore();
          drawPolyline(corners, '#16a34a', true);
        } else {
          drawPolyline(corners, '#16a34a', false);
        }
        corners.forEach(p => drawHandle(p, '#16a34a'));
      }

      // Drawn polygon
      if (poly.length) {
        if (poly.length >= 3) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
          ctx.closePath();
          ctx.fillStyle = 'rgba(37,99,235,0.25)';
          ctx.fill();
          ctx.restore();
          drawPolyline(poly, '#2563EB', true);
          const sq = measured();
          if (sq > 0) label(fmtSqft(sq), centroid(poly), '#2563EB');
        } else {
          drawPolyline(poly, '#2563EB', false);
        }
        if (hover && mode === 'draw') drawPolyline([poly[poly.length - 1], hover], '#2563EB', false);
        poly.forEach(p => drawHandle(p, '#2563EB'));
      }
    }

    function fmtSqft(n) {
      return (Math.round(n * 10) / 10).toLocaleString('en-IN') + ' sq ft';
    }

    function state() {
      return {
        hasImage: !!img,
        mode: mode,
        corners: corners.length,
        points: poly.length,
        calibrated: !!H,
        sqft: measured()
      };
    }

    function emit() {
      updateButtons();
      onChange(getResult());
    }

    function updateButtons() {
      const set = (el, disabled) => { if (el) el.disabled = !!disabled; };
      set(buttons.calib, !img);
      set(buttons.draw, !img);
      set(buttons.undo, !img || (mode === 'calib' ? !corners.length : !poly.length));
      set(buttons.clear, !img || (mode === 'calib' ? !corners.length : !poly.length));
      set(buttons.reset, !img);
    }

    // ---- public API ----
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
          img = im;
          let w = im.naturalWidth || im.width;
          let h = im.naturalHeight || im.height;
          if (w >= h && w > MAX_EDGE) { h = Math.round(h * MAX_EDGE / w); w = MAX_EDGE; }
          else if (h > w && h > MAX_EDGE) { w = Math.round(w * MAX_EDGE / h); h = MAX_EDGE; }
          canvas.width = w; canvas.height = h;
          canvas.hidden = false;
          corners = []; poly = []; H = null; mode = 'idle';
          render(); emit();
          setHint('Tap “Set scale”, then tap the 4 corners of a known rectangle (wall, door, window).');
          resolve(state());
        };
        im.onerror = () => reject(new Error('Could not load the photo.'));
        im.src = src;
      });
    }

    function setMode(m) {
      if (!img) return;
      mode = m;
      if (m === 'calib') setHint('Tap the 4 corners in order: top-left, top-right, bottom-right, bottom-left.');
      if (m === 'draw') setHint(H ? 'Tap each corner of the painted area. Close to finish.' : 'Set the scale first, then tap the painted area.');
      render(); emit();
    }

    function undo() {
      if (mode === 'calib') { corners.pop(); recompute(); }
      else { poly.pop(); }
      render(); emit();
    }

    function clear() {
      if (mode === 'calib') { corners = []; recompute(); }
      else { poly = []; }
      render(); emit();
    }

    function reset() {
      corners = []; poly = []; H = null; calibW = 0; calibH = 0; mode = 'idle';
      render(); emit();
    }

    function setCalibSize(w, h) {
      calibW = num(w); calibH = num(h);
      recompute();
      render(); emit();
    }

    function getResult() {
      const sq = measured();
      return {
        ok: sq > 0,
        sqft: sq,
        calibrated: !!H,
        method: H ? 'calibrated' : (poly.length >= 3 ? 'uncalibrated' : null),
        calib: corners.length === 4 ? { corners: corners.map(p => p.slice()), w: calibW, h: calibH } : null,
        points: poly.map(p => p.slice()),
        canvas: { w: canvas.width, h: canvas.height }
      };
    }

    function setInitial(data) {
      if (!data) return;
      corners = [];
      poly = [];
      calibW = num(data.calib && data.calib.w);
      calibH = num(data.calib && data.calib.h);
      if (data.calib && Array.isArray(data.calib.corners)) {
        corners = data.calib.corners.slice(0, 4).map(p => [num0(p[0]), num0(p[1])]);
      }
      if (Array.isArray(data.points)) {
        poly = data.points.map(p => [num0(p[0]), num0(p[1])]);
      }
      recompute();
      render(); emit();
    }

    function num0(n) { const v = parseFloat(n); return isFinite(v) ? v : 0; }

    // ---- pointer input ----
    canvas.addEventListener('pointerdown', (ev) => {
      if (!img || mode === 'idle') return;
      ev.preventDefault();
      const p = toCanvas(ev);
      if (mode === 'calib') {
        if (corners.length < 4) {
          corners.push(p);
          if (corners.length === 4) {
            recompute();
            if (!H) setHint('Those corners do not form a rectangle. Tap “Set scale” and try again.');
            else if (!calibW || !calibH) setHint('Now type the real width and height of that rectangle.');
            else setHint('Scale set. Tap “Draw area” and tap out the painted surface.');
          }
        }
      } else if (mode === 'draw') {
        poly.push(p);
      }
      render(); emit();
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!img || mode !== 'draw' || !poly.length) return;
      hover = toCanvas(ev);
      render();
    });
    canvas.addEventListener('pointerleave', () => { hover = null; render(); });

    if (buttons.calib) buttons.calib.addEventListener('click', () => setMode('calib'));
    if (buttons.draw) buttons.draw.addEventListener('click', () => setMode('draw'));
    if (buttons.undo) buttons.undo.addEventListener('click', undo);
    if (buttons.clear) buttons.clear.addEventListener('click', clear);
    if (buttons.reset) buttons.reset.addEventListener('click', reset);

    updateButtons();

    return {
      loadImage, setMode, undo, clear, reset, setCalibSize,
      getResult, setInitial, state, render,
      hasImage: () => !!img
    };
  }

  return {
    // geometry
    polygonArea, distance, solve, homographyFromQuad, homographyFromCalibration,
    applyH, transformPoints, calibratedArea, flatArea,
    // costing
    paintLitres, labourCost,
    DEFAULT_COVERAGE, DEFAULT_COATS, DEFAULT_WASTAGE,
    // editor
    createEditor, MAX_EDGE
  };
});
