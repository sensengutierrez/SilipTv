// Performance: startup and tab switches with 1,500 products and 6,000 sales.
// Run: cd web && python3 -m http.server 8765   (other terminal)   then: node tests/perf.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium). Prints "errors []" when OK.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto((process.env.POS_URL || 'http://localhost:8765/'));
  await p.waitForSelector('#sName'); await p.fill('#sName', 'Big'); await p.click('#sSave');
  await p.evaluate(async () => {
    const now = Date.now();
    const ps = []; for (let i = 0; i < 1500; i++) ps.push({ id: 'p' + i, name: 'Item ' + i, barcode: String(480000 + i), price: 10 + i % 50, cost: 5, unit: 'pc', stock: i % 30, reorder: 5 });
    const ss = []; for (let i = 0; i < 6000; i++) ss.push({ id: 's' + i, no: i, time: now - i * 600000, items: [{ productId: 'p' + (i % 1500), name: 'Item ' + (i % 1500), price: 12, cost: 5, qty: 1 + i % 3 }], subtotal: 12, discount: 0, total: 12, cash: 12, change: 0, method: 'cash' });
    await DB.importAll({ app: 'pos', products: ps, sales: ss, meta: [{ key: 'store', value: { name: 'Big' } }] });
  });
  const t0 = Date.now();
  await p.reload(); await p.waitForSelector('#quick .tile');
  console.log('startup ms', Date.now() - t0);
  for (const v of ['inventory', 'sales', 'customers', 'inventory', 'cashier']) {
    const t = Date.now();
    await p.click('.tabs [data-view=' + v + ']');
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    await p.waitForTimeout(50);
    console.log(v, Date.now() - t - 50);
  }
  const t = Date.now(); await p.fill('#search', 'Item 14'); await p.waitForSelector('.results .result'); console.log('search ms', Date.now() - t);
  await b.close();
})();
