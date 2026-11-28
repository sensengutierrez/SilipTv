/* Receiving: pagtanggap ng delivery mula sa supplier (may invoice).
 * Draft -> I-post (idadagdag ang stock, ia-update ang puhunan/presyo) -> puwedeng i-void.
 * Parang Excel ang listahan ng item: puwedeng mag-paste mula sa Excel, mag-import ng .xlsx/CSV, at mag-scan.
 */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const COLS = [
    { k: 'barcode', label: 'Barcode', w: 120, mode: 'numeric' },
    { k: 'name', label: 'Paninda', w: 200 },
    { k: 'unit', label: 'Unit', w: 80 },
    { k: 'qty', label: 'Dami', w: 70, num: true },
    { k: 'cost', label: 'Puhunan/unit', w: 95, num: true },
    { k: 'price', label: 'Presyo ng benta', w: 95, num: true },
  ];
  const ALIAS = {
    name: ['name', 'pangalan', 'paninda', 'product', 'item', 'description', 'desc', 'particulars', 'produkto', 'الصنف', 'المنتج', 'اسم'],
    barcode: ['barcode', 'code', 'sku', 'item code', 'upc', 'ean', 'باركود'],
    qty: ['qty', 'quantity', 'dami', 'bilang', 'pcs', 'qty.', 'الكمية'],
    cost: ['cost', 'puhunan', 'unit cost', 'unit price', 'price/unit', 'cost price', 'presyo ng bili', 'التكلفة', 'سعر الوحدة'],
    price: ['selling price', 'srp', 'presyo', 'presyo ng benta', 'retail', 'retail price', 'سعر البيع'],
    unit: ['unit', 'uom', 'unit of measure', 'الوحدة'],
    amount: ['amount', 'total', 'halaga', 'line total', 'المبلغ'],
  };

  let filter = 'all';

  // ---------------------------------------------------------------- listahan
  async function render() {
    const { $, $$, esc, money, t } = K();
    const all = (await DB.all('receivings')).sort((a, b) => (b.time || 0) - (a.time || 0));
    $$('#rcvFilters .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === filter));
    const list = all.filter((r) => filter === 'all' || (filter === 'draft' ? r.status !== 'posted' && r.status !== 'void' : r.status === filter));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const month = all.filter((r) => r.status === 'posted' && r.time >= monthStart);
    const drafts = all.filter((r) => r.status !== 'posted' && r.status !== 'void').length;
    $('#rcvStats').innerHTML =
      '<div class="stat main"><div class="k">' + esc(t('Natanggap ngayong buwan')) + '</div><div class="v">' + money(month.reduce((s, r) => s + r.total, 0)) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Bilang ng delivery')) + '</div><div class="v">' + month.length + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Draft')) + '</div><div class="v">' + drafts + '</div></div>';
    $('#rcvList').innerHTML = list.length ? list.map((r) =>
      '<button type="button" class="item" data-id=\"' + escHtml(r.id) + '\"><span class="grow">' +
      '<div class="nm">RCV #' + (r.no || '–') + ' · ' + esc(r.supplier || t('Walang supplier')) + '</div>' +
      '<div class="meta">' + [r.invoiceNo ? t('Invoice') + ' ' + esc(r.invoiceNo) : '', esc(r.date || ''), t('{n} item', { n: r.lines.length })].filter(Boolean).join(' · ') + '</div></span>' +
      '<span class="right"><div class="pr">' + money(r.total) + '</div>' + badge(r) + '</span></button>').join('')
      : '<div class="card"><h3>' + esc(t('Wala pang receiving')) + '</h3><p class="muted">' + esc(t('Kapag may dumating na delivery mula sa supplier, pindutin ang "+ Bagong receiving" at ilagay ang laman ng invoice. Madadagdag ang stock pagka-post.')) + '</p></div>';
    $$('#rcvList .item').forEach((b) => b.addEventListener('click', async () => open(await DB.get('receivings', b.dataset.id))));
  }

  function badge(r) {
    const { t } = K();
    if (r.status === 'posted') return '<span class="badge">' + t('Naka-post') + '</span>';
    if (r.status === 'void') return '<span class="badge void">VOID</span>';
    return '<span class="badge low">' + t('Draft') + '</span>';
  }

  // ---------------------------------------------------------------- editor
  function blankLine() { return { barcode: '', name: '', unit: '', qty: '', cost: '', price: '', productId: '' }; }

  async function newReceiving() {
    const { S, dayKey } = K();
    open({
      id: '', no: 0, status: 'draft', time: Date.now(), date: dayKey(Date.now()),
      supplier: '', invoiceNo: '', receivedBy: K().cashierName(), notes: '', lines: [], total: 0,
    });
  }

  function lineTotal(l) { const { num } = K(); return Math.round(num(l.qty) * num(l.cost) * 100) / 100; }

  function open(rec) {
    if (!rec) return;
    const { $, $$, esc, money, t, modal, num, qtyStr } = K();
    const editable = rec.status !== 'posted' && rec.status !== 'void';
    rec = JSON.parse(JSON.stringify(rec));
    const lines = rec.lines.map((l) => ({ ...blankLine(), ...l }));
    if (editable) lines.push(blankLine());

    const suppliers = [];
    DB.all('receivings').then((all) => {
      Array.from(new Set(all.map((r) => r.supplier).filter(Boolean))).sort().forEach((s) => suppliers.push(s));
      const dl = document.getElementById('supList');
      if (dl) dl.innerHTML = suppliers.map((s) => '<option value="' + esc(s) + '">').join('');
    });

    const head = editable
      ? '<div class="rcv-head">' +
        '<label class="field"><span>' + esc(t('Supplier')) + '</span><input id="rSup" type="text" list="supList" value="' + esc(rec.supplier) + '"><datalist id="supList"></datalist></label>' +
        '<label class="field"><span>' + esc(t('Invoice / DR no.')) + '</span><input id="rInv" type="text" value="' + esc(rec.invoiceNo) + '"></label>' +
        '<label class="field"><span>' + esc(t('Petsa')) + '</span><input id="rDate" type="date" value="' + esc(rec.date) + '"></label>' +
        '<label class="field"><span>' + esc(t('Tumanggap')) + '</span><input id="rBy" type="text" value="' + esc(rec.receivedBy) + '"></label>' +
        '<label class="field wide"><span>' + esc(t('Notes (puwedeng wala)')) + '</span><input id="rNotes" type="text" value="' + esc(rec.notes) + '"></label>' +
        '</div>'
      : '<div class="rcv-info">' +
        '<div><span class="muted">' + esc(t('Supplier')) + '</span><b>' + esc(rec.supplier || '–') + '</b></div>' +
        '<div><span class="muted">' + esc(t('Invoice / DR no.')) + '</span><b>' + esc(rec.invoiceNo || '–') + '</b></div>' +
        '<div><span class="muted">' + esc(t('Petsa')) + '</span><b>' + esc(rec.date || '') + '</b></div>' +
        '<div><span class="muted">' + esc(t('Tumanggap')) + '</span><b>' + esc(rec.receivedBy || '–') + '</b></div>' +
        (rec.notes ? '<div class="wide"><span class="muted">' + esc(t('Notes')) + '</span><b>' + esc(rec.notes) + '</b></div>' : '') +
        '</div>';

    const tools = editable
      ? '<div class="rcv-tools">' +
        '<button class="btn ghost small" id="rScan" type="button">' + esc(t('Scan')) + '</button>' +
        '<button class="btn ghost small" id="rPaste" type="button">' + esc(t('I-paste mula sa Excel')) + '</button>' +
        '<button class="btn ghost small" id="rImport" type="button">' + esc(t('Import Excel/CSV')) + '</button>' +
        '<input type="file" id="rFile" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
        '<span class="muted tip">' + esc(t('Tip: puwedeng i-copy ang mga row sa Excel at i-paste (Ctrl+V) diretso sa table.')) + '</span>' +
        '</div>'
      : '';

    const actions = editable
      ? (rec.id ? '<button class="btn danger" id="rDel" type="button">' + esc(t('Burahin')) + '</button>' : '<button class="btn" data-close type="button">' + esc(t('Isara')) + '</button>') +
        '<button class="btn ghost" id="rDraft" type="button">' + esc(t('I-save bilang draft')) + '</button>' +
        '<button class="btn primary" id="rPost" type="button">' + esc(t('I-post (idagdag sa stock)')) + '</button>'
      : (rec.status === 'posted' ? '<button class="btn danger" id="rVoid" type="button">' + esc(t('Void')) + '</button>' : '') +
        '<button class="btn ghost" id="rXlsx" type="button">' + esc(t('Excel')) + '</button>' +
        '<button class="btn ghost" id="rPrint" type="button">' + esc(t('Print slip')) + '</button>' +
        '<button class="btn primary" data-close type="button">' + esc(t('Isara')) + '</button>';

    modal(
      '<div class="rcv-title"><h2>' + (rec.no ? 'RCV #' + rec.no : esc(t('Bagong receiving'))) + '</h2>' + (rec.no ? badge(rec) : '') + '</div>' +
      head + tools +
      '<div class="sheet-wrap"><table class="sheet" id="rSheet"></table></div>' +
      '<div class="rcv-sum" id="rSum"></div>' +
      (editable && rec.id ? '<button class="btn ghost small" id="rPrintDraft" type="button" style="margin-top:8px">' + esc(t('Print slip')) + '</button>' : '') +
      '<div class="modal-actions wrap">' + actions + '</div>',
      (m, close) => {
        m.classList.add('wide-modal');
        const sheet = $('#rSheet', m);

        function drawSheet() {
          sheet.innerHTML =
            '<thead><tr><th class="rn">#</th>' + COLS.map((c) => '<th style="min-width:' + c.w + 'px">' + esc(t(c.label)) + '</th>').join('') +
            '<th class="num" style="min-width:90px">' + esc(t('Halaga')) + '</th>' + (editable ? '<th></th>' : '') + '</tr></thead><tbody>' +
            lines.map((l, i) => {
              const p = l.productId && K().byId(l.productId);
              const isNew = editable ? (l.name.trim() && !p) : l.isNew;
              return '<tr data-i="' + i + '"' + (isNew ? ' class="new"' : '') + '><td class="rn">' + (i + 1) + '</td>' +
                COLS.map((c) => editable
                  ? '<td><input data-k="' + c.k + '" data-i="' + i + '" type="text"' + (c.num || c.mode ? ' inputmode="' + (c.mode || 'decimal') + '"' : '') +
                    (c.k === 'name' ? ' list="prodList"' : '') + (c.num ? ' class="num"' : '') + ' value="' + esc(l[c.k]) + '"' +
                    (c.k === 'price' && p ? ' placeholder="' + esc(String(p.price)) + '"' : '') + (c.k === 'unit' && p ? ' placeholder="' + esc(p.unit || '') + '"' : '') + '></td>'
                  : '<td' + (c.num ? ' class="num"' : '') + '>' + esc(c.num && l[c.k] !== '' ? qtyStr(num(l[c.k])) : l[c.k]) + (c.k === 'name' && isNew ? ' <span class="badge low">' + esc(t('bago')) + '</span>' : '') + '</td>').join('') +
                '<td class="num amt">' + (l.name || l.qty ? money(lineTotal(l)) : '') + '</td>' +
                (editable ? '<td>' + (i < lines.length - 1 || l.name ? '<button type="button" class="rm-row" data-rm="' + i + '" aria-label="' + esc(t('Alisin')) + '">×</button>' : '') + '</td>' : '') +
                '</tr>';
            }).join('') + '</tbody>';
          if (editable) {
            let dl = document.getElementById('prodList');
            if (!dl) { dl = document.createElement('datalist'); dl.id = 'prodList'; m.appendChild(dl); }
            dl.innerHTML = K().S.products.map((p) => '<option value="' + esc(p.name) + '">').join('');
          }
          drawSum();
        }

        function drawSum() {
          const real = lines.filter((l) => l.name.trim());
          const total = real.reduce((s, l) => s + lineTotal(l), 0);
          const qty = real.reduce((s, l) => s + num(l.qty), 0);
          const newOnes = real.filter((l) => !(l.productId && K().byId(l.productId))).length;
          $('#rSum', m).innerHTML =
            '<span>' + esc(t('{n} item', { n: real.length })) + ' · ' + esc(t('dami {q}', { q: qtyStr(qty) })) +
            (editable && newOnes ? ' · <b class="warn">' + esc(t('{n} bagong paninda', { n: newOnes })) + '</b>' : '') + '</span>' +
            '<span class="sum-total">' + esc(t('Total')) + ' <b>' + money(total) + '</b></span>';
          $$('tr[data-i]', sheet).forEach((tr) => {
            const l = lines[Number(tr.dataset.i)];
            const a = $('.amt', tr);
            if (a && l) a.textContent = l.name || l.qty ? money(lineTotal(l)) : '';
          });
        }

        // Itugma ang linya sa paninda (barcode o pangalan)
        function match(i, by) {
          const l = lines[i];
          const { byBarcode, S } = K();
          let p = null;
          if (by === 'barcode' && l.barcode.trim()) p = byBarcode(l.barcode);
          if (by === 'name' && l.name.trim()) p = S.products.find((x) => x.name.toLowerCase() === l.name.trim().toLowerCase());
          if (p) {
            l.productId = p.id;
            l.name = p.name;
            if (!l.barcode) l.barcode = p.barcode || '';
            if (!l.unit) l.unit = p.unit || '';
            if (l.cost === '' && p.cost !== '' && p.cost != null) l.cost = String(p.cost);
            if (l.qty === '') l.qty = '1';
          } else if (by === 'name' || (by === 'barcode' && !l.name)) {
            l.productId = '';
          }
        }

        function ensureBlank() {
          const last = lines[lines.length - 1];
          if (!last || last.name || last.barcode || last.qty || last.cost) lines.push(blankLine());
        }

        function focusCell(i, k) {
          const el = sheet.querySelector('input[data-i="' + i + '"][data-k="' + k + '"]');
          if (el) { el.focus(); el.select && el.select(); }
        }

        if (editable) {
          sheet.addEventListener('input', (e) => {
            const el = e.target;
            if (!el.dataset.k) return;
            const i = Number(el.dataset.i);
            lines[i][el.dataset.k] = el.value;
            if (el.dataset.k === 'qty' || el.dataset.k === 'cost') drawSum();
            if (i === lines.length - 1 && el.value) {
              lines.push(blankLine());
              const tr = document.createElement('tbody');
              void tr;
              const keep = { i, k: el.dataset.k, pos: el.selectionStart };
              drawSheet();
              const again = sheet.querySelector('input[data-i="' + keep.i + '"][data-k="' + keep.k + '"]');
              if (again) { again.focus(); try { again.setSelectionRange(keep.pos, keep.pos); } catch (err) { /* number */ } }
            }
          });
          sheet.addEventListener('change', (e) => {
            const el = e.target;
            if (el.dataset.k !== 'barcode' && el.dataset.k !== 'name') return;
            const i = Number(el.dataset.i);
            match(i, el.dataset.k);
            ensureBlank();
            drawSheet();
            focusCell(i, el.dataset.k === 'barcode' ? (lines[i].productId ? 'qty' : 'name') : 'qty');
          });
          sheet.addEventListener('keydown', (e) => {
            const el = e.target;
            if (!el.dataset || !el.dataset.k) return;
            const i = Number(el.dataset.i), k = el.dataset.k;
            if (e.key === 'Enter' || (e.key === 'ArrowDown' && !el.list)) { e.preventDefault(); el.blur(); focusCell(Math.min(lines.length - 1, i + 1), k); }
            else if (e.key === 'ArrowUp' && !el.list) { e.preventDefault(); focusCell(Math.max(0, i - 1), k); }
          });
          // Paste mula sa Excel: tab-separated na mga row, simula sa cell na ito
          sheet.addEventListener('paste', (e) => {
            const el = e.target;
            if (!el.dataset || !el.dataset.k) return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
            e.preventDefault();
            const rows = XLSXLite.parseDelimited(text);
            pasteGrid(rows, Number(el.dataset.i), COLS.findIndex((c) => c.k === el.dataset.k));
          });
          sheet.addEventListener('click', (e) => {
            const b = e.target.closest('[data-rm]');
            if (!b) return;
            lines.splice(Number(b.dataset.rm), 1);
            ensureBlank();
            drawSheet();
          });
        }

        function pasteGrid(rows, startRow, startCol) {
          // Kung may header na kilala, gamitin ang mapping; kung wala, ayon sa posisyon
          const mapped = mapHeader(rows[0] || []);
          if (mapped) rows = rows.slice(1);
          rows.forEach((r, ri) => {
            const i = startRow + ri;
            while (lines.length <= i) lines.push(blankLine());
            const l = lines[i];
            if (mapped) {
              Object.keys(mapped).forEach((k) => { if (k !== 'amount' && r[mapped[k]] != null) l[k] = String(r[mapped[k]]).trim(); });
              if (mapped.amount != null && !mapped.cost && num(l.qty)) l.cost = String(Math.round(num(r[mapped.amount]) / num(l.qty) * 100) / 100);
            } else {
              r.forEach((v, ci) => { const c = COLS[startCol + ci]; if (c) l[c.k] = String(v).trim(); });
            }
            if (l.cost) l.cost = String(num(l.cost));
            if (l.qty) l.qty = String(num(l.qty));
            if (l.price) l.price = String(num(l.price));
            match(i, l.barcode ? 'barcode' : 'name');
            if (!l.productId && l.name) match(i, 'name');
          });
          ensureBlank();
          drawSheet();
          K().toast(t('Naidagdag ang {n} row', { n: rows.length }));
        }

        drawSheet();

        if (editable) {
          $('#rScan', m).onclick = async () => {
            try {
              const code = await Scanner.scan();
              if (!code) return;
              let i = lines.findIndex((l) => l.barcode === code);
              if (i >= 0) { lines[i].qty = String(num(lines[i].qty) + 1); }
              else {
                i = lines.length - 1;
                lines[i].barcode = code;
                match(i, 'barcode');
                if (!lines[i].qty) lines[i].qty = '1';
              }
              ensureBlank(); drawSheet();
              focusCell(i, lines[i].productId ? 'qty' : 'name');
            } catch (err) { K().toast(err.message, true); }
          };
          $('#rPaste', m).onclick = async () => {
            let text = '';
            try { text = await navigator.clipboard.readText(); } catch (err) { /* walang permiso */ }
            if (!text) {
              text = await K().promptArea(t('I-paste dito ang mga row mula sa Excel'), t('Kopyahin ang mga row sa Excel (kasama ang header kung meron: name, barcode, qty, cost, price, unit), tapos i-paste dito.'));
            }
            if (!text) return;
            const firstEmpty = lines.findIndex((l) => !l.name && !l.barcode);
            pasteGrid(XLSXLite.parseDelimited(text), firstEmpty < 0 ? lines.length : firstEmpty, 0);
          };
          $('#rImport', m).onclick = () => $('#rFile', m).click();
          $('#rFile', m).addEventListener('change', async (e) => {
            const f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            try {
              const rows = await XLSXLite.readFile(f);
              if (!mapHeader(rows[0] || [])) { K().toast(t('Walang header na "name" at "qty" sa file. Tingnan ang unang row.'), true); return; }
              const firstEmpty = lines.findIndex((l) => !l.name && !l.barcode);
              pasteGrid(rows, firstEmpty < 0 ? lines.length : firstEmpty, 0);
            } catch (err) { K().toast(err.message, true); }
          });

          const collect = () => {
            rec.supplier = $('#rSup', m).value.trim();
            rec.invoiceNo = $('#rInv', m).value.trim();
            rec.date = $('#rDate', m).value;
            rec.receivedBy = $('#rBy', m).value.trim();
            rec.notes = $('#rNotes', m).value.trim();
            rec.lines = lines.filter((l) => l.name.trim()).map((l) => ({
              productId: l.productId && K().byId(l.productId) ? l.productId : '',
              barcode: l.barcode.trim(), name: l.name.trim(), unit: l.unit.trim(),
              qty: Math.round(num(l.qty) * 1000) / 1000, cost: l.cost === '' ? '' : Math.round(num(l.cost) * 100) / 100,
              price: l.price === '' ? '' : Math.round(num(l.price) * 100) / 100,
            }));
            rec.total = Math.round(rec.lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
          };
          const ensureId = async () => {
            if (!rec.id) rec.id = K().uid();
            if (!rec.no) { rec.no = (await DB.getMeta('rcvSeq', 0)) + 1; await DB.setMeta('rcvSeq', rec.no); }
            rec.time = rec.time || Date.now();
          };

          $('#rDraft', m).onclick = async () => {
            collect();
            await ensureId();
            rec.status = 'draft';
            await DB.put('receivings', rec);
            close(); render(); K().toast(t('Na-save ang draft RCV #{n}', { n: rec.no }));
          };
          $('#rPost', m).onclick = async () => {
            collect();
            if (!rec.lines.length) { K().toast(t('Wala pang item'), true); return; }
            const bad = rec.lines.find((l) => !(l.qty > 0));
            if (bad) { K().toast(t('Lagyan ng dami ang {x}', { x: bad.name }), true); return; }
            const noPrice = rec.lines.find((l) => !l.productId && !(num(l.price) > 0));
            if (noPrice) { K().toast(t('Bagong paninda si {x}: lagyan ng presyo ng benta', { x: noPrice.name }), true); return; }
            const dupBar = rec.lines.find((l) => !l.productId && l.barcode && K().byBarcode(l.barcode));
            if (dupBar) { K().toast(t('Gamit na ang barcode na {b}', { b: dupBar.barcode }), true); return; }
            const newCount = rec.lines.filter((l) => !l.productId).length;
            const ok = await K().confirmBox(
              t('I-post ang receiving?'),
              t('Madadagdag ang stock ng {n} paninda (total {tot}).', { n: rec.lines.length, tot: money(rec.total) }) +
                (newCount ? ' ' + t('{n} ang bagong paninda na gagawin.', { n: newCount }) : '') + ' ' + t('Ia-update din ang puhunan at presyo.'),
              t('I-post'));
            if (!ok) return;
            await ensureId();
            try {
              await DB.postReceiving(rec);
              await K().reloadProducts();
              close(); render();
              K().toast(t('Na-post ang RCV #{n}. Nadagdag ang stock.', { n: rec.no }));
              open(await DB.get('receivings', rec.id));
            } catch (err) { K().toast(err.message, true); }
          };
          const del = $('#rDel', m);
          if (del) del.onclick = async () => {
            if (!(await K().confirmBox(t('Burahin ang draft?'), t('Hindi pa ito naidagdag sa stock.'), t('Burahin'), true))) return;
            await DB.del('receivings', rec.id);
            close(); render();
          };
          const pd = $('#rPrintDraft', m);
          if (pd) pd.onclick = () => { collect(); printSlip(rec); };
        } else {
          const v = $('#rVoid', m);
          if (v) v.onclick = async () => {
            if (!(await K().requireAdmin())) return;
            if (!(await K().confirmBox(t('I-void ang RCV #{n}?', { n: rec.no }), t('Babawasan ulit ang stock ng mga paninda dito. Hindi ibabalik ang lumang puhunan at presyo.'), t('I-void'), true))) return;
            await DB.voidReceiving(rec.id);
            await K().reloadProducts();
            close(); render(); K().toast(t('Na-void ang RCV #{n}', { n: rec.no }));
          };
          $('#rPrint', m).onclick = () => printSlip(rec);
          $('#rXlsx', m).onclick = () => exportXlsx(rec);
        }
      }
    );
  }

  function mapHeader(row) {
    const norm = row.map((h) => String(h || '').trim().toLowerCase());
    const out = {};
    Object.keys(ALIAS).forEach((k) => {
      const i = norm.findIndex((h) => ALIAS[k].includes(h));
      if (i >= 0) out[k] = i;
    });
    // "price" lang at walang "cost": sa invoice ng supplier, iyon ang puhunan
    if (out.price != null && out.cost == null && norm[out.price] === 'price') { out.cost = out.price; delete out.price; }
    if (out.cost == null && norm.includes('price')) out.cost = norm.indexOf('price');
    return out.name != null && (out.qty != null || out.cost != null) ? out : null;
  }

  // ---------------------------------------------------------------- print / export
  async function printSlip(rec) {
    const { S, t, toast } = K();
    const p = S.printer;
    const doc = Receipt.slipDoc(S.store, rec);
    try {
      if (p.mode === 'none' || p.mode === 'system') { await Printer.printHtml(K().receiptDoc(Receipt.toHtml(doc))); return; }
      toast(t('Nagpi-print…'));
      await Printer.sendBytes(p, await Receipt.bytes(doc, { paper: p.paper }));
      toast(t('Na-print ang receiving slip'));
    } catch (e) { toast(t('Hindi nag-print: {e}', { e: e.message }), true); }
  }

  function exportXlsx(rec) {
    const { t, num, saveBlob } = K();
    const rows = [['barcode', 'name', 'unit', 'qty', 'cost', 'price', 'amount']].concat(
      rec.lines.map((l) => [l.barcode || '', l.name, l.unit || '', num(l.qty), num(l.cost), l.price === '' ? '' : num(l.price), lineTotal(l)]));
    rows.push(['', t('TOTAL'), '', '', '', '', rec.total]);
    saveBlob('receiving-' + rec.no + (rec.invoiceNo ? '-' + rec.invoiceNo.replace(/[^\w-]+/g, '') : '') + '.xlsx', XLSXLite.write(rows, 'RCV ' + rec.no));
  }

  function bind() {
    const { $, $$ } = K();
    $('#newRcv').onclick = newReceiving;
    $$('#rcvFilters .chip').forEach((c) => c.addEventListener('click', () => { filter = c.dataset.f; render(); }));
    $('#rcvTemplate').onclick = () => {
      const rows = [['barcode', 'name', 'unit', 'qty', 'cost', 'price'], ['4800000000011', 'Halimbawa: Kape 3-in-1', 'sachet', 100, 9.5, 12]];
      K().saveBlob('receiving-template.xlsx', XLSXLite.write(rows, 'Receiving'));
    };
  }

  window.Receiving = { render, bind, newReceiving };
})();
