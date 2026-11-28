/* Lokal na database (IndexedDB). Nasa device lang ang data: walang server, walang account. */
(function () {
  'use strict';
  const DB_NAME = 'pos-db';
  const VERSION = 1;
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

    async exportAll() {
      const [products, sales, meta] = await Promise.all([DB.all('products'), DB.all('sales'), DB.all('meta')]);
      return { app: 'pos', format: 1, exported: new Date().toISOString(), products, sales, meta };
    },

    /** Palitan lahat ng data mula sa backup. */
    importAll(data) {
      if (!data || data.app !== 'pos' || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
        return Promise.reject(new Error('Hindi ito backup file ng POS na ito.'));
      }
      return tx(['products', 'sales', 'meta'], 'readwrite', (t) => {
        ['products', 'sales', 'meta'].forEach((s) => t.objectStore(s).clear());
        data.products.forEach((p) => p && p.id && t.objectStore('products').put(p));
        data.sales.forEach((s) => s && s.id && t.objectStore('sales').put(s));
        (data.meta || []).forEach((m) => m && m.key && t.objectStore('meta').put(m));
      });
    },

    clearAll() {
      return tx(['products', 'sales', 'meta'], 'readwrite', (t) => {
        ['products', 'sales', 'meta'].forEach((s) => t.objectStore(s).clear());
      });
    },
  };

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round(n) { return Math.round(n * 1000) / 1000; }

  window.DB = DB;
})();
