/* Lokal na database (IndexedDB). Nasa device lang ang data: walang server, walang account. */
(function () {
  'use strict';
  const DB_NAME = 'pos-db';
  const VERSION = 4;
  const STORES = ['products', 'sales', 'meta', 'receivings', 'customers', 'payments', 'staff', 'shifts'];
  // Koneksyon sa cloud: hindi isinasama sa backup file at hindi napapalitan kapag nag-restore.
  const KEEP_META = ['cloud', 'cloudHashes'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id' });
          s.createIndex('barcode', 'barcode', { unique: false });
        }
        if (!db.objectStoreNames.contains('sales')) {
          const s = db.createObjectStore('sales', { keyPath: 'id' });
          s.createIndex('time', 'time', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('receivings')) {
          const s = db.createObjectStore('receivings', { keyPath: 'id' });
          s.createIndex('time', 'time', { unique: false });
        }
        // v3: suki (customers), bayad sa utang, at benta kada suki
        if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('payments')) {
          const s = db.createObjectStore('payments', { keyPath: 'id' });
          s.createIndex('customerId', 'customerId', { unique: false });
        }
        // v4: staff (may PIN) at shift ng kaha (petty cash)
        if (!db.objectStoreNames.contains('staff')) db.createObjectStore('staff', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('shifts')) db.createObjectStore('shifts', { keyPath: 'id' });
        const sales = req.transaction.objectStore('sales');
        if (!sales.indexNames.contains('customerId')) sales.createIndex('customerId', 'customerId', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let out;
      Promise.resolve(fn(t)).then((v) => { out = v; }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Na-abort'));
    });
  }

  const DB = {
    all: (store) => tx([store], 'readonly', (t) => wrap(t.objectStore(store).getAll())),
    get: (store, key) => tx([store], 'readonly', (t) => wrap(t.objectStore(store).get(key))),
    put: (store, val) => tx([store], 'readwrite', (t) => { t.objectStore(store).put(val); return val; }),
    del: (store, key) => tx([store], 'readwrite', (t) => { t.objectStore(store).delete(key); }),

    async getMeta(key, def) {
      const r = await DB.get('meta', key);
      return r ? r.value : def;
    },
    setMeta: (key, value) => DB.put('meta', { key, value }),

    /** Benta: i-save ang resibo at bawasan ang stock, sabay sa iisang transaction. */
    saveSale(sale) {
      return tx(['sales', 'products'], 'readwrite', async (t) => {
        const ps = t.objectStore('products');
        for (const it of sale.items) {
          const p = await wrap(ps.get(it.productId));
          if (p) { p.stock = round(num(p.stock) - it.qty); p.updated = Date.now(); ps.put(p); }
        }
        t.objectStore('sales').put(sale);
        return sale;
      });
    },

    /** I-void ang benta: ibalik ang stock. */
    voidSale(id, reason) {
      return tx(['sales', 'products'], 'readwrite', async (t) => {
        const ss = t.objectStore('sales');
        const sale = await wrap(ss.get(id));
        if (!sale || sale.voided) return sale;
        const ps = t.objectStore('products');
        for (const it of sale.items) {
          const p = await wrap(ps.get(it.productId));
          if (p) { p.stock = round(num(p.stock) + it.qty); p.updated = Date.now(); ps.put(p); }
        }
        sale.voided = Date.now();
        sale.voidReason = reason || '';
        ss.put(sale);
        return sale;
      });
    },

    /** Receiving (delivery mula sa supplier): idagdag ang stock, i-update ang puhunan (at presyo kung may bago),
     *  gumawa ng bagong paninda kung wala pa. Lahat sa iisang transaction. */
    postReceiving(rec) {
      return tx(['receivings', 'products'], 'readwrite', async (t) => {
        const ps = t.objectStore('products');
        const now = Date.now();
        for (const ln of rec.lines) {
          let p = ln.productId ? await wrap(ps.get(ln.productId)) : null;
          if (!p) {
            p = {
              id: ln.productId || (now.toString(36) + Math.random().toString(36).slice(2, 8)),
              name: ln.name, barcode: ln.barcode || '', price: num(ln.price), cost: '', unit: ln.unit || 'piraso',
              category: '', stock: 0, reorder: 0, created: now,
            };
            ln.productId = p.id;
            ln.isNew = true;
          }
          ln.prevStock = num(p.stock);
          ln.prevCost = p.cost;
          ln.prevPrice = num(p.price);
          p.stock = round(num(p.stock) + num(ln.qty));
          if (ln.cost !== '' && ln.cost != null) p.cost = Math.round(num(ln.cost) * 100) / 100;
          if (ln.price !== '' && ln.price != null && num(ln.price) > 0) p.price = Math.round(num(ln.price) * 100) / 100;
          if (ln.barcode && !p.barcode) p.barcode = ln.barcode;
          if (ln.unit && !p.unit) p.unit = ln.unit;
          p.updated = now;
          ps.put(p);
        }
        rec.status = 'posted';
        rec.posted = now;
        t.objectStore('receivings').put(rec);
        return rec;
      });
    },

    /** I-void ang receiving: bawasan ulit ang stock. Hindi binabalik ang lumang puhunan/presyo. */
    voidReceiving(id) {
      return tx(['receivings', 'products'], 'readwrite', async (t) => {
        const rs = t.objectStore('receivings');
        const rec = await wrap(rs.get(id));
        if (!rec || rec.status !== 'posted') return rec;
        const ps = t.objectStore('products');
        for (const ln of rec.lines) {
          const p = await wrap(ps.get(ln.productId));
          if (p) { p.stock = round(num(p.stock) - num(ln.qty)); p.updated = Date.now(); ps.put(p); }
        }
        rec.status = 'void';
        rec.voided = Date.now();
        rs.put(rec);
        return rec;
      });
    },

    /** Lahat ng benta at bayad ng isang suki. */
    customerLedger(id) {
      return tx(['sales', 'payments'], 'readonly', async (t) => {
        const sales = await wrap(t.objectStore('sales').index('customerId').getAll(id));
        const payments = await wrap(t.objectStore('payments').index('customerId').getAll(id));
        return { sales, payments };
      });
    },

    async exportAll() {
      const [products, sales, meta, receivings, customers, payments, staff, shifts] = await Promise.all(STORES.map((n) => DB.all(n)));
      return { app: 'pos', format: 4, exported: new Date().toISOString(), products, sales, receivings, customers, payments, staff, shifts, meta: meta.filter((m) => !KEEP_META.includes(m.key)) };
    },

    /** Palitan lahat ng data mula sa backup. */
    importAll(data) {
      if (!data || data.app !== 'pos' || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
        return Promise.reject(new Error('Hindi ito backup file ng POS na ito.'));
      }
      return tx(STORES, 'readwrite', async (t) => {
        const keep = (await Promise.all(KEEP_META.map((k) => wrap(t.objectStore('meta').get(k))))).filter(Boolean);
        STORES.forEach((s) => t.objectStore(s).clear());
        keep.forEach((m) => t.objectStore('meta').put(m));
        ['receivings', 'customers', 'payments', 'staff', 'shifts'].forEach((n) => (data[n] || []).forEach((r) => r && r.id && t.objectStore(n).put(r)));
        data.products.forEach((p) => p && p.id && t.objectStore('products').put(p));
        data.sales.forEach((s) => s && s.id && t.objectStore('sales').put(s));
        (data.meta || []).forEach((m) => m && m.key && !KEEP_META.includes(m.key) && t.objectStore('meta').put(m));
      });
    },

    clearAll() {
      return tx(STORES, 'readwrite', (t) => {
        STORES.forEach((s) => t.objectStore(s).clear());
      });
    },
  };

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round(n) { return Math.round(n * 1000) / 1000; }

  window.DB = DB;
})();
