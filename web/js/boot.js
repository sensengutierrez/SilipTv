/* Maagang setup bago lumabas ang screen: wika (direksyon) at tema, para walang "kislap" ng maling kulay. */
(function () {
  'use strict';
  let theme = 'auto';
  try { theme = localStorage.getItem('pos-theme') || 'auto'; } catch (e) { /* walang storage */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (window.I18N) I18N.apply();
})();
