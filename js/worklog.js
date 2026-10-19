/* ============================================================
   PAINTER PLUS — DAILY WORK LOG (ERP)
   ------------------------------------------------------------
   A static site has no backend, so the work log lives in
   localStorage and is shared across this browser.

   Each day the crew records the day's work as a set of photo
   entries. For every photo they either MEASURE the painted area on
   the photo itself (js/measure.js: tap a known rectangle for scale,
   then tap the area — perspective is corrected, so a tilted photo
   still gives the true square feet) or type its length × height.
   The square feet are computed the moment the entry is saved, and
   the day carries a labour rate and paint coverage so the total
   square feet turn into a labour cost and a paint estimate. All
   entries of the day add up into ONE running total, so at the end
   of the day it is clear how many square feet were completed, what
   the labour came to and how much paint is needed. The day is then
   closed with a FINAL SUBMIT.

   Data shape (key: painterPlusWorkLog)
     {
       "2026-10-17": {
         date, project, crew, status: "open" | "submitted",
         rate, coverage, coats,   // day rates for labour + paint
         entries: [ { id, area, label, w, h, sqft,
                      method: "measured" | "manual",
                      measure: { calib, points, canvas } | null,
                      photo, note, at } ],
         submittedAt, submittedBy
       }
     }
   ============================================================ */
