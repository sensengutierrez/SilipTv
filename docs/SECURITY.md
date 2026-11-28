# Security

Last review: 2026-11-28. This document covers the threat model, what is in place, what was fixed in this
review, and what is still open.

## Threat model

The POS is an **offline-first app on a shop device**. Realistic risks:

1. A cashier or visitor uses the device to do admin things: void sales, change prices, or take cash and hide it.
2. A **backup file** or a supplier Excel file that someone else made or changed is opened in the app.
3. A **lost or shared backup file** gets read by someone else.
4. The optional **cloud API** is abused: a guessed or leaked key, spam, or very large requests.
5. A fake app "update" is installed on the Android phone.

Out of scope: an attacker with full control of an unlocked device and developer tools. The data lives on
that device, so phone security (screen lock) protects it.

## Controls in place

| Area | Control |
|---|---|
| Staff PIN | PBKDF2-SHA256, 120,000 iterations, random 16-byte salt per PIN, stored as `p2$<hex>`, compared in constant time. Hashes from older versions (SHA-256) are upgraded automatically on the next correct login. |
| PIN guessing | After 5 wrong PINs, the app waits 30 seconds. The wait doubles with each further mistake, up to 15 minutes. The counter survives reloads (`localStorage['pos-pin-fails']`). |
| Admin-only actions | These actions call `Staff.requireAdmin()`: void, settings, printer, backup and restore, staff, deleting customers, voiding payments and receivings. A cashier can continue only if an admin enters their PIN. |
| Lock | Lock screen on start (when staff exist), a lock button, and auto-lock after 2 to 30 idle minutes. |
| HTML injection | All user text goes through `esc()`, and ids and attributes go through `escHtml()`. Restoring a backup accepts only records with safe ids (`/^[\w.:-]{1,80}$/`). |
| Content Security Policy | `script-src 'self'` (no inline or remote scripts), `connect-src` limited to the app and the POS cloud function, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, no referrer. |
| Android WebView | Only loads the app's own origin (WebViewAssetLoader). File and content access are off. Other links open outside the app, and only `http(s)`, `mailto`, `tel`, `sms` and `whatsapp`. The JS bridge `openUrl` uses the same allow-list. |
| Cloud data | Tables have RLS on with **no** policies, and `anon`/`authenticated` have no grants. Only the Edge Function (service role) reads or writes them. Each store sees only its own rows. |
| Cloud secrets | The device token and API keys are random (192–256 bits) and stored only as SHA-256 hashes. A full API key is shown once. Keys can be revoked. |
| API scope | API keys are **read-only** and limited to one store. Staff and PINs are never synced, and the logo is not sent. |
| Cloud limits | 6 MB per request, 256 KB per record, 1000 records per push, `limit` capped at 500/200, MCP batches of at most 20, and at most 30 new stores per hour overall. |
| Backup file | Does not contain the cloud token. Restoring a backup does not change the cloud connection. |
| Disconnect | **Idiskonekta** deletes the store's cloud copy and its keys. |

## Fixed in this review

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | High | PINs were SHA-256(salt:pin). A 4–8 digit PIN can be brute-forced in seconds from a backup file. | PBKDF2 (120k iterations) with a crypto-random salt, plus an automatic upgrade of old hashes. |
| 2 | High | No limit on wrong PIN attempts on the lock screen or the admin prompt. | Lockout with a growing wait, which survives reloads. |
| 3 | Medium | Record ids from a backup file were put into HTML attributes without escaping, so a crafted file could run script. | `escHtml()` on every id, and id validation in `importAll`. |
| 4 | Medium | No Content-Security-Policy. | CSP and no-referrer meta tags. The inline script moved to `boot.js`. |
| 5 | Medium | Android: `openUrl` and the link handler opened any scheme (`intent:`, `file:`, `content:`). | Scheme allow-list, and `allowContentAccess = false`. |
| 6 | Low | Cloud function had no size limits, unbounded `limit`, unlimited registrations and unbounded MCP batches. | The limits listed above. |

## Open items (need a decision)

1. **High: the APK signing key is in the repository.** `android/app/personal.keystore` and its passwords
   (`android/app/build.gradle.kts`) are committed. If the repo is public, anyone can build an APK that Android
   accepts as an *update* of the installed app.
   - **Fix:** create a new key, store it as GitHub Actions secrets (keystore as base64, plus its passwords), and
     have `android.yml` write it at build time. Remove the file from the repo.
   - **Cost:** Android only accepts updates with the same key, so **every installed copy must be reinstalled once**.
     The steps are: save a backup, uninstall, install the new APK, restore the backup.
   - It is best to do this **before** selling to shops.
2. **Admin checks run on the device.** Someone with the unlocked device and developer tools (on the website
   version) could get around them. This is normal for an offline app. The PIN stops casual misuse; the phone's
   own screen lock protects the data.
3. **Data on the device is not encrypted** (IndexedDB), and **backup files are plain JSON**. Anyone with the file
   can read sales and customers. Keep backups private. A future option is password-protected backups.
4. **API key in a URL** (`/mcp?key=…`): some AI apps only accept a URL, so the key may end up in that app's logs or
   history. Use the `Authorization: Bearer` header where possible. Make one key per AI and revoke any key that leaks.
5. **No per-key rate limit** on the API. Supabase free plan limits apply. Add one if a key is ever abused.
6. **CI actions are pinned by tag** (`@v4`), not by commit SHA. This is a low risk; pin by SHA if the repo gets
   more contributors.

## Reporting

If you find a problem, do not post the details publicly. Contact the repository owner directly.
