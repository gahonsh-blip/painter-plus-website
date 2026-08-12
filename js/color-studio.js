/* ============================================================
   COLOR STUDIO — interactive live paint preview
   Lets a client choose wall colours and instantly see them on a
   virtual room. Day/night toggles lighting, and the chosen scheme
   can be saved (localStorage) and sent along when requesting a quote.
   ============================================================ */
(function () {
  "use strict";

  // Curated palette of common, appealing paint shades with friendly names.
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

  // Each wall keeps its own colour; the frame acts as an accent.
  const walls = {
    back:  { el: document.getElementById("wallBack"),  color: "#e8e3d8" },
    left:  { el: document.getElementById("wallLeft"),  color: "#d9d3c6" },
    right: { el: document.getElementById("wallRight"), color: "#d9d3c6" }
  };
  const accentFrame = document.getElementById("accentFrame");
  const room = document.getElementById("room");
  const paletteEl = document.getElementById("palette");
  const customColor = document.getElementById("customColor");
  const customHex = document.getElementById("customHex");
  const hintEl = document.getElementById("studioHint");
  const savedSchemeEl = document.getElementById("savedScheme");
  const quoteLink = document.getElementById("quoteScheme");

  let activeWall = "back";

  // --- Apply a colour to a wall (and persist) ---
  function paintWall(wallKey, hex) {
    const wall = walls[wallKey];
    if (!wall) return;
    wall.color = hex;
    wall.el.style.backgroundColor = hex;
    persist();
    renderSavedScheme();
  }

  // --- Render the swatch palette ---
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
  }

  // --- Apply a chosen colour to the currently-selected wall ---
  function applyColour(hex) {
    paintWall(activeWall, hex);
    customColor.value = hex;
    customHex.textContent = hex.toUpperCase();
    // Reset swatch highlight if it doesn't match
    const match = Array.from(paletteEl.querySelectorAll(".swatch")).find(
      (s) => rgbToHex(s.style.backgroundColor) === hex.toLowerCase()
    );
    markActiveSwatch(match || null);
    flashHint("Painted " + labelFor(activeWall) + " → " + hex.toUpperCase());
  }

  // --- Select which wall is active ---
  function selectWall(wallKey) {
    activeWall = wallKey;
    Object.keys(walls).forEach((k) => walls[k].el.classList.toggle("selected", k === wallKey));
    document.querySelectorAll(".wall-tab").forEach((tab) => {
      const on = tab.dataset.wall === wallKey;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    const current = walls[wallKey].color;
    customColor.value = current;
    customHex.textContent = current.toUpperCase();
    flashHint("Now painting the " + labelFor(wallKey) + ". Choose a colour.");
  }

  function labelFor(key) {
    return key === "back" ? "back wall" : key === "left" ? "left wall" : "right wall";
  }

  // --- Lighting toggle ---
  function setLight(mode) {
    room.dataset.light = mode;
    document.querySelectorAll(".light-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.light === mode)
    );
  }

  // --- Saved scheme display ---
  function renderSavedScheme() {
    savedSchemeEl.innerHTML = "";
    Object.keys(walls).forEach((k) => {
      const box = document.createElement("div");
      box.className = "scheme-wall";
      const swatch = document.createElement("div");
      swatch.style.cssText =
        "height:34px;border-radius:6px;margin-bottom:6px;background:" + walls[k].color + ";";
      const lbl = document.createElement("span");
      lbl.textContent = labelFor(k);
      const hx = document.createElement("strong");
      hx.textContent = walls[k].color.toUpperCase();
      box.appendChild(swatch);
      box.appendChild(lbl);
      box.appendChild(hx);
      savedSchemeEl.appendChild(box);
    });
  }

  // --- Persist scheme to localStorage so it survives reloads ---
  function persist() {
    try {
      const scheme = { back: walls.back.color, left: walls.left.color, right: walls.right.color };
      localStorage.setItem("pp_color_scheme", JSON.stringify(scheme));
      // Carry the scheme into the quote form via the URL.
      const params = new URLSearchParams({
        back: scheme.back,
        left: scheme.left,
        right: scheme.right
      });
      quoteLink.href = "./contact.html?colors=" + encodeURIComponent(params.toString());
    } catch (e) {
      /* localStorage may be unavailable; ignore */
    }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem("pp_color_scheme");
      if (!raw) return;
      const scheme = JSON.parse(raw);
      if (scheme.back) paintWall("back", scheme.back);
      if (scheme.left) paintWall("left", scheme.left);
      if (scheme.right) paintWall("right", scheme.right);
    } catch (e) {
      /* ignore */
    }
  }

  // --- Reset to defaults ---
  function resetScheme() {
    paintWall("back", "#e8e3d8");
    paintWall("left", "#d9d3c6");
    paintWall("right", "#d9d3c6");
    accentFrame.style.backgroundColor = "#c0392b";
    markActiveSwatch(null);
    flashHint("Studio reset to the default scheme.");
  }

  // --- Save: copy scheme summary to clipboard (graceful fallback) ---
  function saveScheme() {
    const summary = [
      "Painter Plus colour scheme:",
      "Back wall: " + walls.back.color.toUpperCase(),
      "Left wall: " + walls.left.color.toUpperCase(),
      "Right wall: " + walls.right.color.toUpperCase()
    ].join("\n");
    persist();
    flashHint("Scheme saved! Use 'Request quote' to send these colours.");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(summary).catch(() => {});
    }
  }

  // --- Hint messages ---
  let hintTimer;
  function flashHint(msg) {
    clearTimeout(hintTimer);
    hintEl.textContent = msg;
    hintEl.style.color = "var(--primary)";
    hintTimer = setTimeout(() => {
      hintEl.style.color = "";
      hintEl.textContent = "Tip: tap a wall, then choose a colour to paint it.";
    }, 2600);
  }

  // --- Helper: normalise rgb() -> #hex ---
  function rgbToHex(rgb) {
    if (!rgb) return "";
    const m = rgb.match(/\d+/g);
    if (!m) return rgb.toLowerCase();
    return (
      "#" +
      m.slice(0, 3).map((n) => parseInt(n, 10).toString(16).padStart(2, "0")).join("")
    );
  }

  // --- Wire up controls ---
  function init() {
    buildPalette();

    document.querySelectorAll(".wall-tab").forEach((tab) => {
      tab.addEventListener("click", () => selectWall(tab.dataset.wall));
    });

    // Click a wall directly to select it.
    Object.keys(walls).forEach((k) => {
      walls[k].el.addEventListener("click", () => selectWall(k));
    });

    customColor.addEventListener("input", (e) => {
      const hex = e.target.value;
      customHex.textContent = hex.toUpperCase();
      applyColour(hex);
    });

    document.querySelectorAll(".light-btn").forEach((btn) => {
      btn.addEventListener("click", () => setLight(btn.dataset.light));
    });

    document.getElementById("saveScheme").addEventListener("click", saveScheme);
    document.getElementById("resetScheme").addEventListener("click", resetScheme);

    loadPersisted();
    selectWall("back");
    renderSavedScheme();
    setLight("day");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
