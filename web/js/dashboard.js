/* Dashboard: charts ng benta at tubo, paraan ng bayad, paubos na paninda, at mga may utang.
 * Simpleng SVG (walang library) para gumana offline.
 */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const PALETTE = ['var(--accent)', '#0f766e', '#c2410c', '#7c3aed', '#be185d'];

  function profitOf(s) {
    let cost = 0;
    s.items.forEach((it) => { cost += (it.cost === '' || it.cost == null ? it.price : Number(it.cost)) * it.qty; });
    return s.total - cost;
  }

  /** Hatiin ang benta kada oras (iisang araw) o kada araw. */
  function buckets(sales, from, to) {
    const { pad } = K();
    const day = 86400000;
    const single = to - from <= day + 3600000;
    const out = [];
    if (single) {
      let lo = 7, hi = 21;
      sales.forEach((s) => { const h = new Date(s.time).getHours(); lo = Math.min(lo, h); hi = Math.max(hi, h); });
      for (let h = lo; h <= hi; h++) out.push({ label: pad(h), from: from + h * 3600000, to: from + (h + 1) * 3600000, sales: 0, profit: 0, n: 0 });
    } else {
      for (let t0 = from; t0 < to; t0 += day) {
        const d = new Date(t0);
        out.push({ label: String(d.getDate()), sub: d.getDate() === 1 || t0 === from ? d.toLocaleDateString(K().locale(), { month: 'short' }) : '', from: t0, to: t0 + day, sales: 0, profit: 0, n: 0 });
      }
    }
    sales.forEach((s) => {
      const b = out.find((x) => s.time >= x.from && s.time < x.to);
      if (b) { b.sales += s.total; b.profit += profitOf(s); b.n++; }
    });
    return { list: out, single };
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function short(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(n));
  }

  function trendChart(bk, width) {
    const { esc, t, money } = K();
    const W = Math.max(300, Math.round(width || 640)), H = W < 500 ? 200 : 240, L = 44, R = 8, T = 12, B = 34;
    const list = bk.list;
    const max = niceMax(Math.max(1, ...list.map((b) => Math.max(b.sales, b.profit))));
    const minP = Math.min(0, ...list.map((b) => b.profit));
    const lo = minP < 0 ? -niceMax(-minP) : 0;
    const span = max - lo;
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / span);
    const step = (W - L - R) / list.length;
    const bw = Math.max(3, Math.min(34, step * 0.62));
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = lo + (span * i) / 4;
      g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text class="ax" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + short(v) + '</text>';
    }
    const every = Math.ceil(list.length / (bk.single ? 9 : 10));
    list.forEach((b, i) => {
      const x = L + step * i + (step - bw) / 2;
      const h = Math.max(0, y(0) - y(b.sales));
      g += '<rect class="b" x="' + x.toFixed(1) + '" y="' + y(b.sales).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3">' +
        '<title>' + esc(b.label + (bk.single ? ':00' : '') + ' · ' + t('Benta') + ' ' + money(b.sales) + ' · ' + t('Tubo') + ' ' + money(b.profit) + ' · ' + b.n + ' ' + t('resibo')) + '</title></rect>';
      if (i % every === 0 || i === list.length - 1) {
        g += '<text class="ax" x="' + (L + step * i + step / 2) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + esc(b.label + (bk.single ? 'h' : '')) + '</text>';
        if (b.sub) g += '<text class="ax" x="' + (L + step * i + step / 2) + '" y="' + (H - B + 29) + '" text-anchor="middle">' + esc(b.sub) + '</text>';
      }
    });
    const pts = list.map((b, i) => (L + step * i + step / 2).toFixed(1) + ',' + y(b.profit).toFixed(1));
    g += '<polyline class="ln" points="' + pts.join(' ') + '"/>';
    list.forEach((b, i) => { if (list.length <= 31) g += '<circle class="dot" cx="' + (L + step * i + step / 2).toFixed(1) + '" cy="' + y(b.profit).toFixed(1) + '" r="3"/>'; });
    return '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('Benta at tubo')) + '" dir="ltr">' + g + '</svg>' +
      '<div class="legend"><span><i class="sw b"></i>' + esc(t('Benta')) + '</span><span><i class="sw ln"></i>' + esc(t('Tubo')) + '</span></div>';
  }

  function donut(parts) {
    const { esc, money } = K();
    const total = parts.reduce((s, p) => s + p.v, 0);
    if (!total) return '';
    const R = 52, r = 32, cx = 64, cy = 64;
    let a0 = -Math.PI / 2, g = '';
    parts.forEach((p, i) => {
      if (!p.v) return;
      const frac = p.v / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const P = (a, rad) => (cx + rad * Math.cos(a)).toFixed(2) + ' ' + (cy + rad * Math.sin(a)).toFixed(2);
      const d = frac >= 0.9999
        ? 'M' + P(0, R) + ' A' + R + ' ' + R + ' 0 1 1 ' + P(Math.PI, R) + ' A' + R + ' ' + R + ' 0 1 1 ' + P(0, R) + ' M' + P(0, r) + ' A' + r + ' ' + r + ' 0 1 0 ' + P(Math.PI, r) + ' A' + r + ' ' + r + ' 0 1 0 ' + P(0, r) + 'Z'
        : 'M' + P(a0, R) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + P(a1, R) + ' L' + P(a1, r) + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + P(a0, r) + 'Z';
      g += '<path d="' + d + '" style="fill:' + PALETTE[i % PALETTE.length] + '" fill-rule="evenodd"><title>' + esc(p.label + ' ' + money(p.v)) + '</title></path>';
      a0 = a1;
    });
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 128 128">' + g + '</svg><div class="donut-legend">' +
      parts.filter((p) => p.v).map((p) => '<div><i class="sw" style="background:' + PALETTE[parts.indexOf(p) % PALETTE.length] + '"></i><span>' + esc(p.label) +
        '</span><b>' + money(p.v) + '</b><span class="muted">' + Math.round((p.v / total) * 100) + '%</span></div>').join('') + '</div></div>';
  }

  function delta(cur, prev) {
    const { esc, t } = K();
    if (!prev) return '';
    const p = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return '<div class="delta ' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% <span>' + esc(t('kumpara sa nakaraan')) + '</span></div>';
  }

  async function render(ctx) {
    const { $, $$, t, esc, money, num, S, qtyStr } = K();
    const valid = ctx.sales.filter((s) => !s.voided);
    const prev = ctx.prevSales.filter((s) => !s.voided);
    const total = valid.reduce((s, x) => s + x.total, 0);
    const prevTotal = prev.reduce((s, x) => s + x.total, 0);
    const profit = valid.reduce((s, x) => s + profitOf(x), 0);
    const prevProfit = prev.reduce((s, x) => s + profitOf(x), 0);
    const missingCost = valid.some((s) => s.items.some((it) => it.cost === '' || it.cost == null));
    const credit = valid.reduce((s, x) => s + (Number(x.credit) || 0), 0);
    const { customers, info } = await window.Customers.summarize();
    const debtors = customers.filter((c) => info[c.id].balance > 0).sort((a, b) => info[b.id].balance - info[a.id].balance);
    const totalDebt = debtors.reduce((s, c) => s + info[c.id].balance, 0);

    $('#salesStats').innerHTML =
      '<div class="stat main"><div class="k">' + esc(t('Kabuuang benta')) + '</div><div class="v">' + money(total) + '</div>' + delta(total, prevTotal) + '</div>' +
      '<div class="stat"><div class="k">' + esc(t('Tubo')) + (missingCost ? ' *' : '') + '</div><div class="v">' + money(profit) + '</div>' + delta(profit, prevProfit) + '</div>' +
      '<div class="stat"><div class="k">' + esc(t('Bilang ng resibo')) + '</div><div class="v">' + valid.length + '</div>' + delta(valid.length, prev.length) + '</div>' +
      '<div class="stat"><div class="k">' + esc(t('Average kada resibo')) + '</div><div class="v">' + money(valid.length ? total / valid.length : 0) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(t('Margin')) + '</div><div class="v">' + (total ? Math.round((profit / total) * 100) : 0) + '%</div></div>' +
      '<div class="stat' + (totalDebt > 0 ? ' warn' : '') + '"><div class="k">' + esc(t('Utang ng mga suki')) + '</div><div class="v">' + money(totalDebt) + '</div>' +
      (credit ? '<div class="delta"><span>' + esc(t('+{x} sa panahong ito', { x: money(credit) })) + '</span></div>' : '') + '</div>';
    $('#costNote').hidden = !missingCost;

    // Trend
    const bk = buckets(valid, ctx.from, ctx.to);
    $('#dashTrend').innerHTML = valid.length ? trendChart(bk, $('#dashTrend').clientWidth) : '<p class="muted">' + esc(t('Wala pang benta sa panahong ito.')) + '</p>';

    // Paraan ng bayad
    const by = { cash: 0, gcash: 0, card: 0, utang: 0 };
    valid.forEach((s) => {
      const m = s.method || 'cash';
      if (m === 'utang') { by.utang += Number(s.credit) || 0; by.cash += Number(s.cash) || 0; }
      else by[m] = (by[m] || 0) + s.total;
    });
    const parts = Object.keys(by).map((k) => ({ label: Receipt.METHOD_LABEL(k), v: Math.round(by[k] * 100) / 100 }));
    $('#dashMethods').innerHTML = donut(parts) || '<p class="muted">' + esc(t('Wala pang benta.')) + '</p>';

    // Paubos
    const low = S.products.filter((p) => num(p.stock) <= num(p.reorder)).sort((a, b) => num(a.stock) - num(b.stock));
    $('#dashLow').innerHTML = low.length ? low.slice(0, 8).map((p) =>
      '<div class="ti"><span>' + esc(p.name) + '</span><span class="badge ' + (num(p.stock) <= 0 ? 'out' : 'low') + '">' + qtyStr(num(p.stock)) + ' ' + esc(p.unit || '') + '</span></div>').join('') +
      (low.length > 8 ? '<p class="muted small">' + esc(t('at {n} pa', { n: low.length - 8 })) + '</p>' : '')
      : '<p class="muted">' + esc(t('Walang paubos na paninda.')) + '</p>';
    $('#dashLowCount').textContent = low.length ? '(' + low.length + ')' : '';

    // May utang
    $('#dashDebt').innerHTML = debtors.length ? debtors.slice(0, 6).map((c) =>
      '<button type="button" class="ti link-row" data-c="' + c.id + '"><span>' + esc(c.name) + '</span><b class="warn-t">' + money(info[c.id].balance) + '</b></button>').join('')
      : '<p class="muted">' + esc(t('Walang may utang.')) + '</p>';
    $$('#dashDebt [data-c]').forEach((b) => b.addEventListener('click', () => window.Customers.view(b.dataset.c)));

    // Pinakamabentang oras / araw
    const best = bk.list.slice().sort((a, b) => b.sales - a.sales)[0];
    $('#dashBest').textContent = best && best.sales ? (bk.single ? t('Pinakamabentang oras: {h}:00 ({x})', { h: best.label, x: money(best.sales) }) : t('Pinakamabentang araw: {d} ({x})', { d: new Date(best.from).toLocaleDateString(K().locale(), { month: 'short', day: 'numeric', weekday: 'short', numberingSystem: 'latn' }), x: money(best.sales) })) : '';
  }

  window.Dashboard = { render, profitOf };
})();
