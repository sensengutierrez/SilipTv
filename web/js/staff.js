/* Staff: may pangalan at PIN, lock screen, at admin-only na access.
 * Kapag walang naka-register na staff, bukas ang lahat (gaya ng dati).
 */
(function () {
  'use strict';
  const K = () => window.POSKIT;
  const ST = { list: [], lockTimer: null, lastActive: Date.now() };

  const ITER = 120000;
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const subtle = () => window.crypto && crypto.subtle && window.TextEncoder;
  /** Random na salt (crypto) para sa bawat PIN. */
  function newSalt() {
    if (window.crypto && crypto.getRandomValues) return hex(crypto.getRandomValues(new Uint8Array(16)));
    return K().uid() + Math.random().toString(36).slice(2);
  }
  /** PIN hash. Bago: "p2$" + PBKDF2-SHA256 (120k ulit), para mabagal hulaan ang PIN kahit makuha ang backup file.
   *  Luma (bago ang v2): SHA-256(salt:pin), o FNV kung walang WebCrypto. Nababasa pa rin at ina-upgrade pagka-login. */
  async function hashPin(pin, salt, legacy) {
    if (!legacy && subtle()) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
      return 'p2$' + hex(bits);
    }
    const data = salt + ':' + pin;
    if (subtle()) return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) { h ^= data.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'f' + h.toString(16);
  }
  function sameStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // ---------- limit sa maling PIN: 5 mali, tapos maghintay (30s, 60s, 120s ... hanggang 15 min) ----------
  const LOCK_KEY = 'pos-pin-fails';
  function failState() { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { n: 0, until: 0 }; } catch (e) { return ST.fails || { n: 0, until: 0 }; } }
  function saveFail(f) { ST.fails = f; try { localStorage.setItem(LOCK_KEY, JSON.stringify(f)); } catch (e) { /* wala */ } }
  /** Ilang segundo pa bago puwedeng sumubok ulit (0 kung puwede na). */
  function waitLeft() { const f = failState(); return Math.max(0, Math.ceil((f.until - Date.now()) / 1000)); }
  function noteFail() {
    const f = failState(); f.n += 1;
    if (f.n >= 5) f.until = Date.now() + Math.min(900, 30 * Math.pow(2, f.n - 5)) * 1000;
    saveFail(f);
  }
  const noteOk = () => saveFail({ n: 0, until: 0 });

  async function load() {
    ST.list = (await DB.all('staff')).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1));
    return ST.list;
  }
  const active = () => ST.list.filter((x) => x.active !== false);
  const enabled = () => active().length > 0;
  const current = () => K().S.user;
  const isAdmin = () => !enabled() || (current() && current().role === 'admin');

  /** Tingnan ang PIN. Kapag tama at luma ang hash, ina-upgrade sa PBKDF2. */
  async function check(person, pin) {
    if (!person || !person.pinHash) return false;
    const v2 = String(person.pinHash).startsWith('p2$');
    const ok = sameStr(person.pinHash, await hashPin(pin, person.salt, !v2));
    if (ok && !v2 && subtle()) {
      person.salt = newSalt();
      person.pinHash = await hashPin(pin, person.salt);
      await DB.put('staff', person);
    }
    return ok;
  }
  /** check() na may limit sa maling subok. Nagbabalik ng true, false, o 'wait'. */
  async function tryPin(person, pin) {
    if (waitLeft()) return 'wait';
    const ok = await check(person, pin);
    if (ok) noteOk(); else noteFail();
    return ok;
  }
  function failMsg(r) {
    const { t, toast } = K();
    const w = waitLeft();
    if (r === 'wait' || w) toast(t('Maraming maling PIN. Subukan ulit pagkalipas ng {n} segundo.', { n: w }), true);
    else toast(t('Mali ang PIN'), true);
  }

  // ---------- PIN pad ----------
  function pinPad(el, onDone) {
    const { t, esc } = K();
    let pin = '';
    el.innerHTML = '<div class="pin-dots"></div><div class="pin-pad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) =>
        '<button type="button" ' + (k === 'del' ? 'aria-label="Delete" ' : '') + 'data-k="' + k + '" class="' + (k === 'ok' ? 'ok' : k === 'del' ? 'del' : '') + '">' + (k === 'del' ? ICON('backspace', 'ic-lg') : k === 'ok' ? esc(t('OK')) : k) + '</button>').join('') + '</div>';
    const dots = el.querySelector('.pin-dots');
    const draw = () => { dots.innerHTML = pin ? Array.from(pin).map(() => '<i></i>').join('') : '<span class="muted">' + esc(t('Ilagay ang PIN')) + '</span>'; };
    draw();
    const press = (k) => {
      if (k === 'del') pin = pin.slice(0, -1);
      else if (k === 'ok') { if (pin) onDone(pin, () => { pin = ''; draw(); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); }); return; }
      else if (pin.length < 8) pin += k;
      draw();
    };
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    const onKey = (e) => {
      if (!document.body.contains(el)) { document.removeEventListener('keydown', onKey); return; }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
  }

  // ---------- Lock screen ----------
  function lock() {
    if (!enabled()) return;
    const { S, t, esc } = K();
    document.querySelectorAll('.modal-wrap').forEach((w) => w.remove());
    S.user = null;
    K().applyStore();
    let el = document.getElementById('lockScreen');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'lockScreen';
    el.className = 'lock';
    const st = S.store;
    el.innerHTML = '<div class="lock-card"><div class="lock-store"><span class="logo">' + (st.logo ? '<img alt="" src="' + esc(st.logo) + '">' : esc((st.name || 'T').charAt(0).toUpperCase())) + '</span>' +
      '<div><div class="store-name">' + esc(st.name || 'POS') + '</div><div class="muted">' + esc(t('Sino ang gagamit?')) + '</div></div></div>' +
      '<div class="lock-users">' + active().map((u) => '<button type="button" class="lock-user" data-id=\"' + escHtml(u.id) + '\"><span class="avatar">' + esc(window.Customers.initials(u.name)) + '</span><span>' + esc(u.name) + '</span>' +
        (u.role === 'admin' ? '<span class="badge">Admin</span>' : '') + '</button>').join('') + '</div><div class="lock-pin" hidden></div></div>';
    document.body.appendChild(el);
    el.querySelectorAll('.lock-user').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.lock-user').forEach((x) => x.classList.toggle('on', x === b));
      const u = ST.list.find((x) => x.id === b.dataset.id);
      const box = el.querySelector('.lock-pin');
      box.hidden = false;
      pinPad(box, async (pin, fail) => {
        const r = await tryPin(u, pin); if (r === true) unlock(u); else { fail(); failMsg(r); }
      });
    }));
    if (active().length === 1) el.querySelector('.lock-user').click();
  }

  function unlock(u) {
    const { S, t, toast } = K();
    S.user = u;
    const el = document.getElementById('lockScreen');
    if (el) el.remove();
    ST.lastActive = Date.now();
    K().applyStore();
    toast(t('Hello, {n}!', { n: u.name }));
    if (window.POS) window.POS.show('cashier');
  }

  /** Para sa void, settings, backup: admin lang. Kapag cashier, puwedeng mag-PIN ang admin. */
  function requireAdmin() {
    if (isAdmin()) return Promise.resolve(true);
    const { t, esc, modal } = K();
    const admins = active().filter((x) => x.role === 'admin');
    return new Promise((resolve) => {
      let ok = false;
      modal(
        '<h2>' + esc(t('Kailangan ng admin')) + '</h2><p class="muted">' + esc(t('Ipa-PIN sa admin para ituloy.')) + '</p>' +
        (admins.length > 1 ? '<select id="raWho">' + admins.map((a) => '<option value=\"' + escHtml(a.id) + '\">' + esc(a.name) + '</option>').join('') + '</select>' : '<p><b>' + esc(admins[0] ? admins[0].name : '') + '</b></p>') +
        '<div class="lock-pin" id="raPin"></div><div class="modal-actions"><button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button></div>',
        (m, close) => {
          pinPad(m.querySelector('#raPin'), async (pin, fail) => {
            const sel = m.querySelector('#raWho');
            const a = sel ? admins.find((x) => x.id === sel.value) : admins[0];
            const r = await tryPin(a, pin); if (r === true) { ok = true; close(); } else { fail(); failMsg(r); }
          });
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); resolve(ok); } });
          obs.observe(document.body, { childList: true });
        }
      );
    });
  }

  // ---------- Staff screen (Iba pa → Staff) ----------
  async function render() {
    const { $, $$, t, esc, S } = K();
    await load();
    const el = $('#staffList');
    $('#staffIntro').textContent = enabled()
      ? t('May lock ang POS. Pipili ng pangalan at maglalagay ng PIN bago gumamit. Admin lang ang makakapag-void, makakapagbago ng settings at makakapag-backup.')
      : t('Wala pang staff, kaya bukas ang POS sa lahat. Gumawa muna ng admin (ikaw), tapos idagdag ang mga cashier.');
    el.innerHTML = ST.list.map((u) =>
      '<button type="button" class="item" data-id=\"' + escHtml(u.id) + '\"><span class="avatar">' + esc(window.Customers.initials(u.name)) + '</span><span class="grow"><div class="nm">' + esc(u.name) + '</div>' +
      '<div class="meta">' + esc(u.role === 'admin' ? t('Admin') : t('Cashier')) + (u.active === false ? ' · ' + esc(t('Naka-disable')) : '') + (S.user && S.user.id === u.id ? ' · ' + esc(t('ikaw ngayon')) : '') + '</div></span>' +
      (u.role === 'admin' ? '<span class="badge">Admin</span>' : '') + '</button>').join('');
    $$('#staffList .item').forEach((b) => b.addEventListener('click', () => edit(ST.list.find((x) => x.id === b.dataset.id))));
    $('#addStaff').textContent = enabled() ? t('+ Bagong staff') : t('+ Gumawa ng admin');
    $('#lockNowBtn').hidden = !enabled();
    $('#autoLock').value = String(S.store.autoLock || 0);
    $('#autoLockRow').hidden = !enabled();
  }

  function edit(u) {
    const { $, t, esc, modal, toast, uid, S } = K();
    const first = !enabled();
    const isNew = !u;
    u = u || { name: '', role: first ? 'admin' : 'cashier', active: true };
    modal(
      '<h2>' + esc(isNew ? (first ? t('Gumawa ng admin') : t('Bagong staff')) : t('I-edit ang staff')) + '</h2>' +
      (first ? '<p class="muted">' + esc(t('Ikaw ang admin. Tandaan ang PIN mo: kailangan ito para sa void, settings at backup.')) + '</p>' : '') +
      '<label class="field"><span>' + esc(t('Pangalan')) + '</span><input id="uName" type="text" value="' + esc(u.name) + '" autocomplete="off"></label>' +
      '<div class="field-row"><label class="field"><span>' + esc(isNew ? t('PIN (4 hanggang 8 numero)') : t('Bagong PIN (blangko kung hindi papalitan)')) + '</span><input id="uPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label>' +
      '<label class="field"><span>' + esc(t('Tungkulin')) + '</span><select id="uRole"' + (first ? ' disabled' : '') + '><option value="cashier"' + (u.role !== 'admin' ? ' selected' : '') + '>' + esc(t('Cashier')) + '</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option></select></label></div>' +
      (isNew || first ? '' : '<label class="switch"><input type="checkbox" id="uActive"' + (u.active !== false ? ' checked' : '') + '><span>' + esc(t('Puwedeng gumamit ng POS')) + '</span></label>') +
      '<div class="modal-actions">' + (isNew ? '' : '<button class="btn danger" id="uDel" type="button">' + esc(t('Burahin')) + '</button>') +
      '<button class="btn" data-close type="button">' + esc(t('Huwag')) + '</button><button class="btn primary" id="uSave" type="button">' + esc(t('I-save')) + '</button></div>',
      (m, close) => {
        setTimeout(() => $('#uName', m).focus(), 60);
        const lastAdmin = () => active().filter((x) => x.role === 'admin' && x.id !== u.id).length === 0;
        $('#uSave', m).onclick = async () => {
          const name = $('#uName', m).value.trim();
          const pin = $('#uPin', m).value.trim();
          const role = first ? 'admin' : $('#uRole', m).value;
          const act = $('#uActive', m) ? $('#uActive', m).checked : true;
          if (!name) { toast(t('Ilagay ang pangalan'), true); return; }
          if ((isNew || pin) && !/^\d{4,8}$/.test(pin)) { toast(t('Ang PIN ay 4 hanggang 8 numero'), true); return; }
          if (!isNew && u.role === 'admin' && (role !== 'admin' || !act) && lastAdmin()) { toast(t('Kailangan ng kahit isang admin'), true); return; }
          const rec = { ...u, id: u.id || uid(), name, role, active: act, updated: Date.now(), created: u.created || Date.now() };
          if (pin) { rec.salt = newSalt(); rec.pinHash = await hashPin(pin, rec.salt); }
          await DB.put('staff', rec);
          await load();
          if (first || (S.user && S.user.id === rec.id)) { S.user = rec; K().applyStore(); }
          close(); render();
          toast(first ? t('Naka-on na ang lock. Ikaw ang admin.') : t('Na-save'));
        };
        const del = $('#uDel', m);
        if (del) del.onclick = async () => {
          if (u.role === 'admin' && lastAdmin()) { toast(t('Kailangan ng kahit isang admin'), true); return; }
          if (!(await K().confirmBox(t('Burahin si {x}?', { x: u.name }), t('Mananatili ang pangalan niya sa mga lumang resibo.'), t('Burahin'), true))) return;
          await DB.del('staff', u.id);
          close(); render();
        };
      }
    );
  }

  // ---------- auto-lock kapag walang galaw ----------
  function startAutoLock() {
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { ST.lastActive = Date.now(); }, true));
    setInterval(() => {
      const mins = Number(K().S.store.autoLock || 0);
      if (!mins || !enabled() || !current() || document.getElementById('lockScreen')) return;
      if (Date.now() - ST.lastActive > mins * 60000) lock();
    }, 15000);
  }

  function bind() {
    const { $, S } = K();
    $('#addStaff').onclick = () => edit(null);
    $('#lockNowBtn').onclick = lock;
    $('#lockBtn').onclick = lock;
    $('#autoLock').addEventListener('change', (e) => { S.store.autoLock = Number(e.target.value); DB.setMeta('store', S.store); });
    startAutoLock();
  }

  window.Staff = { load, enabled, isAdmin, current, lock, requireAdmin, render, bind };
})();
