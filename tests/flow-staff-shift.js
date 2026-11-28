// End-to-end: BHD store, payment methods, staff + PIN lock, custom item + note, shift open/close, admin-only void.
// Run: cd web && python3 -m http.server 8765   (other terminal)   then: node tests/flow-staff-shift.js
// Needs Playwright (npm i -D playwright && npx playwright install chromium). Prints "errors []" when OK.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.goto((process.env.POS_URL || 'http://localhost:8765/'));
  await p.waitForSelector('#sName'); await p.waitForTimeout(300);
  await p.fill('#sName', 'Bench Flowers'); await p.selectOption('#sCur', 'BD ');
  await p.waitForTimeout(100);
  console.log('methods', await p.textContent('#sMethods'));
  await p.fill('#sMethodNew', 'Bank transfer'); await p.click('#sMethodAdd');
  await p.click('#sSave'); await p.waitForTimeout(200);
  await p.evaluate(async () => { await DB.put('products', { id: 'p1', name: 'Red rose', barcode: '', price: 0.5, cost: 0.25, unit: 'piraso', stock: 100, reorder: 10 }); });
  // staff
  await p.click('.tabs [data-view=shift]'); await p.click('.subnav [data-go=staff]'); await p.waitForTimeout(200);
  await p.click('#addStaff'); await p.fill('#uName', 'Bench'); await p.fill('#uPin', '1234'); await p.click('#uSave'); await p.waitForTimeout(300);
  await p.click('#addStaff'); await p.fill('#uName', 'Ana'); await p.fill('#uPin', '1111'); await p.click('#uSave'); await p.waitForTimeout(300);
  await p.click('#lockBtn'); await p.waitForTimeout(200);
  await p.click('.lock-user >> text=Ana');
  for (const k of '1111') await p.click('.lock-pin [data-k="' + k + '"]');
  await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(300);
  console.log('user', await p.textContent('#storeSub'));
  // cashier tries settings → admin prompt
  await p.click('#settingsBtn'); await p.waitForTimeout(200);
  console.log('admin prompt', await p.isVisible('#raPin'));
  await p.click('.modal [data-close]');
  // reload products, custom item + note
  await p.evaluate(() => POS.show('cashier'));
  await p.reload(); await p.waitForTimeout(400);
  await p.click('.lock-user >> text=Ana'); for (const k of '1111') await p.click('.lock-pin [data-k="' + k + '"]'); await p.click('.lock-pin [data-k=ok]'); await p.waitForTimeout(300);
  await p.click('#quick .tile >> nth=0'); await p.click('.qty [data-a=set]'); await p.fill('#pnVal', '12'); await p.click('#pnOk');
  await p.click('#customItem'); await p.fill('#ciName', 'Bouquet wrapping + card'); await p.fill('#ciPrice', '2.5'); await p.click('#ciOk');
  await p.click('#noteBtn'); await p.fill('#pnVal', 'Para kay Maria, deliver 5pm'); await p.click('#pnOk');
  console.log('methods btn', await p.textContent('#payMethod'), 'total', await p.textContent('#total'));
  await p.click('#payMethod [data-m^=benefit]');
  await p.click('#payBtn'); await p.waitForTimeout(300);
  await p.fill('#osCash', '20'); await p.click('#osOk'); await p.waitForTimeout(600);
  await p.click('.modal [data-close]');
  // cash sale
  await p.click('#quick .tile >> nth=0'); await p.fill('#cash', '1'); await p.click('#payBtn'); await p.waitForTimeout(400); await p.click('.modal [data-close]');
  const sales = await p.evaluate(async () => (await DB.all('sales')).map(s => [s.no, s.total, s.method, s.methodLabel, s.cashier, !!s.shiftId, s.note, s.change]));
  console.log('sales', JSON.stringify(sales));
  // kaha
  await p.click('.tabs [data-view=shift]'); await p.waitForTimeout(300);
  await p.click('#shOut'); await p.fill('#mvAmt', '1.250'); await p.fill('#mvNote', 'Ribbon'); await p.click('#mvOk'); await p.waitForTimeout(300);
  await p.click('#shClose'); await p.fill('#csCount', '19'); await p.waitForTimeout(100);
  await p.click('#csOk'); await p.waitForTimeout(500);
  await p.click('.modal [data-close]');
  // void requires admin
  await p.click('.tabs [data-view=sales]'); await p.waitForTimeout(300);
  await p.click('#salesList .item >> nth=0'); await p.waitForTimeout(200);
  await p.click('#vsVoid'); await p.waitForTimeout(200);
  for (const k of '1234') await p.click('#raPin [data-k="' + k + '"]'); await p.click('#raPin [data-k=ok]'); await p.waitForTimeout(200);
  console.log('confirm shown', await p.isVisible('#cfOk'));
  await p.click('#cfOk'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelectorAll('.modal-wrap').forEach(w => w.remove()));
  await p.waitForTimeout(200);
  const bk = await p.evaluate(async () => { const d = await DB.exportAll(); return [d.format, d.staff.length, d.shifts.length, d.shifts[0].expected, d.shifts[0].counted]; });
  console.log('backup', bk);
  console.log('errors', errs);
  await b.close();
})();
