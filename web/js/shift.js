/* Kaha / shift: opening petty cash, cash in at cash out (gastos), at pagsara na may bilang ng pera (X at Z report). */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const SH = { open: null };

  async function loadOpen() {
    const all = await DB.all('shifts');
    SH.open = all.filter((s) => !s.closedAt).sort((a, b) => b.openedAt - a.openedAt)[0] || null;
    return SH.open;
  }
  const required = () => K().S.store.useShift !== false;

  /** Kuwenta ng shift: benta at bayad kada paraan, cash in/out, at inaasahang cash sa kaha. */
  async function summary(sh) {
    const [sales, payments] = await Promise.all([DB.all('sales'), DB.all('payments')]);
    const mine = sales.filter((s) => s.shiftId === sh.id);
    const valid = mine.filter((s) => !s.voided);
    const pays = payments.filter((p) => p.shiftId === sh.id && !p.voided);
    const byMethod = {};
    let cashSales = 0, credit = 0, total = 0, discount = 0;
    valid.forEach((s) => {
      total += s.total; discount += s.discount || 0;
      const m = s.method || 'cash';
      if (m === 'utang') { credit += Number(s.credit) || 0; cashSales += Number(s.cash) || 0; return; }
      const label = s.methodLabel || Receipt.METHOD_LABEL(m);
      byMethod[label] = (byMethod[label] || 0) + s.total;
      if (m === 'cash') cashSales += s.total;
    });
    let cashPayments = 0, otherPayments = 0;
    pays.forEach((p) => { if ((p.method || 'cash') === 'cash') cashPayments += p.amount; else otherPayments += p.amount; });
    const moves = sh.moves || [];
    const cashIn = moves.filter((x) => x.type === 'in').reduce((s, x) => s + x.amount, 0);
    const cashOut = moves.filter((x) => x.type === 'out').reduce((s, x) => s + x.amount, 0);
    const expected = K().r2((sh.openingCash || 0) + cashSales + cashPayments + cashIn - cashOut);
    return { count: valid.length, voids: mine.length - valid.length, total, discount, byMethod, cashSales, credit, cashPayments, otherPayments, cashIn, cashOut, expected };
  }

  function reportDoc(sh, sm, kind) {
    const { S, t, money, fmtDateTime } = K();
    const d = [];
    d.push({ t: 'text', s: S.store.name || t('Tindahan'), align: 'c', b: true });
    d.push({ t: 'text', s: kind === 'Z' ? t('Z REPORT (sarado ang shift)') : t('X REPORT (bukas pa ang shift)'), align: 'c', b: true, big: true });
    d.push({ t: 'rule' });
    d.push({ t: 'text', s: t('Shift #{n}', { n: sh.no }) });
    d.push({ t: 'text', s: t('Bukas') + ': ' + fmtDateTime(sh.openedAt) + (sh.openedBy ? ' · ' + sh.openedBy : '') });
    if (sh.closedAt) d.push({ t: 'text', s: t('Sarado') + ': ' + fmtDateTime(sh.closedAt) + (sh.closedBy ? ' · ' + sh.closedBy : '') });
    else d.push({ t: 'text', s: t('Ngayon') + ': ' + fmtDateTime(Date.now()) });
    d.push({ t: 'rule' });
    d.push({ t: 'lr', l: t('Bilang ng resibo'), r: String(sm.count) });
    if (sm.voids) d.push({ t: 'lr', l: t('Na-void'), r: String(sm.voids) });
    d.push({ t: 'lr', l: t('Kabuuang benta'), r: money(sm.total), b: true });
    if (sm.discount) d.push({ t: 'lr', l: t('Discount'), r: money(sm.discount) });
    Object.keys(sm.byMethod).forEach((k) => d.push({ t: 'lr', l: '  ' + k, r: money(sm.byMethod[k]) }));
    if (sm.credit) d.push({ t: 'lr', l: '  ' + t('Utang'), r: money(sm.credit) });
    if (sm.cashPayments || sm.otherPayments) d.push({ t: 'lr', l: t('Bayad sa utang'), r: money(sm.cashPayments + sm.otherPayments) });
    d.push({ t: 'rule' });
    d.push({ t: 'text', s: t('KAHA (CASH)'), b: true });
    d.push({ t: 'lr', l: t('Opening cash'), r: money(sh.openingCash || 0) });
    d.push({ t: 'lr', l: t('+ Cash na benta'), r: money(sm.cashSales) });
    if (sm.cashPayments) d.push({ t: 'lr', l: t('+ Cash na bayad sa utang'), r: money(sm.cashPayments) });
    if (sm.cashIn) d.push({ t: 'lr', l: t('+ Cash in'), r: money(sm.cashIn) });
    if (sm.cashOut) d.push({ t: 'lr', l: t('− Cash out / gastos'), r: money(sm.cashOut) });
    d.push({ t: 'lr', l: t('Dapat nasa kaha'), r: money(sm.expected), b: true });
    if (sh.closedAt) {
      d.push({ t: 'lr', l: t('Binilang'), r: money(sh.counted) });
      const diff = K().r2(sh.counted - sh.expected);
      d.push({ t: 'lr', l: diff < 0 ? t('KULANG') : diff > 0 ? t('SOBRA') : t('Sakto'), r: money(Math.abs(diff)), b: true });
      if (sh.closeNote) d.push({ t: 'text', s: sh.closeNote });
    }
    const moves = sh.moves || [];
    if (moves.length) {
      d.push({ t: 'rule' });
      moves.forEach((x) => d.push({ t: 'lr', l: (x.type === 'in' ? '+ ' : '− ') + (x.note || (x.type === 'in' ? t('Cash in') : t('Cash out'))), r: money(x.amount) }));
    }
    d.push({ t: 'feed' });
    d.push({ t: 'text', s: t('Pirma') + ': ____________________' });
    return d;
  }

  // ---------- buksan / isara ----------
  function openShift() {
    const { $, t, esc, modal, toast, uid, num, r2, money } = K();
    return new Promise(async (resolve) => {
      const last = (await DB.all('shifts')).filter((s) => s.closedAt).sort((a, b) => b.closedAt - a.closedAt)[0];
      let result = null;
      modal(
        '<h2>' + esc(t('Buksan ang shift')) + '</h2><p class="muted">' + esc(t('Ilagay ang perang nasa kaha bago magsimula (opening / petty cash).')) + '</p>' +
        '<label class="field"><span>' + esc(t('Opening cash')) + '</span><input id="osCash" type="text" inputmode="decimal" value="' + (last ? last.counted : '') + '" placeholder="0"></label>' +
        (last ? '<p class="muted small">' + esc(t('Huling binilang: {x}', { x: money(last.counted) })) + '</p>' : '') +
        '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button><button class="btn primary" id="osOk" type="button">' + esc(t('Buksan')) + '</button></div>',
        (m, close) => {
          const inp = $('#osCash', m);
          setTimeout(() => { inp.focus(); inp.select(); }, 60);
          const go = async () => {
            const n = ((await DB.getMeta('shiftSeq', 0)) || 0) + 1;
            await DB.setMeta('shiftSeq', n);
            const sh = { id: uid(), no: n, openedAt: Date.now(), openedBy: K().cashierName(), openedById: K().S.user ? K().S.user.id : '', openingCash: r2(num(inp.value)), moves: [] };
            await DB.put('shifts', sh);
            SH.open = sh; result = sh;
            close(); toast(t('Bukas na ang shift #{n}', { n }));
            K().applyStore();
          };
          $('#osOk', m).onclick = go;
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); resolve(result); } });
          obs.observe(document.body, { childList: true });
        }
      );
    });
  }

  /** Bago magbenta: siguraduhing may bukas na shift (kung naka-on). */
  async function ensureOpen() {
    if (!required()) return SH.open || (await loadOpen());
    if (SH.open || (await loadOpen())) return SH.open;
    return openShift();
  }

  function move(type) {
    const { $, t, esc, modal, toast, num, r2 } = K();
    if (!SH.open) return;
    modal(
      '<h2>' + esc(type === 'in' ? t('Cash in') : t('Cash out / gastos')) + '</h2>' +
      '<p class="muted">' + esc(type === 'in' ? t('Perang idinagdag sa kaha (hal. dagdag na barya).') : t('Perang kinuha sa kaha (hal. pambili ng yelo, pamasahe, delivery).')) + '</p>' +
      '<label class="field"><span>' + esc(t('Halaga')) + '</span><input id="mvAmt" type="text" inputmode="decimal"></label>' +
      '<label class="field"><span>' + esc(t('Para saan')) + '</span><input id="mvNote" type="text"></label>' +
      '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button><button class="btn primary" id="mvOk" type="button">' + esc(t('I-save')) + '</button></div>',
      (m, close) => {
        setTimeout(() => $('#mvAmt', m).focus(), 60);
        $('#mvOk', m).onclick = async () => {
          const amount = r2(num($('#mvAmt', m).value));
          if (amount <= 0) { toast(t('Ilagay ang halaga'), true); return; }
          SH.open.moves = (SH.open.moves || []).concat([{ type, amount, note: $('#mvNote', m).value.trim(), time: Date.now(), by: K().cashierName() }]);
          await DB.put('shifts', SH.open);
          close(); render();
        };
      }
    );
  }

  async function closeShift() {
    const { $, t, esc, modal, toast, num, r2, money } = K();
    if (!SH.open) return;
    const sh = SH.open;
    const sm = await summary(sh);
    modal(
      '<h2>' + esc(t('Isara ang shift #{n}', { n: sh.no })) + '</h2>' +
      '<div class="row-lr"><span>' + esc(t('Dapat nasa kaha')) + '</span><b>' + money(sm.expected) + '</b></div>' +
      '<label class="field"><span>' + esc(t('Binilang na cash sa kaha')) + '</span><input id="csCount" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<div class="row-lr" id="csDiff"></div>' +
      '<label class="field"><span>' + esc(t('Tala (puwedeng wala)')) + '</span><input id="csNote" type="text"></label>' +
      '<div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button><button class="btn primary" id="csOk" type="button">' + esc(t('Isara ang shift')) + '</button></div>',
      (m, close) => {
        const inp = $('#csCount', m);
        setTimeout(() => inp.focus(), 60);
        const diffEl = $('#csDiff', m);
        inp.addEventListener('input', () => {
          if (!inp.value.trim()) { diffEl.innerHTML = ''; return; }
          const d = r2(num(inp.value) - sm.expected);
          diffEl.innerHTML = '<span>' + esc(d < 0 ? t('Kulang') : d > 0 ? t('Sobra') : t('Sakto')) + '</span><b class="' + (d < 0 ? 'bad-t' : d > 0 ? 'warn-t' : 'ok-t') + '">' + money(Math.abs(d)) + '</b>';
        });
        $('#csOk', m).onclick = async () => {
          if (!inp.value.trim()) { toast(t('Ilagay ang binilang na cash'), true); return; }
          Object.assign(sh, { closedAt: Date.now(), closedBy: K().cashierName(), counted: r2(num(inp.value)), expected: sm.expected, closeNote: $('#csNote', m).value.trim(), summary: sm });
          await DB.put('shifts', sh);
          SH.open = null;
          close();
          K().applyStore();
          showReport(sh, 'Z');
          render();
        };
      }
    );
  }

  async function showReport(sh, kind) {
    const { t, esc, modal } = K();
    const sm = sh.closedAt && sh.summary ? sh.summary : await summary(sh);
    const doc = reportDoc(sh, sm, kind || (sh.closedAt ? 'Z' : 'X'));
    modal(
      Receipt.toHtml(doc) +
      '<div class="send-grid" style="margin-top:12px">' + window.Customers.sendButtons(null) + '</div>' +
      '<div class="modal-actions"><button class="btn primary" data-close type="button">' + esc(t('Isara')) + '</button></div>',
      (m) => window.Customers.bindSend(m, doc, null, t('Shift #{n}', { n: sh.no }), 'shift-' + sh.no)
    );
  }

  // ---------- Kaha screen ----------
  async function render() {
    const { $, $$, t, esc, money, fmtDateTime, S } = K();
    await loadOpen();
    $('#useShift').checked = required();
    const box = $('#shiftNow');
    if (!SH.open) {
      box.innerHTML = '<div class="card"><h3>' + esc(t('Walang bukas na shift')) + '</h3><p class="muted">' +
        esc(required() ? t('Bubuksan ito bago ang unang benta. Ilalagay ang opening cash (petty cash) na nasa kaha.') : t('Puwedeng magbenta kahit walang shift. Buksan para mabilang ang kaha.')) + '</p>' +
        '<button class="btn primary" id="shOpen" type="button">' + esc(t('Buksan ang shift')) + '</button></div>';
      $('#shOpen').onclick = async () => { await openShift(); render(); };
    } else {
      const sh = SH.open;
      const sm = await summary(sh);
      const row = (k, v, cls) => '<div class="row-lr' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><b>' + v + '</b></div>';
      box.innerHTML = '<div class="card shift-card"><div class="cart-head"><h3>' + esc(t('Shift #{n}', { n: sh.no })) + ' <span class="badge">' + esc(t('Bukas')) + '</span></h3>' +
        '<span class="muted small">' + esc(fmtDateTime(sh.openedAt) + (sh.openedBy ? ' · ' + sh.openedBy : '')) + '</span></div>' +
        '<div class="stats three"><div class="stat"><div class="k">' + esc(t('Benta')) + '</div><div class="v">' + money(sm.total) + '</div></div>' +
        '<div class="stat"><div class="k">' + esc(t('Resibo')) + '</div><div class="v">' + sm.count + '</div></div>' +
        '<div class="stat main"><div class="k">' + esc(t('Dapat nasa kaha')) + '</div><div class="v">' + money(sm.expected) + '</div></div></div>' +
        row(t('Opening cash'), money(sh.openingCash || 0)) + row(t('+ Cash na benta'), money(sm.cashSales)) +
        (sm.cashPayments ? row(t('+ Cash na bayad sa utang'), money(sm.cashPayments)) : '') +
        row(t('+ Cash in'), money(sm.cashIn)) + row(t('− Cash out / gastos'), money(sm.cashOut)) +
        Object.keys(sm.byMethod).filter((k) => k !== Receipt.METHOD_LABEL('cash')).map((k) => row(k, money(sm.byMethod[k]), 'muted-row')).join('') +
        (sm.credit ? row(t('Utang'), money(sm.credit), 'muted-row') : '') +
        '<div class="btn-row" style="margin-top:12px"><button class="btn ghost" id="shIn" type="button">' + esc(t('+ Cash in')) + '</button>' +
        '<button class="btn ghost" id="shOut" type="button">' + esc(t('− Cash out / gastos')) + '</button></div>' +
        '<div class="btn-row" style="margin-top:8px"><button class="btn ghost" id="shX" type="button">' + esc(t('X report')) + '</button>' +
        '<button class="btn primary" id="shClose" type="button">' + esc(t('Isara ang shift')) + '</button></div>' +
        ((sh.moves || []).length ? '<h3 style="margin-top:14px">' + esc(t('Cash in / out')) + '</h3>' + sh.moves.slice().reverse().map((x) =>
          '<div class="row-lr"><span>' + (x.type === 'in' ? '+ ' : '− ') + esc(x.note || '') + ' <span class="muted small">' + esc(fmtDateTime(x.time) + (x.by ? ' · ' + x.by : '')) + '</span></span><b>' + money(x.amount) + '</b></div>').join('') : '') +
        '</div>';
      $('#shIn').onclick = () => move('in');
      $('#shOut').onclick = () => move('out');
      $('#shX').onclick = () => showReport(sh, 'X');
      $('#shClose').onclick = closeShift;
    }
    const past = (await DB.all('shifts')).filter((s) => s.closedAt).sort((a, b) => b.closedAt - a.closedAt).slice(0, 30);
    $('#shiftHist').innerHTML = past.length ? past.map((s) => {
      const d = K().r2(s.counted - s.expected);
      return '<button type="button" class="item" data-id="' + s.id + '"><span class="grow"><div class="nm">' + esc(t('Shift #{n}', { n: s.no })) + ' · ' + esc(fmtDateTime(s.openedAt)) + '</div>' +
        '<div class="meta">' + esc((s.openedBy || '') + (s.closedBy && s.closedBy !== s.openedBy ? ' → ' + s.closedBy : '')) + '</div></span>' +
        '<span class="right"><div class="pr">' + money(s.summary ? s.summary.total : 0) + '</div>' +
        (d ? '<span class="badge ' + (d < 0 ? 'out' : 'low') + '">' + esc(d < 0 ? t('Kulang') : t('Sobra')) + ' ' + money(Math.abs(d)) + '</span>' : '<span class="badge">' + esc(t('Sakto')) + '</span>') + '</span></button>';
    }).join('') : '<p class="muted">' + esc(t('Wala pang saradong shift.')) + '</p>';
    $$('#shiftHist .item').forEach((b) => b.addEventListener('click', async () => showReport(await DB.get('shifts', b.dataset.id), 'Z')));
  }

  function bind() {
    const { $, S } = K();
    $('#useShift').addEventListener('change', (e) => { S.store.useShift = e.target.checked; DB.setMeta('store', S.store); render(); });
  }

  window.Shift = { loadOpen, ensureOpen, openShift, render, bind, current: () => SH.open };
})();
