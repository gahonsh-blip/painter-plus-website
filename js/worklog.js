/* ============================================================
   PAINTER PLUS — DAILY WORK LOG (ERP)
   ------------------------------------------------------------
   A static site has no backend, so the work log lives in
   localStorage and is shared across this browser.

   Each day the crew records the day's work as a set of photo
   entries. For every photo they pick the AREA (wall, ceiling,
   exterior wall, trim …) and type its length × height; the
   square feet are computed the moment the entry is saved. All
   entries of the day add up into ONE running total, so at the end
   of the day it is clear how many square feet were completed.
   The day is then closed with a FINAL SUBMIT.

   Data shape (key: painterPlusWorkLog)
     {
       "2026-10-17": {
         date, project, crew, status: "open" | "submitted",
         entries: [ { id, area, label, w, h, sqft, photo, note, at } ],
         submittedAt, submittedBy
       }
     }
   ============================================================ */
(function () {
  'use strict';

  const STORE_KEY = 'painterPlusWorkLog';

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

  // HTML-attribute escaper. team.js's esc() escapes &, < and > but NOT
  // quotes, which is correct for text nodes yet lets a value break out of a
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
    return { date: date, project: '', crew: '', status: 'open', entries: [], submittedAt: '', submittedBy: '' };
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
    writeAll(days);
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
    writeAll(days);
    emit();
    return { ok: true };
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
    const e = {
      id: entry.id || makeId(),
      area: entry.area || 'wall',
      label: entry.label || areaLabel(entry.area || 'wall'),
      w: num(entry.w), h: num(entry.h),
      sqft: sqft(entry.w, entry.h),
      photo: entry.photo || '',
      note: entry.note || '',
      at: entry.at || new Date().toISOString()
    };
    if (!e.w || !e.h) return { ok: false, error: 'Enter both length and height.' };
    const idx = day.entries.findIndex(x => x.id === e.id);
    if (idx >= 0) day.entries[idx] = e; else day.entries.push(e);
    if (entry.project !== undefined) day.project = entry.project;
    if (entry.crew !== undefined) day.crew = entry.crew;
    saveDay(day);
    return { ok: true, day: day, entry: e };
  }

  function removeEntry(date, id) {
    const day = getDay(date);
    if (day.status === 'submitted') return { ok: false, error: 'This day is already submitted. Reopen it to make changes.' };
    day.entries = day.entries.filter(x => x.id !== id);
    saveDay(day);
    return { ok: true, day: day };
  }

  function submitDay(date, by) {
    const day = getDay(date);
    if (!day.entries.length) return { ok: false, error: 'Add at least one photo entry before submitting.' };
    day.status = 'submitted';
    day.submittedAt = new Date().toISOString();
    day.submittedBy = by || '';
    saveDay(day);
    return { ok: true, day: day };
  }
  function reopenDay(date) {
    const day = getDay(date);
    day.status = 'open';
    day.submittedAt = '';
    day.submittedBy = '';
    saveDay(day);
    return { ok: true, day: day };
  }

  function summary(day) {
    const t = totals(day);
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
    if (day.status === 'submitted') lines.push('Status: SUBMITTED' + (day.submittedBy ? ' by ' + day.submittedBy : ''));
    return lines.join('\n');
  }

  window.PPWorkLog = {
    STORE_KEY, AREAS, areaLabel, fmt, sqft, num, todayKey,
    getDay, listDays, saveDay, hasDay, removeDay, addEntry, removeEntry,
    submitDay, reopenDay, totals, breakdown, summary
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
    const crewEl = $('wlCrew');
    const statusEl = $('wlStatus');
    const gate = $('wlGate');
    const panel = $('wlPanel');

    const areaEl = $('wlArea');
    const wEl = $('wlW');
    const hEl = $('wlH');
    const sqftEl = $('wlSqft');
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

    let editingId = null;
    let photoData = '';

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
    function setPhoto(data, show) {
      photoData = data || '';
      if (!previewBox || !previewImg) return;
      if (photoData && show !== false) { previewImg.src = photoData; previewBox.hidden = false; }
      else if (!photoData) { previewBox.hidden = true; previewImg.removeAttribute('src'); }
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
        setPhoto(data);
        hint('Photo added. Enter the area size and save.');
      });
    });
    if (urlEl) urlEl.addEventListener('input', () => {
      if (urlEl.value.trim()) { setPhoto(urlEl.value.trim()); if (fileEl) fileEl.value = ''; }
    });

    // ----- live square feet for the entry being typed -----
    function updateLiveSqft() {
      if (!sqftEl) return;
      const s = sqft(wEl ? wEl.value : 0, hEl ? hEl.value : 0);
      if ('value' in sqftEl) sqftEl.value = fmt(s);
      else sqftEl.textContent = fmt(s);
    }
    if (wEl) wEl.addEventListener('input', updateLiveSqft);
    if (hEl) hEl.addEventListener('input', updateLiveSqft);

    // ----- add / edit entry -----
    function resetForm() {
      editingId = null;
      if (areaEl) areaEl.value = 'wall';
      if (wEl) wEl.value = '';
      if (hEl) hEl.value = '';
      if (noteEl) noteEl.value = '';
      if (fileEl) fileEl.value = '';
      if (urlEl) urlEl.value = '';
      setPhoto('');
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
      setPhoto(e.photo || '', false);
      if (e.photo) { previewImg.src = e.photo; previewBox.hidden = false; }
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
        photo: photoData,
        note: noteEl ? noteEl.value : '',
        project: projectEl ? projectEl.value : '',
        crew: crewEl ? crewEl.value : ''
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
    if (crewEl) crewEl.addEventListener('change', persistDayMeta);
    function persistDayMeta() {
      const date = currentDate();
      const day = PPWorkLog.getDay(date);
      if (day.status === 'submitted') return;
      day.project = projectEl ? projectEl.value : '';
      day.crew = crewEl ? crewEl.value : '';
      // Don't create a stored day for an empty shell — a date with no photo
      // entry and no project/crew would otherwise show up in the history as a
      // phantom 0 sq ft day. Only drop it if a real day already exists.
      if (!day.entries.length && !day.project && !day.crew) {
        if (PPWorkLog.hasDay(date)) PPWorkLog.removeDay(date);
        render();
        return;
      }
      PPWorkLog.saveDay(day);
      render();
    }

    function loadDay() {
      const day = PPWorkLog.getDay(currentDate());
      if (projectEl) projectEl.value = day.project || '';
      if (crewEl) crewEl.value = day.crew || '';
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
        li.innerHTML =
          thumb +
          '<div class="wl-item-body">' +
            '<div class="wl-item-title">' + esc(e.label) + '</div>' +
            '<div class="wl-item-meta">' + esc((e.w || 0) + ' × ' + (e.h || 0) + ' ft') +
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
      const bd = PPWorkLog.breakdown(day);
      totalsEl.innerHTML =
        '<div class="wl-total-main"><span>Total area today</span><strong>' + esc(PPWorkLog.fmt(t.sqft)) + '</strong></div>' +
        '<div class="wl-total-sub">' + t.count + (t.count === 1 ? ' photo' : ' photos') + ' logged</div>' +
        (bd.length
          ? '<ul class="wl-breakdown">' + bd.map(r =>
              '<li><span>' + esc(r.label) + '</span><span>' + r.count + '× · ' + esc(PPWorkLog.fmt(r.sqft)) + '</span></li>').join('') + '</ul>'
          : '');
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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wl-hist-row' + (d.date === currentDate() ? ' active' : '');
        btn.innerHTML =
          '<span class="wl-hist-date">' + esc(d.date) + (d.status === 'submitted' ? ' ✅' : '') + '</span>' +
          '<span class="wl-hist-proj">' + esc(d.project || '—') + '</span>' +
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
      const day = PPWorkLog.getDay(currentDate());
      renderEntries(day);
      renderTotals(day);
      renderStatus(day);
      renderHistory();
    }

    // ----- final submit / reopen / export -----
    if (submitBtn) submitBtn.addEventListener('click', () => {
      const day = PPWorkLog.getDay(currentDate());
      const t = PPWorkLog.totals(day);
      if (!t.count) { hint('Add at least one photo entry first.', true); return; }
      const ok = window.confirm('Final submit this day?\n\nTotal area: ' + PPWorkLog.fmt(t.sqft) + ' across ' + t.count + ' photo(s).\n\nYou can reopen it later if something changes.');
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
    function openPanel() { if (gate) gate.hidden = true; if (panel) panel.hidden = false; loadDay(); }
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
