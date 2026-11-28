# Build, release and auto update

## Flow

1. Work on a branch such as `claude/...` or `feature/...` and open a pull request to `main`.
2. **`android.yml`** runs on pushes to `main` and `claude/**` that touch `android/`, `web/` or the workflow:
   - writes `web/js/version.js` (`1.0.<run_number>`)
   - builds the release APK with Gradle 8.7 and JDK 17
   - uploads `POS.apk` as a workflow artifact (useful for testing a branch)
   - **on `main` only**, publishes a GitHub Release with tag `pos-v<run_number>` and asset `POS.apk`, marked as latest
3. **`pages.yml`** runs on pushes to `main` that touch `web/`:
   - stamps the version into `version.js` and into `VERSION` in `sw.js`
   - deploys `web/` to GitHub Pages

Run numbers are shared with branch builds, so release tags skip numbers (for example v15, then v17). This is normal.

## How users get updates

- **Android**: on start, `Updater.kt` reads `https://api.github.com/repos/sensengutierrez/tindahan-pos/releases/latest`.
  It compares the `pos-vN` number with the installed version and offers **I-update**. That downloads `POS.apk` and opens
  the installer. Data is kept because the package name and signing key stay the same.
- **Website**: the new `sw.js` has a new `VERSION`. Open tabs show "May bagong bersyon" with a reload button,
  and the old cache is deleted on activate.

## Links

- APK: https://github.com/sensengutierrez/tindahan-pos/releases/latest/download/POS.apk
- Website: https://sensengutierrez.github.io/tindahan-pos/

## Signing

The APK is signed with `android/app/personal.keystore` (see `android/app/build.gradle.kts`).
Installed apps only accept updates signed with the **same key**. Changing the key means every user
must back up, uninstall and reinstall. See the signing finding in [SECURITY.md](SECURITY.md).

## Cloud (Supabase) deploys

The Edge Function is **not** deployed by CI. After changing `supabase/functions/pos/index.ts`, deploy it with
either of these:

- the Supabase CLI: `supabase functions deploy pos --no-verify-jwt --project-ref ihtwvsjtxpxzaoogfjpd`
- the Supabase MCP `deploy_edge_function` tool, with `verify_jwt: false`

Apply new SQL in `supabase/migrations/` with `supabase db push` or the MCP `apply_migration` tool.
