/* ============================================================
   PAINTER PLUS — SMART BOT (two modes, live data)
   ------------------------------------------------------------
   Mode 1 — CLIENT  : koi code nahi. Services, warranty, team,
                      portfolio, reviews, contact, process — sab
                      live data se.
   Mode 2 — PAINTER : pehle "painter code" (member id) poochhta
                      hai, phir staff passcode. Uske baad us painter
                      ka apna live data: profile, kaam, sqft,
                      projects, approval pending, earning.

   Data kabhi copy nahi hota. Har jawab se pehle ye seedha
   window.PPTeam / window.PPWorkLog / window.PPERP / window.PPReviews
   (aur zarurat pade to localStorage) se LIVE padhta hai. Isliye
   admin panel me jo aaj badla, bot wahi aaj batata hai — purana
   data nahi.

   Bilingual: sawaal Hindi (Devanagari) me ho to Hindi, warna English.

   Security: painter ka paisa/attendance bina staff passcode ke
   kabhi nahi dikhta. Sirf member id jaanna kaafi nahi hai.
   ============================================================ */
(function () {
  'use strict';
  if (window.PPBot && window.PPBot.__loaded) return;

  var VERSION = '1.0.0';
  var GAP_KEY = 'ppBotGaps';
  var MAX_GAPS = 200;

  /* ---------------------------------------------------------------
   * 1. LIVE DATA READERS
   * ------------------------------------------------------------- */

  function ls(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function teamApi() { return window.PPTeam || null; }
  function erpApi() { return window.PPERP || null; }

  // Stored lists are untrusted: a null/scalar in the array used to reach
  // `.title` / `.name` and throw inside the bot's answer builder.
  function objects(v) {
    return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); }) : [];
  }
  function txt(v) {
    return (v == null || typeof v === 'object') ? '' : String(v);
  }

  function members() {
    try {
      var T = teamApi();
      if (T && typeof T.list === 'function') {
        var l = T.list();
        if (Array.isArray(l)) return objects(l);
      }
    } catch (e) { /* fall through */ }
    var raw = ls('painterPlusTeam');
    if (Array.isArray(raw)) return objects(raw);
    if (raw && Array.isArray(raw.members)) return objects(raw.members);
    return [];
  }

  function findMember(code) {
    var q = String(code || '').trim().toLowerCase();
    if (!q) return null;
    var list = members();
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m) continue;
      if (String(m.id || '').toLowerCase() === q) return m;
    }
    for (var j = 0; j < list.length; j++) {
      var n = list[j];
      if (n && String(n.name || '').toLowerCase() === q) return n;
    }
    return null;
  }

  function roleOf(m) {
    try {
      var T = teamApi();
      if (T && typeof T.roleOf === 'function') {
        var r = T.roleOf(m && m.role);
        if (r && r.label) return r.label;
      }
    } catch (e) { /* ignore */ }
    var r0 = txt(m && m.role) || 'painter';
    return r0.charAt(0).toUpperCase() + r0.slice(1);
  }

  function contact() {
    var T = teamApi();
    var d = null;
    try {
      if (T && typeof T.ownerDefaults === 'function') d = T.ownerDefaults();
    } catch (e) { /* ignore */ }
    if (!d) {
      var head = members()[0] || {};
      d = {
        phone: txt(head.phone) || '+91 8825183628',
        email: txt(head.email) || 'gahonsh@gmail.com',
        address: txt(head.address) || 'Upar Balalong, Arki, Khunti, Jharkhand – 835225',
        note: txt(head.note) || 'Active since 2015 · 5-year warranty on every project · Free site inspection'
      };
    }
    return d;
  }

  function workDays() {
    try {
      var W = window.PPWorkLog;
      if (W && typeof W.listDays === 'function') {
        var l = W.listDays();
        if (Array.isArray(l)) return objects(l);
      }
    } catch (e) { /* fall through */ }
    var days = ls('painterPlusWorkLog') || {};
    if (!days || typeof days !== 'object' || Array.isArray(days)) return [];
    return Object.keys(days).sort().reverse().map(function (k) {
      var d = days[k];
      if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
      d.date = txt(d.date) || k;
      d.entries = objects(d.entries);
      return d;
    }).filter(Boolean);
  }

  function sqftOfDay(d) {
    var total = 0;
    (d.entries || []).forEach(function (e) {
      var v = Number(e && e.sqft);
      if (isFinite(v)) total += v;
    });
    if (!total && d.sqft) total = Number(d.sqft) || 0;
    return total;
  }

  // Resolve a stored crew value (an id or a legacy display name) to the roster
  // id, so days logged before the picker stored ids still belong to the painter.
  function crewIdOf(value) {
    var q = String(value || '').trim().toLowerCase();
    if (!q) return '';
    var list = members();
    for (var i = 0; i < list.length; i++) {
      var m = list[i] || {};
      if (String(m.id || '').toLowerCase() === q || String(m.name || '').toLowerCase() === q) return String(m.id || '');
    }
    return q;
  }

  function daysFor(memberId) {
    var want = String(memberId || '').trim().toLowerCase();
    return workDays().filter(function (d) {
      return crewIdOf(d.crew) === want;
    });
  }

  function projectNameFor(d) {
    if (!d || typeof d !== 'object') return '';
    var name = txt(d.project).trim();
    if (name) return name;
    var erp = erpApi();
    if (erp && typeof erp.getProject === 'function' && d.projectId) {
      try {
        var p = erp.getProject(d.projectId);
        if (p && txt(p.name).trim()) return txt(p.name).trim();
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  function reviewsData() {
    var list = [];
    // The real engine is the source of truth: it resolves subject keys, hides
    // moderated reviews and normalises the stored map. Reading the raw store
    // only as an array missed the actual shape (an object keyed by subject),
    // so the bot always said "no reviews".
    var R = window.PPReviews;
    if (R && typeof R.feed === 'function') {
      try { list = R.feed().filter(function (r) { return r && !r.hidden; }); } catch (e) { list = []; }
    } else {
      var raw = ls('painterPlusReviews');
      if (Array.isArray(raw)) list = raw;
      else if (raw && Array.isArray(raw.items)) list = raw.items;
      else if (raw && Array.isArray(raw.reviews)) list = raw.reviews;
      else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (k) {
          if (Array.isArray(raw[k])) list = list.concat(raw[k]);
        });
      }
      list = list.filter(function (r) { return r && typeof r === 'object' && !r.hidden; });
    }
    var scores = list.map(function (r) {
      var s = Number(r && (r.score || r.rating || r.stars));
      return isFinite(s) && s > 0 ? s : null;
    }).filter(function (s) { return s !== null; });
    var avg = scores.length ? (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    return { count: list.length, avg: Math.round(avg * 10) / 10, items: list };
  }

  function portfolio() {
    var raw = ls('painterPlusProjects');
    if (Array.isArray(raw)) return objects(raw);
    if (raw && Array.isArray(raw.projects)) return objects(raw.projects);
    return [];
  }

  function erpProjects() {
    var erp = erpApi();
    try {
      if (erp && typeof erp.listProjects === 'function') {
        var l = erp.listProjects();
        if (Array.isArray(l)) return objects(l);
      }
    } catch (e) { /* ignore */ }
    var d = ls('painterPlusERP');
    return (d && Array.isArray(d.projects)) ? objects(d.projects) : [];
  }

  function painterReport(memberId) {
    var erp = erpApi();
    try {
      if (erp && typeof erp.reportByPainter === 'function') {
        var rows = erp.reportByPainter();
        if (Array.isArray(rows)) {
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i] || {};
            // reportByPainter() rows expose the crew identity as `crewId`
            // (the member id) and `crew` (the display name). Older/other
            // callers used key/id/memberId/painter, so accept all of them —
            // otherwise "my earnings" never found the row and always said
            // "nothing recorded".
            var keys = [r.crewId, r.key, r.id, r.memberId, r.painter, r.crew];
            var want = String(memberId).toLowerCase();
            for (var k = 0; k < keys.length; k++) {
              var key = String(keys[k] == null ? '' : keys[k]);
              if (key && key.toLowerCase() === want) return r;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // A painter report row carries labour and paint separately (approvedLabour,
  // approvedPaintCost, pendingLabour, …). Accept a pre-summed `<key>Total` from
  // any caller, otherwise add the two halves — reading only approvedLabour used
  // to report ₹0 for a paint-only job and hide pending/invoiced money.
  function reportMoney(rep, key) {
    var total = Number(rep && rep[key + 'Total']);
    if (isFinite(total) && total) return total;
    var labour = Number(rep && rep[key + 'Labour']) || 0;
    var paint = Number(rep && rep[key + 'PaintCost']) || 0;
    return labour + paint;
  }

  function money(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return '';
    try { return '₹' + v.toLocaleString('en-IN'); } catch (e) { return '₹' + v; }
  }

  function num(n) {
    var v = Number(n);
    if (!isFinite(v)) return '0';
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  }

  /* ---------------------------------------------------------------
   * 2. TEXT HELPERS
   * ------------------------------------------------------------- */

  // Roman-Hindi (Hinglish) markers. Unambiguous only: no "do", "me", "to",
  // "par" — those are ordinary English words and would flip English questions.
  var HI_WORDS = ['kya', 'kyu', 'kyun', 'hai', 'hain', 'kaise', 'kaisa', 'kaisi',
    'kahan', 'kaha', 'kitna', 'kitne', 'kitni', 'kaun', 'kaunsi', 'kaunsa', 'kaunse',
    'karna', 'karo', 'karein', 'kijiye', 'dijiye', 'chahiye', 'batao', 'bataiye',
    'bataye', 'batayen', 'mujhe', 'mera', 'meri', 'hamara', 'hamari', 'aap', 'aapka',
    'aapki', 'nahi', 'nahin', 'paisa', 'paise', 'kaam', 'din', 'saal', 'wala', 'wali',
    'theek', 'thik', 'sab', 'kuch', 'raha', 'rahi', 'rahe', 'hoga', 'hota', 'hote',
    'karte', 'karta', 'karti', 'milega', 'milegi', 'bolo', 'abhi', 'phir', 'bhi',
    'chalta', 'chalti', 'banwana', 'banwane', 'lagwana', 'lagwane', 'jaldi',
    'zarurat', 'jarurat', 'hona', 'hogi', 'lagta', 'lagti', 'dijiye', 'kijiyega',
    'kitne din', 'kitna time', 'kaun sa', 'konsa'];

  // Devanagari, or any Roman-Hindi marker → Hindi. Otherwise English.
  function detectLang(s) {
    var str = String(s || '');
    if (/[\u0900-\u097F]/.test(str)) return 'hi';
    var low = ' ' + str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ') + ' ';
    for (var i = 0; i < HI_WORDS.length; i++) {
      if (low.indexOf(' ' + HI_WORDS[i] + ' ') >= 0) return 'hi';
    }
    return 'en';
  }
  function isHindi(s) { return detectLang(s) === 'hi'; }

  var STOP = { ka: 1, ki: 1, ke: 1, hai: 1, hain: 1, ho: 1, me: 1, the: 1, is: 1, a: 1, of: 1, for: 1, to: 1, and: 1, my: 1, i: 1, do: 1, you: 1, kya: 1, kaise: 1 };

  function tokens(s) {
    return String(s || '').toLowerCase().replace(/[^\u0900-\u097Fa-z0-9\s]/g, ' ')
      .split(/\s+/).filter(function (t) { return t && t.length > 1 && !STOP[t]; });
  }

  /* ---------------------------------------------------------------
   * 3. INTENTS
   * ------------------------------------------------------------- */

  var CLIENT_INTENTS = [
    { id: 'greeting', kw: ['hi', 'hello', 'hey', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार', 'salam'] },
    { id: 'services', kw: ['service', 'services', 'kaam', 'work', 'kya karte', 'painting', 'पेंटिंग', 'सेवा', 'interior', 'exterior', 'putty', 'texture', 'waterproofing', 'polish'] },
    { id: 'warranty', kw: ['warranty', 'guarantee', 'warrenty', 'वारंटी', 'गारंटी', 'kitne saal', 'saal ki'] },
    { id: 'experience', kw: ['experience', 'since', 'kitne saal se', 'अनुभव', 'old', 'purana', 'trust', 'भरोसा'] },
    { id: 'contact', kw: ['contact', 'phone', 'call', 'number', 'whatsapp', 'email', 'address', 'संपर्क', 'फोन', 'नंबर', 'पता', 'email', 'mail'] },
    { id: 'location', kw: ['location', 'kahan', 'kaha', 'address', 'area', 'service area', 'पता', 'कहां', 'कहाँ', 'khunti', 'arki', 'ranchi', 'jharkhand'] },
    { id: 'process', kw: ['process', 'kaise', 'kaise kaam', 'steps', 'प्रक्रिया', 'kaise shuru', 'consultation', 'quote', 'estimate'] },
    { id: 'pricing', kw: ['price', 'pricing', 'rate', 'cost', 'kitna', 'kitne', 'charge', 'पैसा', 'कीमत', 'रेट', 'budget', 'sqft rate', 'per sqft'] },
    { id: 'portfolio', kw: ['portfolio', 'project', 'projects', 'work photos', 'gallery', 'photo', 'फोटो', 'काम', 'देखना'] },
    { id: 'team', kw: ['team', 'crew', 'painter', 'painters', 'staff', 'टीम', 'कितने लोग', 'kitne log', 'workers'] },
    { id: 'reviews', kw: ['review', 'reviews', 'rating', 'feedback', 'testimonial', 'रिव्यू', 'रेटिंग'] },
    { id: 'colors', kw: ['color', 'colour', 'colors', 'shade', 'paint color', 'रंग', 'कलर', 'studio'] },
    { id: 'booking', kw: ['book', 'booking', 'appointment', 'visit', 'site visit', 'free quote', 'quote', 'बुक', 'मिलना', 'आना'] },
    { id: 'painter_mode', kw: ['painter code', 'painter login', 'crew login', 'main painter', 'i am painter', 'पेंटर हूं', 'पेंटर हूँ', 'staff login', 'mera kaam', 'mera data'] },
    { id: 'timeline', kw: ['kitne din', 'how long', 'time lagega', 'kab tak', 'duration', 'days', 'कितने दिन', 'समय', 'kitna time'] },
    { id: 'protection', kw: ['furniture', 'dust', 'saman', 'samaan', 'safai', 'cleaning', 'cover', 'फर्नीचर', 'धूल', 'सफाई', 'bacha'] },
    { id: 'brands', kw: ['brand', 'brands', 'asian', 'berger', 'nerolac', 'dulux', 'company ka paint', 'ब्रांड', 'पेंट कंपनी'] },
    { id: 'payment', kw: ['payment', 'advance', 'bill', 'invoice', 'gst', 'cash', 'upi', 'पेमेंट', 'एडवांस', 'बिल'] },
    { id: 'thanks', kw: ['thanks', 'thank', 'dhanyavad', 'shukriya', 'धन्यवाद', 'शुक्रिया'] }
  ];

  var PAINTER_INTENTS = [
    { id: 'p_profile', kw: ['profile', 'mera profile', 'my profile', 'meri jankari', 'मेरी जानकारी', 'who am i', 'role', 'mera role'] },
    { id: 'p_work', kw: ['work', 'kaam', 'mera kaam', 'my work', 'sqft', 'square feet', 'kitna kaam', 'काम', 'वर्क', 'attendance', 'haziri', 'हाजिरी', 'days', 'din'] },
    { id: 'p_money', kw: ['money', 'paisa', 'payment', 'earning', 'salary', 'kitna paisa', 'पैसा', 'कमाई', 'वेतन', 'due', 'baki', 'बकाया'] },
    { id: 'p_projects', kw: ['project', 'projects', 'site', 'kaunse project', 'प्रोजेक्ट', 'कौन सा', 'assignment'] },
    { id: 'p_pending', kw: ['pending', 'approval', 'approve', 'बाकी', 'अप्रूवल', 'waiting', 'submit'] },
    { id: 'p_logout', kw: ['logout', 'exit', 'band', 'बंद', 'client', 'switch'] },
    { id: 'p_help', kw: ['help', 'madad', 'मदद', 'kya poochh', 'what can you do'] }
  ];

  // A keyword must sit on a word boundary. Plain substring matching made
  // "gold" hit the "old" keyword and answer the wrong question. A plural
  // suffix is allowed, because the chips say "My earnings"/"My projects" while
  // the keywords are singular — without it the chip fell through to the
  // generic summary and never answered the question.
  function kwHit(norm, k) {
    if (/[^\x00-\x7F]/.test(k)) return norm.indexOf(k) >= 0;   // Devanagari: substring is fine
    var safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + safe + '(s|es)?([^a-z0-9]|$)').test(norm);
  }

  function matchIntent(q, intents) {
    var norm = ' ' + String(q || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
    var best = null, bestScore = 0;
    intents.forEach(function (it) {
      var score = 0;
      it.kw.forEach(function (k) {
        if (kwHit(norm, k)) score += (k.indexOf(' ') >= 0 ? 3 : (k.length >= 6 ? 2 : 1));
      });
      if (score > bestScore) { bestScore = score; best = it.id; }
    });
    return bestScore ? best : null;
  }

  /* ---------------------------------------------------------------
   * 4. ANSWER BUILDERS
   * ------------------------------------------------------------- */

  function clientAnswer(q, hi, forceIntent) {
    var intent = forceIntent || matchIntent(q, CLIENT_INTENTS);
    var c = contact();
    var list = members();

    switch (intent) {
      case 'greeting':
        return {
          text: hi
            ? 'नमस्ते! 🙏 मैं Painter Plus का असिस्टेंट हूँ. पेंटिंग, वारंटी, टीम, पोर्टफोलियो, रेट या संपर्क — जो पूछना हो पूछिए.'
            : 'Hello! 🙏 I am the Painter Plus assistant. Ask me about painting services, warranty, team, portfolio, rates or contact.',
          chips: hi ? ['कौन सी सर्विस?', 'वारंटी?', 'संपर्क नंबर', 'कितना रेट?']
            : ['What services?', 'Warranty?', 'Contact number', 'Pricing?']
        };

      case 'services':
        return {
          text: hi
            ? 'हमारी सर्विस:\n• Interior Painting — अंदर की दीवार, छत, वार्डरोब\n• Exterior Painting — बाहर की मौसम-रोधी पेंटिंग\n• Wall Putty & Primer — सतह की तैयारी\n• Texture & Designer Finish — स्टक्को, सैंडस्टोन, मेटैलिक\n• Waterproofing — छत, दीवार, खुली सतह\n• 5 साल की वारंटी हर काम पर'
            : 'Our services:\n• Interior Painting — walls, ceilings, wardrobes\n• Exterior Painting — weather-resistant coatings\n• Wall Putty & Primer — surface preparation\n• Texture & Designer Finishes — stucco, sandstone, metallic\n• Waterproofing — terraces, walls, exposed surfaces\n• 5-year warranty on every job',
          links: [{ label: hi ? 'सर्विस देखें' : 'See services', href: 'services.html' }]
        };

      case 'warranty':
        return {
          text: hi
            ? 'हर प्रोजेक्ट पर 5 साल की वारंटी मिलती है, और साइट इंस्पेक्शन फ्री है. कोई छुपा चार्ज नहीं.'
            : 'Every project carries a 5-year warranty, and the site inspection is free. No hidden charges.',
          links: [{ label: hi ? 'संपर्क करें' : 'Contact us', href: 'contact.html' }]
        };

      case 'experience':
        return {
          text: hi
            ? 'Painter Plus 2015 से सक्रिय है — 10+ साल का अनुभव, घर और बिज़नेस दोनों के लिए काम.'
            : 'Painter Plus has been active since 2015 — 10+ years of experience, working for homes and businesses.',
        };

      case 'contact': {
        var lines = [];
        if (c.phone) lines.push('📞 ' + c.phone);
        if (c.email) lines.push('✉️ ' + c.email);
        if (c.address) lines.push('📍 ' + c.address);
        if (c.phone) lines.push('💬 https://wa.me/' + String(c.phone).replace(/[^0-9]/g, ''));
        return {
          text: (hi ? 'संपर्क:\n' : 'Contact:\n') + lines.join('\n'),
          links: [{ label: hi ? 'कॉन्टैक्ट पेज' : 'Contact page', href: 'contact.html' }]
        };
      }

      case 'location':
        return {
          text: hi
            ? '📍 ' + (c.address || '') + '\nहम Arki, Khunti और आस-पास के इलाकों में काम करते हैं. अपना इलाका बता दीजिए, हम बता देंगे.'
            : '📍 ' + (c.address || '') + '\nWe work in Arki, Khunti and nearby areas. Tell us your area and we will confirm.',
          links: [{ label: hi ? 'कॉन्टैक्ट' : 'Contact', href: 'contact.html' }]
        };

      case 'process':
        return {
          text: hi
            ? 'काम का तरीका:\n1. Consultation — साइट देखते हैं, ज़रूरत समझते हैं, फ्री कोटेशन देते हैं\n2. Preparation — मरम्मत, पुट्टी, प्राइमर, सुरक्षा\n3. Painting & Finishing — प्रीमियम पेंट और फिनिशिंग\nफिर हैंडओवर, और 5 साल की वारंटी.'
            : 'How we work:\n1. Consultation — site inspection, requirements, free quote\n2. Preparation — repairs, putty, primer, protection\n3. Painting & Finishing — premium paints, clean handover\nThen a 5-year warranty.',
          links: [{ label: hi ? 'फ्री कोट' : 'Free quote', href: 'contact.html' }]
        };

      case 'pricing':
        return {
          text: hi
            ? 'रेट सतह और स्कोप पर निर्भर करता है (sqft, पुट्टी, पेंट की क्वालिटी, ऊंचाई). इसलिए पहले फ्री साइट इंस्पेक्शन करते हैं और लिखित कोटेशन देते हैं — कोई छुपा चार्ज नहीं. अपना नंबर छोड़ दीजिए, हम रेट बता देंगे.'
            : 'Rate depends on the surface and scope (sqft, putty, paint grade, height). We do a free site inspection first and give a written quote — no hidden charges. Leave your number and we will share rates.',
          links: [{ label: hi ? 'कोटेशन लें' : 'Get a quote', href: 'contact.html' }]
        };

      case 'portfolio': {
        var proj = portfolio();
        var erp = erpProjects();
        var count = proj.length || erp.length;
        var titles = (proj.length ? proj : erp).slice(0, 5).map(function (p) {
          return '• ' + (txt(p.title) || txt(p.name) || 'Project');
        }).filter(Boolean);
        var answer = count
          ? (hi ? 'अब तक ' + count + ' प्रोजेक्ट वेबसाइट पर लाइव हैं:\n' : count + ' projects are live on the site:\n') + titles.join('\n')
          : (hi ? 'पोर्टफोलियो पेज पर ताज़ा काम देख सकते हैं.' : 'You can see recent work on the portfolio page.');
        return { text: answer, links: [{ label: hi ? 'पोर्टफोलियो' : 'Portfolio', href: 'portfolio.html' }, { label: hi ? 'गैलरी' : 'Gallery', href: 'gallery.html' }] };
      }

      case 'team': {
        var byRole = Object.create(null);
        list.forEach(function (m) {
          var r = (m && m.role) || 'painter';
          byRole[r] = (byRole[r] || 0) + 1;
        });
        var parts = Object.keys(byRole).map(function (r) { return r + ': ' + byRole[r]; });
        return {
          text: list.length
            ? (hi ? 'टीम में अभी ' + list.length + ' लोग हैं (' : 'The crew has ' + list.length + ' members (') + parts.join(', ') + ').'
            : (hi ? 'टीम की जानकारी अभी अपडेट हो रही है.' : 'Crew details are being updated.'),
          links: [{ label: hi ? 'टीम देखें' : 'Meet the team', href: 'team.html' }]
        };
      }

      case 'reviews': {
        var r = reviewsData();
        return {
          text: r.count
            ? (hi ? 'ग्राहक रेटिंग: ' + r.avg + '/5 (' + r.count + ' रिव्यू).' : 'Customer rating: ' + r.avg + '/5 from ' + r.count + ' reviews.')
            : (hi ? 'अभी कोई रिव्यू दर्ज नहीं है.' : 'No reviews recorded yet.'),
          links: [{ label: hi ? 'रिव्यू पढ़ें' : 'Read reviews', href: 'index.html#reviews' }]
        };
      }

      case 'colors':
        return {
          text: hi ? 'Color Studio में रंग चुन सकते हैं, दीवार पर लगाकर देखिए.' : 'Pick shades in the Color Studio and preview them on a wall.',
          links: [{ label: 'Color Studio', href: 'color-studio.html' }]
        };

      case 'booking':
        return {
          text: hi
            ? 'बुकिंग के लिए बस एक कॉल या WhatsApp काफी है. हम साइट देखने आते हैं, फ्री कोटेशन देते हैं, फिर तारीख तय होती है.'
            : 'Booking takes one call or WhatsApp. We visit the site, give a free quote, then fix the date.',
          links: [{ label: hi ? 'संपर्क करें' : 'Contact us', href: 'contact.html' }]
        };

      case 'painter_mode':
        return { action: 'ask_code' };

      case 'timeline':
        return {
          text: hi
            ? 'छोटा काम (1-2 कमरा) 2-4 दिन, पूरा घर 7-15 दिन. साइट इंस्पेक्शन के बाद तारीख और दिन लिखित में दे देते हैं, और उसी हिसाब से टीम लगती है.'
            : 'A small job (1-2 rooms) takes 2-4 days, a full house 7-15 days. After the site inspection we give you the dates and duration in writing, and plan the crew around it.',
          chips: hi ? ['फ्री इंस्पेक्शन', 'संपर्क नंबर'] : ['Free inspection', 'Contact number']
        };

      case 'protection':
        return {
          text: hi
            ? 'काम से पहले फर्नीचर, फर्श और फिटिंग ढक दी जाती है, धूल रोकने के लिए प्लास्टिक शीट लगती है, और काम खत्म होने पर सफाई करके ही टीम जाती है.'
            : 'Before work starts we cover the furniture, floors and fittings, use plastic sheeting to control dust, and clean up before the crew leaves.',
        };

      case 'brands':
        return {
          text: hi
            ? 'पेंट और पुट्टी अच्छे ब्रांड की लगती है — एशियन, बर्जर, नेरोलैक जैसे. आप चाहें तो अपनी पसंद का ब्रांड भी बता सकते हैं, वही इस्तेमाल होगा.'
            : 'We use well-known paints and putty — Asian, Berger, Nerolac and similar. If you prefer a specific brand, tell us and we will use that.',
        };

      case 'payment':
        return {
          text: hi
            ? 'काम शुरू होने पर एडवांस, और बाकी काम के अलग-अलग चरण पूरे होने पर. पूरा हिसाब लिखित में मिलता है — कोई छुपा चार्ज नहीं. बिल/इनवॉइस भी मिलता है.'
            : 'A booking advance to start, then payments as each stage is completed. You get the full breakdown in writing, with no hidden charges, and a proper invoice.',
          links: [{ label: hi ? 'बात करें' : 'Talk to us', href: 'contact.html' }]
        };

      case 'thanks':
        return { text: hi ? 'खुशी हुई! 😊 कुछ और पूछना हो तो बताइए.' : 'Glad to help! 😊 Ask me anything else.' };
    }

    return gap(q, hi);
  }

  function painterSummary(m, hi) {
    var days = daysFor(m.id);
    var totalSqft = days.reduce(function (a, d) { return a + sqftOfDay(d); }, 0);
    var submitted = days.filter(function (d) { return d.status === 'submitted'; }).length;
    var open = days.filter(function (d) { return d.status !== 'submitted'; }).length;
    var rep = painterReport(m.id) || {};

    var lines = [];
    lines.push(hi ? 'नमस्ते ' + (txt(m.name) || txt(m.id)) + '! 🙏' : 'Welcome ' + (txt(m.name) || txt(m.id)) + '! 🙏');
    lines.push((hi ? 'रोल: ' : 'Role: ') + roleOf(m));
    lines.push((hi ? 'कुल काम के दिन: ' : 'Work days: ') + days.length +
      (hi ? ' · सबमिट: ' : ' · submitted: ') + submitted +
      (hi ? ' · खुले: ' : ' · open: ') + open);
    lines.push((hi ? 'कुल क्षेत्र: ' : 'Total area: ') + num(totalSqft) + ' sqft');

    var approved = reportMoney(rep, 'approved');
    var pending = reportMoney(rep, 'pending') || (Number(rep.unbilledLabour) || 0);
    if (approved) lines.push((hi ? 'अप्रूव्ड रकम: ' : 'Approved amount: ') + money(approved));
    if (pending) lines.push((hi ? 'अप्रूवल बाकी: ' : 'Awaiting approval: ') + money(pending));

    lines.push(hi ? '\nपूछ सकते हैं: मेरा काम, मेरा पैसा, मेरे प्रोजेक्ट, पेंडिंग अप्रूवल.' : '\nYou can ask: my work, my earnings, my projects, pending approvals.');
    return lines.join('\n');
  }

  function painterAnswer(q, hi, session) {
    var m = session.member;
    var intent = matchIntent(q, PAINTER_INTENTS);

    switch (intent) {
      case 'p_logout':
        session.mode = 'client'; session.member = null; session.unlocked = false;
        return { text: hi ? 'पेंटर मोड बंद. अब क्लाइंट मोड में हूँ.' : 'Painter mode closed. Back to client mode.' };

      case 'p_profile':
        return {
          text: (hi ? 'आपकी प्रोफाइल:\n' : 'Your profile:\n') +
            '• ' + (hi ? 'नाम: ' : 'Name: ') + (txt(m.name) || txt(m.id)) + '\n' +
            '• ' + (hi ? 'रोल: ' : 'Role: ') + roleOf(m) + '\n' +
            (txt(m.title) ? '• ' + txt(m.title) + '\n' : '') +
            (txt(m.phone) ? '• 📞 ' + txt(m.phone) + '\n' : '') +
            (txt(m.startYear) ? '• ' + (hi ? 'शुरुआत: ' : 'Since: ') + txt(m.startYear) + '\n' : '') +
            (txt(m.tagline) ? '• ' + txt(m.tagline) : ''),
          links: [{ label: hi ? 'मेरी प्रोफाइल खोलें' : 'Open my profile', href: 'painter-profile.html?id=' + encodeURIComponent(m.id) }]
        };

      case 'p_work': {
        var days = daysFor(m.id);
        if (!days.length) return { text: hi ? 'आपका अभी कोई वर्क लॉग दर्ज नहीं है.' : 'No work log entries for you yet.' };
        var total = days.reduce(function (a, d) { return a + sqftOfDay(d); }, 0);
        var recent = days.slice(0, 5).map(function (d) {
          var p = projectNameFor(d);
          return '• ' + d.date + ' — ' + num(sqftOfDay(d)) + ' sqft' + (p ? ' · ' + p : '') + ' · ' + (d.status || 'open');
        });
        return {
          text: (hi ? 'आपका काम:\n' : 'Your work:\n') +
            (hi ? 'कुल दिन: ' : 'Total days: ') + days.length + '\n' +
            (hi ? 'कुल क्षेत्र: ' : 'Total area: ') + num(total) + ' sqft\n' +
            (hi ? 'हाल के दिन:\n' : 'Recent days:\n') + recent.join('\n'),
          links: [{ label: hi ? 'वर्क लॉग' : 'Work log', href: 'worklog.html' }]
        };
      }

      case 'p_money': {
        var rep = painterReport(m.id) || {};
        var approved = reportMoney(rep, 'approved');
        var pending = reportMoney(rep, 'pending') || (Number(rep.unbilledLabour) || 0);
        var invoiced = reportMoney(rep, 'invoiced');
        if (!approved && !pending && !invoiced) {
          return { text: hi ? 'अभी आपके नाम पर कोई अप्रूव्ड या पेंडिंग रकम दर्ज नहीं है.' : 'No approved or pending amount is recorded for you yet.' };
        }
        var out = [];
        if (approved) out.push((hi ? 'अप्रूव्ड: ' : 'Approved: ') + money(approved));
        if (pending) out.push((hi ? 'अप्रूवल बाकी: ' : 'Awaiting approval: ') + money(pending));
        if (invoiced) out.push((hi ? 'इनवॉइस हो चुका: ' : 'Invoiced: ') + money(invoiced));
        return { text: out.join('\n'), links: [{ label: hi ? 'ERP खोलें' : 'Open ERP', href: 'erp.html' }] };
      }

      case 'p_projects': {
        var erp = erpProjects();
        var mine = erp.filter(function (p) {
          var crew = String(p.crew || p.painter || p.memberId || '');
          return crew && crew.toLowerCase() === String(m.id).toLowerCase();
        });
        var names = (mine.length ? mine : erp).slice(0, 8).map(function (p) {
          return '• ' + (txt(p.name) || txt(p.id)) + (txt(p.status) ? ' · ' + txt(p.status) : '');
        });
        return {
          text: (mine.length
            ? (hi ? 'आपके प्रोजेक्ट:\n' : 'Your projects:\n')
            : (hi ? 'आपके नाम पर प्रोजेक्ट दर्ज नहीं है. ERP में कुल प्रोजेक्ट:\n' : 'No project is assigned to you yet. All ERP projects:\n')) + names.join('\n'),
          links: [{ label: hi ? 'ERP' : 'ERP', href: 'erp.html' }]
        };
      }

      case 'p_pending': {
        var d2 = daysFor(m.id).filter(function (x) { return x.status !== 'submitted'; });
        return {
          text: d2.length
            ? (hi ? d2.length + ' दिन का काम अभी सबमिट/अप्रूवल में बाकी है:\n' : d2.length + ' days are still open or awaiting approval:\n') +
              d2.slice(0, 6).map(function (x) { return '• ' + x.date + ' · ' + (x.status || 'open'); }).join('\n')
            : (hi ? 'सब कुछ सबमिट है, कोई पेंडिंग नहीं. 👍' : 'Everything is submitted. Nothing pending. 👍'),
          links: [{ label: hi ? 'वर्क लॉग' : 'Work log', href: 'worklog.html' }]
        };
      }

      case 'p_help':
      default:
        return { text: painterSummary(m, hi) };
    }
  }

  /* ---------------------------------------------------------------
   * 5. GAP LOG
   * ------------------------------------------------------------- */

  function gap(q, hi) {
    try {
      var raw = localStorage.getItem(GAP_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.unshift({ q: String(q).slice(0, 300), mode: 'client', at: new Date().toISOString(), page: location.pathname });
      localStorage.setItem(GAP_KEY, JSON.stringify(arr.slice(0, MAX_GAPS)));
    } catch (e) { /* ignore */ }
    var c = contact();
    return {
      text: (hi
        ? 'यह जानकारी अभी सिस्टम में नहीं है, इसलिए मैं गलत जवाब नहीं दूँगा. 🙏 सीधे टीम से बात कर लीजिए:'
        : 'That information is not in the system yet, so I will not guess. 🙏 Please talk to the team directly:') +
        (c.phone ? '\n📞 ' + c.phone : '') +
        (c.phone ? '\n💬 https://wa.me/' + String(c.phone).replace(/[^0-9]/g, '') : ''),
      links: [{ label: hi ? 'संपर्क करें' : 'Contact', href: 'contact.html' }],
      escalated: true
    };
  }

  /* ---------------------------------------------------------------
   * 6. UI
   * ------------------------------------------------------------- */

  var CSS = '' +
    '.ppb-btn{position:fixed;left:18px;bottom:18px;z-index:9998;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;' +
    'background:linear-gradient(135deg,#1f6feb,#0b4fc4);color:#fff;font-size:22px;box-shadow:0 10px 26px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center}' +
    '.ppb-btn:hover{transform:translateY(-2px)}' +
    '.ppb-wrap{position:fixed;left:18px;bottom:86px;z-index:9999;width:min(370px,calc(100vw - 24px));height:min(560px,calc(100vh - 120px));' +
    'background:#fff;border:1px solid #dbe4f0;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden}' +
    '.ppb-wrap.open{display:flex}' +
    '.ppb-head{background:linear-gradient(135deg,#1f6feb,#0b4fc4);color:#fff;padding:13px 15px;display:flex;align-items:center;gap:9px}' +
    '.ppb-head b{font-size:14.5px;font-weight:600}.ppb-head small{display:block;font-size:11px;opacity:.85}' +
    '.ppb-x{margin-left:auto;background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer}' +
    '.ppb-modes{display:flex;gap:6px;padding:9px 12px 0}' +
    '.ppb-mode{flex:1;border:1px solid #dbe4f0;background:#f6f9ff;border-radius:999px;padding:7px 8px;font-size:12px;cursor:pointer;color:#234}' +
    '.ppb-mode.on{background:#1f6feb;border-color:#1f6feb;color:#fff;font-weight:600}' +
    '.ppb-msgs{flex:1;overflow-y:auto;padding:12px;background:#f7fafd;display:flex;flex-direction:column;gap:9px}' +
    '.ppb-m{max-width:88%;padding:9px 12px;border-radius:13px;font-size:13.2px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}' +
    '.ppb-m.bot{background:#fff;border:1px solid #e2eaf4;color:#1a2330;border-bottom-left-radius:4px}' +
    '.ppb-m.user{background:#1f6feb;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.ppb-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}' +
    '.ppb-link{display:inline-block;padding:5px 10px;border-radius:999px;background:#eef4ff;border:1px solid #c9dbff;color:#0b4fc4;font-size:11.5px;text-decoration:none;font-weight:500}' +
    '.ppb-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}' +
    '.ppb-chip{background:#fff;border:1px solid #dbe4f0;color:#345;font-size:11.5px;padding:5px 9px;border-radius:999px;cursor:pointer}' +
    '.ppb-chip:hover{border-color:#1f6feb;color:#0b4fc4}' +
    '.ppb-form{display:flex;gap:7px;padding:9px 11px;border-top:1px solid #e2eaf4;background:#fff}' +
    '.ppb-in{flex:1;border:1px solid #dbe4f0;border-radius:999px;padding:9px 13px;font-size:13px;outline:none;font-family:inherit}' +
    '.ppb-in:focus{border-color:#1f6feb}' +
    '.ppb-send{width:38px;height:38px;border-radius:50%;border:0;background:#1f6feb;color:#fff;cursor:pointer;font-size:15px}' +
    '@media(max-width:480px){.ppb-wrap{right:8px;left:8px;width:auto;bottom:78px;height:min(74vh,540px)}}';

  var els = {};
  var session = { mode: 'client', step: 'idle', member: null, unlocked: false };

  function injectCSS() {
    if (document.getElementById('ppb-css')) return;
    var st = document.createElement('style');
    st.id = 'ppb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function buildUI() {
    injectCSS();
    var btn = document.createElement('button');
    btn.className = 'ppb-btn';
    btn.setAttribute('aria-label', 'Chat');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    var wrap = document.createElement('div');
    wrap.className = 'ppb-wrap';
    wrap.innerHTML =
      '<div class="ppb-head"><div><b>Painter Plus Assistant</b><small>Client · Painter</small></div>' +
      '<button class="ppb-x" aria-label="Close">&times;</button></div>' +
      '<div class="ppb-modes">' +
      '<button type="button" class="ppb-mode on" data-mode="client">👤 Client</button>' +
      '<button type="button" class="ppb-mode" data-mode="painter">🎨 Painter</button>' +
      '</div>' +
      '<div class="ppb-msgs"></div>' +
      '<div class="ppb-chips"></div>' +
      '<form class="ppb-form"><input class="ppb-in" placeholder="Type your question..." autocomplete="off" />' +
      '<button class="ppb-send" type="submit">➤</button></form>';

    document.body.appendChild(btn);
    document.body.appendChild(wrap);

    els.btn = btn; els.wrap = wrap;
    els.msgs = wrap.querySelector('.ppb-msgs');
    els.chips = wrap.querySelector('.ppb-chips');
    els.input = wrap.querySelector('.ppb-in');
    els.form = wrap.querySelector('.ppb-form');
    els.modeBtns = wrap.querySelectorAll('.ppb-mode');

    btn.addEventListener('click', function () {
      wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
      if (wrap.classList.contains('open') && !els.started) { els.started = true; greet(); }
      if (wrap.classList.contains('open')) setTimeout(function () { els.input.focus(); }, 80);
    });
    wrap.querySelector('.ppb-x').addEventListener('click', function () {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = els.input.value.trim();
      if (!q) return;
      els.input.value = '';
      handle(q);
    });
    Array.prototype.forEach.call(els.modeBtns, function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
  }

  function setMode(mode) {
    session.mode = mode;
    session.step = 'idle';
    session.member = null;
    session.unlocked = false;
    Array.prototype.forEach.call(els.modeBtns, function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === mode);
    });
    if (mode === 'painter') {
      var hi = currentLang === 'hi';
      addMsg('bot', hi
        ? 'पेंटर मोड. 🎨 अपना पेंटर कोड (member ID) डालिए, जैसे gahonsh.'
        : 'Painter mode. 🎨 Enter your painter code (member ID), for example gahonsh.');
      session.step = 'await_code';
      setChips([]);
    } else {
      var hi2 = currentLang === 'hi';
      addMsg('bot', hi2 ? 'क्लाइंट मोड. पूछिए कुछ भी.' : 'Client mode. Ask me anything.');
      setChips(defaultChips());
    }
  }

  function defaultChips() {
    return currentLang === 'hi'
      ? ['कौन सी सर्विस?', 'वारंटी कितनी?', 'संपर्क नंबर', 'पोर्टफोलियो']
      : ['What services?', 'Warranty?', 'Contact number', 'Portfolio'];
  }

  var currentLang = 'en';

  function addMsg(role, text, links) {
    var d = document.createElement('div');
    d.className = 'ppb-m ' + role;
    d.textContent = text;
    if (links && links.length) {
      var box = document.createElement('div');
      box.className = 'ppb-links';
      links.forEach(function (l) {
        var a = document.createElement('a');
        a.className = 'ppb-link';
        a.href = l.href;
        a.textContent = l.label;
        if (/^https?:/.test(l.href)) { a.target = '_blank'; a.rel = 'noopener'; }
        box.appendChild(a);
      });
      d.appendChild(box);
    }
    els.msgs.appendChild(d);
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function setChips(chips) {
    els.chips.innerHTML = '';
    (chips || []).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'ppb-chip';
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', function () { handle(c); });
      els.chips.appendChild(b);
    });
  }

  function greet() {
    var hi = currentLang === 'hi';
    addMsg('bot', hi
      ? 'नमस्ते! 🙏 मैं Painter Plus का असिस्टेंट हूँ.\nक्लाइंट के तौर पर सवाल पूछिए, या ऊपर "Painter" दबाकर अपना कोड डालिए.'
      : 'Hello! 🙏 I am the Painter Plus assistant.\nAsk as a client, or tap "Painter" above and enter your code.');
    setChips(defaultChips());
  }

  // "aur batao", "more details" — answer the previous topic again instead of
  // treating it as a new, unknown question.
  var FOLLOW_UP = ['aur', 'aur batao', 'aur bataye', 'detail', 'details', 'more',
    'more info', 'explain', 'uske baad', 'और', 'और बताओ', 'और बताइए', 'ज्यादा', 'विस्तार'];
  function isFollowUp(q) {
    var n = String(q || '').toLowerCase().replace(/[^\u0900-\u097fa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return FOLLOW_UP.indexOf(n) >= 0 || n === '';
  }

  var SUGGEST = {
    services: [['Warranty?', 'वारंटी?'], ['Portfolio', 'पोर्टफोलियो'], ['Pricing?', 'रेट?']],
    warranty: [['Services', 'सर्विस'], ['Contact number', 'संपर्क नंबर'], ['Free inspection', 'फ्री इंस्पेक्शन']],
    pricing: [['Free inspection', 'फ्री इंस्पेक्शन'], ['How long?', 'कितने दिन?'], ['Contact number', 'संपर्क नंबर']],
    contact: [['Free inspection', 'फ्री इंस्पेक्शन'], ['Services', 'सर्विस'], ['Portfolio', 'पोर्टफोलियो']],
    portfolio: [['Reviews', 'रिव्यू'], ['Services', 'सर्विस'], ['Contact number', 'संपर्क नंबर']],
    team: [['Portfolio', 'पोर्टफोलियो'], ['Reviews', 'रिव्यू'], ['Services', 'सर्विस']],
    reviews: [['Portfolio', 'पोर्टफोलियो'], ['Contact number', 'संपर्क नंबर'], ['Services', 'सर्विस']],
    timeline: [['Pricing?', 'रेट?'], ['Contact number', 'संपर्क नंबर'], ['Services', 'सर्विस']],
    process: [['Free inspection', 'फ्री इंस्पेक्शन'], ['Pricing?', 'रेट?'], ['Contact number', 'संपर्क नंबर']],
    booking: [['Contact number', 'संपर्क नंबर'], ['Pricing?', 'रेट?'], ['Portfolio', 'पोर्टफोलियो']]
  };
  function suggestFor(intent, hi) {
    var row = SUGGEST[intent] || [['Services', 'सर्विस'], ['Pricing?', 'रेट?'], ['Contact number', 'संपर्क नंबर']];
    return row.map(function (pair) { return hi ? pair[1] : pair[0]; });
  }

  function handle(q) {
    addMsg('user', q);
    var hi = isHindi(q);
    currentLang = hi ? 'hi' : 'en';

    setTimeout(function () {
      try {
        if (session.mode === 'painter') { handlePainter(q, hi); return; }
        var forced = (isFollowUp(q) && session.lastIntent) ? session.lastIntent : null;
        var res = clientAnswer(q, hi, forced);
        if (!forced) session.lastIntent = matchIntent(q, CLIENT_INTENTS);
        if (res && res.action === 'ask_code') {
          setMode('painter');
          return;
        }
        addMsg('bot', res.text, res.links);
        setChips(res.chips || suggestFor(session.lastIntent, hi));
      } catch (e) {
        addMsg('bot', hi ? 'एक तकनीकी दिक्कत आ गई. टीम से बात कर लीजिए.' : 'Something went wrong. Please contact the team.', [{ label: 'Contact', href: 'contact.html' }]);
      }
    }, 220);
  }

  function handlePainter(q, hi) {
    if (session.step === 'await_code') {
      var m = findMember(q);
      if (!m) {
        addMsg('bot', hi
          ? 'यह कोड नहीं मिला. अपना member ID ठीक से डालिए (जैसे gahonsh).'
          : 'That code was not found. Please enter your member ID again (for example gahonsh).');
        return;
      }
      session.member = m;
      session.step = 'await_pass';
      addMsg('bot', (hi ? 'कोड मिल गया: ' : 'Code found: ') + (txt(m.name) || txt(m.id)) +
        (hi ? '\nअब स्टाफ पासकोड डालिए. इसके बिना आपका पैसा और हाज़िरी नहीं दिखेगी.'
          : '\nNow enter the staff passcode. Without it your earnings and attendance stay hidden.'));
      return;
    }

    if (session.step === 'await_pass') {
      // A question typed here is not a passcode attempt. Say so instead of
      // answering "wrong passcode", which reads like a failed login.
      if (String(q).trim().split(/\s+/).length > 2 || /[?]/.test(q)) {
        addMsg('bot', hi
          ? 'यह पासकोड जैसा नहीं लग रहा. पहले स्टाफ पासकोड डालिए, उसके बाद अपने सवाल पूछिए.'
          : 'That does not look like a passcode. Please enter the staff passcode first, then ask your questions.');
        return;
      }
      var T = teamApi();
      var ok = false;
      try {
        if (T && typeof T.unlockHead === 'function') ok = !!T.unlockHead(q);
        else if (T && typeof T.passcodeDigest === 'function' && T.PASSCODE_SHA256) ok = (T.passcodeDigest(q) === T.PASSCODE_SHA256);
      } catch (e) { ok = false; }
      if (!ok) {
        addMsg('bot', hi ? 'पासकोड गलत है. दोबारा डालिए.' : 'Wrong passcode. Please try again.');
        return;
      }
      session.unlocked = true;
      session.step = 'unlocked';
      addMsg('bot', painterSummary(session.member, hi));
      setChips(hi
        ? ['मेरा काम', 'मेरा पैसा', 'मेरे प्रोजेक्ट', 'पेंडिंग']
        : ['My work', 'My earnings', 'My projects', 'Pending']);
      return;
    }

    if (!session.unlocked || !session.member) {
      session.step = 'await_code';
      addMsg('bot', hi ? 'पहले पेंटर कोड डालिए.' : 'Please enter your painter code first.');
      return;
    }

    var res = painterAnswer(q, hi, session);
    addMsg('bot', res.text, res.links);
    if (res.chips) setChips(res.chips);
  }

  /* ---------------------------------------------------------------
   * 7. BOOT
   * ------------------------------------------------------------- */

  function boot() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', boot); return; }
    try { buildUI(); } catch (e) { /* never break the page */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.PPBot = {
    __loaded: true,
    version: VERSION,
    ask: function (q) {
      var hi = isHindi(q);
      var forced = (isFollowUp(q) && session.lastIntent) ? session.lastIntent : null;
      var res = clientAnswer(q, hi, forced);
      if (!forced) session.lastIntent = matchIntent(q, CLIENT_INTENTS);
      return res;
    },
    members: members,
    painter: function (code) {
      var m = findMember(code);
      return m ? { member: m, days: daysFor(m.id).length } : null;
    },
    gaps: function () {
      try { return JSON.parse(localStorage.getItem(GAP_KEY) || '[]'); } catch (e) { return []; }
    },
    clearGaps: function () { try { localStorage.removeItem(GAP_KEY); } catch (e) {} },
    // Test / integration hooks. Not used by the widget itself.
    _internals: {
      session: function () { return session; },
      painterReport: painterReport,
      setMode: function (m) { session.mode = m; session.step = (m === 'painter' ? 'await_code' : 'idle'); session.member = null; session.unlocked = false; },
      handlePainter: function (q, hi) { handlePainter(q, hi); },
      lastBotMessage: function () {
        var nodes = els.msgs ? els.msgs.children : [];
        for (var i = nodes.length - 1; i >= 0; i--) {
          if (nodes[i].className.indexOf('bot') >= 0) return nodes[i].textContent;
        }
        return '';
      }
    }
  };
})();
