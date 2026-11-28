// Security: legacy PIN hash upgrade to PBKDF2, wrong-PIN lockout, malicious ids/HTML from a backup file.
// Run: cd web && python3 -m http.server 8765   (other terminal)   then: node tests/security.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium). Prints "errors []" when OK.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.goto((process.env.POS_URL || 'http://localhost:8765/'));
  await p.waitForSelector('#sName'); await p.fill('#sName', 'Sec'); await p.click('#sSave');
  await p.evaluate(async () => {
    const h = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, '0')).join('');
    await DB.put('staff', { id: 'a1', name: 'Boss', role: 'admin', active: true, salt: 'abc', pinHash: await h('abc:1234') });
    await DB.put('staff', { id: 'c1', name: 'Kim', role: 'cashier', active: true, salt: 'xyz', pinHash: await h('xyz:5555') });
    // malicious backup-like product id + name
    await DB.importAll({ app: 'pos', products: [{ id: '"><img src=x onerror=alert(1)>', name: 'bad' }, { id: 'ok1', name: '<b>x</b><img src=x onerror="window.__xss=1">', price: 1, stock: 1 }], sales: [], staff: [await DB.get('staff', 'a1'), await DB.get('staff', 'c1')], meta: [{ key: 'store', value: { name: 'Sec' } }] });
  });
  await p.reload(); await p.waitForTimeout(400);
  console.log('products', await p.evaluate(async () => (await DB.all('products')).map((x) => x.id)));
  await p.click('.lock-user >> text=Boss');
  for (const k of '1234') await p.click('.lock-pin [data-k="' + k + '"]');
  await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(600);
  console.log('unlocked', !(await p.isVisible('#lockScreen')), 'hash', (await p.evaluate(async () => (await DB.get('staff', 'a1')).pinHash)).slice(0, 8));
  await p.click('.tabs [data-view=inventory]'); await p.waitForTimeout(300);
  console.log('xss', await p.evaluate(() => window.__xss || 0));
  await p.click('#lockBtn'); await p.waitForTimeout(200);
  await p.click('.lock-user >> text=Kim');
  for (let i = 0; i < 6; i++) { for (const k of '0000') await p.click('.lock-pin [data-k="' + k + '"]'); await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(250); }
  console.log('toast', await p.textContent('#toast'));
  for (const k of '5555') await p.click('.lock-pin [data-k="' + k + '"]');
  await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(400);
  console.log('blocked while waiting', await p.isVisible('#lockScreen'));
  await p.evaluate(() => localStorage.setItem('pos-pin-fails', JSON.stringify({ n: 0, until: 0 })));
  await p.click('.lock-pin [data-k=ok]').catch(() => {});
  for (const k of '5555') await p.click('.lock-pin [data-k="' + k + '"]');
  await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(600);
  console.log('unlocked after wait', !(await p.isVisible('#lockScreen')));
  console.log('errors', errs);
  await b.close();
})();
