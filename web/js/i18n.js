/* Language: Tagalog (tl, ang orihinal na text), English (en), Arabic (ar, right-to-left).
 * Ang key ay ang Tagalog na text mismo; kapag walang salin, Tagalog ang lalabas.
 * Gamit: t('Ilang {u} ang dumating?', { u: 'kilo' })
 */
(function () {
  'use strict';
  const LANGS = { tl: 'Tagalog', en: 'English', ar: 'العربية' };
  let lang = 'tl';
  try { lang = localStorage.getItem('pos-lang') || 'tl'; } catch (e) { /* wala */ }
  if (!LANGS[lang]) lang = 'tl';

  function t(key, vars) {
    let s = key;
    if (lang !== 'tl') {
      const d = window.I18N_DICT && window.I18N_DICT[key];
      if (d && d[lang]) s = d[lang];
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k])));
    return s;
  }

  // I-translate ang static na HTML: text ng elementong may data-t, at placeholder/aria-label/title na may data-t-attr
  const originals = new WeakMap();
  function translateDom(root) {
    (root || document).querySelectorAll('[data-t]').forEach((el) => {
      if (!originals.has(el)) originals.set(el, el.textContent.trim());
      el.textContent = t(originals.get(el));
    });
    (root || document).querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
      ['placeholder', 'aria-label', 'title'].forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const k = 'data-orig-' + a;
        if (!el.hasAttribute(k)) el.setAttribute(k, el.getAttribute(a));
        el.setAttribute(a, t(el.getAttribute(k)));
      });
    });
  }

  function apply() {
    document.documentElement.lang = lang === 'tl' ? 'fil' : lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    translateDom(document);
  }

  function setLang(l) {
    if (!LANGS[l]) return;
    lang = l;
    try { localStorage.setItem('pos-lang', l); } catch (e) { /* wala */ }
    apply();
  }

  window.I18N = { t, setLang, apply, translateDom, LANGS, get lang() { return lang; } };
  window.t = t;
})();
