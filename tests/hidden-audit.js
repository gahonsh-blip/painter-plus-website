/* ============================================================
   HIDDEN-ATTRIBUTE AUDIT
   ------------------------------------------------------------
   Appended (defer) to a page, this reports every element that carries the
   `hidden` attribute but whose OWN computed display is not 'none'.

   Why: the UA sheet's `[hidden]{display:none}` is an author-beatable default.
   Any author rule that sets `display` on the element wins, so
   `<div hidden class="wl-measure">` (display:flex) and
   `<button hidden class="btn-ghost">` (display:inline-block) render anyway and
   the author's intent to hide them is silently ignored. That class already bit
   `.pmp-empty` once (fixed with `.pmp-empty[hidden]{display:none}`) and, in the
   tenth audit pass, was found on `#wlMeasurePanel`, `#wlCancelEdit`,
   `#wlReopen` and the `#wlGate`/`#erpGate` login panels — the work-log and ERP
   login gate stayed on screen after a successful unlock. The fix is the global
   `[hidden]{display:none !important}` rule in css/style.css.

   We check each element's own display, independent of a hidden ancestor, so a
   defect is caught even while the element sits inside a hidden panel (where it
   is invisible today but appears the moment that panel opens).

   Writes ok/FAIL lines into <pre id="hidden-audit">.
   ============================================================ */
(function () {
  'use strict';
  const bad = [];
  const all = document.querySelectorAll('[hidden]');
  all.forEach((el) => {
    const d = getComputedStyle(el).display;
    if (d !== 'none') {
      bad.push('#' + (el.id || el.className || el.tagName) + ' [' +
        (el.className || el.tagName) + '] has [hidden] but its own display is ' + d);
    }
  });
  const pre = document.createElement('pre');
  pre.id = 'hidden-audit';
  pre.textContent = 'HIDDEN-AUDIT ' + location.pathname.split('/').pop() +
    ' checked=' + all.length + '\n' +
    (bad.length ? bad.map(b => 'FAIL ' + b).join('\n')
                : 'ok   every [hidden] element is display:none');
  document.body.appendChild(pre);
})();
