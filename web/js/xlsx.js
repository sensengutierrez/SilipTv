/* Maliit na Excel (.xlsx) reader at writer, walang library.
 * read(arrayBuffer) -> Promise<Array<Array<string>>> (unang sheet)
 * write(rows, sheetName) -> Blob (.xlsx)
 * Gumagamit ng DecompressionStream('deflate-raw') ng browser para sa pagbasa.
 */
(function () {
  'use strict';

  // ---------- ZIP read ----------
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  function listZip(d) {
    let eocd = -1;
    for (let i = d.length - 22; i >= Math.max(0, d.length - 65557); i--) {
      if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Hindi Excel (.xlsx) file');
    const count = u16(d, eocd + 10);
    let p = u32(d, eocd + 16);
    const files = {};
    for (let i = 0; i < count; i++) {
      if (u32(d, p) !== 0x02014b50) break;
      const method = u16(d, p + 10);
      const csize = u32(d, p + 20);
      const nlen = u16(d, p + 28), xlen = u16(d, p + 30), clen = u16(d, p + 32);
      const local = u32(d, p + 42);
      const name = new TextDecoder().decode(d.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, local };
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Luma ang browser: hindi mabasa ang .xlsx. Gamitin ang CSV.');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  async function readEntry(d, files, name) {
    const f = files[name];
    if (!f) return null;
    const start = f.local + 30 + u16(d, f.local + 26) + u16(d, f.local + 28);
    const raw = d.subarray(start, start + f.csize);
    const bytes = f.method === 0 ? raw : await inflateRaw(raw);
    return new TextDecoder().decode(bytes);
  }

  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  async function read(buf) {
    const d = new Uint8Array(buf);
    const files = listZip(d);
    const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    // Unang sheet ayon sa workbook
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await readEntry(d, files, 'xl/workbook.xml');
    const rels = await readEntry(d, files, 'xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = parse(wb).getElementsByTagName('sheet')[0];
      const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rel = rid && Array.from(parse(rels).getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const tgt = rel.getAttribute('Target').replace(/^\//, '');
        sheetPath = tgt.startsWith('xl/') ? tgt : 'xl/' + tgt;
      }
    }
    const shared = [];
    const ss = await readEntry(d, files, 'xl/sharedStrings.xml');
    if (ss) {
      Array.from(parse(ss).getElementsByTagName('si')).forEach((si) => {
        shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join(''));
      });
    }
    const sheet = await readEntry(d, files, sheetPath);
    if (!sheet) throw new Error('Walang sheet sa file');
    const rows = [];
    Array.from(parse(sheet).getElementsByTagName('row')).forEach((r) => {
      const ri = (parseInt(r.getAttribute('r'), 10) || rows.length + 1) - 1;
      const row = [];
      Array.from(r.getElementsByTagName('c')).forEach((c, k) => {
        const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : k;
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let val = '';
        if (type === 's') val = shared[parseInt(v && v.textContent, 10)] || '';
        else if (type === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent).join('');
        else if (v) val = v.textContent;
        row[ci] = val;
      });
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
      rows[ri] = row;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  }

  // ---------- ZIP write (store, walang compression) ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function zip(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    entries.forEach(([name, text]) => {
      const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nb.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nb);
      offset += 30 + nb.length + data.length;
    });
    const csize = central.reduce((s, b) => s + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const xesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function write(rows, sheetName) {
    const sd = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      const style = ri === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
      if (v == null || v === '') return '';
      return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
    }).join('') + '</row>').join('');
    const widths = (rows[0] || []).map((_, ci) => Math.min(50, Math.max(8, ...rows.map((r) => String(r[ci] == null ? '' : r[ci]).length + 2))));
    const cols = '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    const name = xesc((sheetName || 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + sd + '</sheetData></worksheet>'],
    ]);
  }

  /** Basahin ang file (xlsx o csv/tsv) bilang rows. */
  async function readFile(file) {
    const name = (file.name || '').toLowerCase();
    const buf = await file.arrayBuffer();
    const d = new Uint8Array(buf);
    if (d[0] === 0x50 && d[1] === 0x4b) return read(buf);
    if (/\.xls$/.test(name)) throw new Error('Lumang .xls: i-save muna bilang .xlsx o CSV sa Excel.');
    return parseDelimited(new TextDecoder().decode(d));
  }

  /** CSV / TSV (paste mula sa Excel ay tab-separated). */
  function parseDelimited(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  }

  window.XLSXLite = { read, write, readFile, parseDelimited };
})();
