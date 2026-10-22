# फोटो पर एरिया चुनकर Square Feet निकालना — वास्तविक स्थिति और शोध

Photo-to-square-feet measurement in Painter Plus: what actually exists, how it
works, and what is still missing.

Date: 2026-10-18

## सारांश (TL;DR)

एक बाहरी दस्तावेज़ का दावा था कि "चुने हुए एरिया का वास्तविक Square Feet निकालना
**कोड में नहीं मिला**" और फोटो "Firestore में सेव" होती है। यह जाँच गलत थी।

| दावा (बाहरी दस्तावेज़) | वास्तविक स्थिति |
|------------------------|-----------------|
| Square Feet गणना का कोड नहीं है | **मौजूद है** — `js/measure.js` (homography + shoelace) |
| फोटो Firestore में सेव होती है | **गलत** — कोई Firebase/Firestore नहीं; सब `localStorage` में |
| कम-से-कम 5 फोटो के बाद सबमिट | **गलत** — ऐसा कोई नियम कोड में नहीं है |
| Square Feet से मजदूरी/पेंट | **मौजूद है** — `js/measure.js` + `js/erp.js` |

निचले हिस्से में हर बिंदु का प्रमाण (फ़ाइल:लाइन और ब्राउज़र टेस्ट) दिया गया है।

## 1. फोटो से Square Feet कैसे निकलता है (असली तंत्र)

पूरा इंजन `js/measure.js` में है। यह एक फोटो (जो दीवार का *परिप्रेक्ष्य* प्रक्षेपण
होती है) से असली वर्गफुट निकालता है। सिर्फ़ पिक्सेल गिनना गलत होता, क्योंकि तिरछी
खींची गई वही दीवार कम पिक्सेल घेरती है।

दो चरण:

1. **कैलिब्रेशन (Scale)** — पेंटर फोटो पर उस आयत के **चार कोने** टैप करता है जिसका
   असली नाप उसे पता है (दीवार, दरवाज़ा, खिड़की, टाइल्स की कतार), और उसकी असली
   **चौड़ाई × ऊँचाई फीट** में टाइप करता है।
2. **एरिया (Area)** — पेंटर फोटो पर उस हिस्से का **Polygon** टैप करता है जिसे मापना है।

गणित:

- चार जोड़ी बिंदु (पिक्सेल ↔ फीट) से एक **homography** बनती है —
  `homographyFromCalibration()` (`js/measure.js:112`) — जो पिक्सेल को असली फीट में
  बदलने वाला प्रक्षेपी नक्शा है। यह तिरछी/झुकी फोटो को भी ठीक करता है।
- उस नक्शे को Polygon पर लगाकर क्षेत्रफल **shoelace सूत्र** से निकाला जाता है —
  `polygonArea()` (`js/measure.js:40`) और `calibratedArea()` (`js/measure.js:118`)।

क्यों विश्वसनीय है: कैलिब्रेशन के कारण यह साधारण पिक्सेल-अनुपात नहीं है। टेस्ट
`tests/measure.test.js` साबित करते हैं कि **तिरछी फोटो** पर भी 10×6 फीट की दीवार
80 sq ft ही मापती है, और उसका 5×4 पैच 20 sq ft।

```bash
$ node tests/measure.test.js
...
ok  skewed photo: full wall still measures 80 sq ft
ok  skewed photo: a 5x4 patch measures 20 sq ft
ok  labour cost = area x rate
ok  paint litres for 80 sq ft, 2 coats, 130 coverage, 10% wastage
16 passed, 0 failed
```

## 2. पेंटर इसे कहाँ इस्तेमाल करता है (Work Log)

`worklog.html` के "Add a photo entry" खंड में असली एडिटर लगा है
(`js/worklog.js:373`, `PPMeasure.createEditor`):

- **📏 Set scale** → चार कैलिब्रेशन कोने टैप करें। आसानी के लिए **Common sizes**
  बटन (दरवाज़ा 3×7, खिड़की 4×4, टाइल 2×2, ईंट 1×1) एक टैप में नाप भर देते हैं।
- **✏️ Draw area** → मापने वाला हिस्सा टैप करें। वर्गफुट लाइव दिखता है
  (`#wlMeasuredSqft`)।
- **✔ Use this measurement** → माप को एंट्री में डाल देता है (`method: "measured"`)।

हर एंट्री `measure: { calib, points, canvas }` के साथ सेव होती है
(`js/worklog.js:27`), ताकि एडिट करने पर माप दोबारा खुल जाए। दिन के सभी एंट्री
एक **running total** में जुड़ते हैं।

## 3. Square Feet से मजदूरी और पेंट (मौजूद है)

- मजदूरी = क्षेत्रफल × दर/वर्गफुट — `labourCost()` (`js/measure.js:148`)।
- पेंट लीटर = `(area × coats / coverage) × (1 + wastage)`, डिफ़ॉल्ट
  coverage 130 sq ft/L प्रति कोट, 2 कोट, +10% wastage — `paintLitres()`
  (`js/measure.js:137`)।
- ERP इन्हें प्रोजेक्ट, बिलिंग और रिपोर्ट से जोड़ता है — `js/erp.js:163-180`
  (`sqft`, `litres`, `paintCost`, `labour`, `total`)।

## 4. सेव कहाँ होता है (Firestore नहीं)

कोई Firebase/Firestore/नेटवर्क बैकएंड नहीं है — यह जानबूझकर backend-less साइट है।
सारा डेटा ब्राउज़र के `localStorage` में रहता है:

