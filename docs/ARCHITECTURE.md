# Architecture

## Big picture

```
┌──────────────────────── Android app (APK) ────────────────────────┐
│ MainActivity: WebView loads https://appassets.androidplatform.net │
│   (WebViewAssetLoader serves the copied web/ folder from assets)  │
│ Bridge.kt  → window.AndroidPOS (print, scan, save file, share…)   │
│ Updater.kt → checks GitHub Releases (tag pos-vN) and installs     │
└───────────────────────────────┬───────────────────────────────────┘
                                │ same code
┌───────────────────────────────▼───────────────────────────────────┐
│ web/  (plain HTML/CSS/JS, offline PWA)                             │
│   IndexedDB "pos-db"  ← all store data lives here                  │
│   sw.js caches every file for offline use                          │
└───────────────────────────────┬───────────────────────────────────┘
                                │ optional, only if the owner connects
┌───────────────────────────────▼───────────────────────────────────┐
│ Supabase Edge Function "pos"  (sync in, read-only REST + MCP out)  │
│   Postgres tables: stores, api_keys, docs                          │
└───────────────────────────────────────────────────────────────────┘
```

There is no build step. Gradle copies `../web` into the APK assets during the Android build, and
GitHub Pages serves `web/` as is.

## Script load order (`web/index.html`)

In `<head>`:

1. `i18n.js`: `window.I18N`, `t()`.
2. `i18n-dict.js`: the translations.
3. `boot.js`: applies the saved theme and language before first paint, so there is no flash.

At the end of `<body>`:

4. `version.js`: written by CI.
5. `icons.js`: `ICON(name)`, which returns inline SVG.
6. `db.js`: `window.DB` and `escHtml()`.
7. `xlsx.js`, `escpos.js`, `receipt.js`, `printer.js`, `scanner.js`.
8. `receiving.js`, `share.js`, `customers.js`, `dashboard.js`, `staff.js`, `shift.js`, `cloud.js`.
9. `app.js`: builds `window.POSKIT`, binds everything and calls `start()`.

Modules other than `app.js` read shared helpers lazily through `const K = () => window.POSKIT`. This is
why they can load before `app.js`.

## `window.POSKIT` (shared helpers, from `app.js`)

| Group | Helpers |
|---|---|
| State and DOM | `S` (app state: `store`, `printer`, `products`, `cart`, `user`, …), `$`, `$$` |
| Text and numbers | `t`, `esc`, `num`, `r2`, `r3`, `money`, `qtyStr`, `uid`, `dayKey`, `fmtDateTime` |
| Dialogs | `toast`, `modal(html, onMount)`, `confirmBox`, `promptText`, `promptArea` |
| Products | `byId`, `byBarcode`, `reloadProducts` |
| Receipts and files | `receiptDoc`, `saveBlob`, `printDoc`, `viewSale` |
| Store and staff | `methods()`, `cashierName()`, `shiftId()`, `applyStore()`, `requireAdmin()` |

## Views and navigation

- Each tab is a `<section class="view" id="view-NAME">`.
- `show(name)` in `app.js` toggles `.on` and calls the view's render function.
- The "Iba pa" tab groups `shift`, `staff`, `printer` and `backup`. Its sub-navigation is the `.subnav` row with `data-go`.
- `ADMIN_VIEWS` (`staff`, `printer`, `backup`) redirect non-admins.
- The Android back button calls `window.__posBack()`. It closes the top modal or returns to the cashier.

## Receipts and printing

`receipt.js` turns a sale (or payment, shift report, receiving slip) into a **doc**: a list of lines
like `{t:'lr', l, r}`, `{t:'text', s}` and `{t:'hr'}`. The same doc is rendered by different functions for
different outputs:

| Output | Function |
|---|---|
| HTML preview | `toHtml` |
| Plain text for WhatsApp and email | `toText` |
| Image (canvas) for Arabic text and sharing | `toCanvas` |
| ESC/POS bytes for thermal printers | `bytes`, using `escpos.js` |

`printer.js` picks the path:

- Android Bluetooth SPP through `AndroidPOS.bt*`, with callbacks to `window.__posCb`
- Web Bluetooth (BLE)
- the system print dialog

## Theme and design tokens

- Colors are CSS custom properties on `:root`. Dark mode overrides them in two places:
  - `@media (prefers-color-scheme: dark)`, used when the setting is Auto
  - `:root[data-theme=dark]`, used when the user picks Dark
- `--accent` is the store color, set at runtime by `applyStore()`.
- Text in the accent color uses `--accent-text`, which is lighter in dark mode for contrast.
- The theme setting is `S.store.theme`. It is mirrored to `localStorage['pos-theme']` so `boot.js` can apply it before paint.
- Motion is short (120–220 ms) and turns off under `prefers-reduced-motion`.

## Android bridge (`window.AndroidPOS`)

The bridge exists only inside the APK. Check `const A = window.AndroidPOS` before using it.

| Area | Methods |
|---|---|
| App | `appVersion()` |
| Printing | `btList(id)`, `btPrint(address, b64, id)`, `openBluetoothSettings()`, `printHtml(html)` |
| Scanning | `scan(id)` (ML Kit barcode scanner) |
| Files | `saveFile(name, mime, text, id)`, `saveFileB64(name, mime, b64, id)` |
| Sharing and links | `shareFile(name, mime, b64, text)`, `openUrl(url)` (http(s), mailto, tel, sms and whatsapp only) |
| Status bar | `setBarColor(hex)` |

Asynchronous results come back through `window.__posCb(id, ok, msg)`.

The WebView loads only the app's own origin. Any other link opens outside the app, and only for those same safe schemes.
