/* ============================================================
   Browser self-test for the CONTACT prefill
   (contact.html + js/script.js). Injected into a generated copy of
   contact.html, opened with the Color Studio's quote query string.

   The Color Studio and "Paint my photo" both link to
   contact.html?colors=…&sqft=…&coats=…&litres=…. Nothing used to
   read those parameters, so the visitor's whole scheme was lost at
   the form. This pins the prefill.
   ============================================================ */
(function () {
  'use strict';
  const out = [];
  const log = (m) => { out.push(m); console.log('[contact-selftest] ' + m); };
  const ok = (m) => log('ok   ' + m);
  const fail = (m) => log('FAIL ' + m);
  const check = (cond, m) => cond ? ok(m) : fail(m);

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'contact-selftest';
    pre.style.cssText = 'white-space:pre-wrap;background:#0b1b33;color:#e2e8f0;padding:18px;margin:30px auto;max-width:900px;border-radius:12px;font-size:13px;line-height:1.6';
    pre.textContent = out.join('\n') + '\n\n' +
      (out.some(l => l.indexOf('FAIL') === 0) ? 'RESULT: FAILURES' : 'RESULT: ALL OK');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', () => {
    const msg = document.getElementById('message');
    check(!!msg, 'the contact form has a message field');
    const value = msg ? msg.value : '';

    check(value.indexOf('Enquiry from the studio') !== -1, 'the enquiry is marked as coming from the studio');
    check(value.indexOf('Room: living') !== -1, 'the selected room is carried over');
    check(value.indexOf('Back wall #E8E3D8') !== -1, 'the wall colour is carried over');
    check(value.indexOf('Left wall #D9D3C6') !== -1, 'every painted surface colour is carried over');
    check(value.indexOf('452 sq ft') !== -1, 'the measured area is carried over');
    check(value.indexOf('2 coats') !== -1, 'the coat count is carried over');
    check(value.indexOf('4 L') !== -1, 'the paint estimate is carried over');
    check(value.indexOf('[object Object]') === -1, 'nothing hostile leaked into the message');
    finish();
  }, { once: true });
})();
