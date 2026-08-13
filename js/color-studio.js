/* ============================================================
   COLOR STUDIO (advanced) — multi-scene live paint preview
   State machine driven, so switching scenes/finishes/lighting never
   breaks: every scene keeps its own surface colours; the coverage
   slider interpolates each surface from its original colour toward
   the chosen colour so clients literally watch paint cover the wall.
   State is persisted to localStorage and carried into the quote form.
   ============================================================ */
(function () {
  "use strict";

  // --- Curated palette ---
  const PALETTE = [
    { hex: "#e8e3d8", name: "Warm Linen" },
    { hex: "#f4f1ea", name: "Ivory White" },
    { hex: "#d9d3c6", name: "Sand Dune" },
    { hex: "#c9d6d1", name: "Sage Mist" },
    { hex: "#a7c4a0", name: "Eucalyptus" },
    { hex: "#7d9b76", name: "Forest Calm" },
    { hex: "#bcd4e6", name: "Sky Breath" },
    { hex: "#5b8fb0", name: "Coastal Blue" },
    { hex: "#2f4858", name: "Deep Slate" },
    { hex: "#e8c4b8", name: "Blush Clay" },
    { hex: "#c06c61", name: "Terracotta" },
    { hex: "#8d5524", name: "Walnut Spice" },
    { hex: "#f2d399", name: "Soft Honey" },
    { hex: "#d4af37", name: "Golden Accent" },
    { hex: "#c0392b", name: "Brick Red" },
    { hex: "#34495e", name: "Charcoal Steel" },
    { hex: "#9b6a6a", name: "Muted Plum" },
    { hex: "#1e2a38", name: "Midnight" }
  ];

  // --- Surface defaults per scene (the "before" colours) ---
  const DEFAULTS = {
    living:   { back: "#e8e3d8", left: "#d9d3c6", right: "#d9d3c6", ceiling: "#f2efe8", floor: "#6b4f2a", accent: "#c0392b" },
    bedroom:  { back: "#efe7dd", left: "#ddd4c6", right: "#ddd4c6", ceiling: "#f4f1ea", floor: "#6b4f2a", accent: "#5b8fb0" },
    kitchen:  { back: "#eef2f5", left: "#e2e8ef", right: "#e2e8ef", ceiling: "#f7f9fb", floor: "#3a3a3a", cabinet: "#cfd8e3", accent: "#d4af37" },
    bathroom: { back: "#eaf2f5", left: "#dbe9ef", right: "#dbe9ef", ceiling: "#f6fbfd", floor: "#cfe0e6", tile: "#b8d6df", accent: "#5b8fb0" },
    dining:   { back: "#efe7dd", left: "#e2d8c8", right: "#e2d8c8", ceiling: "#f4f1ea", floor: "#6b4f2a", accent: "#c06c61" },
    office:   { back: "#eef2f5", left: "#e2e8ef", right: "#e2e8ef", ceiling: "#f7f9fb", floor: "#3a3a3a", cab: "#cfd8e3", accent: "#34495e" },
    kids:     { back: "#fde9ef", left: "#fbe3ea", right: "#fbe3ea", ceiling: "#fff5f8", floor: "#c98a4a", accent: "#5b8fb0" },
    exterior: { sky: "#bfe3ff", main: "#e8e3d8", roof: "#5a3a1a", ground: "#5a7c3a", trim: "#f4f1ea", door: "#8d5524" }
  };

  // Friendly labels for each surface key.
  const SURFACE_LABELS = {
    back: "Back wall", left: "Left wall", right: "Right wall", ceiling: "Ceiling",
    floor: "Floor", accent: "Accent", cabinet: "Cabinets", tile: "Tile wall", cab: "Cabinets",
    sky: "Sky", main: "Main wall", roof: "Roof", ground: "Ground", trim: "Trim", door: "Door"
  };

  // Preset schemes, keyed by scene. Each maps surface -> hex.
  const PRESETS = {
    living: [
      { name: "Calm Neutrals", colors: { back: "#e8e3d8", left: "#d9d3c6", right: "#d9d3c6", accent: "#c9d6d1" } },
      { name: "Coastal Cool", colors: { back: "#bcd4e6", left: "#c9d6d1", right: "#c9d6d1", accent: "#5b8fb0" } },
      { name: "Warm Earth", colors: { back: "#e8c4b8", left: "#d9d3c6", right: "#d9d3c6", accent: "#c06c61" } },
      { name: "Forest Calm", colors: { back: "#a7c4a0", left: "#c9d6d1", right: "#c9d6d1", accent: "#7d9b76" } }
    ],
    bedroom: [
      { name: "Restful Grey", colors: { back: "#d9d3c6", left: "#c9d6d1", right: "#c9d6d1", accent: "#5b8fb0" } },
      { name: "Soft Blush", colors: { back: "#e8c4b8", left: "#f4f1ea", right: "#f4f1ea", accent: "#9b6a6a" } },
      { name: "Deep Night", colors: { back: "#2f4858", left: "#34495e", right: "#34495e", accent: "#d4af37" } }
    ],
    kitchen: [
      { name: "Clean White", colors: { back: "#f4f1ea", left: "#eef2f5", right: "#eef2f5", cabinet: "#e8e3d8", accent: "#5b8fb0" } },
      { name: "Sage & Oak", colors: { back: "#c9d6d1", left: "#d9d3c6", right: "#d9d3c6", cabinet: "#8d5524", accent: "#a7c4a0" } },
      { name: "Modern Slate", colors: { back: "#eef2f5", left: "#e2e8ef", right: "#e2e8ef", cabinet: "#34495e", accent: "#d4af37" } }
    ],
    bathroom: [
      { name: "Spa Calm", colors: { back: "#eaf2f5", left: "#dbe9ef", right: "#dbe9ef", tile: "#bcd4e6", accent: "#a7c4a0" } },
      { name: "Coastal Blue", colors: { back: "#bcd4e6", left: "#c9d6d1", right: "#c9d6d1", tile: "#5b8fb0", accent: "#d4af37" } },
      { name: "Warm Sand", colors: { back: "#e8e3d8", left: "#d9d3c6", right: "#d9d3c6", tile: "#c9d6d1", accent: "#c06c61" } },
      { name: "Deep Stone", colors: { back: "#34495e", left: "#2f4858", right: "#2f4858", tile: "#1e2a38", accent: "#d4af37" } }
    ],
    dining: [
      { name: "Warm Amber", colors: { back: "#e8e3d8", left: "#d9d3c6", right: "#d9d3c6", accent: "#c06c61" } },
      { name: "Evening Plum", colors: { back: "#9b6a6a", left: "#c0a0a0", right: "#c0a0a0", accent: "#d4af37" } },
      { name: "Forest Feast", colors: { back: "#a7c4a0", left: "#c9d6d1", right: "#c9d6d1", accent: "#8d5524" } },
      { name: "Soft Ivory", colors: { back: "#f4f1ea", left: "#e8e3d8", right: "#e8e3d8", accent: "#5b8fb0" } }
    ],
    office: [
      { name: "Focus Grey", colors: { back: "#d9d3c6", left: "#c9d6d1", right: "#c9d6d1", cab: "#34495e", accent: "#5b8fb0" } },
      { name: "Deep Navy", colors: { back: "#2f4858", left: "#34495e", right: "#34495e", cab: "#1e2a38", accent: "#d4af37" } },
      { name: "Sage Work", colors: { back: "#c9d6d1", left: "#d9d3c6", right: "#d9d3c6", cab: "#8d5524", accent: "#a7c4a0" } },
      { name: "Clean White", colors: { back: "#f4f1ea", left: "#eef2f5", right: "#eef2f5", cab: "#cfd8e3", accent: "#34495e" } }
    ],
    kids: [
      { name: "Sunny Sky", colors: { back: "#bcd4e6", left: "#c9d6d1", right: "#c9d6d1", accent: "#ffd24d" } },
      { name: "Bubblegum", colors: { back: "#fde9ef", left: "#f4d3e0", right: "#f4d3e0", accent: "#c06c61" } },
      { name: "Mint Play", colors: { back: "#a7c4a0", left: "#c9d6d1", right: "#c9d6d1", accent: "#5b8fb0" } },
      { name: "Soft Cream", colors: { back: "#f4f1ea", left: "#e8e3d8", right: "#e8e3d8", accent: "#d4af37" } }
    ],
    exterior: [
      { name: "Classic White", colors: { main: "#f4f1ea", roof: "#5a3a1a", trim: "#ffffff", door: "#c0392b" } },
      { name: "Terracotta Villa", colors: { main: "#e8c4b8", roof: "#8d5524", trim: "#f4f1ea", door: "#34495e" } },
      { name: "Coastal Blue", colors: { main: "#bcd4e6", roof: "#2f4858", trim: "#ffffff", door: "#5b8fb0" } },
      { name: "Garden Green", colors: { main: "#a7c4a0", roof: "#2f5223", trim: "#f4f1ea", door: "#8d5524" } }
    ]
  };

  const FINISH_NOTES = {
    matte: "Flat, no shine — hides wall imperfections. Great for ceilings and low-traffic walls.",
    eggshell: "Soft, subtle sheen — easy to clean. The most popular wall finish.",
    satin: "Soft glow — durable and washable. Ideal for kitchens, bathrooms and trims.",
    semigloss: "Shiny and tough — moisture-resistant. Best for doors, trims and cabinets."
  };

  // --- Element refs ---
  const stage = document.getElementById("stage");
  const paletteEl = document.getElementById("palette");
  const customColor = document.getElementById("customColor");
  const customHex = document.getElementById("customHex");
  const surfaceTabsEl = document.getElementById("surfaceTabs");
  const presetTabsEl = document.getElementById("presetTabs");
  const finishNote = document.getElementById("finishNote");
  const harmonyEl = document.getElementById("harmony");
  const schemeSummaryEl = document.getElementById("schemeSummary");
  const coverageInput = document.getElementById("coverage");
  const coverageVal = document.getElementById("coverageVal");
  const quoteLink = document.getElementById("quoteScheme");

  // --- State ---
  // colours[scene][surface] = chosen hex (the "after")
  const colours = {};
  Object.keys(DEFAULTS).forEach((s) => {
    colours[s] = Object.assign({}, DEFAULTS[s]);
  });
  let scene = "living";
  let surface = "back";
  let finish = "matte";
  let light = "day";
  let coverage = 100; // 0 = original, 100 = fully chosen

  // --- Colour helpers ---
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return [230, 227, 216];
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  // Interpolate from original -> chosen by coverage ratio.
  function blend(originalHex, chosenHex, ratio) {
    const a = hexToRgb(originalHex);
    const b = hexToRgb(chosenHex);
    return rgbToHex(
      a[0] + (b[0] - a[0]) * ratio,
      a[1] + (b[1] - a[1]) * ratio,
      a[2] + (b[2] - a[2]) * ratio
    );
  }

  // --- Build palette swatches ---
  function buildPalette() {
    PALETTE.forEach((c) => {
      const sw = document.createElement("button");
      sw.className = "swatch";
      sw.type = "button";
      sw.style.backgroundColor = c.hex;
      sw.title = c.name + " (" + c.hex + ")";
      sw.setAttribute("aria-label", c.name);
      sw.addEventListener("click", () => {
        applyColour(c.hex);
        markActiveSwatch(sw);
      });
      paletteEl.appendChild(sw);
    });
  }
  function markActiveSwatch(active) {
    paletteEl.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    if (active) active.classList.add("active");
    else {
      // Highlight any swatch matching the current surface colour.
      const cur = (colours[scene][surface] || "").toLowerCase();
      const match = Array.from(paletteEl.querySelectorAll(".swatch")).find(
        (s) => rgbToHex(...hexToRgb(s.style.backgroundColor)) === cur
      );
      if (match) match.classList.add("active");
    }
  }

  // --- Apply colour to current surface + repaint stage ---
  function applyColour(hex) {
    colours[scene][surface] = hex;
    customColor.value = hex;
    customHex.textContent = hex.toUpperCase();
    paintStage();
    markActiveSwatch(null);
    updateHarmony();
    persist();
    renderSummary();
  }

  // --- Repaint every surface in the active scene using coverage blend ---
  function paintStage() {
    const sceneEl = stage.querySelector('.scene[data-scene="' + scene + '"]');
    if (!sceneEl) return;
    const ratio = coverage / 100;
    sceneEl.querySelectorAll(".paint-surface").forEach((el) => {
      const key = el.dataset.surface;
      const orig = DEFAULTS[scene][key] || "#e8e3d8";
      const chosen = colours[scene][key] || orig;
      el.style.backgroundColor = blend(orig, chosen, ratio);
    });
  }

  // --- Surface tabs for the active scene ---
  function buildSurfaceTabs() {
    surfaceTabsEl.innerHTML = "";
    const keys = Object.keys(DEFAULTS[scene]);
    keys.forEach((key) => {
      const b = document.createElement("button");
      b.className = "surface-tab" + (key === surface ? " active" : "");
      b.type = "button";
      b.textContent = SURFACE_LABELS[key] || key;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", key === surface ? "true" : "false");
      b.addEventListener("click", () => selectSurface(key));
      surfaceTabsEl.appendChild(b);
    });
  }
  function selectSurface(key) {
    surface = key;
    surfaceTabsEl.querySelectorAll(".surface-tab").forEach((t, i) => {
      const on = Object.keys(DEFAULTS[scene])[i] === key;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    // Highlight surfaces in the stage.
    stage.querySelectorAll(".scene.active .paint-surface").forEach((el) => {
      el.classList.toggle("selected", el.dataset.surface === key);
    });
    const cur = colours[scene][key] || DEFAULTS[scene][key];
    customColor.value = cur;
    customHex.textContent = cur.toUpperCase();
    markActiveSwatch(null);
    updateHarmony();
  }

  // --- Scene switching ---
  function selectScene(s) {
    scene = s;
    // Validate surface exists in this scene; fall back to first key.
    if (!DEFAULTS[scene][surface]) surface = Object.keys(DEFAULTS[scene])[0];
    // Toggle scene visibility + finish + light.
    stage.querySelectorAll(".scene").forEach((el) => {
      const on = el.dataset.scene === s;
      el.classList.toggle("active", on);
      if (on) {
        el.dataset.finish = finish;
        el.dataset.light = light;
      }
    });
    document.querySelectorAll(".scene-tab").forEach((t) => {
      const on = t.dataset.scene === s;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    buildSurfaceTabs();
    buildPresetTabs();
    selectSurface(surface);
    paintStage();
    persist();
    renderSummary();
  }

  // --- Finish ---
  function setFinish(f) {
    finish = f;
    const sceneEl = stage.querySelector(".scene.active");
    if (sceneEl) sceneEl.dataset.finish = f;
    document.querySelectorAll(".finish-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.finish === f)
    );
    finishNote.textContent = FINISH_NOTES[f] || "";
    persist();
  }

  // --- Lighting ---
  function setLight(mode) {
    light = mode;
    const sceneEl = stage.querySelector(".scene.active");
    if (sceneEl) sceneEl.dataset.light = mode;
    document.querySelectorAll(".light-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.light === mode)
    );
    persist();
  }

  // --- Presets ---
  function buildPresetTabs() {
    presetTabsEl.innerHTML = "";
    (PRESETS[scene] || []).forEach((p) => {
      const b = document.createElement("button");
      b.className = "preset-tab";
      b.type = "button";
      b.textContent = p.name;
      b.addEventListener("click", () => applyPreset(p));
      presetTabsEl.appendChild(b);
    });
  }
  function applyPreset(p) {
    Object.keys(p.colors).forEach((key) => {
      if (DEFAULTS[scene][key] !== undefined) colours[scene][key] = p.colors[key];
    });
    // Mark the active preset visually.
    presetTabsEl.querySelectorAll(".preset-tab").forEach((t) =>
      t.classList.toggle("active", t.textContent === p.name)
    );
    paintStage();
    const cur = colours[scene][surface] || DEFAULTS[scene][surface];
    customColor.value = cur;
    customHex.textContent = cur.toUpperCase();
    markActiveSwatch(null);
    updateHarmony();
    persist();
    renderSummary();
  }

  // --- Harmony hint (light/dark + warm/cool) ---
  function updateHarmony() {
    const hex = colours[scene][surface] || DEFAULTS[scene][surface];
    const [r, g, b] = hexToRgb(hex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const warm = r > b;
    harmonyEl.textContent =
      "This shade reads " + (lum > 0.6 ? "light" : lum > 0.35 ? "mid-tone" : "deep") +
      " & " + (warm ? "warm" : "cool") + " — pair it with a " +
      (warm ? "cool neutral" : "warm neutral") + " for balance.";
  }

  // --- Coverage slider ---
  function setCoverage(v) {
    coverage = v;
    coverageVal.textContent = v + "%";
    paintStage();
  }

  // --- Scheme summary + quote link ---
  function renderSummary() {
    schemeSummaryEl.innerHTML = "";
    Object.keys(colours[scene]).forEach((key) => {
      const row = document.createElement("div");
      row.className = "ss-row";
      const chip = document.createElement("div");
      chip.className = "ss-chip";
      chip.style.backgroundColor = colours[scene][key];
      const name = document.createElement("span");
      name.className = "ss-name";
      name.textContent = SURFACE_LABELS[key] || key;
      const hx = document.createElement("span");
      hx.className = "ss-hex";
      hx.textContent = colours[scene][key].toUpperCase();
      row.appendChild(chip);
      row.appendChild(name);
      row.appendChild(hx);
      schemeSummaryEl.appendChild(row);
    });
  }

  // --- Persistence ---
  function persist() {
    try {
      localStorage.setItem("pp_studio", JSON.stringify({
        colours, scene, surface, finish, light
      }));
    } catch (e) {}
    // Carry the scheme into the quote form via URL params.
    const params = new URLSearchParams();
    params.set("scene", scene);
    params.set("finish", finish);
    params.set("light", light);
    Object.keys(colours[scene]).forEach((k) => params.set(k, colours[scene][k].replace("#", "")));
    quoteLink.href = "./contact.html?colors=" + encodeURIComponent(params.toString());
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem("pp_studio");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.colours) {
        Object.keys(d.colours).forEach((s) => {
          if (colours[s]) Object.assign(colours[s], d.colours[s]);
        });
      }
    } catch (e) {}
  }

  // --- Save / share / reset ---
  function saveScheme() {
    persist();
    flash("Scheme saved! Use 'Request quote' to send these colours.");
    const summary = ["Painter Plus colour scheme (" + scene + "):"]
      .concat(Object.keys(colours[scene]).map(
        (k) => (SURFACE_LABELS[k] || k) + ": " + colours[scene][k].toUpperCase()
      )).join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(summary).catch(() => {});
  }
  function shareScheme() {
    persist();
    const url = quoteLink.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => flash("Shareable link copied to clipboard!"),
        () => flash("Link: " + url)
      );
    } else {
      flash("Link: " + url);
    }
  }
  function resetScheme() {
    colours[scene] = Object.assign({}, DEFAULTS[scene]);
    coverage = 100;
    coverageInput.value = 100;
    coverageVal.textContent = "100%";
    presetTabsEl.querySelectorAll(".preset-tab").forEach((t) => t.classList.remove("active"));
    paintStage();
    const cur = colours[scene][surface] || DEFAULTS[scene][surface];
    customColor.value = cur;
    customHex.textContent = cur.toUpperCase();
    markActiveSwatch(null);
    updateHarmony();
    persist();
    renderSummary();
    flash("Scene reset to defaults.");
  }

  // --- Hint messages ---
  let hintTimer;
  function flash(msg) {
    clearTimeout(hintTimer);
    harmonyEl.textContent = msg;
    harmonyEl.style.color = "var(--primary)";
    hintTimer = setTimeout(() => {
      harmonyEl.style.color = "";
      updateHarmony();
    }, 2800);
  }

  // --- Wire up ---
  function init() {
    buildPalette();
    loadPersisted();

    document.querySelectorAll(".scene-tab").forEach((t) =>
      t.addEventListener("click", () => selectScene(t.dataset.scene))
    );
    document.querySelectorAll(".finish-tab").forEach((t) =>
      t.addEventListener("click", () => setFinish(t.dataset.finish))
    );
    document.querySelectorAll(".light-btn").forEach((b) =>
      b.addEventListener("click", () => setLight(b.dataset.light))
    );

    customColor.addEventListener("input", (e) => {
      customHex.textContent = e.target.value.toUpperCase();
      applyColour(e.target.value);
    });

    coverageInput.addEventListener("input", (e) => setCoverage(parseInt(e.target.value, 10)));

    document.getElementById("saveScheme").addEventListener("click", saveScheme);
    document.getElementById("shareScheme").addEventListener("click", shareScheme);
    document.getElementById("resetScheme").addEventListener("click", resetScheme);

    // Click a surface in the stage to select it.
    stage.addEventListener("click", (e) => {
      const el = e.target.closest(".paint-surface");
      if (el && el.dataset.surface) selectSurface(el.dataset.surface);
    });

    selectScene("living");
    setFinish("matte");
    setLight("day");
    finishNote.textContent = FINISH_NOTES.matte;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ============================================================
   PAINTER SCENE — orchestration timeline
   Drives the cartoon painter story: walk in → paint → walk out →
   house becomes freshly painted → owner comes out → handshake →
   payment → painter leaves. Captions narrate each step so it is
   clear and "real" to the viewer. Replay restarts the whole scene.
   ============================================================ */
(function () {
  "use strict";

  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function $(id) { return document.getElementById(id); }
  function playScene() {
    const painter = $("psPainter");
    const owner = $("psOwner");
    const money = $("psMoney");
    const wall = $("psWall");
    const caption = $("psCaption");
    const strokes = document.querySelectorAll(".ps-stroke");

    // Reset to the start of the scene.
    clearTimers();
    [painter, owner, money].forEach((el) => {
      if (!el) return;
      el.className = el.className.split(" ").filter((c) =>
        !["painting", "leaving", "show", "handshake", "farewell"].includes(c)
      ).join(" ");
    });
    wall.classList.remove("painted");
    strokes.forEach((s) => s.classList.remove("show"));
    void painter.offsetWidth; // force reflow so CSS animation restarts
    painter.classList.add("ps-painter");
    painter.style.animation = "none";
    void painter.offsetWidth;
    painter.style.animation = "";

    const setCaption = (t) => { if (caption) caption.textContent = t; };

    // 1. Painter walks in (2.2s)
    setCaption("Our painter arrives with his brush and paint…");
    // 2. Painting phase: arm swings, strokes appear (from ~2.3s)
    timers.push(setTimeout(() => {
      painter.classList.add("painting");
      setCaption("He paints the wall, stroke by stroke…");
    }, 2200));
    timers.push(setTimeout(() => strokes[0] && strokes[0].classList.add("show"), 2500));
    timers.push(setTimeout(() => strokes[1] && strokes[1].classList.add("show"), 2900));
    timers.push(setTimeout(() => strokes[2] && strokes[2].classList.add("show"), 3300));
    // 3. Whole house becomes freshly painted as he finishes (~4.6s)
    timers.push(setTimeout(() => {
      wall.classList.add("painted");
      setCaption("The whole house is freshly painted!");
    }, 4200));
    // 4. Painter steps out (walks right) (~5.2s)
    timers.push(setTimeout(() => {
      painter.className = "ps-painter leaving";
      setCaption("The painter steps out, job done.");
    }, 5200));
    // 5. Owner comes out to shake hands (~6.8s)
    timers.push(setTimeout(() => {
      owner.classList.add("show");
      setCaption("The happy owner comes out to say thank you…");
    }, 6800));
    // 6. Painter returns for handshake (~8.2s)
    timers.push(setTimeout(() => {
      painter.className = "ps-painter handshake";
      setCaption("…they shake hands.");
    }, 8200));
    // 7. Payment handed over (~9.4s)
    timers.push(setTimeout(() => {
      money.classList.add("show");
      setCaption("Payment received with a smile.");
    }, 9400));
    // 8. Painter leaves for good (~10.6s)
    timers.push(setTimeout(() => {
      painter.className = "ps-painter farewell";
      setCaption("The painter heads home — another happy home.");
    }, 10600));
    // 9. Owner goes back inside (~12.4s)
    timers.push(setTimeout(() => {
      owner.className = "ps-owner farewell";
      setCaption("Watch our painter transform a home…");
    }, 12400));
  }

  function init() {
    const replay = $("psReplay");
    if (replay) replay.addEventListener("click", playScene);
    // Start automatically once the hero is visible.
    if ($("psStage")) playScene();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
