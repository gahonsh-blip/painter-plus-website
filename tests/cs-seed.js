/* ============================================================
   Seed + error collector for the COLOR STUDIO self-test.

   Loaded from <head> WITHOUT defer, so it runs before any page
   script (js/script.js is a plain end-of-body script and
   js/color-studio.js is deferred). It:

     1. installs window.__csErrors and the error listeners, so a
        throw from the very first line of a page script is recorded;
     2. writes a deliberately corrupt `pp_studio` into localStorage,
        which the studio reads during init. Before the fix this
        crashed the scene render (a number/null/object/bogus-hex
        colour was passed to `.toUpperCase()` / `.replace()`).

   See tests/color-studio-selftest.js for the assertions.
   ============================================================ */
(function () {
  'use strict';
  var errs = (window.__csErrors = []);
  window.addEventListener('error', function (e) { errs.push(e.message || String(e.error)); });
  window.addEventListener('unhandledrejection', function (e) {
    errs.push('rejection: ' + (e.reason && e.reason.message || e.reason));
  });

  try {
    localStorage.setItem('pp_studio', JSON.stringify({
      colours: {
        living: { back: 12345, left: null, right: '#abcdef', ceiling: '#ffffff', floor: '#000000', accent: {} },
        kitchen: { back: '', left: 'notacolor', right: '#GGGGGG', ceiling: '#1234567', floor: 0, cabinet: [] },
        exterior: { sky: '#abc', main: 7, roof: null, ground: false, trim: '#112233', door: '#' }
      },
      scene: 'living',
      surface: 'back',
      finish: 'flatmatte',
      light: 'day',
      areas: { living: { back: { w: 12, h: 10, inc: true } } }
    }));
  } catch (e) { /* storage may be blocked; the harness tolerates that */ }
})();
