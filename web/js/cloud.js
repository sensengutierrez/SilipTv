/* Cloud sync at API para sa AI agents (Claude, ChatGPT, Gemini, Grok).
 * Opsyonal: kapag nakakonekta, ipinapadala ang mga pagbabago (benta, paninda, suki, bayad, receiving, shift)
 * sa cloud. Ang AI ay may read-only na access gamit ang API key. Hindi ipinapadala ang staff at PIN. */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const URL_BASE = 'https://ihtwvsjtxpxzaoogfjpd.supabase.co/functions/v1/pos';
  const KINDS = ['products', 'sales', 'customers', 'payments', 'receivings', 'shifts'];
  const CHUNK = 400;
  const C = { cfg: null, busy: false, again: false, timer: null, keys: null };

  const mcpUrl = (key) => URL_BASE + '/mcp' + (key ? '?key=' + encodeURIComponent(key) : '');
  const restUrl = URL_BASE + '/api';
  const openapiUrl = URL_BASE + '/api/openapi.json';

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + s.length.toString(36);
  }

  async function call(path, method, body, token) {
    const res = await fetch(URL_BASE + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }

  async function load() { C.cfg = await DB.getMeta('cloud', null); return C.cfg; }
  const connected = () => !!(C.cfg && C.cfg.token);
  const saveCfg = () => DB.setMeta('cloud', C.cfg);

  function storeDoc() {
    const st = K().S.store;
    return {
      name: st.name, address: st.address, phone: st.phone, currency: st.currency,
      decimals: Receipt.decimalsOf(st), methods: K().methods().map((m) => m.label),
    };
  }

  /** Ipadala ang nagbago lang (ikinukumpara sa huling naipadala). */
  async function sync() {
    if (!connected()) return;
    if (C.busy) { C.again = true; return; }
    if (navigator.onLine === false) return;
    C.busy = true;
    try {
      const sent = await DB.getMeta('cloudHashes', {});
      const now = {}, docs = [];
      const add = (kind, id, data) => {
        const key = kind + ':' + id, h = hash(JSON.stringify(data));
        now[key] = h;
        if (sent[key] !== h) docs.push({ kind, id: String(id), data, key, h });
      };
      add('store', 'store', storeDoc());
      for (const kind of KINDS) (await DB.all(kind)).forEach((r) => add(kind, r.id, r));
      const deleted = Object.keys(sent).filter((k) => !(k in now)).map((k) => { const i = k.indexOf(':'); return { kind: k.slice(0, i), id: k.slice(i + 1), key: k }; });
      for (let i = 0; i < docs.length; i += CHUNK) {
        const part = docs.slice(i, i + CHUNK);
        await call('/sync/push', 'POST', { docs: part.map(({ kind, id, data }) => ({ kind, id, data })) }, C.cfg.token);
        part.forEach((d) => { sent[d.key] = d.h; });
        await DB.setMeta('cloudHashes', sent);
      }
      for (let i = 0; i < deleted.length; i += CHUNK) {
        const part = deleted.slice(i, i + CHUNK);
        await call('/sync/push', 'POST', { deleted: part.map(({ kind, id }) => ({ kind, id })) }, C.cfg.token);
        part.forEach((d) => { delete sent[d.key]; });
        await DB.setMeta('cloudHashes', sent);
      }
      C.cfg.lastSync = Date.now(); C.cfg.error = '';
    } catch (e) {
      C.cfg.error = e.message || String(e);
      if (/device token/i.test(C.cfg.error)) C.cfg.error = K().t('Hindi na kilala ng cloud ang device na ito. Idiskonekta at ikonekta ulit.');
    } finally {
      C.busy = false;
      if (C.cfg) await saveCfg();
      if (isShown()) render();
    }
    if (C.again) { C.again = false; schedule(1000); }
  }

  function schedule(ms) {
    if (!connected()) return;
    clearTimeout(C.timer);
    C.timer = setTimeout(sync, ms == null ? 4000 : ms);
  }

  /** Bantayan ang pagsulat sa database para kusang mag-sync. */
  function watchDB() {
    const touch = () => schedule();
    const wrap1 = (name, test) => {
      const orig = DB[name];
      DB[name] = function () { const p = orig.apply(DB, arguments); if (!test || test.apply(null, arguments)) p.then(touch, () => {}); return p; };
    };
    wrap1('put', (store, val) => KINDS.includes(store) || (store === 'meta' && val && val.key === 'store'));
    wrap1('del', (store) => KINDS.includes(store));
    ['saveSale', 'voidSale', 'postReceiving', 'voidReceiving', 'importAll'].forEach((n) => { if (DB[n]) wrap1(n); });
  }

  async function init() {
    await load();
    watchDB();
    if (connected()) schedule(2500);
    setInterval(() => { if (connected()) sync(); }, 5 * 60 * 1000);
    window.addEventListener('online', () => schedule(1000));
  }

  // ---------- UI (nasa Backup tab, admin lang) ----------
  const isShown = () => { const el = document.getElementById('cloudCard'); return el && el.offsetParent !== null; };

  async function connect() {
    const { t, toast, S } = K();
    try {
      const r = await call('/sync/register', 'POST', { name: S.store.name || '' });
      C.cfg = { token: r.deviceToken, storeId: r.storeId, since: Date.now(), lastSync: 0, error: '' };
      await saveCfg();
      await DB.setMeta('cloudHashes', {});
      toast(t('Nakakonekta na sa cloud'));
      render();
      await sync();
    } catch (e) {
      toast(t('Hindi makakonekta: {e}', { e: e.message }), true);
    }
  }

  async function disconnect() {
    const { t, toast, confirmBox } = K();
    if (!(await confirmBox(t('Idiskonekta sa cloud?'), t('Buburahin ang kopya ng data sa cloud at hindi na gagana ang mga API key. Mananatili ang lahat ng data sa device na ito.'), t('Idiskonekta'), true))) return;
    try { await call('/sync/store', 'DELETE', undefined, C.cfg.token); } catch (e) { /* baka wala na sa cloud */ }
    C.cfg = null; C.keys = null;
    await DB.del('meta', 'cloud');
    await DB.del('meta', 'cloudHashes');
    toast(t('Nadiskonekta na'));
    render();
  }

  async function loadKeys() {
    try { C.keys = (await call('/sync/keys', 'GET', undefined, C.cfg.token)).keys.filter((k) => !k.revoked); }
    catch (e) { C.keys = null; C.keyError = e.message; }
  }

  async function createKey() {
    const { t, toast, promptText } = K();
    const label = await promptText(t('Pangalan ng API key'), t('hal. Claude'));
    if (label == null) return;
    try {
      const r = await call('/sync/keys', 'POST', { label: label || 'AI agent' }, C.cfg.token);
      await sync();
      showGuide(r.key);
      await loadKeys(); render(true);
    } catch (e) { toast(e.message, true); }
  }

  async function revokeKey(id) {
    const { t, confirmBox } = K();
    if (!(await confirmBox(t('Bawiin ang API key?'), t('Hindi na makakabasa ng data ang AI na gumagamit nito.'), t('Bawiin'), true))) return;
    await call('/sync/keys/' + encodeURIComponent(id), 'DELETE', undefined, C.cfg.token).catch(() => {});
    await loadKeys(); render(true);
  }

  function copy(text) {
    const { t, toast } = K();
    const done = () => toast(t('Nakopya'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* wala */ }
      ta.remove();
    }
  }

  /** Paano ikonekta ang AI. Kapag may bagong key, ipinapakita rin ito (isang beses lang). */
  function showGuide(key) {
    const { t, esc, modal, $$ } = K();
    const k = key || '<API key>';
    const field = (label, val, id) => '<label>' + esc(label) + '</label><div class="copy-row"><input readonly value="' + esc(val) + '" id="' + id + '"><button class="btn small" type="button" data-copy="' + id + '">' + esc(t('Kopyahin')) + '</button></div>';
    modal(
      '<h2>' + esc(key ? t('Bagong API key') : t('Paano ikonekta ang AI')) + '</h2>' +
      (key ? '<p class="warn-note">' + esc(t('Isang beses lang ipapakita ang key na ito. Kopyahin at itago. Kahit sino na may hawak nito ay makakabasa ng benta mo.')) + '</p>' + field(t('API key'), key, 'gKey') : '') +
      field(t('MCP URL (para sa Claude, ChatGPT at iba pa)'), mcpUrl(key ? key : ''), 'gMcp') +
      field(t('OpenAPI (REST)'), openapiUrl, 'gApi') +
      '<div class="guide">' +
      '<p><b>Claude</b>: ' + esc(t('Settings > Connectors > Add custom connector, at i-paste ang MCP URL.')) + '</p>' +
      '<p><b>ChatGPT</b>: ' + esc(t('Sa Settings > Apps & Connectors (Developer mode), gumawa ng connector at i-paste ang MCP URL. O sa Custom GPT > Actions, i-import ang OpenAPI URL at ilagay ang API key bilang Bearer.')) + '</p>' +
      '<p><b>Gemini, Grok</b>: ' + esc(t('Sa Gemini CLI, xAI API o ibang app na may MCP, gamitin ang MCP URL. Para sa REST, gamitin ang OpenAPI URL at ang header na Authorization: Bearer {k}.', { k: key ? 'tpos_xxxx' : k })) + '</p>' +
      '<p class="muted">' + esc(t('Read-only ang access: makikita ng AI ang benta, paninda at stock, suki at utang, at kaha. Hindi ito makakapagbago ng data. Hindi kasama ang staff at PIN.')) + '</p>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn primary" data-close type="button">OK</button></div>',
      (m) => $$('[data-copy]', m).forEach((b) => b.addEventListener('click', () => copy(m.querySelector('#' + b.dataset.copy).value)))
    );
  }

  async function render(skipKeys) {
    const el = document.getElementById('cloudCard');
    if (!el) return;
    const { t, esc, fmtDateTime } = K();
    if (!C.cfg) await load();
    const head = '<h3>' + esc(t('Cloud at API para sa AI')) + '</h3>';
    if (!connected()) {
      el.innerHTML = head +
        '<p class="muted">' + esc(t('Ikonekta para makita ng AI agent (Claude, ChatGPT, Gemini, Grok) ang benta, paninda, suki at kaha mo, at matanong mo sila tulad ng "magkano ang benta ngayong linggo?" o "ano ang dapat i-order?". Read-only ang access. Hindi ipinapadala ang staff at PIN.')) + '</p>' +
        '<div class="btn-row"><button class="btn primary" id="cloudConnect" type="button">' + esc(t('Ikonekta sa cloud')) + '</button></div>';
      el.querySelector('#cloudConnect').onclick = connect;
      return;
    }
    if (!skipKeys) await loadKeys();
    const st = C.busy ? t('Nagsi-sync…') : C.cfg.error ? t('Hindi na-sync: {e}', { e: C.cfg.error })
      : C.cfg.lastSync ? t('Huling sync: {d}', { d: fmtDateTime(C.cfg.lastSync) }) : t('Hindi pa na-sync');
    const keys = C.keys == null
      ? '<p class="muted">' + esc(t('Hindi makuha ang listahan ng key. Tingnan ang internet.')) + '</p>'
      : C.keys.length
        ? C.keys.map((k) => '<div class="item"><div class="grow"><div class="nm">' + esc(k.label) + '</div><div class="meta">' + esc(k.prefix) + '… · ' +
            esc(k.last_used ? t('Huling gamit: {d}', { d: fmtDateTime(Date.parse(k.last_used)) }) : t('Hindi pa nagagamit')) + '</div></div>' +
            '<button class="btn small ghost" type="button" data-revoke="' + esc(k.id) + '">' + esc(t('Bawiin')) + '</button></div>').join('')
        : '<p class="muted">' + esc(t('Wala pang API key. Gumawa ng isa para sa bawat AI na ikokonekta mo.')) + '</p>';
    el.innerHTML = head +
      '<p class="backup-when' + (C.cfg.error ? ' old' : '') + '">' + esc(t('Nakakonekta')) + ' · ' + esc(st) + '</p>' +
      '<div class="btn-row"><button class="btn ghost" id="cloudSync" type="button">' + esc(t('I-sync ngayon')) + '</button>' +
      '<button class="btn ghost" id="cloudGuide" type="button">' + esc(t('Paano ikonekta ang AI')) + '</button></div>' +
      '<h4>' + esc(t('API keys')) + '</h4><div class="list">' + keys + '</div>' +
      '<div class="btn-row"><button class="btn primary" id="cloudKey" type="button">' + esc(t('+ Gumawa ng API key')) + '</button>' +
      '<button class="btn ghost danger-text" id="cloudOff" type="button">' + esc(t('Idiskonekta')) + '</button></div>';
    el.querySelector('#cloudSync').onclick = () => { const p = sync(); render(true); return p; };
    el.querySelector('#cloudGuide').onclick = () => showGuide();
    el.querySelector('#cloudKey').onclick = createKey;
    el.querySelector('#cloudOff').onclick = disconnect;
    el.querySelectorAll('[data-revoke]').forEach((b) => { b.onclick = () => revokeKey(b.dataset.revoke); });
  }

  window.Cloud = { init, render, sync, schedule, connected, mcpUrl, URL_BASE };
})();
