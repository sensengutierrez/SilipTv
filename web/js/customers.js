/* Suki (customers): contact, utang at bayad, at history ng bili. */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const C = { filter: 'all', list: [], info: {} };

  // ---------- data ----------
  /** Kuwenta ng balanse, kabuuang bili at huling bili ng bawat suki. */
  async function summarize() {
    const [customers, sales, payments] = await Promise.all([DB.all('customers'), DB.all('sales'), DB.all('payments')]);
    const info = {};
    customers.forEach((c) => { info[c.id] = { balance: 0, spent: 0, count: 0, last: 0, paid: 0 }; });
    sales.forEach((s) => {
      const x = s.customerId && info[s.customerId];
      if (!x || s.voided) return;
      x.spent += s.total; x.count++; x.last = Math.max(x.last, s.time);
      x.balance += Number(s.credit) || 0;
    });
    payments.forEach((p) => {
      const x = info[p.customerId];
      if (!x || p.voided) return;
      x.balance -= Number(p.amount) || 0; x.paid += Number(p.amount) || 0;
      x.last = Math.max(x.last, p.time);
    });
    Object.values(info).forEach((x) => { x.balance = Math.round(x.balance * 100) / 100; });
    C.list = customers.sort((a, b) => a.name.localeCompare(b.name));
    C.info = info;
    return { customers: C.list, info };
  }

  async function balance(id) {
    if (!id) return 0;
    const { sales, payments } = await DB.customerLedger(id);
    let b = 0;
    sales.forEach((s) => { if (!s.voided) b += Number(s.credit) || 0; });
    payments.forEach((p) => { if (!p.voided) b -= Number(p.amount) || 0; });
    return Math.round(b * 100) / 100;
  }

  // ---------- listahan ----------
  async function render() {
    const { $, $$, t, esc, money, fmtDateTime } = K();
    await summarize();
    const q = ($('#custSearch').value || '').trim().toLowerCase();
    $$('#custFilters .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === C.filter));
    let list = C.list;
    if (q) list = list.filter((c) => (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q));
    if (C.filter === 'debt') list = list.filter((c) => C.info[c.id].balance > 0).sort((a, b) => C.info[b.id].balance - C.info[a.id].balance);
    if (C.filter === 'recent') list = list.filter((c) => C.info[c.id].last).sort((a, b) => C.info[b.id].last - C.info[a.id].last);
    const debtors = C.list.filter((c) => C.info[c.id].balance > 0);
    const totalDebt = debtors.reduce((s, c) => s + C.info[c.id].balance, 0);
    $('#custStats').innerHTML =
      '<div class="stat"><div class="k">' + esc(t('Bilang ng suki')) + '</div><div class="v">' + C.list.length + '</div></div>' +
      '<div class="stat' + (totalDebt > 0 ? ' warn' : '') + '"><div class="k">' + esc(t('Kabuuang utang')) + '</div><div class="v">' + money(totalDebt) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('May utang')) + '</div><div class="v">' + debtors.length + '</div></div>';
    if (!C.list.length) {
      $('#custList').innerHTML = '<div class="card"><h3>' + esc(t('Wala pang suki')) + '</h3><p class="muted">' +
        esc(t('Magdagdag ng suki para ma-record ang utang, mapadalhan ng resibo sa WhatsApp o email, at makita ang history ng bili nila.')) + '</p></div>';
      return;
    }
    $('#custList').innerHTML = list.length ? list.map((c) => {
      const x = C.info[c.id];
      return '<button type="button" class="item" data-id="' + c.id + '"><span class="avatar">' + esc(initials(c.name)) + '</span><span class="grow">' +
        '<div class="nm">' + esc(c.name) + '</div>' +
        '<div class="meta">' + esc([c.phone, c.email].filter(Boolean).join(' · ') || t('Walang contact')) +
        (x.last ? ' · ' + esc(t('Huli: {d}', { d: fmtDateTime(x.last) })) : '') + '</div></span>' +
        '<span class="right">' + (x.balance > 0 ? '<span class="badge low">' + esc(t('Utang')) + ' ' + money(x.balance) + '</span>'
          : x.balance < 0 ? '<span class="badge">' + esc(t('Sobra')) + ' ' + money(-x.balance) + '</span>' : '') +
        '<div class="meta">' + money(x.spent) + '</div></span></button>';
    }).join('') : '<p class="muted">' + esc(t('Walang nahanap.')) + '</p>';
    $$('#custList .item').forEach((b) => b.addEventListener('click', () => view(b.dataset.id)));
  }

  function initials(name) {
    const w = String(name || '?').trim().split(/\s+/);
    return ((w[0] || '?').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
  }

  // ---------- form ----------
  function edit(c) {
    const { $, t, esc, modal, toast, uid } = K();
    const isNew = !c || !c.id;
    c = { name: '', phone: '', email: '', address: '', note: '', limit: '', ...(c || {}) };
    return new Promise((resolve) => {
      let saved = null;
      modal(
        '<h2>' + esc(isNew ? t('Bagong suki') : t('I-edit ang suki')) + '</h2>' +
        '<label class="field"><span>' + esc(t('Pangalan')) + '</span><input id="cName" type="text" value="' + esc(c.name) + '" autocomplete="off"></label>' +
        '<div class="field-row"><label class="field"><span>' + esc(t('Mobile / WhatsApp')) + '</span><input id="cPhone" type="tel" value="' + esc(c.phone) + '" placeholder="09171234567"></label>' +
        '<label class="field"><span>Email</span><input id="cEmail" type="email" value="' + esc(c.email) + '" placeholder="name@email.com"></label></div>' +
        '<p class="muted small">' + esc(t('Para sa labas ng Pilipinas, ilagay ang country code, hal. +973 3xxx xxxx.')) + '</p>' +
        '<label class="field"><span>' + esc(t('Address (puwedeng wala)')) + '</span><input id="cAddr" type="text" value="' + esc(c.address) + '"></label>' +
        '<div class="field-row"><label class="field"><span>' + esc(t('Limit ng utang (puwedeng wala)')) + '</span><input id="cLimit" type="text" inputmode="decimal" value="' + esc(c.limit) + '"></label><span></span></div>' +
        '<label class="field"><span>' + esc(t('Tala (puwedeng wala)')) + '</span><input id="cNote" type="text" value="' + esc(c.note) + '"></label>' +
        '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>' +
        '<button class="btn primary" id="cSave" type="button">' + esc(t('I-save')) + '</button></div>',
        (m, close) => {
          setTimeout(() => $('#cName', m).focus(), 60);
          $('#cSave', m).onclick = async () => {
            const name = $('#cName', m).value.trim();
            if (!name) { toast(t('Ilagay ang pangalan'), true); return; }
            const rec = {
              ...c, id: c.id || uid(), name,
              phone: $('#cPhone', m).value.trim(), email: $('#cEmail', m).value.trim(),
              address: $('#cAddr', m).value.trim(), note: $('#cNote', m).value.trim(),
              limit: $('#cLimit', m).value.trim() === '' ? '' : K().num($('#cLimit', m).value),
              created: c.created || Date.now(), updated: Date.now(),
            };
            await DB.put('customers', rec);
            saved = rec;
            close();
            toast(isNew ? t('Naidagdag ang {x}', { x: name }) : t('Na-save'));
          };
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); resolve(saved); } });
          obs.observe(document.body, { childList: true });
        }
      );
    });
  }

  // ---------- detalye ----------
  function reminderText(c, bal) {
    const { S, t, money } = K();
    return t('Hi {n}! Paalala lang po mula sa {s}: ang balanse ninyo ay {b}. Salamat po!', { n: c.name, s: S.store.name || t('Tindahan'), b: money(bal) });
  }

  async function view(id) {
    const { $, $$, t, esc, money, fmtDateTime, modal, confirmBox, toast } = K();
    const c = await DB.get('customers', id);
    if (!c) return;
    const { sales, payments } = await DB.customerLedger(id);
    const bal = await balance(id);
    const spent = sales.filter((s) => !s.voided).reduce((s, x) => s + x.total, 0);
    const rows = sales.map((s) => ({ kind: 's', time: s.time, x: s }))
      .concat(payments.map((p) => ({ kind: 'p', time: p.time, x: p })))
      .sort((a, b) => b.time - a.time);
    const hist = rows.length ? rows.slice(0, 100).map((r) => {
      if (r.kind === 's') {
        const s = r.x;
        return '<button type="button" class="item" data-sale="' + s.id + '"><span class="grow"><div class="nm">#' + s.no + ' · ' + esc(fmtDateTime(s.time)) + '</div>' +
          '<div class="meta">' + esc(s.items.map((i) => i.name).join(', ').slice(0, 70)) + '</div></span><span class="right"><div class="pr">' + money(s.total) + '</div>' +
          (s.voided ? '<span class="badge void">VOID</span>' : s.credit ? '<span class="badge low">' + esc(t('Utang')) + ' ' + money(s.credit) + '</span>' : '<span class="meta">' + esc(Receipt.METHOD_LABEL(s.method || 'cash')) + '</span>') + '</span></button>';
      }
      const p = r.x;
      return '<button type="button" class="item" data-pay="' + p.id + '"><span class="grow"><div class="nm">' + esc(t('Bayad sa utang')) + ' · ' + esc(fmtDateTime(p.time)) + '</div>' +
        '<div class="meta">' + esc([Receipt.METHOD_LABEL(p.method || 'cash'), p.note].filter(Boolean).join(' · ')) + '</div></span>' +
        '<span class="right"><div class="pr ok">−' + money(p.amount) + '</div>' + (p.voided ? '<span class="badge void">VOID</span>' : '') + '</span></button>';
    }).join('') : '<p class="muted">' + esc(t('Wala pang bili.')) + '</p>';

    modal(
      '<div class="cust-head"><span class="avatar big">' + esc(initials(c.name)) + '</span><div><h2 style="margin:0">' + esc(c.name) + '</h2>' +
      '<div class="muted">' + esc([c.phone, c.email].filter(Boolean).join(' · ') || t('Walang contact')) + '</div>' +
      (c.address ? '<div class="muted small">' + esc(c.address) + '</div>' : '') + (c.note ? '<div class="muted small">' + esc(c.note) + '</div>' : '') + '</div></div>' +
      '<div class="stats three" style="margin-top:12px">' +
      '<div class="stat' + (bal > 0 ? ' warn' : '') + '"><div class="k">' + esc(bal < 0 ? t('Sobrang bayad') : t('Balanse (utang)')) + '</div><div class="v">' + money(Math.abs(bal)) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Kabuuang bili')) + '</div><div class="v">' + money(spent) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Bilang ng bili')) + '</div><div class="v">' + sales.filter((s) => !s.voided).length + '</div></div></div>' +
      (c.limit !== '' && c.limit != null && bal > Number(c.limit) ? '<p class="warn-note">' + esc(t('Lampas na sa limit ng utang ({x})', { x: money(c.limit) })) + '</p>' : '') +
      '<div class="btn-row">' +
      '<button class="btn primary" id="cvPay" type="button">' + esc(t('Tumanggap ng bayad')) + '</button>' +
      (c.phone ? '<button class="btn wa" id="cvWa" type="button">WhatsApp</button><button class="btn ghost" id="cvCall" type="button">' + esc(t('Tawagan')) + '</button>' : '') +
      (c.email ? '<button class="btn ghost" id="cvMail" type="button">Email</button>' : '') + '</div>' +
      '<h3 style="margin:16px 0 8px">' + esc(t('History')) + '</h3><div class="list hist">' + hist + '</div>' +
      '<div class="modal-actions wrap">' +
      '<button class="btn danger" id="cvDel" type="button">' + esc(t('Burahin')) + '</button>' +
      '<button class="btn ghost" id="cvEdit" type="button">' + esc(t('I-edit')) + '</button>' +
      '<button class="btn" data-close type="button">' + esc(t('Isara')) + '</button></div>',
      (m, close) => {
        const reopen = async () => { close(); await view(id); refresh(); };
        $('#cvPay', m).onclick = async () => {
          const r = await receivePayment(c, bal);
          if (r) { await reopen(); viewPayment(r.pay, c, reopen, r.balance); }
        };
        const wa = $('#cvWa', m); if (wa) wa.onclick = () => Share.whatsapp(c.phone, bal > 0 ? reminderText(c, bal) : t('Hi {n}!', { n: c.name }));
        const cl = $('#cvCall', m); if (cl) cl.onclick = () => Share.call(c.phone);
        const ml = $('#cvMail', m); if (ml) ml.onclick = () => Share.email(c.email, K().S.store.name || '', bal > 0 ? reminderText(c, bal) : '');
        $('#cvEdit', m).onclick = async () => { close(); await edit(c); view(id); refresh(); };
        $('#cvDel', m).onclick = async () => {
          const msg = bal > 0 ? t('May utang pa siyang {x}. Mawawala ang record ng suki pero mananatili ang mga benta.', { x: money(bal) }) : t('Mananatili ang mga benta sa Dashboard.');
          if (!(await confirmBox(t('Burahin si {x}?', { x: c.name }), msg, t('Burahin'), true))) return;
          await DB.del('customers', id);
          close(); refresh(); toast(t('Nabura'));
        };
        $$('[data-sale]', m).forEach((b) => b.addEventListener('click', async () => K().viewSale(await DB.get('sales', b.dataset.sale))));
        $$('[data-pay]', m).forEach((b) => b.addEventListener('click', () => viewPayment(payments.find((p) => p.id === b.dataset.pay), c, () => reopen())));
      }
    );
  }

  function refresh() {
    if (document.querySelector('#view-customers.on')) render();
    if (document.querySelector('#view-sales.on') && window.POS) window.POS.show('sales');
  }

  // ---------- bayad sa utang ----------
  function receivePayment(c, bal) {
    const { $, $$, t, esc, money, modal, toast, uid, num, r2 } = K();
    return new Promise((resolve) => {
      let done = null;
      let method = 'cash';
      modal(
        '<h2>' + esc(t('Bayad sa utang')) + '</h2><p class="muted">' + esc(c.name) + ' · ' + esc(t('Balanse')) + ': <b>' + money(bal) + '</b></p>' +
        '<label class="field"><span>' + esc(t('Halaga')) + '</span><input id="ppAmt" type="text" inputmode="decimal" autocomplete="off" value="' + (bal > 0 ? bal : '') + '"></label>' +
        '<div class="seg" id="ppMethod">' + ['cash', 'gcash', 'card'].map((k) => '<button type="button" data-m="' + k + '"' + (k === 'cash' ? ' class="on"' : '') + '>' + esc(Receipt.METHOD_LABEL(k)) + '</button>').join('') + '</div>' +
        '<label class="field"><span>' + esc(t('Tala (puwedeng wala)')) + '</span><input id="ppNote" type="text"></label>' +
        '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button>' +
        '<button class="btn primary" id="ppOk" type="button">' + esc(t('I-save ang bayad')) + '</button></div>',
        (m, close) => {
          const inp = $('#ppAmt', m);
          setTimeout(() => { inp.focus(); inp.select(); }, 60);
          $$('#ppMethod button', m).forEach((b) => b.addEventListener('click', () => { method = b.dataset.m; $$('#ppMethod button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
          $('#ppOk', m).onclick = async () => {
            const amount = r2(num(inp.value));
            if (amount <= 0) { toast(t('Ilagay ang halaga'), true); return; }
            const pay = { id: uid(), customerId: c.id, customerName: c.name, amount, method, note: $('#ppNote', m).value.trim(), time: Date.now(), cashier: K().S.store.cashier || '' };
            await DB.put('payments', pay);
            done = { pay, balance: r2(bal - amount) };
            close();
            toast(t('Na-record ang bayad na {x}', { x: money(amount) }));
          };
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); resolve(done); } });
          obs.observe(document.body, { childList: true });
        }
      );
    });
  }

  async function viewPayment(pay, c, after, knownBal) {
    if (!pay) return;
    const { $, t, esc, modal, confirmBox, toast } = K();
    const bal = knownBal != null ? knownBal : await balance(c.id);
    const doc = Receipt.paymentDoc(K().S.store, pay, c, bal);
    modal(
      Receipt.toHtml(doc) +
      '<div class="modal-actions wrap">' + sendButtons(c) +
      (pay.voided ? '' : '<button class="btn danger" id="pvVoid" type="button">' + esc(t('Void')) + '</button>') +
      '<button class="btn primary" data-close type="button">' + esc(t('Isara')) + '</button></div>',
      (m, close) => {
        bindSend(m, doc, c, t('Bayad sa utang'), 'bayad-' + pay.id);
        const vb = $('#pvVoid', m);
        if (vb) vb.onclick = async () => {
          if (!(await confirmBox(t('I-void ang bayad?'), t('Ibabalik sa utang ang halagang ito.'), t('I-void'), true))) return;
          pay.voided = Date.now();
          await DB.put('payments', pay);
          close(); toast(t('Na-void')); refresh(); if (after) after();
        };
      }
    );
  }

  // ---------- mga button sa pagpapadala (ginagamit din sa resibo ng benta) ----------
  function sendButtons(c) {
    const { S, t, esc } = K();
    return (S.printer.mode !== 'none' ? '<button class="btn ghost" data-send="print" type="button">🖨 ' + esc(t('Print')) + '</button>' : '') +
      '<button class="btn wa" data-send="wa" type="button">WhatsApp</button>' +
      '<button class="btn ghost" data-send="mail" type="button">Email</button>' +
      '<button class="btn ghost" data-send="img" type="button">' + esc(t('I-share (larawan)')) + '</button>';
  }

  function bindSend(m, doc, c, subject, fileName) {
    const { $$, S, t, toast, promptText } = K();
    const text = () => Receipt.toText(doc, 32);
    $$('[data-send]', m).forEach((b) => b.addEventListener('click', async () => {
      try {
        const k = b.dataset.send;
        if (k === 'print') { await K().printDoc(doc); return; }
        if (k === 'wa') {
          let phone = c && c.phone;
          if (!phone) {
            phone = await promptText(t('WhatsApp number (puwedeng blangko para pumili sa WhatsApp)'), '');
            if (phone == null) return;
          }
          Share.whatsapp(phone, '```\n' + text() + '\n```');
        }
        if (k === 'mail') {
          let to = c && c.email;
          if (!to) {
            to = await promptText(t('Email ng customer (puwedeng blangko)'), '');
            if (to == null) return;
          }
          Share.email(to, (S.store.name ? S.store.name + ' - ' : '') + subject, text());
        }
        if (k === 'img') {
          const r = await Share.shareImage(doc, fileName, '');
          if (r === 'download') toast(t('Na-save ang larawan ng resibo'));
        }
      } catch (e) { toast(e.message, true); }
    }));
  }

  // ---------- pagpili ng suki sa Cashier ----------
  function pick(currentId) {
    const { $, $$, t, esc, money, modal } = K();
    return new Promise(async (resolve) => {
      await summarize();
      let result;
      modal(
        '<h2>' + esc(t('Piliin ang suki')) + '</h2>' +
        '<div class="toolbar"><input id="pkQ" type="search" placeholder="' + esc(t('Hanapin ang pangalan o numero')) + '" autocomplete="off">' +
        '<button class="btn primary" id="pkNew" type="button">' + esc(t('+ Bago')) + '</button></div>' +
        '<div class="list pick-list" id="pkList"></div>' +
        '<div class="modal-actions">' + (currentId ? '<button class="btn" id="pkNone" type="button">' + esc(t('Walk-in (walang suki)')) + '</button>' : '') +
        '<button class="btn" data-close type="button">' + esc(t('Isara')) + '</button></div>',
        (m, close) => {
          const draw = () => {
            const q = $('#pkQ', m).value.trim().toLowerCase();
            const list = C.list.filter((c) => !q || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(q))
              .sort((a, b) => (C.info[b.id].last || 0) - (C.info[a.id].last || 0)).slice(0, 60);
            $('#pkList', m).innerHTML = list.length ? list.map((c) => {
              const x = C.info[c.id];
              return '<button type="button" class="item' + (c.id === currentId ? ' sel' : '') + '" data-id="' + c.id + '"><span class="avatar">' + esc(initials(c.name)) + '</span>' +
                '<span class="grow"><div class="nm">' + esc(c.name) + '</div><div class="meta">' + esc(c.phone || c.email || '') + '</div></span>' +
                (x.balance > 0 ? '<span class="badge low">' + money(x.balance) + '</span>' : '') + '</button>';
            }).join('') : '<p class="muted">' + esc(C.list.length ? t('Walang nahanap.') : t('Wala pang suki. Pindutin ang "+ Bago".')) + '</p>';
            $$('#pkList .item', m).forEach((b) => b.addEventListener('click', () => { result = C.list.find((c) => c.id === b.dataset.id); close(); }));
          };
          draw();
          $('#pkQ', m).addEventListener('input', draw);
          setTimeout(() => $('#pkQ', m).focus(), 60);
          $('#pkNew', m).onclick = async () => {
            const q = $('#pkQ', m).value.trim();
            const rec = await edit(/^[\d+ ]{7,}$/.test(q) ? { phone: q } : { name: q });
            if (rec) { result = rec; close(); }
          };
          const nb = $('#pkNone', m); if (nb) nb.onclick = () => { result = null; close(); };
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); resolve(result); } });
          obs.observe(document.body, { childList: true });
        }
      );
    });
  }

  async function exportXlsx() {
    const { S, t, toast, saveBlob, dayKey } = K();
    await summarize();
    const rows = [['name', 'phone', 'email', 'address', 'balance', 'total_bili', 'bilang_ng_bili', 'huling_bili', 'note']];
    C.list.forEach((c) => {
      const x = C.info[c.id];
      rows.push([c.name, c.phone || '', c.email || '', c.address || '', x.balance, Math.round(x.spent * 100) / 100, x.count, x.last ? dayKey(x.last) : '', c.note || '']);
    });
    try { await saveBlob('suki-' + ((S.store.name || 'pos').toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '-' + dayKey(Date.now()) + '.xlsx', XLSXLite.write(rows, 'Suki')); toast(t('Na-export')); }
    catch (e) { toast(e.message, true); }
  }

  function bind() {
    const { $, $$ } = K();
    $('#addCust').onclick = async () => { if (await edit(null)) render(); };
    $('#custSearch').addEventListener('input', render);
    $$('#custFilters .chip').forEach((c) => c.addEventListener('click', () => { C.filter = c.dataset.f; render(); }));
    $('#custExport').onclick = exportXlsx;
  }

  window.Customers = { render, bind, pick, edit, view, balance, summarize, sendButtons, bindSend, initials };
})();
