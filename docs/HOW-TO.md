# How to add or change things

## Add a new screen (view)

1. In `web/index.html`, add `<section class="view" id="view-NAME">…</section>`. If it lives under "Iba pa", also add a button to every `.subnav` and the name to `data-also` on the "Iba pa" tab.
2. Write the module as `web/js/NAME.js`:

   ```js
   (function () {
     'use strict';
     const K = () => window.POSKIT;
     async function render() { const { $, t, esc } = K(); /* … */ }
     function bind() { /* event listeners, once */ }
     window.Name = { render, bind };
   })();
   ```

3. Add the `<script>` tag before `app.js`, and add the file to `FILES` in `web/sw.js`.
4. In `app.js`, call `Name.bind()` inside `bind()`, and add `if (view === 'NAME') Name.render();` in `show()`.
   If only admins may use it, add it to `ADMIN_VIEWS`.

## Add text

- In JS, use `t('Tagalog na text')`, or `t('May {n} na item', { n })` for values.
- In HTML, add `data-t` to an element with plain text. `placeholder`, `aria-label` and `title` are translated automatically.
- Add the key to `web/js/i18n-dict.js` as `"Tagalog": { "en": "…", "ar": "…" }`.
- Run `python3 tools/i18n_check.py` until it reports `0 missing`.

## Add a setting

1. Add a default to `DEFAULT_STORE` in `app.js`.
2. Add the field in `editStore()` and save it in the `#sSave` handler.
3. If the setting must apply before first paint (like the theme), mirror it to `localStorage` and read it in `boot.js`.

## Add a payment method type

Owners add their own methods in ⚙. To change the **defaults** for a currency, edit `defaultMethods()` in `app.js`.
`cash` is special because it counts in the shift's expected cash. `utang` (credit) is added automatically when
`allowCredit` is on.

## Add an icon

Add a path to `P` in `web/js/icons.js` (24×24, stroke-based) and use `ICON('name')` in HTML strings.
Do not use emoji as icons.

## Add a field that agents should see

1. Store it in the record. The cloud sync sends the whole record.
2. Expose it in the mapping functions in `supabase/functions/pos/index.ts` (`products()`, `salesList()`, …),
   then update the OpenAPI text and tool descriptions if needed.
3. Deploy the function.

## Before opening a PR

- Run the tests in `tests/` against `python3 -m http.server` in `web/`, and check that each prints `errors []`.
- Run `python3 tools/i18n_check.py`, which should print `0 missing`.
- Check the screens at phone width (390px) and desktop width, in light and dark mode.
- If you added a file to `web/`, check that it is in `sw.js`.
