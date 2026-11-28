/* POS: cashier, paninda, receiving, benta, printer, backup. Lahat ng data ay nasa device (IndexedDB). */
(function () {
  'use strict';
  const A = window.AndroidPOS || null;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const t = (k, v) => I18N.t(k, v);

  const COLORS = ['#1e40af', '#0f766e', '#b91c1c', '#7c3aed', '#c2410c', '#be185d', '#0e7490', '#374151'];
  const UNITS = ['piraso', 'pack', 'sachet', 'bote', 'lata', 'kilo', 'gramo', 'litro', 'box', 'dosena', 'tali', 'tasa'];

  const DEFAULT_STORE = { name: '', address: '', phone: '', tin: '', footer: '', currency: '₱', color: COLORS[0], logo: '', cashier: '', lang: '' };
  const DEFAULT_PRINTER = { mode: A ? 'bt' : 'system', address: '', name: '', paper: 58, logo: true, auto: true };

  const S = {
    store: { ...DEFAULT_STORE },
    printer: { ...DEFAULT_PRINTER },
    products: [],
    cart: [],
    discount: 0,
    soldCount: {},
    invFilter: 'all',
    invGrid: false,
    salesRange: 'today',
    salesDay: null,
  };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const money = (n) => S.store.currency + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyStr = (n) => String(r3(n));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (x) => String(x).padStart(2, '0');
  const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtTime = (ts) => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const locale = () => (I18N.lang === 'ar' ? 'ar' : I18N.lang === 'en' ? 'en-US' : 'en-PH');
  const fmtDateTime = (ts) => { const d = new Date(ts); return d.toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric', numberingSystem: 'latn' }) + ' ' + fmtTime(ts); };

  let toastTimer;
  function toast(msg, bad) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast' + (bad ? ' bad' : ''); }, bad ? 4200 : 2200);
  }

  function beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      beep.ctx = beep.ctx || new C();
      const o = beep.ctx.createOscillator(), g = beep.ctx.createGain();
      o.frequency.value = 1400; g.gain.value = 0.08;
      o.connect(g); g.connect(beep.ctx.destination);
      o.start(); o.stop(beep.ctx.currentTime + 0.08);
    } catch (e) { /* walang tunog */ }
  }

  // ---------- modal ----------
  function modal(html, onMount) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' && document.querySelector('.modal-wrap:last-of-type') === wrap) close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    if (onMount) onMount($('.modal', wrap), close);
    return close;
  }

  /** Hintayin na magsara ang modal (para sa confirm/prompt). */
  function whenClosed(m, fn) {
    const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); fn(); } });
    obs.observe(document.body, { childList: true });
  }

  function confirmBox(title, msg, okLabel, danger) {
    return new Promise((resolve) => {
      let ok = false;
      modal(
        '<h2>' + esc(title) + '</h2><p class="muted">' + esc(msg) + '</p>' +
        '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" id="cfOk" type="button">' + esc(okLabel || 'OK') + '</button></div>',
        (m, close) => { $('#cfOk', m).onclick = () => { ok = true; close(); }; whenClosed(m, () => resolve(ok)); }
      );
    });
  }

  function promptBox(title, value, hint, kind) {
    return new Promise((resolve) => {
      let result = null;
      const field = kind === 'area'
        ? '<textarea id="pnVal" rows="8" style="font-family:ui-monospace,monospace;font-size:13px">' + esc(value) + '</textarea>'
        : '<input id="pnVal" type="text"' + (kind === 'num' ? ' inputmode="decimal"' : '') + ' autocomplete="off" value="' + esc(value) + '">';
      modal(
        '<h2>' + esc(title) + '</h2>' + (hint ? '<p class="muted">' + esc(hint) + '</p>' : '') + field +
        '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>' +
        '<button class="btn primary" id="pnOk" type="button">OK</button></div>',
        (m, close) => {
          const inp = $('#pnVal', m);
          setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 50);
          const ok = () => { result = kind === 'area' ? inp.value : inp.value.trim(); close(); };
          $('#pnOk', m).onclick = ok;
          if (kind !== 'area') inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
          whenClosed(m, () => resolve(result));
        }
      );
    });
  }
  const promptNumber = (title, value, hint) => promptBox(title, value, hint, 'num');
  const promptText = (title, value) => promptBox(title, value, '', 'text');
  const promptArea = (title, hint) => promptBox(title, '', hint, 'area');

  // ---------- theme / header / language ----------
  function mix(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * pct + 255 * (1 - pct)));
    return 'rgb(' + ch.join(',') + ')';
  }
  function applyStore() {
    const st = S.store;
    const color = /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : COLORS[0];
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-soft', mix(color, 0.12));
    $('meta[name=theme-color]').setAttribute('content', color);
    if (A && A.setBarColor) try { A.setBarColor(color); } catch (e) { /* luma */ }
    $('#storeName').textContent = st.name || t('Tindahan');
    $('#storeSub').textContent = st.name ? (st.address || 'POS') : t('Pindutin para ilagay ang pangalan ng tindahan');
    document.title = st.name ? st.name + ' POS' : 'POS';
    const lg = $('#storeLogo');
    lg.innerHTML = st.logo ? '<img alt="" src="' + esc(st.logo) + '">' : esc((st.name || 'T').trim().charAt(0).toUpperCase());
    $('#langBtn').textContent = { tl: 'TL', en: 'EN', ar: 'ع' }[I18N.lang];
  }

  function setLanguage(l) {
    I18N.setLang(l);
    S.store.lang = l;
    saveStore();
    applyStore();
    const v = currentView();
    show(v);
  }

  function pickLanguage() {
    modal(
      '<h2>' + esc(t('Language')) + '</h2><div class="options">' +
      Object.keys(I18N.LANGS).map((l) =>
        '<button type="button" class="option' + (I18N.lang === l ? ' on' : '') + '" data-l="' + l + '"><span><div class="t">' + I18N.LANGS[l] + '</div></span></button>').join('') +
      '</div>',
      (m, close) => $$('[data-l]', m).forEach((b) => b.addEventListener('click', () => { close(); setLanguage(b.dataset.l); }))
    );
  }

  // ---------- data ----------
  async function loadAll() {
    S.store = { ...DEFAULT_STORE, ...(await DB.getMeta('store', {})) };
    S.printer = { ...DEFAULT_PRINTER, ...(await DB.getMeta('printer', {})) };
    if (!A && S.printer.mode === 'bt') S.printer.mode = 'system';
    if (S.store.lang && S.store.lang !== I18N.lang) I18N.setLang(S.store.lang);
    S.products = await DB.all('products');
    S.soldCount = await DB.getMeta('soldCount', {});
    applyStore();
  }
  const saveStore = () => DB.setMeta('store', S.store);
  const savePrinter = () => DB.setMeta('printer', S.printer);
  const byId = (id) => S.products.find((p) => p.id === id);
  const byBarcode = (code) => {
    const c = String(code).trim();
    return c ? S.products.find((p) => p.barcode && String(p.barcode).trim() === c) : null;
  };
  const stockState = (p) => (num(p.stock) <= 0 ? 'out' : num(p.stock) <= num(p.reorder) ? 'low' : 'ok');
  async function reloadProducts() { S.products = await DB.all('products'); }

  // ---------- tabs ----------
  const currentView = () => (($('.view.on') || {}).id || 'view-cashier').replace('view-', '');
  function show(view) {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + view));
    if (view === 'cashier') renderCashier();
    if (view === 'inventory') renderInventory();
    if (view === 'receiving') Receiving.render();
    if (view === 'sales') renderSales();
    if (view === 'printer') renderPrinter();
    if (view === 'backup') renderBackup();
    window.scrollTo(0, 0);
    try { sessionStorage.setItem('pos-view', view); } catch (e) { /* wala */ }
  }

  // =========================================================
  // CASHIER
  // =========================================================
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return S.products
      .filter((p) => {
        const hay = (p.name + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (S.soldCount[b.id] || 0) - (S.soldCount[a.id] || 0))
      .slice(0, 40);
  }

  let resultSel = -1;
  function renderResults() {
    const q = $('#search').value;
    const box = $('#results');
    if (!q.trim()) { box.hidden = true; return; }
    const list = search(q);
    resultSel = list.length ? 0 : -1;
    box.innerHTML = list.length
      ? list.map((p, i) =>
          '<button type="button" class="result' + (i === 0 ? ' sel' : '') + '" data-id="' + p.id + '">' +
          '<span class="grow"><div class="nm">' + esc(p.name) + '</div>' +
          '<div class="meta">' + (p.barcode ? esc(p.barcode) + ' · ' : '') + esc(t('Stock')) + ': ' + qtyStr(num(p.stock)) + ' ' + esc(p.unit || '') + '</div></span>' +
          '<span class="pr">' + money(p.price) + '</span></button>').join('')
      : '<div class="empty-note">' + esc(t('Walang nahanap.')) + ' <button type="button" class="link" id="addFromSearch">' + esc(t('+ Idagdag bilang bagong paninda')) + '</button></div>';
    box.hidden = false;
    $$('.result', box).forEach((b) => b.addEventListener('click', () => { addToCart(byId(b.dataset.id)); clearSearch(); }));
    const add = $('#addFromSearch', box);
    if (add) add.onclick = () => {
      const v = $('#search').value.trim();
      clearSearch();
      editProduct(/^\d{6,}$/.test(v) ? { barcode: v } : { name: v });
    };
  }
  function clearSearch() { $('#search').value = ''; $('#results').hidden = true; }

  function renderQuick() {
    const list = S.products.slice()
      .sort((a, b) => (S.soldCount[b.id] || 0) - (S.soldCount[a.id] || 0) || a.name.localeCompare(b.name))
      .slice(0, 24);
    $('#quickWrap').hidden = !list.length;
    $('#quick').innerHTML = list.map((p) =>
      '<button type="button" class="tile' + (stockState(p) === 'out' ? ' out' : '') + '" data-id="' + p.id + '">' +
      '<span class="nm">' + esc(p.name) + '</span><span class="pr">' + money(p.price) + '</span></button>').join('');
    $$('#quick .tile').forEach((b) => b.addEventListener('click', () => addToCart(byId(b.dataset.id))));
  }

  function addToCart(p, qty) {
    if (!p) return;
    qty = qty || 1;
    const line = S.cart.find((l) => l.productId === p.id);
    if (line) line.qty = r3(line.qty + qty);
    else S.cart.push({ productId: p.id, name: p.name, price: num(p.price), cost: p.cost === '' || p.cost == null ? '' : num(p.cost), unit: p.unit || '', qty });
    beep();
    const inCart = S.cart.find((l) => l.productId === p.id).qty;
    if (inCart > num(p.stock)) toast(t('Paalala: {n} na lang ang stock ng {x}', { n: qtyStr(num(p.stock)), x: p.name }), true);
    renderCart();
  }

  function cartTotals() {
    const subtotal = r2(S.cart.reduce((s, l) => s + l.price * l.qty, 0));
    const discount = Math.min(r2(S.discount), subtotal);
    return { subtotal, discount, total: r2(subtotal - discount) };
  }

  function renderCart() {
    const list = $('#cartList');
    list.setAttribute('data-empty', t('Wala pang laman. Mag-scan o maghanap ng paninda.'));
    list.innerHTML = S.cart.map((l, i) =>
      '<div class="line-item">' +
      '<div><div class="nm">' + esc(l.name) + '</div><div class="each">' + money(l.price) + (l.unit ? ' / ' + esc(l.unit) : '') + '</div></div>' +
      '<div class="amt">' + money(l.price * l.qty) + '</div>' +
      '<div class="line-controls"><span class="qty">' +
      '<button type="button" data-a="dec" data-i="' + i + '" aria-label="−">−</button>' +
      '<button type="button" class="q" data-a="set" data-i="' + i + '">' + qtyStr(l.qty) + '</button>' +
      '<button type="button" data-a="inc" data-i="' + i + '" aria-label="+">+</button></span>' +
      '<button type="button" class="rm" data-a="rm" data-i="' + i + '">' + esc(t('Alisin')) + '</button></div>' +
      '<div></div></div>').join('');
    const items = S.cart.reduce((s, l) => s + l.qty, 0);
    $('#cartCount').textContent = S.cart.length ? '(' + qtyStr(items) + ')' : '';
    $('#clearCart').hidden = !S.cart.length;
    if (!S.cart.length) S.discount = 0;
    const tt = cartTotals();
    $('#subRow').hidden = $('#discRow').hidden = !tt.discount;
    $('#subtotal').textContent = money(tt.subtotal);
    $('#discount').textContent = '−' + money(tt.discount);
    $('#total').textContent = money(tt.total);
    renderCashChips(tt.total);
    updateChange();
  }

  function renderCashChips(total) {
    const chips = [];
    if (total > 0) {
      chips.push([t('Sakto'), total]);
      [20, 50, 100, 200, 500, 1000].forEach((b) => {
        const v = Math.ceil(total / b) * b;
        if (v > total && !chips.some((c) => c[1] === v)) chips.push([money(v).replace('.00', ''), v]);
      });
    }
    $('#cashChips').innerHTML = chips.slice(0, 5).map((c) => '<button type="button" class="chip" data-v="' + c[1] + '">' + esc(c[0]) + '</button>').join('');
    $$('#cashChips .chip').forEach((b) => b.addEventListener('click', () => { $('#cash').value = b.dataset.v; updateChange(); }));
  }

  function updateChange() {
    const { total } = cartTotals();
    const cashStr = $('#cash').value.trim();
    const cash = num(cashStr);
    const row = $('.pay .change');
    row.classList.remove('ok', 'short');
    if (!cashStr || !S.cart.length) {
      $('#change').textContent = '—';
    } else if (cash < total) {
      $('#change').textContent = t('Kulang {x}', { x: money(total - cash) });
      row.classList.add('short');
    } else {
      $('#change').textContent = money(cash - total);
      row.classList.add('ok');
    }
    $('#payBtn').disabled = !(S.cart.length > 0 && (cashStr === '' || cash >= total));
    $('#payBtn').textContent = S.printer.mode === 'none' ? t('Bayad') : t('Bayad & Print');
  }

  function renderPrinterLine() {
    const p = S.printer;
    $('#printerLine').textContent = p.mode === 'bt' ? (p.name ? t('Printer') + ': ' + p.name : t('Wala pang napiling Bluetooth printer'))
      : p.mode === 'ble' ? t('Printer') + ': Bluetooth (BLE)' + (p.name ? ' · ' + p.name : '')
      : p.mode === 'system' ? t('Printer: ordinaryong print') : t('Hindi magpi-print ng resibo');
  }

  function renderCashier() { renderQuick(); renderCart(); renderPrinterLine(); }

  async function pay() {
    if (!S.cart.length) return;
    const tt = cartTotals();
    const cashStr = $('#cash').value.trim();
    const cash = cashStr === '' ? tt.total : num(cashStr);
    if (cash < tt.total) { toast(t('Kulang ang bayad'), true); return; }
    $('#payBtn').disabled = true;
    try {
      const no = (await DB.getMeta('seq', 0)) + 1;
      await DB.setMeta('seq', no);
      const sale = {
        id: uid(), no, time: Date.now(),
        items: S.cart.map((l) => ({ ...l })),
        subtotal: tt.subtotal, discount: tt.discount, total: tt.total,
        cash: r2(cash), change: r2(cash - tt.total),
        cashier: S.store.cashier || '',
      };
      await DB.saveSale(sale);
      sale.items.forEach((l) => { S.soldCount[l.productId] = r3((S.soldCount[l.productId] || 0) + l.qty); });
      await DB.setMeta('soldCount', S.soldCount);
      await reloadProducts();
      S.cart = []; S.discount = 0; $('#cash').value = '';
      renderCashier();
      saleDone(sale);
      if (S.printer.mode !== 'none' && S.printer.auto) printSale(sale);
    } catch (e) {
      toast(t('Hindi na-save: {e}', { e: e.message }), true);
    } finally {
      updateChange();
    }
  }

  function saleDone(sale) {
    modal(
      '<div class="done-big"><div class="k">' + esc(t('Sukli')) + '</div><div class="v">' + money(sale.change) + '</div>' +
      '<p class="muted">' + esc(t('Total {a} · Bayad {b} · Resibo #{n}', { a: money(sale.total), b: money(sale.cash), n: sale.no })) + '</p></div>' +
      '<div class="modal-actions">' +
      (S.printer.mode !== 'none' ? '<button class="btn ghost" id="sdPrint" type="button">' + esc(S.printer.auto ? t('Print ulit') : t('Print resibo')) + '</button>' : '') +
      '<button class="btn primary" data-close type="button">' + esc(t('Bagong benta')) + '</button></div>',
      (m) => { const pb = $('#sdPrint', m); if (pb) pb.onclick = () => printSale(sale); }
    );
  }

  // ---------- resibo ----------
  const saleDoc = (sale) => Receipt.saleDoc(S.store, sale, { logo: S.printer.logo });

  function receiptDoc(inner) {
    const w = S.printer.paper === 80 ? 72 : 48;
    return '<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>' +
      '@page{size:' + (w + 8) + 'mm auto;margin:4mm}body{margin:0;font-family:ui-monospace,Menlo,Consolas,"Noto Sans Arabic",monospace;font-size:12px;color:#000}' +
      '.receipt{width:' + w + 'mm}.c{text-align:center}.b{font-weight:700}.big{font-size:15px}.r{display:flex;justify-content:space-between;gap:6px}' +
      'hr{border:0;border-top:1px dashed #000;margin:5px 0}img{max-width:60%;max-height:80px;display:block;margin:0 auto 5px;filter:grayscale(1)}.sm{font-size:10px;padding-inline-start:6px}' +
      '</style></head><body>' + inner + '</body></html>';
  }

  async function printDoc(doc) {
    const p = S.printer;
    if (p.mode === 'none') return;
    if (p.mode === 'system') { await Printer.printHtml(receiptDoc(Receipt.toHtml(doc))); return; }
    toast(t('Nagpi-print…'));
    await Printer.sendBytes(p, await Receipt.bytes(doc, { paper: p.paper }));
  }

  async function printSale(sale) {
    try {
      await printDoc(saleDoc(sale));
      if (S.printer.mode === 'bt' || S.printer.mode === 'ble') toast(t('Na-print ang resibo #{n}', { n: sale.no }));
    } catch (e) {
      toast(t('Hindi nag-print: {e}', { e: e.message }), true);
    }
  }

  // =========================================================
  // PANINDA
  // =========================================================
  function filteredProducts() {
    const q = $('#invSearch').value.trim().toLowerCase();
    let list = S.products.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (q) list = list.filter((p) => (p.name + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase().includes(q));
    if (S.invFilter === 'low') list = list.filter((p) => stockState(p) === 'low');
    if (S.invFilter === 'out') list = list.filter((p) => stockState(p) === 'out');
    return list;
  }

  function renderInventory() {
    const low = S.products.filter((p) => stockState(p) === 'low').length;
    const out = S.products.filter((p) => stockState(p) === 'out').length;
    const value = S.products.reduce((s, p) => s + Math.max(0, num(p.stock)) * num(p.cost === '' || p.cost == null ? p.price : p.cost), 0);
    $('#invSummary').textContent = S.products.length
      ? t('{n} paninda · {l} paubos · {o} ubos · halaga ng stock {v}', { n: S.products.length, l: low, o: out, v: money(value) })
      : '';
    $$('#invFilters .chip[data-f]').forEach((c) => c.classList.toggle('on', c.dataset.f === S.invFilter));
    $('#invGridBtn').classList.toggle('on', S.invGrid);
    $('#invGridBtn').textContent = S.invGrid ? t('Listahan') : t('Excel view');
    const el = $('#invList');
    if (!S.products.length) {
      el.innerHTML = '<div class="card"><h3>' + esc(t('Wala pang paninda')) + '</h3><p class="muted">' + esc(t('Pindutin ang "+ Bagong paninda" para magdagdag, mag-receive ng delivery sa Receiving tab, o mag-import ng listahan sa Backup tab.')) + '</p></div>';
      return;
    }
    const list = filteredProducts();
    if (S.invGrid) return renderInvGrid(list);
    el.innerHTML = list.length ? list.map((p) => {
      const st = stockState(p);
      return '<button type="button" class="item" data-id="' + p.id + '"><span class="grow">' +
        '<div class="nm">' + esc(p.name) + '</div>' +
        '<div class="meta">' + [p.barcode, p.category].filter(Boolean).map(esc).join(' · ') + '</div></span>' +
        '<span class="right"><div class="pr">' + money(p.price) + '</div>' +
        '<span class="badge ' + (st === 'ok' ? '' : st) + '">' + qtyStr(num(p.stock)) + ' ' + esc(p.unit || '') + '</span></span></button>';
    }).join('') : '<p class="muted" style="text-align:center;padding:20px">' + esc(t('Walang tugma.')) + '</p>';
    $$('#invList .item').forEach((b) => b.addEventListener('click', () => editProduct(byId(b.dataset.id))));
  }

  // Excel-style na pag-edit ng maraming paninda
  const GRID = [
    { k: 'name', label: 'Pangalan', w: 190 },
    { k: 'barcode', label: 'Barcode', w: 120 },
    { k: 'category', label: 'Kategorya', w: 110 },
    { k: 'unit', label: 'Unit', w: 80 },
    { k: 'price', label: 'Presyo', w: 85, num: true },
    { k: 'cost', label: 'Puhunan', w: 85, num: true },
    { k: 'stock', label: 'Stock', w: 75, num: true },
    { k: 'reorder', label: 'Paalala', w: 75, num: true },
  ];
  const gridEdits = {};
  function renderInvGrid(list) {
    const el = $('#invList');
    const changed = Object.keys(gridEdits).length;
    el.innerHTML =
      '<div class="grid-bar"><span class="muted">' + esc(t('I-click ang cell para i-edit. Enter = pababa. Puwedeng mag-paste mula sa Excel.')) + '</span>' +
      '<span class="btn-row" style="flex:none"><button class="btn small" id="gridCancel" type="button"' + (changed ? '' : ' disabled') + '>' + esc(t('Ibalik')) + '</button>' +
      '<button class="btn primary small" id="gridSave" type="button"' + (changed ? '' : ' disabled') + '>' + esc(t('I-save ang binago ({n})', { n: changed })) + '</button></span></div>' +
      '<div class="sheet-wrap"><table class="sheet" id="invSheet"><thead><tr><th class="rn">#</th>' +
      GRID.map((c) => '<th style="min-width:' + c.w + 'px">' + esc(t(c.label)) + '</th>').join('') + '</tr></thead><tbody>' +
      list.map((p, i) => {
        const e = gridEdits[p.id] || {};
        return '<tr data-id="' + p.id + '" class="' + stockState(p) + '"><td class="rn">' + (i + 1) + '</td>' + GRID.map((c) => {
          const v = c.k in e ? e[c.k] : (p[c.k] == null ? '' : p[c.k]);
          return '<td' + (c.k in e ? ' class="dirty"' : '') + '><input data-k="' + c.k + '" data-r="' + i + '" type="text"' + (c.num ? ' inputmode="decimal" class="num"' : '') + ' value="' + esc(v) + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    const sheet = $('#invSheet');
    const focus = (r, k) => { const x = sheet.querySelector('input[data-r="' + r + '"][data-k="' + k + '"]'); if (x) { x.focus(); x.select(); } };
    sheet.addEventListener('input', (ev) => {
      const inp = ev.target;
      const tr = inp.closest('tr');
      const id = tr.dataset.id, k = inp.dataset.k;
      const p = byId(id);
      gridEdits[id] = gridEdits[id] || {};
      if (String(p[k] == null ? '' : p[k]) === inp.value) delete gridEdits[id][k]; else gridEdits[id][k] = inp.value;
      if (!Object.keys(gridEdits[id]).length) delete gridEdits[id];
      inp.parentElement.classList.toggle('dirty', !!(gridEdits[id] && k in gridEdits[id]));
      const n = Object.keys(gridEdits).length;
      $('#gridSave').disabled = $('#gridCancel').disabled = !n;
      $('#gridSave').textContent = t('I-save ang binago ({n})', { n });
    });
    sheet.addEventListener('keydown', (ev) => {
      const inp = ev.target;
      if (!inp.dataset.k) return;
      const r = Number(inp.dataset.r);
      if (ev.key === 'Enter' || ev.key === 'ArrowDown') { ev.preventDefault(); focus(r + 1, inp.dataset.k); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); focus(r - 1, inp.dataset.k); }
    });
    sheet.addEventListener('paste', (ev) => {
      const inp = ev.target;
      if (!inp.dataset.k) return;
      const text = (ev.clipboardData || window.clipboardData).getData('text');
      if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
      ev.preventDefault();
      const rows = XLSXLite.parseDelimited(text);
      const r0 = Number(inp.dataset.r), c0 = GRID.findIndex((c) => c.k === inp.dataset.k);
      rows.forEach((row, ri) => row.forEach((v, ci) => {
        const x = sheet.querySelector('input[data-r="' + (r0 + ri) + '"][data-k="' + (GRID[c0 + ci] || {}).k + '"]');
        if (x) { x.value = String(v).trim(); x.dispatchEvent(new Event('input', { bubbles: true })); }
      }));
    });
    $('#gridCancel').onclick = () => { Object.keys(gridEdits).forEach((k) => delete gridEdits[k]); renderInventory(); };
    $('#gridSave').onclick = async () => {
      const ids = Object.keys(gridEdits);
      for (const id of ids) {
        const p = { ...byId(id) };
        const e = gridEdits[id];
        Object.keys(e).forEach((k) => {
          const c = GRID.find((x) => x.k === k);
          if (k === 'name' && !e[k].trim()) return;
          if (k === 'barcode' && e[k].trim()) { const d = byBarcode(e[k]); if (d && d.id !== id) { toast(t('Gamit na ang barcode na {b}', { b: e[k] }), true); return; } }
          p[k] = c.num ? (k === 'cost' && String(e[k]).trim() === '' ? '' : (k === 'price' || k === 'cost' ? r2(num(e[k])) : r3(num(e[k])))) : String(e[k]).trim();
        });
        p.updated = Date.now();
        await DB.put('products', p);
      }
      Object.keys(gridEdits).forEach((k) => delete gridEdits[k]);
      await reloadProducts();
      renderInventory();
      toast(t('Na-save ang {n} paninda', { n: ids.length }));
    };
  }

  function editProduct(p) {
    const isNew = !p || !p.id;
    p = { name: '', barcode: '', price: '', cost: '', unit: t('piraso'), stock: 0, reorder: 0, category: '', ...(p || {}) };
    const tUnits = UNITS.map((u) => t(u));
    const units = tUnits.includes(p.unit) ? tUnits : [p.unit].concat(tUnits);
    const cats = Array.from(new Set(S.products.map((x) => x.category).filter(Boolean))).sort();
    modal(
      '<h2>' + esc(isNew ? t('Bagong paninda') : t('I-edit ang paninda')) + '</h2>' +
      '<label class="field"><span>' + esc(t('Pangalan ng paninda')) + '</span><input id="pName" type="text" value="' + esc(p.name) + '" placeholder="' + esc(t('hal. Coke 1.5L')) + '"></label>' +
      '<label class="field"><span>' + esc(t('Barcode (puwedeng wala)')) + '</span><span class="with-btn"><input id="pBarcode" type="text" inputmode="numeric" value="' + esc(p.barcode) + '">' +
      '<button class="btn ghost" id="pScan" type="button">' + esc(t('Scan')) + '</button></span></label>' +
      '<div class="field-row">' +
      '<label class="field"><span>' + esc(t('Presyo ng benta')) + ' (' + esc(S.store.currency.trim()) + ')</span><input id="pPrice" type="text" inputmode="decimal" value="' + esc(p.price) + '"></label>' +
      '<label class="field"><span>' + esc(t('Puhunan (puwedeng wala)')) + '</span><input id="pCost" type="text" inputmode="decimal" value="' + esc(p.cost) + '"></label>' +
      '</div><div class="field-row">' +
      '<label class="field"><span>' + esc(t('Unit')) + '</span><select id="pUnit">' + units.map((u) => '<option' + (u === p.unit ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '<option value="__other">' + esc(t('Iba pa…')) + '</option></select></label>' +
      '<label class="field"><span>' + esc(t('Kategorya (puwedeng wala)')) + '</span><input id="pCat" type="text" list="catList" value="' + esc(p.category) + '"><datalist id="catList">' + cats.map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist></label>' +
      '</div><div class="field-row">' +
      '<label class="field"><span>' + esc(t('Stock ngayon')) + '</span><input id="pStock" type="text" inputmode="decimal" value="' + esc(qtyStr(num(p.stock))) + '"></label>' +
      '<label class="field"><span>' + esc(t('Paalala kapag ganito na lang')) + '</span><input id="pReorder" type="text" inputmode="decimal" value="' + esc(qtyStr(num(p.reorder))) + '"></label>' +
      '</div>' +
      (isNew ? '' : '<div class="btn-row" style="margin-bottom:6px"><button class="btn ghost" id="pRestock" type="button">' + esc(t('+ Dagdag stock (nag-deliver)')) + '</button></div>') +
      '<div class="modal-actions">' +
      (isNew ? '<button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>' : '<button class="btn danger" id="pDel" type="button">' + esc(t('Burahin')) + '</button>') +
      '<button class="btn primary" id="pSave" type="button">' + esc(t('I-save')) + '</button></div>',
      (m, close) => {
        if (isNew) setTimeout(() => $(p.name ? '#pPrice' : '#pName', m).focus(), 60);
        $('#pUnit', m).addEventListener('change', async (e) => {
          if (e.target.value !== '__other') return;
          const sel = e.target;
          const u = await promptText(t('Anong unit?'), '');
          if (u) { const o = document.createElement('option'); o.textContent = u; sel.insertBefore(o, sel.firstChild); sel.value = u; }
          else sel.value = units[0];
        });
        $('#pScan', m).onclick = async () => {
          try { const c = await Scanner.scan(); if (c) $('#pBarcode', m).value = c; } catch (e) { toast(e.message, true); }
        };
        const rs = $('#pRestock', m);
        if (rs) rs.onclick = async () => {
          const v = await promptNumber(t('Ilang {u} ang dumating?', { u: p.unit || t('piraso') }), '', t('Idadagdag ito sa kasalukuyang stock. Para sa delivery na may invoice, gamitin ang Receiving tab.'));
          if (v == null || !num(v)) return;
          $('#pStock', m).value = qtyStr(num($('#pStock', m).value) + num(v));
          toast(t('Idinagdag. Pindutin ang I-save.'));
        };
        const del = $('#pDel', m);
        if (del) del.onclick = async () => {
          if (!(await confirmBox(t('Burahin ang {x}?', { x: p.name }), t('Mananatili ang mga lumang benta nito.'), t('Burahin'), true))) return;
          await DB.del('products', p.id);
          S.products = S.products.filter((x) => x.id !== p.id);
          close(); renderInventory(); renderQuick(); toast(t('Nabura'));
        };
        $('#pSave', m).onclick = async () => {
          const name = $('#pName', m).value.trim();
          const barcode = $('#pBarcode', m).value.trim();
          const priceStr = $('#pPrice', m).value.trim();
          if (!name) { toast(t('Ilagay ang pangalan'), true); $('#pName', m).focus(); return; }
          if (priceStr === '' || num(priceStr) < 0) { toast(t('Ilagay ang presyo'), true); $('#pPrice', m).focus(); return; }
          if (barcode) {
            const dup = byBarcode(barcode);
            if (dup && dup.id !== p.id) { toast(t('Gamit na ang barcode na ito sa {x}', { x: dup.name }), true); return; }
          }
          const unit = $('#pUnit', m).value === '__other' ? t('piraso') : $('#pUnit', m).value;
          const rec = {
            id: p.id || uid(), name, barcode, price: r2(num(priceStr)),
            cost: $('#pCost', m).value.trim() === '' ? '' : r2(num($('#pCost', m).value)),
            unit, category: $('#pCat', m).value.trim(),
            stock: r3(num($('#pStock', m).value)), reorder: r3(num($('#pReorder', m).value)),
            created: p.created || Date.now(), updated: Date.now(),
          };
          await DB.put('products', rec);
          const i = S.products.findIndex((x) => x.id === rec.id);
          if (i >= 0) S.products[i] = rec; else S.products.push(rec);
          close(); renderInventory(); renderQuick();
          toast(isNew ? t('Naidagdag ang {x}', { x: name }) : t('Na-save'));
        };
      }
    );
  }

  // =========================================================
  // BENTA
  // =========================================================
  function rangeBounds() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = 86400000;
    switch (S.salesRange) {
      case 'yesterday': return [start.getTime() - day, start.getTime(), 'kahapon'];
      case 'week': return [start.getTime() - 6 * day, start.getTime() + day, '7-araw'];
      case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), start.getTime() + day, dayKey(now).slice(0, 7)];
      case 'day': {
        const [y, mo, d] = S.salesDay.split('-').map(Number);
        const s = new Date(y, mo - 1, d).getTime();
        return [s, s + day, S.salesDay];
      }
      default: return [start.getTime(), start.getTime() + day, dayKey(now)];
    }
  }

  async function salesInRange() {
    const [from, to] = rangeBounds();
    const all = await DB.all('sales');
    return all.filter((s) => s.time >= from && s.time < to).sort((a, b) => b.time - a.time);
  }

  async function renderSales() {
    $$('#salesRange .chip[data-r]').forEach((c) => c.classList.toggle('on', c.dataset.r === S.salesRange));
    $('.date-chip').classList.toggle('on', S.salesRange === 'day');
    const sales = await salesInRange();
    const valid = sales.filter((s) => !s.voided);
    const total = valid.reduce((s, x) => s + x.total, 0);
    let cost = 0, hasCost = true;
    const top = {};
    valid.forEach((s) => s.items.forEach((it) => {
      if (it.cost === '' || it.cost == null) hasCost = false;
      cost += num(it.cost) * it.qty;
      const k = it.productId;
      top[k] = top[k] || { name: it.name, qty: 0, amt: 0, unit: it.unit };
      top[k].qty += it.qty; top[k].amt += it.price * it.qty;
    }));
    const discounts = valid.reduce((s, x) => s + (x.discount || 0), 0);
    $('#salesStats').innerHTML =
      '<div class="stat main"><div class="k">' + esc(t('Kabuuang benta')) + '</div><div class="v">' + money(total) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Bilang ng resibo')) + '</div><div class="v">' + valid.length + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Tubo')) + (hasCost ? '' : ' (' + esc(t('may kulang na puhunan')) + ')') + '</div><div class="v">' + money(total - cost) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Average kada resibo')) + '</div><div class="v">' + money(valid.length ? total / valid.length : 0) + '</div></div>' +
      (discounts ? '<div class="stat"><div class="k">' + esc(t('Discount')) + '</div><div class="v">' + money(discounts) + '</div></div>' : '');
    const tops = Object.values(top).sort((a, b) => b.amt - a.amt).slice(0, 10);
    const maxAmt = tops.length ? tops[0].amt : 1;
    $('#topItems').innerHTML = tops.length ? tops.map((x) =>
      '<div class="ti"><span>' + esc(x.name) + ' <span class="muted">× ' + qtyStr(x.qty) + '</span></span><b>' + money(x.amt) + '</b>' +
      '<div class="bar"><i style="width:' + Math.max(3, (x.amt / maxAmt) * 100) + '%"></i></div></div>').join('')
      : '<p class="muted">' + esc(t('Wala pang benta.')) + '</p>';
    const short = ['today', 'yesterday', 'day'].includes(S.salesRange);
    $('#salesList').innerHTML = sales.length ? sales.map((s) =>
      '<button type="button" class="item" data-id="' + s.id + '"><span class="grow">' +
      '<div class="nm">#' + s.no + ' · ' + esc(short ? fmtTime(s.time) : fmtDateTime(s.time)) + '</div>' +
      '<div class="meta">' + esc(s.items.map((i) => i.name).join(', ').slice(0, 80)) + '</div></span>' +
      '<span class="right"><div class="pr">' + money(s.total) + '</div>' + (s.voided ? '<span class="badge void">VOID</span>' : '') + '</span></button>').join('')
      : '<p class="muted">' + esc(t('Walang resibo sa panahong ito.')) + '</p>';
    $$('#salesList .item').forEach((b) => b.addEventListener('click', async () => viewSale(await DB.get('sales', b.dataset.id))));
  }

  function viewSale(sale) {
    if (!sale) return;
    modal(
      Receipt.toHtml(saleDoc(sale)) +
      '<div class="modal-actions">' +
      (sale.voided ? '' : '<button class="btn danger" id="vsVoid" type="button">' + esc(t('Void')) + '</button>') +
      (S.printer.mode !== 'none' ? '<button class="btn ghost" id="vsPrint" type="button">' + esc(t('Print ulit')) + '</button>' : '') +
      '<button class="btn primary" data-close type="button">' + esc(t('Isara')) + '</button></div>' +
      (sale.voided ? '<p class="muted" style="text-align:center;margin-top:10px">' + esc(t('Na-void noong {d}', { d: fmtDateTime(sale.voided) })) + '</p>' : ''),
      (m, close) => {
        const pb = $('#vsPrint', m);
        if (pb) pb.onclick = () => printSale(sale);
        const vb = $('#vsVoid', m);
        if (vb) vb.onclick = async () => {
          if (!(await confirmBox(t('I-void ang resibo #{n}?', { n: sale.no }), t('Hindi na ito bibilangin sa benta at ibabalik ang stock ng mga paninda.'), t('I-void'), true))) return;
          await DB.voidSale(sale.id, '');
          sale.items.forEach((l) => { S.soldCount[l.productId] = Math.max(0, r3((S.soldCount[l.productId] || 0) - l.qty)); });
          await DB.setMeta('soldCount', S.soldCount);
          await reloadProducts();
          close(); renderSales(); toast(t('Na-void ang #{n}', { n: sale.no }));
        };
      }
    );
  }

  // =========================================================
  // PRINTER
  // =========================================================
  function renderPrinter() {
    const p = S.printer;
    const modes = [
      ['bt', t('Bluetooth printer'), A ? t('Thermal printer na naka-pair sa phone na ito (58mm o 80mm).') : t('Sa Android app lang ito.'), !A],
      ['ble', t('Bluetooth (BLE) sa browser'), Printer.hasBle ? t('Para sa website sa Chrome. Gumagana sa mga printer na may Bluetooth Low Energy.') : t('Hindi suportado ng browser na ito.'), !Printer.hasBle || !!A],
      ['system', t('Ordinaryong print'), t('Gamit ang print ng phone o computer. Puwede ring i-save bilang PDF.'), false],
      ['none', t('Walang print'), t('Ipakita lang ang sukli, walang resibo.'), false],
    ].filter((m) => !(A && m[0] === 'ble'));
    $('#printModes').innerHTML = modes.map((m) =>
      '<label class="option' + (p.mode === m[0] ? ' on' : '') + (m[3] ? ' disabled' : '') + '">' +
      '<input type="radio" name="pmode" value="' + m[0] + '"' + (p.mode === m[0] ? ' checked' : '') + (m[3] ? ' disabled' : '') + '>' +
      '<span><div class="t">' + esc(m[1]) + '</div><div class="d">' + esc(m[2]) + '</div></span></label>').join('');
    $$('#printModes input').forEach((r) => r.addEventListener('change', () => { S.printer.mode = r.value; savePrinter(); renderPrinter(); }));
    $$('#paperSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.p) === p.paper));
    $('#printLogo').checked = !!p.logo;
    $('#autoPrint').checked = !!p.auto;
    $('#btCard').hidden = !(p.mode === 'bt' || p.mode === 'ble');
    $('#arNote').hidden = I18N.lang !== 'ar';
    if (p.mode === 'bt') {
      $('#btHelp').textContent = t('Buksan ang printer, i-pair muna sa Bluetooth settings ng phone (karaniwang PIN: 0000 o 1234), tapos piliin dito.');
      $('#btRefresh').hidden = false;
      loadPaired();
    } else if (p.mode === 'ble') {
      $('#btHelp').textContent = t('Buksan ang printer at pindutin ang "Pumili ng printer". Lalabas ang listahan ng Chrome.');
      $('#btRefresh').hidden = true;
      $('#btList').innerHTML = (p.name ? '<div class="item"><span class="grow"><div class="nm">' + esc(p.name) + '</div><div class="meta">' + esc(t('Napili')) + '</div></span></div>' : '') +
        '<button class="btn primary" id="bleChoose" type="button" style="margin-top:8px">' + esc(t('Pumili ng printer')) + '</button>';
      $('#bleChoose').onclick = async () => {
        try {
          const d = await Printer.bleConnect();
          S.printer.name = d.name; S.printer.address = d.id; savePrinter(); renderPrinter();
          toast(t('Konektado sa {x}', { x: d.name }));
        } catch (e) { if (e.name !== 'NotFoundError') toast(e.message, true); }
      };
    }
  }

  async function loadPaired() {
    const el = $('#btList');
    el.innerHTML = '<p class="muted">' + esc(t('Hinahanap…')) + '</p>';
    try {
      const list = await Printer.pairedList();
      el.innerHTML = list.length ? list.map((d) =>
        '<label class="option' + (S.printer.address === d.address ? ' on' : '') + '" style="margin-bottom:6px">' +
        '<input type="radio" name="btdev" value="' + esc(d.address) + '"' + (S.printer.address === d.address ? ' checked' : '') + '>' +
        '<span><div class="t">' + esc(d.name || t('Walang pangalan')) + '</div><div class="d">' + esc(d.address) + '</div></span></label>').join('')
        : '<p class="muted">' + esc(t('Walang naka-pair na Bluetooth device. I-pair muna ang printer sa Settings ng phone.')) + '</p>' +
          '<button class="btn ghost" id="openBtSettings" type="button">' + esc(t('Buksan ang Bluetooth settings')) + '</button>';
      $$('input[name=btdev]', el).forEach((r) => r.addEventListener('change', () => {
        const d = list.find((x) => x.address === r.value);
        S.printer.address = d.address; S.printer.name = d.name || d.address; savePrinter(); loadPaired();
        toast(t('Napili: {x}', { x: S.printer.name }));
      }));
      const ob = $('#openBtSettings', el);
      if (ob) ob.onclick = () => A.openBluetoothSettings();
    } catch (e) {
      el.innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
    }
  }

  function sampleSale() {
    return {
      id: 'sample', no: 1, time: Date.now(), cashier: S.store.cashier,
      items: [
        { name: t('Kape 3-in-1'), price: 12, qty: 3, unit: t('sachet') },
        { name: t('Pandesal'), price: 5, qty: 10, unit: t('piraso') },
        { name: t('Softdrinks 1.5L'), price: 85, qty: 1, unit: t('bote') },
      ],
      subtotal: 171, discount: 0, total: 171, cash: 200, change: 29,
    };
  }

  // =========================================================
  // BACKUP / FILES
  // =========================================================
  async function renderBackup() {
    const last = await DB.getMeta('lastBackup', 0);
    const el = $('#lastBackup');
    if (!last) { el.textContent = t('Hindi pa nakakapag-backup.'); el.className = 'backup-when old'; }
    else {
      const days = Math.floor((Date.now() - last) / 86400000);
      el.textContent = t('Huling backup: {d}', { d: fmtDateTime(last) }) + (days >= 1 ? ' (' + t('{n} araw na', { n: days }) + ')' : '');
      el.className = 'backup-when' + (days >= 7 ? ' old' : '');
    }
    const v = A && A.appVersion ? A.appVersion() : (window.POS_VERSION || '');
    $('#about').textContent = 'POS ' + v + ' · ' + t('Walang ads · Nasa device mo lang ang data');
  }

  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /** I-save ang file: sa Android app ay pipili ng lugar, sa browser ay download. */
  async function saveBlob(name, blob) {
    if (A && A.saveFileB64) {
      const b64 = await blobToB64(blob);
      return new Promise((resolve, reject) => {
        const id = 'f' + Date.now();
        window.__posFile = (cid, ok, msg) => { if (cid === id) (ok ? resolve(msg) : reject(new Error(msg || t('Hindi na-save')))); };
        A.saveFileB64(name, blob.type || 'application/octet-stream', b64, id);
      });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'ok';
  }
  const saveFile = (name, mime, text) => saveBlob(name, new Blob([text], { type: mime }));

  const slug = () => (S.store.name || 'pos').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pos';

  async function exportBackup() {
    try {
      const data = await DB.exportAll();
      const r = await saveFile('backup-' + slug() + '-' + dayKey(Date.now()) + '.json', 'application/json', JSON.stringify(data));
      if (r === 'cancel') return;
      await DB.setMeta('lastBackup', Date.now());
      renderBackup();
      toast(t('Na-save ang backup'));
    } catch (e) { toast(e.message, true); }
  }

  function readFile(input) {
    return new Promise((resolve, reject) => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(f);
    });
  }

  async function importBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast(t('Sira o hindi tamang file'), true); return; }
    if (!data || data.app !== 'pos') { toast(t('Hindi ito backup file ng POS na ito'), true); return; }
    const msg = t('{p} paninda, {s} benta at {r} receiving mula {d}. Papalitan nito ang lahat ng data ngayon.', {
      p: (data.products || []).length, s: (data.sales || []).length, r: (data.receivings || []).length,
      d: data.exported ? fmtDateTime(data.exported) : 'backup',
    });
    if (!(await confirmBox(t('Ibalik ang backup?'), msg, t('Ibalik'), true))) return;
    try {
      await DB.importAll(data);
      await loadAll();
      S.cart = [];
      I18N.apply();
      toast(t('Naibalik ang backup'));
      show('cashier');
    } catch (e) { toast(e.message, true); }
  }

  const PRODUCT_COLS = ['name', 'barcode', 'price', 'cost', 'unit', 'stock', 'reorder', 'category'];
  function productRows() {
    return [PRODUCT_COLS].concat(S.products.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => PRODUCT_COLS.map((h) => (['price', 'cost', 'stock', 'reorder'].includes(h) && p[h] !== '' && p[h] != null ? num(p[h]) : (p[h] == null ? '' : p[h])))));
  }

  async function exportProducts(kind) {
    try {
      const base = 'paninda-' + slug() + '-' + dayKey(Date.now());
      if (kind === 'xlsx') await saveBlob(base + '.xlsx', XLSXLite.write(productRows(), 'Paninda'));
      else {
        const csv = productRows().map((r) => r.map(csvCell).join(',')).join('\r\n');
        await saveFile(base + '.csv', 'text/csv', '﻿' + csv);
      }
      toast(t('Na-export'));
    } catch (e) { toast(e.message, true); }
  }

  function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  async function importProducts(rows) {
    if (rows.length < 2) { toast(t('Walang laman ang file'), true); return; }
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const alias = { pangalan: 'name', paninda: 'name', product: 'name', item: 'name', presyo: 'price', 'selling price': 'price', srp: 'price', puhunan: 'cost', kategorya: 'category', quantity: 'stock', qty: 'stock', 'reorder level': 'reorder', code: 'barcode', sku: 'barcode' };
    const idx = {};
    head.forEach((h, i) => { idx[alias[h] || h] = i; });
    if (idx.name == null || idx.price == null) { toast(t('Kailangan ng column na "name" at "price"'), true); return; }
    let added = 0, updated = 0;
    const get = (r, k) => (idx[k] == null ? '' : String(r[idx[k]] == null ? '' : r[idx[k]]).trim());
    const recs = [];
    const pool = S.products.map((p) => ({ ...p }));
    for (const r of rows.slice(1)) {
      const name = get(r, 'name');
      if (!name) continue;
      const barcode = get(r, 'barcode');
      const existing = (barcode && pool.find((p) => p.barcode && String(p.barcode) === barcode)) || pool.find((p) => p.name.toLowerCase() === name.toLowerCase());
      const rec = {
        ...(existing || { id: uid(), created: Date.now(), stock: 0, reorder: 0, unit: t('piraso'), cost: '', category: '' }),
        name, barcode: barcode || (existing ? existing.barcode : ''), price: r2(num(get(r, 'price'))), updated: Date.now(),
      };
      if (get(r, 'cost') !== '') rec.cost = r2(num(get(r, 'cost')));
      if (get(r, 'unit')) rec.unit = get(r, 'unit');
      if (get(r, 'stock') !== '') rec.stock = r3(num(get(r, 'stock')));
      if (get(r, 'reorder') !== '') rec.reorder = r3(num(get(r, 'reorder')));
      if (get(r, 'category')) rec.category = get(r, 'category');
      recs.push(rec);
      if (existing) { updated++; Object.assign(existing, rec); } else { added++; pool.push(rec); }
    }
    if (!(await confirmBox(t('Mag-import ng paninda?'), t('{a} bago at {u} papalitan ang presyo/stock.', { a: added, u: updated }), t('Import')))) return;
    for (const rec of recs) await DB.put('products', rec);
    await reloadProducts();
    toast(t('Na-import: {a} bago, {u} na-update', { a: added, u: updated }));
  }

  async function exportSales() {
    const sales = await salesInRange();
    const rows = [['resibo', 'petsa', 'oras', 'paninda', 'qty', 'unit', 'presyo', 'puhunan', 'halaga', 'discount', 'total_ng_resibo', 'void']];
    sales.slice().reverse().forEach((s) => s.items.forEach((it, i) => {
      rows.push([s.no, dayKey(s.time), fmtTime(s.time), it.name, it.qty, it.unit, it.price, it.cost === '' ? '' : num(it.cost), r2(it.price * it.qty),
        i === 0 ? s.discount || 0 : '', i === 0 ? s.total : '', s.voided ? 'void' : '']);
    }));
    try { await saveBlob('benta-' + slug() + '-' + rangeBounds()[2] + '.xlsx', XLSXLite.write(rows, 'Benta')); toast(t('Na-export')); }
    catch (e) { toast(e.message, true); }
  }

  // =========================================================
  // TINDAHAN (pangalan, logo, kulay, language)
  // =========================================================
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => {
          const s = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        im.onerror = () => reject(new Error(t('Hindi mabasa ang larawan')));
        im.src = r.result;
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function editStore(first) {
    const st = { ...S.store };
    if (!st.footer) st.footer = t('Salamat po! Balik po kayo.');
    modal(
      '<h2>' + esc(first ? t('Maligayang pagdating! Ano ang pangalan ng tindahan mo?') : t('Tindahan')) + '</h2>' +
      '<div class="seg lang-seg" id="sLang">' + Object.keys(I18N.LANGS).map((l) => '<button type="button" data-l="' + l + '"' + (I18N.lang === l ? ' class="on"' : '') + '>' + I18N.LANGS[l] + '</button>').join('') + '</div>' +
      (first ? '<p class="muted">' + esc(t('Lalabas ito sa itaas ng app at sa resibo. Puwedeng palitan anumang oras sa ⚙.')) + '</p>' : '') +
      '<div class="logo-pick"><span class="logo" id="sLogo"></span><span class="btn-row" style="flex:1">' +
      '<button class="btn ghost" id="sLogoBtn" type="button">' + esc(t('Pumili ng logo')) + '</button>' +
      '<button class="btn" id="sLogoRm" type="button">' + esc(t('Alisin')) + '</button></span>' +
      '<input type="file" id="sLogoFile" accept="image/*" hidden></div>' +
      '<label class="field"><span>' + esc(t('Pangalan ng tindahan')) + '</span><input id="sName" type="text" value="' + esc(st.name) + '" placeholder="' + esc(t('hal. Aling Nena Sari-Sari Store')) + '"></label>' +
      '<label class="field"><span>' + esc(t('Address (puwedeng wala)')) + '</span><input id="sAddr" type="text" value="' + esc(st.address) + '"></label>' +
      '<div class="field-row"><label class="field"><span>' + esc(t('Contact no. (puwedeng wala)')) + '</span><input id="sPhone" type="tel" value="' + esc(st.phone) + '"></label>' +
      '<label class="field"><span>' + esc(t('Pangalan ng cashier')) + '</span><input id="sCashier" type="text" value="' + esc(st.cashier) + '"></label></div>' +
      '<label class="field"><span>' + esc(t('Dagdag na linya sa resibo (hal. permit/TIN, puwedeng wala)')) + '</span><input id="sTin" type="text" value="' + esc(st.tin) + '"></label>' +
      '<label class="field"><span>' + esc(t('Mensahe sa dulo ng resibo')) + '</span><input id="sFooter" type="text" value="' + esc(st.footer) + '"></label>' +
      '<div class="field-row"><label class="field"><span>' + esc(t('Simbolo ng pera')) + '</span><select id="sCur">' +
      ['₱', 'PHP ', '$', 'BD ', 'SAR ', 'AED ', 'KWD ', 'QAR ', 'OMR '].map((c) => '<option' + (c === st.currency ? ' selected' : '') + ' value="' + c + '">' + c.trim() + '</option>').join('') + '</select></label><span></span></div>' +
      '<div class="field"><span>' + esc(t('Kulay ng app')) + '</span><div class="swatches">' +
      COLORS.map((c) => '<button type="button" class="swatch' + (c === st.color ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div></div>' +
      '<div class="modal-actions">' + (first ? '' : '<button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>') +
      '<button class="btn primary" id="sSave" type="button">' + esc(t('I-save')) + '</button></div>',
      (m, close) => {
        const drawLogo = () => {
          $('#sLogo', m).innerHTML = st.logo ? '<img alt="" src="' + esc(st.logo) + '">' : esc(($('#sName', m).value || 'T').trim().charAt(0).toUpperCase() || 'T');
          $('#sLogoRm', m).hidden = !st.logo;
        };
        drawLogo();
        $$('#sLang button', m).forEach((b) => b.addEventListener('click', () => {
          // Palitan agad ang language at buksan ulit ang form sa bagong language
          const keep = { name: $('#sName', m).value, address: $('#sAddr', m).value, phone: $('#sPhone', m).value, cashier: $('#sCashier', m).value, tin: $('#sTin', m).value };
          close();
          const oldFooter = t('Salamat po! Balik po kayo.');
          setLanguage(b.dataset.l);
          Object.assign(S.store, keep, { logo: st.logo, color: st.color });
          if (!S.store.footer || S.store.footer === oldFooter) S.store.footer = '';
          editStore(first);
        }));
        $('#sName', m).addEventListener('input', drawLogo);
        if (first) setTimeout(() => $('#sName', m).focus(), 80);
        $('#sLogoBtn', m).onclick = () => $('#sLogoFile', m).click();
        $('#sLogoRm', m).onclick = () => { st.logo = ''; drawLogo(); };
        $('#sLogoFile', m).addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try { st.logo = await resizeImage(f, 320); drawLogo(); } catch (err) { toast(err.message, true); }
        });
        $$('.swatch', m).forEach((b) => b.addEventListener('click', () => {
          st.color = b.dataset.c;
          $$('.swatch', m).forEach((x) => x.classList.toggle('on', x === b));
        }));
        $('#sSave', m).onclick = async () => {
          st.name = $('#sName', m).value.trim();
          if (!st.name) { toast(t('Ilagay ang pangalan ng tindahan'), true); return; }
          st.address = $('#sAddr', m).value.trim();
          st.phone = $('#sPhone', m).value.trim();
          st.cashier = $('#sCashier', m).value.trim();
          st.tin = $('#sTin', m).value.trim();
          st.footer = $('#sFooter', m).value.trim();
          st.currency = $('#sCur', m).value;
          st.lang = I18N.lang;
          S.store = st;
          await saveStore();
          applyStore();
          close();
          renderCashier();
          toast(t('Na-save'));
        };
      }
    );
  }

  // =========================================================
  // EVENTS
  // =========================================================
  function bind() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
    $('#storeBtn').onclick = () => editStore(false);
    $('#settingsBtn').onclick = () => editStore(false);
    $('#langBtn').onclick = pickLanguage;

    // Search + USB/Bluetooth barcode scanner (nagta-type at nag-e-Enter)
    const s = $('#search');
    s.addEventListener('input', renderResults);
    s.addEventListener('keydown', (e) => {
      const items = $$('#results .result');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        resultSel = (resultSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.classList.toggle('sel', i === resultSel));
        items[resultSel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const exact = byBarcode(s.value);
        if (exact) { addToCart(exact); clearSearch(); return; }
        if (items[resultSel]) { items[resultSel].click(); return; }
        if (/^\d{6,}$/.test(s.value.trim())) toast(t('Walang paninda na may barcode na {b}', { b: s.value.trim() }), true);
      } else if (e.key === 'Escape') clearSearch();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('#results').hidden = true; });
    s.addEventListener('focus', () => { if (s.value.trim()) renderResults(); });

    $('#scanBtn').onclick = async () => {
      try {
        const code = await Scanner.scan();
        if (!code) return;
        const p = byBarcode(code);
        if (p) addToCart(p);
        else if (await confirmBox(t('Wala pa ang barcode na ito'), t('{b}: idagdag bilang bagong paninda?', { b: code }), t('Idagdag'))) editProduct({ barcode: code });
      } catch (e) { toast(e.message, true); }
    };

    $('#cartList').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const l = S.cart[i];
      if (!l) return;
      if (b.dataset.a === 'inc') l.qty = r3(l.qty + 1);
      if (b.dataset.a === 'dec') l.qty = r3(l.qty - 1);
      if (b.dataset.a === 'rm') l.qty = 0;
      if (b.dataset.a === 'set') {
        const v = await promptNumber(t('Ilan ang {x}?', { x: l.name }), qtyStr(l.qty), t('Puwedeng may decimal, hal. 0.5 kilo'));
        if (v == null) return;
        l.qty = r3(num(v));
      }
      if (l.qty <= 0) S.cart.splice(i, 1);
      renderCart();
    });
    $('#clearCart').onclick = async () => {
      if (await confirmBox(t('Alisin lahat sa cart?'), t('Hindi pa ito nabebenta.'), t('Alisin'), true)) { S.cart = []; renderCart(); }
    };
    $('#cash').addEventListener('input', updateChange);
    $('#cash').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#payBtn').disabled) pay(); });
    $('#payBtn').onclick = pay;
    $('#discBtn').onclick = async () => {
      if (!S.cart.length) { toast(t('Wala pang laman ang cart')); return; }
      const { subtotal } = cartTotals();
      const v = await promptNumber(t('Discount'), S.discount ? String(S.discount) : '', t('Halaga (hal. 20) o porsyento (hal. 10%). Subtotal: {x}', { x: money(subtotal) }));
      if (v == null) return;
      S.discount = v.endsWith('%') ? r2(subtotal * Math.min(100, num(v.slice(0, -1))) / 100) : r2(Math.max(0, num(v)));
      renderCart();
    };

    // Paninda
    $('#addProduct').onclick = () => editProduct(null);
    $('#invSearch').addEventListener('input', renderInventory);
    $$('#invFilters .chip[data-f]').forEach((c) => c.addEventListener('click', () => { S.invFilter = c.dataset.f; renderInventory(); }));
    $('#invGridBtn').onclick = () => { S.invGrid = !S.invGrid; renderInventory(); };

    // Receiving
    Receiving.bind();

    // Benta
    $$('#salesRange .chip[data-r]').forEach((c) => c.addEventListener('click', () => { S.salesRange = c.dataset.r; $('#salesDate').value = ''; renderSales(); }));
    $('#salesDate').addEventListener('change', (e) => { if (!e.target.value) return; S.salesRange = 'day'; S.salesDay = e.target.value; renderSales(); });
    $('#salesCsv').onclick = exportSales;

    // Printer
    $$('#paperSeg button').forEach((b) => b.addEventListener('click', () => { S.printer.paper = Number(b.dataset.p); savePrinter(); renderPrinter(); }));
    $('#printLogo').addEventListener('change', (e) => { S.printer.logo = e.target.checked; savePrinter(); });
    $('#autoPrint').addEventListener('change', (e) => { S.printer.auto = e.target.checked; savePrinter(); });
    $('#btRefresh').onclick = loadPaired;
    $('#testPrint').onclick = async () => {
      if (S.printer.mode === 'none') { toast(t('Pumili muna ng paraan ng pag-print')); return; }
      try {
        await printDoc(Receipt.testDoc(S.store, { logo: S.printer.logo }));
        if (S.printer.mode !== 'system') toast(t('Naipadala sa printer'));
      } catch (e) { toast(t('Hindi nag-print: {e}', { e: e.message }), true); }
    };
    $('#previewReceipt').onclick = () => modal(Receipt.toHtml(saleDoc(sampleSale())) + '<div class="modal-actions"><button class="btn primary" data-close type="button">' + esc(t('Isara')) + '</button></div>');

    // Backup
    $('#exportBackup').onclick = exportBackup;
    $('#importBackup').onclick = () => $('#importFile').click();
    $('#importFile').addEventListener('change', async (e) => { const x = await readFile(e.target); if (x) importBackup(x); });
    $('#exportXlsx').onclick = () => exportProducts('xlsx');
    $('#exportCsv').onclick = () => exportProducts('csv');
    $('#importCsv').onclick = () => $('#csvFile').click();
    $('#csvFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { await importProducts(await XLSXLite.readFile(f)); } catch (err) { toast(err.message, true); }
    });
    $('#wipe').onclick = async () => {
      const word = t('BURAHIN');
      const v = await promptText(t('I-type ang {w} para ituloy', { w: word }), '');
      if (v !== word) { if (v != null) toast(t('Hindi tugma, walang binura')); return; }
      await DB.clearAll();
      S.cart = [];
      await loadAll();
      show('cashier');
      editStore(true);
    };

    // Keyboard wedge scanner kahit hindi naka-focus sa search (Cashier tab)
    let buf = '', last = 0;
    document.addEventListener('keydown', (e) => {
      if (!$('#view-cashier').classList.contains('on')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.querySelector('.modal-wrap')) return;
      const now = Date.now();
      if (now - last > 80) buf = '';
      last = now;
      if (e.key === 'Enter') {
        if (buf.length >= 4) {
          const p = byBarcode(buf);
          if (p) addToCart(p); else toast(t('Walang paninda na may barcode na {b}', { b: buf }), true);
        }
        buf = '';
      } else if (e.key.length === 1) buf += e.key;
    });
  }

  // Android back button: isara ang modal muna
  window.__posBack = function () {
    const w = document.querySelectorAll('.modal-wrap');
    if (w.length) { w[w.length - 1].remove(); return true; }
    const sc = document.querySelector('.scan-overlay .scan-close');
    if (sc) { sc.click(); return true; }
    if (!$('#view-cashier').classList.contains('on')) { show('cashier'); return true; }
    return false;
  };

  // ---------- service worker (website lang; sa app ay kasama na ang files) ----------
  function registerSW() {
    if (A || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const ask = (w) => {
        $('#updateBar').hidden = false;
        $('#updateBtn').onclick = () => w.postMessage('skip');
      };
      if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
    // Mag-reload lang kapag update (may dating bersyon), hindi sa unang bukas
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }

  // Para sa ibang module (Receiving)
  window.POSKIT = {
    S, $, $$, t, esc, num, r2, r3, money, qtyStr, uid, dayKey, fmtDateTime, toast, modal, confirmBox, promptText, promptArea,
    byId, byBarcode, reloadProducts, receiptDoc, saveBlob,
  };

  async function start() {
    I18N.apply();
    try {
      await loadAll();
    } catch (e) {
      document.body.innerHTML = '<p style="padding:20px">' + esc(t('Hindi mabuksan ang database')) + ': ' + esc(e.message) + '</p>';
      return;
    }
    I18N.apply();
    bind();
    let v = 'cashier';
    try { v = sessionStorage.getItem('pos-view') || 'cashier'; } catch (e) { /* wala */ }
    show(v);
    if (!S.store.name) editStore(true);
    registerSW();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  window.POS = { show, toast };
  start();
})();
