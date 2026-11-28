/* Resibo at receiving slip bilang "doc" (listahan ng linya), na puwedeng gawing:
 *  - HTML (preview at ordinaryong print)
 *  - ESC/POS text (mabilis, para sa Tagalog/English)
 *  - Larawan (raster) para sa thermal printer, para gumana ang Arabic at kahit anong letra
 * Linya: {t:'text', s, align, b, big} | {t:'lr', l, r, b, big} | {t:'sm', s} | {t:'rule'} | {t:'logo', src} | {t:'feed'}
 */
(function () {
  'use strict';
  const t = (k, v) => window.I18N.t(k, v);
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const q = (n) => String(Math.round(num(n) * 1000) / 1000);
  const pad = (x) => String(x).padStart(2, '0');
  function fmt(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function moneyFn(store) {
    return (n) => (store.currency || '₱') + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function saleDoc(store, sale, opts) {
    const m = moneyFn(store);
    const d = [];
    if (opts && opts.logo && store.logo) d.push({ t: 'logo', src: store.logo });
    d.push({ t: 'text', s: store.name || t('Tindahan'), align: 'c', b: true, big: true });
    if (store.address) d.push({ t: 'text', s: store.address, align: 'c' });
    if (store.phone) d.push({ t: 'text', s: store.phone, align: 'c' });
    if (store.tin) d.push({ t: 'text', s: store.tin, align: 'c' });
    d.push({ t: 'rule' });
    d.push({ t: 'text', s: t('Resibo #{n}', { n: sale.no }) });
    d.push({ t: 'text', s: fmt(sale.time) });
    if (sale.cashier) d.push({ t: 'text', s: t('Cashier') + ': ' + sale.cashier });
    if (sale.voided) d.push({ t: 'text', s: '*** VOIDED ***', align: 'c', b: true });
    d.push({ t: 'rule' });
    sale.items.forEach((it) => {
      d.push({ t: 'lr', l: it.name, r: m(it.price * it.qty) });
      if (it.qty !== 1) d.push({ t: 'sm', s: q(it.qty) + ' ' + (it.unit || '') + ' × ' + m(it.price) });
    });
    d.push({ t: 'rule' });
    if (sale.discount) { d.push({ t: 'lr', l: t('Subtotal'), r: m(sale.subtotal) }); d.push({ t: 'lr', l: t('Discount'), r: '-' + m(sale.discount) }); }
    d.push({ t: 'lr', l: t('TOTAL'), r: m(sale.total), b: true, big: true });
    d.push({ t: 'lr', l: t('Cash'), r: m(sale.cash) });
    d.push({ t: 'lr', l: t('Sukli'), r: m(sale.change) });
    d.push({ t: 'rule' });
    if (store.footer) d.push({ t: 'text', s: store.footer, align: 'c' });
    d.push({ t: 'sm', s: t('Hindi ito opisyal na resibo'), align: 'c' });
    return d;
  }

  function slipDoc(store, rec) {
    const m = moneyFn(store);
    const d = [];
    d.push({ t: 'text', s: store.name || '', align: 'c', b: true });
    d.push({ t: 'text', s: t('RECEIVING SLIP'), align: 'c', b: true, big: true });
    if (rec.status === 'void') d.push({ t: 'text', s: '*** VOIDED ***', align: 'c', b: true });
    else if (rec.status !== 'posted') d.push({ t: 'text', s: t('(DRAFT - hindi pa naidagdag)'), align: 'c' });
    d.push({ t: 'rule' });
    d.push({ t: 'text', s: 'RCV #' + (rec.no || '-') });
    if (rec.supplier) d.push({ t: 'text', s: t('Supplier') + ': ' + rec.supplier });
    if (rec.invoiceNo) d.push({ t: 'text', s: t('Invoice') + ': ' + rec.invoiceNo });
    d.push({ t: 'text', s: t('Petsa') + ': ' + (rec.date || '') });
    if (rec.receivedBy) d.push({ t: 'text', s: t('Tumanggap') + ': ' + rec.receivedBy });
    d.push({ t: 'rule' });
    let units = 0;
    rec.lines.forEach((l) => {
      d.push({ t: 'lr', l: l.name, r: m(num(l.cost) * num(l.qty)) });
      d.push({ t: 'sm', s: q(l.qty) + ' ' + (l.unit || '') + ' × ' + m(l.cost) + (l.isNew ? ' (' + t('bago') + ')' : '') });
      units += num(l.qty);
    });
    d.push({ t: 'rule' });
    d.push({ t: 'lr', l: t('Bilang ng item'), r: String(rec.lines.length) });
    d.push({ t: 'lr', l: t('Kabuuang dami'), r: q(units) });
    d.push({ t: 'lr', l: t('TOTAL'), r: m(rec.total), b: true, big: true });
    if (rec.notes) { d.push({ t: 'rule' }); d.push({ t: 'text', s: rec.notes }); }
    d.push({ t: 'feed' });
    d.push({ t: 'text', s: t('Pirma') + ': ____________________' });
    return d;
  }

  function testDoc(store, opts) {
    const d = [];
    if (opts && opts.logo && store.logo) d.push({ t: 'logo', src: store.logo });
    d.push({ t: 'text', s: 'TEST PRINT', align: 'c', b: true, big: true });
    d.push({ t: 'text', s: store.name || '', align: 'c' });
    d.push({ t: 'rule' });
    d.push({ t: 'lr', l: t('Kape 3-in-1'), r: (store.currency || '₱') + '36.00' });
    d.push({ t: 'lr', l: t('Mahabang pangalan ng produkto para sa test'), r: (store.currency || '₱') + '1,234.00' });
    d.push({ t: 'rule' });
    d.push({ t: 'text', s: t('Gumagana ang printer!'), align: 'c' });
    return d;
  }

  // ---------- HTML ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toHtml(doc) {
    const rtl = window.I18N.lang === 'ar';
    let h = '<div class="receipt" dir="' + (rtl ? 'rtl' : 'ltr') + '">';
    doc.forEach((x) => {
      const cls = [x.align === 'c' ? 'c' : '', x.b ? 'b' : '', x.big ? 'big' : ''].filter(Boolean).join(' ');
      if (x.t === 'logo') h += '<img alt="" src="' + esc(x.src) + '">';
      else if (x.t === 'rule') h += '<hr>';
      else if (x.t === 'feed') h += '<br>';
      else if (x.t === 'lr') h += '<div class="r ' + cls + '"><span>' + esc(x.l) + '</span><span dir="ltr">' + esc(x.r) + '</span></div>';
      else if (x.t === 'sm') h += '<div class="sm' + (x.align === 'c' ? ' c' : '') + '">' + esc(x.s) + '</div>';
      else h += '<div class="' + cls + '">' + esc(x.s) + '</div>';
    });
    return h + '</div>';
  }

  // ---------- ESC/POS text ----------
  async function toEscPos(doc, opts) {
    return window.EscPos.fromDoc(doc, opts);
  }

  // ---------- Larawan (raster) ----------
  function loadImg(src) {
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }

  async function toCanvas(doc, paper) {
    const W = paper === 80 ? 576 : 384;
    const P = 6;
    const base = paper === 80 ? 24 : 22;
    const font = (b, size) => (b ? 'bold ' : '') + size + 'px "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';
    const rtl = window.I18N.lang === 'ar';
    const c = document.createElement('canvas');
    c.width = W; c.height = 4000;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, c.height);
    g.fillStyle = '#000';
    g.textBaseline = 'top';
    try { g.direction = rtl ? 'rtl' : 'ltr'; } catch (e) { /* luma */ }
    let y = 4;
    const start = rtl ? W - P : P, end = rtl ? P : W - P;

    function wrapText(s, maxW) {
      const words = String(s).split(/\s+/);
      const out = []; let line = '';
      words.forEach((w) => {
        const tryL = line ? line + ' ' + w : w;
        if (g.measureText(tryL).width <= maxW || !line) line = tryL;
        else { out.push(line); line = w; }
      });
      if (line) out.push(line);
      return out.length ? out : [''];
    }

    for (const x of doc) {
      const size = x.big ? Math.round(base * 1.35) : x.t === 'sm' ? Math.round(base * 0.82) : base;
      const lh = Math.round(size * 1.3);
      g.font = font(x.b, size);
      if (x.t === 'logo') {
        const im = await loadImg(x.src);
        if (im) {
          const w = Math.min(W * 0.6, im.width * 3), h = im.height * (w / im.width);
          g.drawImage(im, (W - w) / 2, y, w, h);
          y += h + 6;
        }
      } else if (x.t === 'rule') {
        g.fillRect(P, y + 6, W - 2 * P, 2); y += 16;
      } else if (x.t === 'feed') {
        y += lh;
      } else if (x.t === 'lr') {
        g.textAlign = 'left';
        g.direction = 'ltr';
        const rw = g.measureText(x.r).width;
        try { g.direction = rtl ? 'rtl' : 'ltr'; } catch (e) { /* luma */ }
        const lines = wrapText(x.l, W - 2 * P - rw - 12);
        lines.forEach((ln, i) => {
          g.textAlign = rtl ? 'right' : 'left';
          g.fillText(ln, start, y);
          if (i === lines.length - 1) {
            g.direction = 'ltr';
            g.textAlign = rtl ? 'left' : 'right';
            g.fillText(x.r, end, y);
            try { g.direction = rtl ? 'rtl' : 'ltr'; } catch (e) { /* luma */ }
          }
          y += lh;
        });
      } else {
        const lines = wrapText(x.s, W - 2 * P);
        lines.forEach((ln) => {
          if (x.align === 'c') { g.textAlign = 'center'; g.fillText(ln, W / 2, y); }
          else { g.textAlign = rtl ? 'right' : 'left'; g.fillText(ln, start + (x.t === 'sm' ? (rtl ? -10 : 10) : 0), y); }
          y += lh;
        });
      }
    }
    const out = document.createElement('canvas');
    out.width = W; out.height = Math.ceil(y + 8);
    out.getContext('2d').drawImage(c, 0, 0);
    return out;
  }

  /** Doc -> ESC/POS bytes bilang larawan (GS v 0), hiniwa-hiwa para hindi mapuno ang buffer ng printer. */
  async function toRasterBytes(doc, paper) {
    const cv = await toCanvas(doc, paper);
    const W = cv.width, H = cv.height;
    const px = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const bpr = W / 8;
    const parts = [[0x1b, 0x40]];
    const band = 128;
    for (let y0 = 0; y0 < H; y0 += band) {
      const h = Math.min(band, H - y0);
      const data = new Uint8Array(bpr * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
        const i = ((y0 + y) * W + x) * 4;
        if (px[i] + px[i + 1] + px[i + 2] < 384) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
      }
      parts.push([0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8], data);
    }
    parts.push([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  /** Piliin ang paraan: Arabic (o may letrang hindi ASCII sa pangalan) -> larawan; iba -> text. */
  async function bytes(doc, opts) {
    const needsImage = window.I18N.lang === 'ar' || doc.some((x) => /[^\x00-\x7f₱ñÑáéíóúÁÉÍÓÚ×–—’‘“”]/.test((x.s || '') + (x.l || '') + (x.r || '')));
    return needsImage ? toRasterBytes(doc, opts.paper) : toEscPos(doc, opts);
  }

  window.Receipt = { saleDoc, slipDoc, testDoc, toHtml, bytes, toCanvas };
})();
