/* Pag-print ng resibo.
 * - Sa Android app: Bluetooth printer na naka-pair sa phone (classic Bluetooth / SPP).
 * - Sa website (Chrome): Bluetooth Low Energy printer gamit ang Web Bluetooth.
 * - Kahit saan: "Ordinaryong print" (system print dialog), puwede rin i-save bilang PDF.
 */
(function () {
  'use strict';
  const t = (k, v) => window.I18N.t(k, v);
  const A = window.AndroidPOS || null;

  // Callback mula sa Android app
  const pending = {};
  let seq = 0;
  window.__posCb = function (id, ok, msg) {
    const p = pending[id];
    if (!p) return;
    delete pending[id];
    ok ? p.resolve(msg) : p.reject(new Error(msg || 'Hindi nag-print'));
  };
  function native(fn, ...args) {
    return new Promise((resolve, reject) => {
      const id = 'cb' + (++seq);
      pending[id] = { resolve, reject };
      try { A[fn](...args, id); } catch (e) { delete pending[id]; reject(e); }
    });
  }

  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---- Web Bluetooth (BLE) ----
  // Karaniwang service ng mga murang BLE thermal printer
  const BLE_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
  ];
  let ble = { device: null, ch: null };

  async function bleFindChar(device) {
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    const services = await server.getPrimaryServices();
    for (const s of services) {
      let chars = [];
      try { chars = await s.getCharacteristics(); } catch (e) { continue; }
      for (const c of chars) if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
    throw new Error(t('Walang mapag-print-an sa device na ito.'));
  }

  async function bleConnect() {
    if (!navigator.bluetooth) throw new Error(t('Walang Web Bluetooth ang browser na ito. Gamitin ang Chrome sa Android o computer, o ang Android app.'));
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    ble = { device, ch: await bleFindChar(device) };
    return { name: device.name || 'Bluetooth printer', id: device.id };
  }

  async function bleWrite(bytes) {
    if (!ble.device) {
      // Subukang balikan ang dating pinahintulutang printer (Chrome)
      if (navigator.bluetooth && navigator.bluetooth.getDevices) {
        const list = await navigator.bluetooth.getDevices();
        if (list.length) ble.device = list[0];
      }
      if (!ble.device) throw new Error(t('Pumili muna ng printer sa Printer tab.'));
    }
    if (!ble.ch || !ble.device.gatt.connected) ble.ch = await bleFindChar(ble.device);
    const ch = ble.ch;
    const chunk = 180;
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.slice(i, i + chunk);
      if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) {
        await ch.writeValueWithoutResponse(part);
        await new Promise((r) => setTimeout(r, 20));
      } else {
        await ch.writeValue(part);
      }
    }
  }

  // ---- Ordinaryong print (HTML) ----
  function printHtml(html) {
    if (A && A.printHtml) { A.printHtml(html); return Promise.resolve(); }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    return new Promise((resolve) => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* wala */ }
        setTimeout(() => { f.remove(); resolve(); }, 1000);
      }, 300);
    });
  }

  const Printer = {
    isApp: !!A,
    hasBle: !!navigator.bluetooth,

    /** Mga naka-pair na Bluetooth printer (Android app lang). */
    async pairedList() {
      if (!A) return [];
      const r = await native('btList');
      return JSON.parse(r || '[]');
    },
    bleConnect,

    /** Ipadala ang ESC/POS bytes sa napiling printer. */
    async sendBytes(cfg, bytes) {
      if (cfg.mode === 'bt') {
        if (!A) throw new Error(t('Sa Android app lang ito. Sa website, piliin ang "Bluetooth (BLE)".'));
        if (!cfg.address) throw new Error(t('Pumili muna ng printer sa Printer tab.'));
        await native('btPrint', cfg.address, toB64(bytes));
      } else if (cfg.mode === 'ble') {
        await bleWrite(bytes);
      } else {
        throw new Error(t('Walang napiling Bluetooth printer.'));
      }
    },
    printHtml,
  };

  window.Printer = Printer;
})();
