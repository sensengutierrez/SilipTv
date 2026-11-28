/* Gumagawa ng ESC/POS bytes para sa thermal receipt printer (58mm o 80mm). */
(function () {
  'use strict';

  // Karamihan ng murang printer ay walang ₱ o ñ; papalitan ng kahawig.
  function ascii(s) {
    return String(s == null ? '' : s)
      .replace(/₱/g, 'P').replace(/[ñ]/g, 'n').replace(/[Ñ]/g, 'N')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x0a\x20-\x7e]/g, '?');
  }

  class Builder {
    constructor(cols) { this.cols = cols; this.b = []; this.raw([0x1b, 0x40]); }
    raw(arr) { for (const x of arr) this.b.push(x & 0xff); return this; }
    text(s) { const t = ascii(s); for (let i = 0; i < t.length; i++) this.b.push(t.charCodeAt(i)); return this; }
    line(s) { return this.text((s || '') + '\n'); }
    align(a) { return this.raw([0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
    bold(on) { return this.raw([0x1b, 0x45, on ? 1 : 0]); }
    size(w, h) { return this.raw([0x1d, 0x21, ((w - 1) << 4) | (h - 1)]); }
    rule(ch) { return this.line((ch || '-').repeat(this.cols)); }
    /** Kaliwa at kanan sa iisang linya. */
    lr(left, right, cols) {
      cols = cols || this.cols;
      left = ascii(left); right = ascii(right);
      const space = cols - right.length - 1;
      if (left.length > space) {
        // hatiin ang mahabang pangalan sa ilang linya
        const words = wrap(left, cols);
        for (let i = 0; i < words.length - 1; i++) this.line(words[i]);
        left = words[words.length - 1];
        if (left.length > space) { this.line(left); left = ''; }
      }
      return this.line(left + ' '.repeat(Math.max(1, cols - left.length - right.length)) + right);
    }
    wrapped(s) { wrap(ascii(s), this.cols).forEach((l) => this.line(l)); return this; }
    feed(n) { return this.raw([0x1b, 0x64, n || 1]); }
    cut() { return this.raw([0x1d, 0x56, 0x42, 0x00]); }
    /** Larawan (logo) bilang raster: GS v 0. */
    image(img) {
      const bytesPerRow = Math.ceil(img.width / 8);
      this.raw([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, img.height & 0xff, img.height >> 8]);
      for (const x of img.data) this.b.push(x);
      return this;
    }
    bytes() { return new Uint8Array(this.b); }
  }

  function wrap(s, cols) {
    const out = [];
    String(s).split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).forEach((w) => {
        while (w.length > cols) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, cols)); w = w.slice(cols); }
        if (!w) return;
        if (!line) line = w;
        else if (line.length + 1 + w.length <= cols) line += ' ' + w;
        else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }

  /** Gawing itim-at-puti ang logo para sa printer. maxWidth = dots (384 sa 58mm, 576 sa 80mm). */
  function rasterize(dataUrl, maxWidth) {
    return new Promise((resolve) => {
      if (!dataUrl) return resolve(null);
      const im = new Image();
      im.onload = () => {
        const w = Math.min(maxWidth, Math.floor(maxWidth * 0.6), im.width * 4);
        const scale = w / im.width;
        const width = Math.max(8, Math.floor(w / 8) * 8);
        const height = Math.max(1, Math.round(im.height * scale));
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);
        g.drawImage(im, 0, 0, width, height);
        const px = g.getImageData(0, 0, width, height).data;
        const bpr = width / 8;
        const data = new Uint8Array(bpr * height);
        // Floyd–Steinberg dithering para maganda ang litrato
        const lum = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
          const a = px[i * 4 + 3] / 255;
          lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * a + 255 * (1 - a);
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const old = lum[i];
          const nw = old < 128 ? 0 : 255;
          const err = old - nw;
          if (nw === 0) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
          if (x + 1 < width) lum[i + 1] += err * 7 / 16;
          if (y + 1 < height) {
            if (x > 0) lum[i + width - 1] += err * 3 / 16;
            lum[i + width] += err * 5 / 16;
            if (x + 1 < width) lum[i + width + 1] += err / 16;
          }
        }
        resolve({ width, height, data });
      };
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
  }

  /** Buong resibo bilang bytes. */
  async function receipt(store, sale, opts) {
    const cols = opts.paper === 80 ? 48 : 32;
    const b = new Builder(cols);
    const money = (n) => (store.currency || '₱') + Number(n).toFixed(2);
    b.align('center');
    if (opts.logo && store.logo) {
      const img = await rasterize(store.logo, opts.paper === 80 ? 576 : 384);
      if (img) b.image(img);
    }
    b.bold(true).size(2, 2);
    wrap(ascii(store.name || 'Tindahan'), Math.floor(cols / 2)).forEach((l) => b.line(l));
    b.size(1, 1).bold(false);
    if (store.address) b.wrapped(store.address);
    if (store.phone) b.line(store.phone);
    if (store.tin) b.line(store.tin);
    b.align('left').rule();
    b.line('Resibo #' + sale.no);
    b.line(fmtDate(sale.time));
    if (sale.cashier) b.line('Cashier: ' + sale.cashier);
    if (sale.voided) { b.align('center').bold(true).line('*** VOIDED ***').bold(false).align('left'); }
    b.rule();
    for (const it of sale.items) {
      b.lr(it.name, money(it.price * it.qty));
      if (it.qty !== 1) b.line('  ' + trimNum(it.qty) + ' ' + (it.unit || '') + ' x ' + money(it.price));
    }
    b.rule();
    if (sale.discount) { b.lr('Subtotal', money(sale.subtotal)); b.lr('Discount', '-' + money(sale.discount)); }
    b.bold(true).size(1, 2).lr('TOTAL', money(sale.total)).size(1, 1).bold(false);
    b.lr('Cash', money(sale.cash));
    b.lr('Sukli', money(sale.change));
    b.rule();
    b.align('center');
    if (store.footer) b.wrapped(store.footer);
    b.line('Hindi ito opisyal na resibo').feed(3).cut();
    return b.bytes();
  }

  async function testPage(store, opts) {
    const b = new Builder(opts.paper === 80 ? 48 : 32);
    b.align('center');
    if (opts.logo && store.logo) {
      const img = await rasterize(store.logo, opts.paper === 80 ? 576 : 384);
      if (img) b.image(img);
    }
    b.bold(true).size(2, 2).line('TEST PRINT').size(1, 1).bold(false);
    b.line(store.name || '');
    b.rule().align('left').lr('Item', 'P99.00').lr('Mahabang pangalan ng produkto para sa test', 'P1,234.00');
    b.rule().align('center').line('Gumagana ang printer!').feed(3).cut();
    return b.bytes();
  }

  function trimNum(n) { return String(Math.round(n * 1000) / 1000); }
  function fmtDate(t) {
    const d = new Date(t);
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  window.EscPos = { receipt, testPage, ascii };
})();
