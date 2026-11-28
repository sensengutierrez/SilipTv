# 🧾 POS para sa tindahan

Simpleng POS (point of sale) para sa sari-sari store at maliliit na tindahan. **Walang ads, walang account, walang nakatakdang brand**: ang may-ari ang maglalagay ng pangalan, logo at kulay ng tindahan nila, at iyon ang lalabas sa app at sa resibo.

Gumagana sa **Android phone (APK)** at bilang **website** (puwedeng i-install sa phone o computer). Nasa device lang ang data at gumagana kahit walang internet.

## I-download / buksan

- Android: https://github.com/sensengutierrez/tindahan-pos/releases/latest/download/POS.apk
- Website: https://sensengutierrez.github.io/tindahan-pos/ (sa Chrome, "Install app" o "Add to Home screen")

## Mga tab

- **Cashier**: mag-scan ng barcode (camera, o USB/Bluetooth scanner), maghanap ng paninda, mabilis na pili ng pinakamabenta, cart na may +/− at decimal (hal. 0.5 kilo), discount (halaga o %), pili ng suki, paraan ng bayad (Cash, Card, Utang, at kahit anong idagdag mo sa ⚙ gaya ng GCash o BenefitPay), **custom item** para sa gawang-order (hal. bouquet), **tala sa order** (para kanino, oras ng delivery, mensahe sa card), bayad at sukli na may mabilis na buttons, **Bayad & Print**. Pagkabayad, puwedeng i-print ang resibo o ipadala sa **WhatsApp**, **Email**, o i-share bilang larawan.
- **Paninda**: dagdag/edit ng paninda (pangalan, barcode, presyo, puhunan, unit, kategorya, stock, paalala kapag paubos), "Dagdag stock" kapag may delivery, filter ng paubos at ubos. May **Excel view**: i-edit ang presyo, puhunan at stock na parang spreadsheet, at puwedeng mag-paste galing Excel.
- **Receiving**: ilagay ang delivery mula sa invoice ng supplier (supplier, invoice no., petsa, at bawat item: barcode, pangalan, unit, dami, puhunan, presyo). Puwedeng i-type, i-scan, i-paste mula Excel, o mag-import ng .xlsx/CSV (may template). Pag "I-post", madadagdag ang stock, ma-a-update ang puhunan, at gagawa ng bagong paninda kung wala pa. May void, export sa Excel, at print ng receiving slip sa thermal printer.
- **Suki**: listahan ng customer (pangalan, mobile/WhatsApp, email, address, limit ng utang). Makikita ang balanse ng utang, history ng bili at bayad, at may "Tumanggap ng bayad", paalala sa WhatsApp, tawag at email.
- **Dashboard**: benta, tubo, margin at bilang ng resibo (kumpara sa nakaraang panahon), chart ng benta at tubo kada oras o araw, paraan ng bayad, pinakamabenta, paubos na paninda, at mga may utang. Kasama ang listahan ng resibo, print ulit, void at export sa Excel.
- **Iba pa → Kaha**: buksan ang shift na may opening (petty) cash, cash in at cash out/gastos, X report, at pagsara ng shift na may bilang ng pera (Z report: sobra o kulang).
- **Iba pa → Staff**: admin at mga cashier na may PIN. May lock screen (🔒) at auto-lock. Nakatala ang cashier sa bawat resibo. Admin lang ang makakapag-void, makakapagbago ng settings, printer at backup (o mag-PIN ang admin para payagan).
- **Iba pa → Printer**: Bluetooth thermal printer (58mm/80mm) sa Android app, Bluetooth (BLE) sa Chrome, o ordinaryong print/PDF. May logo sa resibo at test print. Kapag Arabic o may letrang hindi kaya ng printer, ipi-print bilang larawan kaya tama ang lalabas.
- **Iba pa → Backup**: i-save ang lahat ng data bilang file at ibalik sa ibang phone; export/import ng paninda sa Excel (.xlsx) o CSV. Kasama sa backup ang receivings, suki at bayad sa utang.
- **⚙ Tindahan**: pangalan, logo, address, contact, cashier, mensahe sa resibo, simbolo ng pera (₱, BHD at iba pa; 3 decimal sa BHD), mga paraan ng bayad, payagan ang utang, kulay ng app, at **wika**.

## Wika

Tagalog, English at العربية (Arabic, right-to-left). Palitan sa 🌐 sa itaas o sa ⚙ Tindahan. Sinusunod din ng resibo ang napiling wika.

## Auto update

- **APK**: tuwing may push sa `main`, gagawa ang GitHub ng bagong `POS.apk` (release `pos-vN`). Pagbukas ng app, lalabas ang "May bagong update"; pindutin ang **I-update**. Hindi nawawala ang data.
- **Website**: kusang naa-update; lalabas ang "May bagong bersyon" at **I-reload**.

## Folders

```
├── web/                Ang POS mismo (HTML/CSS/JS, offline, IndexedDB)
├── android/            Android app: WebView na may laman na web/, Bluetooth printer, Google barcode scanner, auto update
└── .github/workflows/  android.yml (APK sa Releases), pages.yml (website sa GitHub Pages)
```

Subukan sa computer: `cd web && python3 -m http.server 8000` tapos buksan ang http://localhost:8000
