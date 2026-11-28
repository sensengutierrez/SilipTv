# 🧾 POS para sa tindahan

Simpleng POS (point of sale) para sa sari-sari store at maliliit na tindahan. **Walang ads, walang account, walang nakatakdang brand**: ang may-ari ang maglalagay ng pangalan, logo at kulay ng tindahan nila, at iyon ang lalabas sa app at sa resibo.

Gumagana sa **Android phone (APK)** at bilang **website** (puwedeng i-install sa phone o computer). Nasa device lang ang data at gumagana kahit walang internet.

## I-download / buksan

- Android: https://github.com/sensengutierrez/tindahan-pos/releases/latest/download/POS.apk
- Website: https://sensengutierrez.github.io/tindahan-pos/ (sa Chrome, "Install app" o "Add to Home screen")

## Mga tab

- **Cashier**: mag-scan ng barcode (camera, o USB/Bluetooth scanner), maghanap ng paninda, mabilis na pili ng pinakamabenta, cart na may +/− at decimal (hal. 0.5 kilo), discount (halaga o %), bayad at sukli na may mabilis na buttons, **Bayad & Print**.
- **Paninda**: dagdag/edit ng paninda (pangalan, barcode, presyo, puhunan, unit, kategorya, stock, paalala kapag paubos), "Dagdag stock" kapag may delivery, filter ng paubos at ubos.
- **Benta**: benta ngayon, kahapon, 7 araw, buwan o kahit anong araw; tubo, pinakamabenta, listahan ng resibo, print ulit, void (ibinabalik ang stock), export sa CSV.
- **Printer**: Bluetooth thermal printer (58mm/80mm) sa Android app, Bluetooth (BLE) sa Chrome, o ordinaryong print/PDF. May logo sa resibo at test print.
- **Backup**: i-save ang lahat ng data bilang file at ibalik sa ibang phone; export/import ng paninda sa CSV (Excel/Google Sheets).
- **⚙ Tindahan**: pangalan, logo, address, contact, cashier, mensahe sa resibo, simbolo ng pera, kulay ng app.

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