| Key | क्या रखता है | फ़ाइल |
|-----|--------------|-------|
| `painterPlusWorkLog` | दिन-वार एंट्री, माप, दर, कोट | `js/worklog.js:36` |
| `painterPlusERP` | प्रोजेक्ट, approvals, बिल | `js/erp.js:47` |
| `painterPlusGallery` | प्रोफ़ाइल फोटो | `js/gallery.js:36` |
| `painterPlusTeam` | क्रू रोस्टर | `js/team.js:23` |

फोटो फ़ाइल अपलोड होने पर ≤1024px JPEG में बदलकर data URL के रूप में उसी एंट्री में
रहती है।

**"5 फोटो के बाद सबमिट"** — ऐसा कोई नियम नहीं है। `grep` से पूरे कोड में नहीं मिलता।
दिन **Final submit** से बंद होता है (`status: 'submitted'`), फोटो की संख्या की कोई
शर्त नहीं।

## 5. ब्राउज़र में असली सत्यापन (Proof)

`tests/run-wl-selftest.sh` एक असली पेज बनाकर चलाता है: क्रू लॉगिन खोलता है, एक
सिंथेटिक तिरछी फोटो (10×6 फीट दीवार) लोड करता है, कैलिब्रेशन कोने और एरिया टैप
करता है, एंट्री सेव करता है। असली ब्राउज़र में परिणाम (12/12 पास):

```
ok unlock
ok no phantom day from rate alone
ok photo loaded 800x500
door preset filled scale: 3×7 ft
ok scale preset fills known size
full wall measured: 60 sq ft (expected 60 sq ft)
ok full-wall area
half wall measured: 30.1 (expected ~30 sq ft)
ok half-wall area
sqft field after Use: 30.1 sq ft | source: Measured on photo
ok measured badge shown
ok labour shown in totals
ok measurement restored on edit
ok submit locks day
ok reopen
ok summary has labour + paint
```

पेज पर भी दिखा: *Total area today 30.1 sq ft · Labour (₹12/sq ft) ₹361 ·
Paint estimate (2 coats · 130 sq ft/L) 0.5 L*।

## 6. अभी क्या बाकी है (ईमानदार अंतर)

जो मौजूद **नहीं** है, या जिसकी विश्वसनीयता सीमित है:

1. **सब कुछ डिवाइस-लोकल है।** `localStorage` उसी ब्राउज़र तक सीमित है। एक पेंटर
   का लॉग दूसरे फ़ोन या Owner तक अपने-आप नहीं पहुँचता — कोई सर्वर सिंक नहीं।
2. **एक बार का माप बहुत सटीक नहीं।** टेस्ट में 30.1 sq ft आया जबकि अपेक्षित 30 था —
   टैप की जगह पर निर्भर ±0.5% फ़र्क़। असली उपयोग में टैप की सटीकता और कैलिब्रेशन
   आयत चुनने का तरीक़ा त्रुटि बढ़ाते हैं।
3. **पूरी तरह विकृत फोटो।** अगर दीवार का कोई सीधा आयत दिख ही न रहे (अत्यधिक चौड़ा
   कोण, लेंस विरूपण), तो homography पर्याप्त नहीं। ऐसे में मैनुअल नाप (लंबाई × ऊँचाई)
   पर भरोसा करना बेहतर है — जो विकल्प मौजूद है।
4. **कोई सर्वर-साइड प्रमाणीकरण नहीं।** Owner/Head गेट क्लाइंट-साइड है (passcode
   का हैश `js/team.js` में रहता है, सादा पासकोड नहीं) — असली सुरक्षा नहीं।

## 7. सुझाया क्रम (Roadmap)

मौजूदा फोटो + Polygon सिस्टम दोबारा बनाने की ज़रूरत **नहीं** है। आगे का काम:

1. **माप को साझा करना** — ताकि पेंटर का लॉग Owner तक पहुँचे (कोई छोटा बैकएंड या
   निर्यात/आयात, क्योंकि अभी कोई सर्वर नहीं)।
2. ~~**कैलिब्रेशन बेहतर करना** — ज्ञात आयत चुनने के लिए रेडीमेड विकल्प (मानक दरवाज़ा
   ~7×3 फीट, ईंट, टाइल) ताकि Scale सही लगे।~~ **हो गया (2026-10-18)** — Work Log
   में **Common sizes** बटन जोड़े (दरवाज़ा 3×7, खिड़की 4×4, टाइल 2×2, ईंट 1×1) जो
   एक टैप में `#wlCalibW` / `#wlCalibH` भर देते हैं। ब्राउज़र टेस्ट
   (`tests/wl-selftest.js`) इसे साबित करता है: *ok scale preset fills known size*।
3. **त्रुटि-सीमा दिखाना** — माप के साथ "±X%" और एक पुष्टि कदम।
4. **ERP में जोड़ना** — मापा क्षेत्रफल से मजदूरी/पेंट पहले से जुड़ा है; इसे
   Projects, Billing, Reports की स्क्रीन पर और साफ़ दिखाना।

## प्रमाण-सूची (Evidence index)

| दावा | प्रमाण |
|------|--------|
| homography + shoelace से वर्गफुट | `js/measure.js:40,112,118` |
| तिरछी फोटो भी सही मापती है | `tests/measure.test.js` (16/16 पास) |
| Work Log में लाइव एडिटर | `js/worklog.js:373`, `worklog.html:127-148` |
| Scale के लिए रेडीमेड नाप बटन | `worklog.html:143-149`, `js/worklog.js:491-502` |
| मजदूरी + पेंट की गणना | `js/measure.js:137,148`, `js/erp.js:163-180` |
| सेव `localStorage` में (Firestore नहीं) | `js/worklog.js:36`, `js/erp.js:47` |
| "5 फोटो" नियम का अभाव | पूरे कोड में `grep` शून्य परिणाम |
| एंड-टू-एंड ब्राउज़र टेस्ट | `tests/run-wl-selftest.sh` (12/12 पास) |