(function () {
  'use strict';

  const STORE_KEY = 'painterPlusWorkLog';

  // Defaults for the day's costing rates.
  const DEFAULTS = { rate: 0, coverage: 130, coats: 2 };

  // The measurable areas a painter picks from. Same idea as the Color
  // Studio surfaces, kept simple for on-site use.
  const AREAS = [
    { id: 'wall', label: 'Wall' },
    { id: 'ceiling', label: 'Ceiling' },
    { id: 'floor', label: 'Floor' },
    { id: 'feature', label: 'Feature / accent wall' },
    { id: 'exterior', label: 'Exterior wall' },
    { id: 'trim', label: 'Trim / skirting' },
    { id: 'door', label: 'Door / window' },
    { id: 'cabinet', label: 'Cabinets' },
    { id: 'tile', label: 'Tile' },
    { id: 'other', label: 'Other' }
  ];

  function areaLabel(id) {
    const a = AREAS.find(x => x.id === id);
    return a ? a.label : (id || 'Area');
  }

  function num(n) { const v = parseFloat(n); return isFinite(v) && v > 0 ? v : 0; }
  function sqft(w, h) { return num(w) * num(h); }
  function fmt(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('en-IN') + ' sq ft'; }
  function money(n) { return '₹' + Math.round((n || 0)).toLocaleString('en-IN'); }
  function fmtLitres(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('en-IN') + ' L'; }

  // HTML-attribute escaper. The shared text escaper escapes &, < and > but
  // NOT quotes, which is correct for text nodes yet lets a value break out of a
  // quoted attribute. Photo URLs, labels and ids are interpolated into
  // attributes below, so escape the quote characters too.
  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayKey(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }

  // ----- storage (guarded: private mode / blocked storage must not crash) -----
  const STORAGE_ERROR = 'Could not save — this browser\'s storage is full or blocked. Your change was not stored.';
  function readAll() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    } catch (e) { return {}; }
  }
  function writeAll(days) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(days)); return true; }
    catch (e) { return false; }
  }
  function emit() { document.dispatchEvent(new CustomEvent('ppworklog:change')); }

  function blankDay(date) {
    return {
      date: date, project: '', projectId: '', crew: '', status: 'open', entries: [],
      rate: DEFAULTS.rate, coverage: DEFAULTS.coverage, coats: DEFAULTS.coats,
      submittedAt: '', submittedBy: ''
    };
  }
  function getDay(date) {
    const days = readAll();
    const d = days[date];
    if (!d) return blankDay(date);
    return Object.assign(blankDay(date), d, { entries: Array.isArray(d.entries) ? d.entries : [] });
  }
  function listDays() {
    const days = readAll();
    return Object.keys(days).sort().reverse().map(k => getDay(k));
  }
  function saveDay(day) {
    const days = readAll();
    days[day.date] = day;
    if (!writeAll(days)) return { ok: false, error: STORAGE_ERROR, day: day };
    emit();
    return day;
  }
  function hasDay(date) {
    const days = readAll();
    return Object.prototype.hasOwnProperty.call(days, date);
  }
  function removeDay(date) {
    const days = readAll();
    if (!Object.prototype.hasOwnProperty.call(days, date)) return { ok: false };
    delete days[date];
    if (!writeAll(days)) return { ok: false, error: STORAGE_ERROR };
    emit();
    return { ok: true };
  }

  // Day costing: the measured square feet plus the money and paint they
  // imply. A day with no labour rate still reports area and paint.
  function costing(day) {
    const t = totals(day);
    const rate = num(day && day.rate);
    const coverage = num(day && day.coverage) || DEFAULTS.coverage;
    const coats = num(day && day.coats) || DEFAULTS.coats;
    const M = window.PPMeasure;
    const litres = M ? M.paintLitres(t.sqft, { coats: coats, coverage: coverage })
                     : (t.sqft * coats / coverage) * 1.1;
    return {
      sqft: t.sqft, count: t.count,
      rate: rate, coverage: coverage, coats: coats,
      labour: t.sqft * rate,
      litres: litres
    };
  }

  function totals(day) {
    const entries = (day && day.entries) || [];
    let sum = 0;
    entries.forEach(e => { sum += num(e.sqft) || sqft(e.w, e.h); });
    return { count: entries.length, sqft: sum };
  }
  // Per-area breakdown, so the day total can be read at a glance.
  function breakdown(day) {
    const out = [];
    ((day && day.entries) || []).forEach(e => {
      const key = e.area || 'other';
      let row = out.find(r => r.area === key);
      if (!row) { row = { area: key, label: areaLabel(key), count: 0, sqft: 0 }; out.push(row); }
      row.count += 1;
      row.sqft += num(e.sqft) || sqft(e.w, e.h);
    });
    return out.sort((a, b) => b.sqft - a.sqft);
  }

  function makeId() { return 'wl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function addEntry(date, entry) {
    const day = getDay(date);
    if (day.status === 'submitted') return { ok: false, error: 'This day is already submitted. Reopen it to make changes.' };

    const method = entry.method === 'measured' ? 'measured' : 'manual';
    const measured = num(entry.sqft);
    // A measured area comes from the on-photo tool and may have no length ×
    // height; a manual area needs both. Either way we must end up with a
    // positive square footage, else the entry is meaningless.
    let w = num(entry.w), h = num(entry.h);
    let area = method === 'measured' ? measured : sqft(w, h);
    if (!area) return { ok: false, error: method === 'measured'
      ? 'Measure the painted area on the photo first.'
      : 'Enter both length and height.' };

    const e = {
      id: entry.id || makeId(),
      area: entry.area || 'wall',
      label: entry.label || areaLabel(entry.area || 'wall'),
      w: w, h: h,
      sqft: area,
      method: method,
      measure: method === 'measured' ? (entry.measure || null) : null,
      photo: entry.photo || '',
      note: entry.note || '',
      at: entry.at || new Date().toISOString()
    };
    const idx = day.entries.findIndex(x => x.id === e.id);
    if (idx >= 0) day.entries[idx] = e; else day.entries.push(e);
    if (entry.project !== undefined) day.project = entry.project;
    if (entry.crew !== undefined) day.crew = entry.crew;
    // Capture the day's costing rates along with the first entry, so they are
    // stored as soon as the day becomes real.
    if (entry.rate !== undefined) day.rate = num(entry.rate);
    if (entry.coverage !== undefined) day.coverage = num(entry.coverage) || DEFAULTS.coverage;
    if (entry.coats !== undefined) day.coats = num(entry.coats) || DEFAULTS.coats;
    const saved = saveDay(day);
    if (saved && saved.ok === false) return saved;
    return { ok: true, day: day, entry: e };
  }

  function removeEntry(date, id) {
    const day = getDay(date);
    if (day.status === 'submitted') return { ok: false, error: 'This day is already submitted. Reopen it to make changes.' };
    day.entries = day.entries.filter(x => x.id !== id);
    const saved = saveDay(day);
    if (saved && saved.ok === false) return saved;
    return { ok: true, day: day };
  }

  function submitDay(date, by) {
    const day = getDay(date);
    if (!day.entries.length) return { ok: false, error: 'Add at least one photo entry before submitting.' };
    day.status = 'submitted';
    day.submittedAt = new Date().toISOString();
    day.submittedBy = by || '';
    const saved = saveDay(day);
    if (saved && saved.ok === false) return saved;
    return { ok: true, day: day };
  }
  function reopenDay(date) {
    const day = getDay(date);
    day.status = 'open';
    day.submittedAt = '';
    day.submittedBy = '';
    const saved = saveDay(day);
    if (saved && saved.ok === false) return saved;
    // Reopening withdraws any ERP approval: the numbers are about to change,
    // so the old sign-off must not survive to bill the new figures. The ERP
    // also guards this by comparing the day's signature, but clearing here
    // keeps storage honest.
    const ERP = window.PPERP;
    if (ERP && ERP.clearApproval) ERP.clearApproval(date);
    return { ok: true, day: day };
  }

  function summary(day) {
    const t = totals(day);
    const c = costing(day);
    const lines = ['Painter Plus daily work log — ' + day.date];
    if (day.project) lines.push('Project: ' + day.project);
    if (day.crew) lines.push('Crew: ' + day.crew);
    lines.push('Photos: ' + t.count);
    lines.push('Total area: ' + fmt(t.sqft));
    const bd = breakdown(day);
    if (bd.length) {
      lines.push('Breakdown:');
      bd.forEach(r => lines.push('  · ' + r.label + ': ' + r.count + ' photo(s), ' + fmt(r.sqft)));
    }
    if (c.rate > 0) {
      lines.push('Labour: ' + fmt(t.sqft) + ' × ' + money(c.rate) + '/sq ft = ' + money(c.labour));
    }
    if (c.sqft > 0) {
      lines.push('Paint estimate: ' + fmtLitres(c.litres) + ' (' + c.coats + ' coats, ' + c.coverage + ' sq ft/L)');
    }
    if (day.status === 'submitted') lines.push('Status: SUBMITTED' + (day.submittedBy ? ' by ' + day.submittedBy : ''));
    return lines.join('\n');
  }

  window.PPWorkLog = {
    STORE_KEY, AREAS, areaLabel, fmt, money, fmtLitres, sqft, num, todayKey, DEFAULTS,
    getDay, listDays, saveDay, hasDay, removeDay, addEntry, removeEntry,
    submitDay, reopenDay, totals, breakdown, costing, summary
  };

  // ============================================================
  // PAGE CONTROLLER — only runs on worklog.html (when #wlApp exists)
  // ============================================================
  function initPage() {
    const app = document.getElementById('wlApp');
    if (!app) return;

    const T = window.PPTeam;
    const $ = id => document.getElementById(id);
    const esc = (T && T.esc) ? T.esc : (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

    const dateEl = $('wlDate');
    const projectEl = $('wlProject');
    const projectPickEl = $('wlProjectPick');
    const crewEl = $('wlCrew');
    const statusEl = $('wlStatus');
    const gate = $('wlGate');
    const panel = $('wlPanel');

    const rateEl = $('wlRate');
    const coverageEl = $('wlCoverage');
    const coatsEl = $('wlCoats');

    const areaEl = $('wlArea');
    const wEl = $('wlW');
    const hEl = $('wlH');
    const sqftEl = $('wlSqft');
    const sqftSrcEl = $('wlSqftSrc');
    const noteEl = $('wlNote');
    const fileEl = $('wlPhotoFile');
    const urlEl = $('wlPhotoUrl');
    const previewBox = $('wlPhotoPreview');
    const previewImg = $('wlPhotoPreviewImg');
    const addBtn = $('wlAdd');
    const cancelBtn = $('wlCancelEdit');
    const formTitle = $('wlFormTitle');

    const itemsEl = $('wlItems');
    const emptyEl = $('wlEmpty');
    const totalsEl = $('wlTotals');
    const historyEl = $('wlHistory');
    const submitBtn = $('wlSubmit');
    const reopenBtn = $('wlReopen');
    const exportBtn = $('wlExport');
    const exportBox = $('wlExportBox');
    const exportText = $('wlExportText');
    const hintEl = $('wlHint');

    // Measurement editor elements
    const measurePanel = $('wlMeasurePanel');
    const canvasEl = $('wlCanvas');
    const measureModeEl = $('wlMeasureMode');
    const measureHintEl = $('wlMeasureHint');
    const measuredSqftEl = $('wlMeasuredSqft');
    const calibWEl = $('wlCalibW');
    const calibHEl = $('wlCalibH');
    const useMeasuredBtn = $('wlUseMeasured');

    let editingId = null;
    let photoData = '';
    let measured = null;   // { sqft, measure } captured from the on-photo tool

    // ----- area options + crew options -----
    if (areaEl) areaEl.innerHTML = AREAS.map(a => '<option value="' + escAttr(a.id) + '">' + esc(a.label) + '</option>').join('');
    function fillCrew() {
      if (!crewEl) return;
      const opts = ['<option value="">— select crew —</option>'];
      if (T) T.list().forEach(m => opts.push('<option value="' + escAttr(m.id) + '">' + esc(m.name) + ' · ' + esc(T.roleOf(m.role).label) + '</option>'));
      crewEl.innerHTML = opts.join('');
    }

    function currentDate() { return (dateEl && dateEl.value) || PPWorkLog.todayKey(); }
    function crewName(id) {
      if (!id || !T) return id || '';
      const m = T.get(id);
      return m ? m.name : id;
    }

    // ----- hint line -----
    let hintTimer;
    function hint(msg, bad) {
      if (!hintEl) return;
      clearTimeout(hintTimer);
      hintEl.textContent = msg;
      hintEl.style.color = bad ? '#dc2626' : 'var(--primary)';
      hintTimer = setTimeout(() => { hintEl.textContent = ''; }, 3200);
    }

    // ----- photo: file (downscaled) or URL -----
    // The on-photo measurement editor (js/measure.js). It only exists if the
    // module and canvas are both present, so a missing script degrades to the
    // plain length × height entry instead of throwing.
    const measure = (window.PPMeasure && canvasEl) ? window.PPMeasure.createEditor({
      canvas: canvasEl,
      hintEl: measureHintEl,
      buttons: {
        calib: $('wlCalibBtn'), draw: $('wlDrawBtn'), undo: $('wlUndoBtn'),
        clear: $('wlClearBtn'), reset: $('wlMeasureReset')
      },
      onChange: onMeasureChange
    }) : null;

    let lastResult = null;   // latest result from the measurement editor
    let useMeasured = false; // true once the painter taps "Use this measurement"

    function onMeasureChange(result) {
      lastResult = result;
      if (measureModeEl) {
        measureModeEl.textContent = result.mode === 'calib'
          ? 'Setting scale (' + result.corners + '/4 corners)'
          : result.mode === 'draw'
            ? 'Drawing (' + result.points + ' points)'
            : 'Not started';
      }
      if (measuredSqftEl) measuredSqftEl.textContent = fmt(result.sqft);
      if (useMeasuredBtn) useMeasuredBtn.disabled = !result.ok;
      // If the painter is already using the measurement, keep the readout live.
      if (useMeasured) {
        if (!result.ok) { useMeasured = false; hint('Measurement cleared — enter the size or measure again.', true); }
        updateLiveSqft();
      }
    }

    // Load a photo into the form. `restore` is a saved measure object when
    // editing an existing entry; otherwise the editor starts fresh.
    function applyPhoto(data, restore) {
      photoData = data || '';
      measured = null;
      useMeasured = false;
      if (previewBox && previewImg) {
        if (photoData) { previewImg.src = photoData; previewBox.hidden = false; }
        else { previewBox.hidden = true; previewImg.removeAttribute('src'); }
      }
      if (!measure || !measurePanel) return;
      if (!photoData) { measurePanel.hidden = true; measure.reset(); return; }
      measurePanel.hidden = false;
      measure.loadImage(photoData).then(() => {
        if (restore) {
          measure.setInitial(restore);
          if (lastResult && lastResult.ok) { measured = { sqft: lastResult.sqft, measure: lastResult }; useMeasured = true; }
        }
        updateLiveSqft();
      }).catch(() => { measurePanel.hidden = true; });
    }
    function downscale(file, cb) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1024;
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (w >= h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          else if (h > w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            cb(c.toDataURL('image/jpeg', 0.72));
          } catch (e) { cb(reader.result); }
        };
        img.onerror = () => cb(reader.result);
        img.src = reader.result;
      };
      reader.onerror = () => cb('');
      reader.readAsDataURL(file);
    }
    if (fileEl) fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      downscale(f, (data) => {
        if (urlEl) urlEl.value = '';
        applyPhoto(data);
        hint('Photo added. Measure it or enter the size, then save.');
      });
    });
    if (urlEl) urlEl.addEventListener('input', () => {
      if (urlEl.value.trim()) { applyPhoto(urlEl.value.trim()); if (fileEl) fileEl.value = ''; }
    });

    // ----- live square feet for the entry being typed -----
    // The measured area wins when the painter has chosen it; otherwise the
    // figure comes from length × height.
    function updateLiveSqft() {
      if (!sqftEl) return;
      let s, src;
      if (useMeasured && measured) { s = measured.sqft; src = 'Measured on photo'; }
      else { s = sqft(wEl ? wEl.value : 0, hEl ? hEl.value : 0); src = 'From length × height'; }
      if ('value' in sqftEl) sqftEl.value = fmt(s);
      else sqftEl.textContent = fmt(s);
      if (sqftSrcEl) sqftSrcEl.textContent = src;
    }
    if (wEl) wEl.addEventListener('input', () => { useMeasured = false; updateLiveSqft(); });
    if (hEl) hEl.addEventListener('input', () => { useMeasured = false; updateLiveSqft(); });

    // "Use this measurement" — adopt the on-photo figure for this entry.
    if (useMeasuredBtn) useMeasuredBtn.addEventListener('click', () => {
      if (!lastResult || !lastResult.ok) { hint('Measure the painted area on the photo first.', true); return; }
      useMeasured = true;
      measured = { sqft: lastResult.sqft, measure: lastResult };
      updateLiveSqft();
      hint('Measured area used: ' + fmt(lastResult.sqft));
    });
    // Typing the known rectangle's size re-calibrates live.
    function applyCalibSize() {
      if (!measure) return;
      measure.setCalibSize(calibWEl ? calibWEl.value : 0, calibHEl ? calibHEl.value : 0);
    }
    if (calibWEl) calibWEl.addEventListener('input', applyCalibSize);
    if (calibHEl) calibHEl.addEventListener('input', applyCalibSize);

    // ----- add / edit entry -----
    function resetForm() {
      editingId = null;
      if (areaEl) areaEl.value = 'wall';
      if (wEl) wEl.value = '';
      if (hEl) hEl.value = '';
      if (noteEl) noteEl.value = '';
      if (fileEl) fileEl.value = '';
      if (urlEl) urlEl.value = '';
      if (calibWEl) calibWEl.value = '';
      if (calibHEl) calibHEl.value = '';
      applyPhoto('');
      updateLiveSqft();
      if (formTitle) formTitle.textContent = '📷 Add a photo entry';
      if (addBtn) addBtn.textContent = '💾 Save photo area';
      if (cancelBtn) cancelBtn.hidden = true;
    }
    function editEntry(id) {
      const day = PPWorkLog.getDay(currentDate());
      const e = day.entries.find(x => x.id === id);
      if (!e) return;
      editingId = id;
      if (areaEl) areaEl.value = e.area || 'wall';
      if (wEl) wEl.value = e.w || '';
      if (hEl) hEl.value = e.h || '';
      if (noteEl) noteEl.value = e.note || '';
      if (urlEl) urlEl.value = /^https?:/i.test(e.photo || '') ? e.photo : '';
      if (fileEl) fileEl.value = '';
      if (e.measure && e.measure.calib) {
        if (calibWEl) calibWEl.value = e.measure.calib.w || '';
        if (calibHEl) calibHEl.value = e.measure.calib.h || '';
      } else {
        if (calibWEl) calibWEl.value = '';
        if (calibHEl) calibHEl.value = '';
      }
      // Reload the photo and restore the saved measurement overlay.
      applyPhoto(e.photo || '', e.measure || null);
      updateLiveSqft();
      if (formTitle) formTitle.textContent = '✏️ Edit photo entry';
      if (addBtn) addBtn.textContent = '💾 Update entry';
      if (cancelBtn) cancelBtn.hidden = false;
      if (wEl) wEl.focus();
    }

    if (addBtn) addBtn.addEventListener('click', () => {
      const day = PPWorkLog.getDay(currentDate());
      if (day.status === 'submitted') { hint('This day is submitted. Reopen it to edit.', true); return; }
      const res = PPWorkLog.addEntry(currentDate(), {
        id: editingId,
        area: areaEl ? areaEl.value : 'wall',
        label: PPWorkLog.areaLabel(areaEl ? areaEl.value : 'wall'),
        w: wEl ? wEl.value : 0,
        h: hEl ? hEl.value : 0,
        method: (useMeasured && measured) ? 'measured' : 'manual',
        sqft: (useMeasured && measured) ? measured.sqft : 0,
        measure: (useMeasured && measured) ? measured.measure : null,
        photo: photoData,
        note: noteEl ? noteEl.value : '',
        project: projectEl ? projectEl.value : '',
        crew: crewEl ? crewEl.value : '',
        rate: rateEl ? rateEl.value : 0,
        coverage: coverageEl ? coverageEl.value : PPWorkLog.DEFAULTS.coverage,
        coats: coatsEl ? coatsEl.value : PPWorkLog.DEFAULTS.coats
      });
      if (!res.ok) { hint(res.error, true); return; }
      hint(editingId ? 'Entry updated.' : 'Photo area saved: ' + PPWorkLog.fmt(res.entry.sqft));
      resetForm();
      render();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

    // ----- day bar -----
    if (dateEl) {
      if (!dateEl.value) dateEl.value = PPWorkLog.todayKey();
      dateEl.addEventListener('change', () => { resetForm(); loadDay(); });
    }
    if (projectEl) projectEl.addEventListener('change', persistDayMeta);
    if (projectPickEl) projectPickEl.addEventListener('change', onPickProject);
    if (crewEl) crewEl.addEventListener('change', persistDayMeta);
    if (rateEl) rateEl.addEventListener('input', persistDayMeta);
    if (coverageEl) coverageEl.addEventListener('input', persistDayMeta);
    if (coatsEl) coatsEl.addEventListener('input', persistDayMeta);

    // ----- ERP project link -----
    // The work log can attach a day to a project created in erp.html. The
    // free-text field stays so old days (and one-off sites) still work; the
    // ERP matches a day to a project by id first, then by name.
    const ERP = window.PPERP;
    function fillProjectPicker() {
      if (!projectPickEl || !ERP) return;
      const list = ERP.listProjects();
      const current = projectPickEl.value;
      projectPickEl.innerHTML = '<option value="">— no project —</option>' +
        list.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
      if (current) projectPickEl.value = current;
    }
    function onPickProject() {
      if (!projectPickEl) return;
      const id = projectPickEl.value;
      const day = PPWorkLog.getDay(currentDate());
      if (day.status === 'submitted') { loadDay(); return; }
      day.projectId = id;
      if (ERP && id) {
        const p = ERP.getProject(id);
        // A picked project names the site and sets the day's rates, so the
        // painter does not retype them on every new day.
        if (p) {
          if (projectEl) projectEl.value = p.name;
          if (rateEl && p.rate) rateEl.value = p.rate;
          if (coverageEl && p.coverage) coverageEl.value = p.coverage;
          if (coatsEl && p.coats) coatsEl.value = p.coats;
        }
      }
      persistDayMeta();
    }
    function syncProjectPicker(day) {
      if (!projectPickEl) return;
      projectPickEl.value = (day && day.projectId) || '';
    }
    fillProjectPicker();
    // Projects may be added in another tab; refresh when we come back. Approval
    // badges in the history also come from the ERP, so re-render those too.
    window.addEventListener('focus', () => { fillProjectPicker(); renderHistory(); });

    function persistDayMeta() {
      const date = currentDate();
      const day = PPWorkLog.getDay(date);
      if (day.status === 'submitted') return;
      day.project = projectEl ? projectEl.value : '';
      day.projectId = projectPickEl ? projectPickEl.value : '';
      day.crew = crewEl ? crewEl.value : '';
      day.rate = rateEl ? num(rateEl.value) : 0;
      day.coverage = coverageEl ? (num(coverageEl.value) || PPWorkLog.DEFAULTS.coverage) : PPWorkLog.DEFAULTS.coverage;
      day.coats = coatsEl ? (num(coatsEl.value) || PPWorkLog.DEFAULTS.coats) : PPWorkLog.DEFAULTS.coats;
      // Don't create a stored day for an empty shell — a date with no photo
      // entry and no project/crew would otherwise show up in the history as a
      // phantom 0 sq ft day. The day rates are still read live from the form
      // (see liveDay), and get captured for real when the first entry is saved.
      if (!day.entries.length && !day.project && !day.projectId && !day.crew) {
        if (PPWorkLog.hasDay(date)) PPWorkLog.removeDay(date);
        render();
        return;
      }
      const saved = PPWorkLog.saveDay(day);
      if (saved && saved.ok === false) hint(saved.error, true);
      render();
    }

    // The day as the form currently shows it: the stored day overlaid with the
    // values still only in the form, so the totals read correctly before the
    // first entry is saved without persisting an empty day.
    function liveDay() {
      const day = PPWorkLog.getDay(currentDate());
      if (day.status === 'submitted') return day;
      if (projectEl) day.project = projectEl.value;
      if (projectPickEl) day.projectId = projectPickEl.value;
      if (crewEl) day.crew = crewEl.value;
      if (rateEl) day.rate = num(rateEl.value);
      if (coverageEl) day.coverage = num(coverageEl.value) || PPWorkLog.DEFAULTS.coverage;
      if (coatsEl) day.coats = num(coatsEl.value) || PPWorkLog.DEFAULTS.coats;
      return day;
    }

    function loadDay() {
      const day = PPWorkLog.getDay(currentDate());
      if (projectEl) projectEl.value = day.project || '';
      syncProjectPicker(day);
      if (crewEl) crewEl.value = day.crew || '';
      if (rateEl) rateEl.value = day.rate || '';
      if (coverageEl) coverageEl.value = day.coverage || PPWorkLog.DEFAULTS.coverage;
      if (coatsEl) coatsEl.value = day.coats || PPWorkLog.DEFAULTS.coats;
      render();
    }

    // ----- render entries, totals, history -----
    function renderEntries(day) {
      if (!itemsEl) return;
      itemsEl.innerHTML = '';
      const locked = day.status === 'submitted';
      if (!day.entries.length) { if (emptyEl) emptyEl.hidden = false; return; }
      if (emptyEl) emptyEl.hidden = true;

      day.entries.forEach(e => {
        const li = document.createElement('li');
        li.className = 'wl-item';
        const thumb = e.photo
          ? '<img class="wl-thumb" loading="lazy" src="' + escAttr(e.photo) + '" alt="' + escAttr(e.label) + ' work photo" />'
          : '<span class="wl-thumb wl-thumb-empty" aria-hidden="true">📷</span>';
        const measuredTag = e.method === 'measured'
          ? '<span class="wl-tag" title="Measured on the photo">📐 measured</span>' : '';
        const dims = (e.w && e.h)
          ? esc(e.w + ' × ' + e.h + ' ft')
          : 'measured on photo';
        li.innerHTML =
          thumb +
          '<div class="wl-item-body">' +
            '<div class="wl-item-title">' + esc(e.label) + measuredTag + '</div>' +
            '<div class="wl-item-meta">' + dims +
              (e.note ? ' · ' + esc(e.note) : '') + '</div>' +
          '</div>' +
          '<div class="wl-item-val">' + esc(PPWorkLog.fmt(e.sqft || PPWorkLog.sqft(e.w, e.h))) + '</div>' +
          (locked ? '' :
            '<div class="wl-item-actions">' +
              '<button type="button" class="edit" data-id="' + escAttr(e.id) + '">✏️</button>' +
              '<button type="button" class="del" data-id="' + escAttr(e.id) + '">🗑</button>' +
            '</div>');
        itemsEl.appendChild(li);
      });

      itemsEl.querySelectorAll('button.edit').forEach(b => b.addEventListener('click', () => editEntry(b.dataset.id)));
      itemsEl.querySelectorAll('button.del').forEach(b => b.addEventListener('click', () => {
        const res = PPWorkLog.removeEntry(currentDate(), b.dataset.id);
        if (!res.ok) { hint(res.error, true); return; }
        if (editingId === b.dataset.id) resetForm();
        render();
      }));
    }

    function renderTotals(day) {
      if (!totalsEl) return;
      const t = PPWorkLog.totals(day);
      const c = PPWorkLog.costing(day);
      const bd = PPWorkLog.breakdown(day);
      const econ = c.sqft > 0
        ? '<div class="wl-econ">' +
            (c.rate > 0
              ? '<div class="wl-econ-row"><span>Labour (' + esc(PPWorkLog.money(c.rate)) + '/sq ft)</span><strong>' + esc(PPWorkLog.money(c.labour)) + '</strong></div>'
              : '<div class="wl-econ-row wl-econ-hint"><span>Add a labour rate above to cost this day.</span></div>') +
            '<div class="wl-econ-row"><span>Paint estimate (' + c.coats + ' coats · ' + c.coverage + ' sq ft/L)</span><strong>' + esc(PPWorkLog.fmtLitres(c.litres)) + '</strong></div>' +
          '</div>'
        : '';
      totalsEl.innerHTML =
        '<div class="wl-total-main"><span>Total area today</span><strong>' + esc(PPWorkLog.fmt(t.sqft)) + '</strong></div>' +
        '<div class="wl-total-sub">' + t.count + (t.count === 1 ? ' photo' : ' photos') + ' logged</div>' +
        (bd.length
          ? '<ul class="wl-breakdown">' + bd.map(r =>
              '<li><span>' + esc(r.label) + '</span><span>' + r.count + '× · ' + esc(PPWorkLog.fmt(r.sqft)) + '</span></li>').join('') + '</ul>'
          : '') +
        econ;
      if (submitBtn) submitBtn.disabled = t.count === 0 || day.status === 'submitted';
    }

    function renderStatus(day) {
      if (!statusEl) return;
      if (day.status === 'submitted') {
        statusEl.textContent = '✅ Submitted';
        statusEl.className = 'wl-status wl-status-submitted';
      } else {
        statusEl.textContent = '🟢 Open';
        statusEl.className = 'wl-status wl-status-open';
      }
      if (submitBtn) submitBtn.hidden = day.status === 'submitted';
      if (reopenBtn) reopenBtn.hidden = day.status !== 'submitted';
    }

    function renderHistory() {
      if (!historyEl) return;
      const days = PPWorkLog.listDays();
      historyEl.innerHTML = '';
      if (!days.length) {
        historyEl.innerHTML = '<p class="wl-empty">No days logged yet.</p>';
        return;
      }
      days.forEach(d => {
        const t = PPWorkLog.totals(d);
        // Approval state comes from the ERP; a submitted day still reads as
        // pending until an Owner/Head approves it there.
        const appr = (ERP && ERP.approvalOf) ? ERP.approvalOf(d.date).status : 'pending';
        const apprBadge = d.status === 'submitted'
          ? { approved: ' <span class="wl-appr wl-appr-ok" title="Approved in ERP">✅ approved</span>',
              rejected: ' <span class="wl-appr wl-appr-bad" title="Rejected in ERP">⛔ rejected</span>',
              pending:  ' <span class="wl-appr wl-appr-wait" title="Awaiting approval in ERP">⏳ approval</span>' }[appr] || ''
          : '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wl-hist-row' + (d.date === currentDate() ? ' active' : '');
        btn.innerHTML =
          '<span class="wl-hist-date">' + esc(d.date) + (d.status === 'submitted' ? ' ✅' : '') + '</span>' +
          '<span class="wl-hist-proj">' + esc(d.project || '—') + apprBadge + '</span>' +
          '<span class="wl-hist-val">' + esc(PPWorkLog.fmt(t.sqft)) + '</span>';
        btn.addEventListener('click', () => {
          if (dateEl) dateEl.value = d.date;
          resetForm();
          loadDay();
          app.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        historyEl.appendChild(btn);
      });
    }

    function render() {
      const day = liveDay();
      renderEntries(day);
      renderTotals(day);
      renderStatus(day);
      renderHistory();
    }

    // ----- final submit / reopen / export -----
    if (submitBtn) submitBtn.addEventListener('click', () => {
      const day = PPWorkLog.getDay(currentDate());
      const t = PPWorkLog.totals(day);
      const c = PPWorkLog.costing(day);
      if (!t.count) { hint('Add at least one photo entry first.', true); return; }
      const ok = window.confirm('Final submit this day?\n\nTotal area: ' + PPWorkLog.fmt(t.sqft) + ' across ' + t.count + ' photo(s).' +
        (c.rate > 0 ? '\nLabour: ' + PPWorkLog.money(c.labour) + '.' : '') +
        '\nPaint: ' + PPWorkLog.fmtLitres(c.litres) + '.\n\nYou can reopen it later if something changes.');
      if (!ok) return;
      const res = PPWorkLog.submitDay(currentDate(), crewName(crewEl ? crewEl.value : ''));
      if (!res.ok) { hint(res.error, true); return; }
      hint('Day submitted. Total ' + PPWorkLog.fmt(t.sqft) + '.');
      resetForm();
      render();
    });
    if (reopenBtn) reopenBtn.addEventListener('click', () => {
      const res = PPWorkLog.reopenDay(currentDate());
      if (!res.ok) { hint(res.error, true); return; }
      hint('Day reopened for editing.');
      render();
    });
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const text = PPWorkLog.summary(PPWorkLog.getDay(currentDate()));
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(
        () => hint('Day summary copied to clipboard.'),
        () => hint('Copy failed — summary shown below.', true)
      );
      if (exportBox && exportText) { exportText.value = text; exportBox.hidden = false; }
    });

    // ----- gate (reuses the shared Owner/Head passcode) -----
    const unlockBtn = $('wlUnlock');
    const passInput = $('wlPass');
    const gateErr = $('wlGateErr');
    function openPanel() {
      if (gate) gate.hidden = true;
      if (panel) panel.hidden = false;
      // Projects may have been added on the ERP page since this tab loaded,
      // so refresh the picker before showing the day.
      fillProjectPicker();
      loadDay();
    }
    function tryUnlock() {
      if (T && T.unlockHead(passInput ? passInput.value : '')) openPanel();
      else if (gateErr) { gateErr.hidden = false; if (passInput) passInput.value = ''; }
    }
    if (unlockBtn) unlockBtn.addEventListener('click', tryUnlock);
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });

    fillCrew();
    updateLiveSqft();
    resetForm();

    // Already unlocked in this session? Go straight in.
    if (T && T.isActingHead && T.isActingHead()) openPanel();
    else if (gateErr) gateErr.hidden = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
