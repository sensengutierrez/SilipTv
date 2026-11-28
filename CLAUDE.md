# Project brain: Store POS

Read this first. It is the short map for anyone (a developer or an AI agent) who picks up this repo.
Details live in [`docs/`](docs/).

## What this is

A white-label point of sale for small shops (sari-sari stores, flower shops). Each owner sets their own
store name, logo, color, currency and payment methods, so there is no fixed brand. It runs:

- as an **Android app** (`android/`, a WebView around `web/`, with Bluetooth printing and auto update), and
- as a **website / PWA** (`web/`, deployed to GitHub Pages).

All store data lives **on the device** (IndexedDB) and the app works offline. The optional **cloud**
(Supabase) copies data up so AI agents can read it through REST or MCP.

UI text is Tagalog first, with English and Arabic (right-to-left) translations.

## Folder map

| Path | What is there |
|---|---|
| `web/index.html` | The single page: header, tab bar and every view (`<section class="view" id="view-…">`). |
| `web/css/app.css` | All styles. Design tokens on `:root` (light) and the dark overrides right after. |
| `web/js/*.js` | Plain browser scripts (no build step). The load order is in `index.html`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). |
| `web/sw.js` | Offline service worker. **Every new file in `web/` must be added to `FILES`.** |
| `android/` | Kotlin WebView shell: `MainActivity.kt`, JS bridge `Bridge.kt` (`window.AndroidPOS`), `BtPrinter.kt`, `Updater.kt`. |
| `supabase/` | The cloud: Edge Function `functions/pos/index.ts` and the SQL migration. See [docs/CLOUD-API.md](docs/CLOUD-API.md). |
| `.github/workflows/` | `android.yml` builds the APK and publishes releases; `pages.yml` deploys the website. See [docs/RELEASE.md](docs/RELEASE.md). |
| `tools/i18n_check.py` | Lists UI text without an English/Arabic translation. |
| `tests/` | Playwright end-to-end scripts (flows, security, performance). |
| `docs/` | Architecture, data model, release, cloud/API, security, how-to. |

## Rules that keep things working

1. **No build step, no framework.** Plain ES2020 scripts that attach to `window` (`DB`, `Receipt`, `Staff`, …).
   Shared helpers are on `window.POSKIT` (set up in `app.js`).
2. **New file in `web/`?** Add a `<script>` tag in `index.html` (before `app.js`) **and** add it to `FILES` in `web/sw.js`,
   otherwise it will not work offline.
3. **New UI text?** Write it in Tagalog through `t('…')` (or `data-t` in HTML), then add the English and Arabic to
   `web/js/i18n-dict.js`. Run `python3 tools/i18n_check.py`.
4. **Escape everything** that goes into `innerHTML`: `esc()` for text, `escHtml()` for ids and attributes.
5. **Money** uses the store's decimals: `money()` to show, `r2()` to round, `dec()` for the count (3 for BHD/KWD/OMR, else 2).
6. **Changing the database shape?** Bump `VERSION` in `web/js/db.js`, add the store in `onupgradeneeded`,
   add it to `STORES`, and bump the backup `format`. See [docs/DATA.md](docs/DATA.md).
7. **Admin-only actions** (void, settings, printer, backup, deleting customers) must go through
   `await Staff.requireAdmin()` (or `K().requireAdmin()`).
8. **Releases happen only from `main`.** Work on a branch, open a PR, merge. Each merge creates `pos-vN` and the
   app offers the update. Branch builds are checked but not released.
9. Comments in code are short and in Tagalog, like the rest of the codebase.

## Run it locally

```sh
cd web && python3 -m http.server 8765      # open http://localhost:8765
```

Tests (need `npm i -D playwright` and `npx playwright install chromium`, with the server above running):

```sh
node tests/flow-staff-shift.js
node tests/security.js
node tests/perf.js
python3 tools/i18n_check.py
```

## Where to look for…

- Cashier, cart, payment, settings, inventory, sales list: `web/js/app.js`
- Receipts (one "doc" model rendered to HTML, text, image and ESC/POS bytes): `web/js/receipt.js`, `web/js/escpos.js`
- Printing (Bluetooth via Android, Web Bluetooth, system print): `web/js/printer.js`, `android/…/BtPrinter.kt`
- Customers and credit (utang): `web/js/customers.js`
- Dashboard charts: `web/js/dashboard.js`
- Staff, PIN, lock screen: `web/js/staff.js`
- Cash drawer shifts (X/Z report): `web/js/shift.js`
- Receiving stock from supplier invoices: `web/js/receiving.js`
- Excel import/export: `web/js/xlsx.js`
- Cloud sync, API keys: `web/js/cloud.js` (app) and `supabase/functions/pos/index.ts` (server)
- Security notes and known gaps: [docs/SECURITY.md](docs/SECURITY.md)
