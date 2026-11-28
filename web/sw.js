/* Offline: lahat ng files ng app ay naka-cache para gumana kahit walang internet.
 * Palitan ang VERSION (ginagawa ng GitHub Actions) para lumabas ang "May bagong bersyon". */
const VERSION = 'dev';
const CACHE = 'pos-' + VERSION;
const FILES = [
  './', 'index.html', 'css/app.css', 'js/i18n.js', 'js/i18n-dict.js', 'js/version.js', 'js/db.js', 'js/xlsx.js', 'js/escpos.js',
  'js/receipt.js', 'js/printer.js', 'js/scanner.js', 'js/receiving.js', 'js/app.js',
  'vendor/zxing.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pos-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('index.html')))
  );
});
