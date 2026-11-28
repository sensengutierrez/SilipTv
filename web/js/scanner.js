/* Pag-scan ng barcode gamit ang camera.
 * Sa Android app: scanner ng Google (mabilis, walang camera permission na kailangan).
 * Sa website: BarcodeDetector ng browser kung meron, kung wala ay ZXing.
 * Gumagana rin ang USB/Bluetooth barcode scanner (parang keyboard) sa search box.
 */
(function () {
  'use strict';
  const t = (k, v) => window.I18N.t(k, v);
  const A = window.AndroidPOS || null;
  let seq = 0;

  function nativeScan() {
    return new Promise((resolve, reject) => {
      const id = 'scan' + (++seq);
      const prev = window.__posScan;
      window.__posScan = function (cid, ok, code) {
        if (cid !== id) return prev && prev(cid, ok, code);
        window.__posScan = prev;
        if (ok) resolve(code || null); else reject(new Error(code || 'fallback'));
      };
      try { A.scan(id); } catch (e) { reject(e); }
    });
  }

  let overlay = null;

  function cameraScan() {
    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return reject(new Error(t('Walang camera access ang browser na ito (kailangan ng https).')));
      }
      overlay = document.createElement('div');
      overlay.className = 'scan-overlay';
      overlay.innerHTML =
        '<video playsinline muted></video><div class="scan-frame"></div>' +
        '<div class="scan-hint">' + t('Itapat ang barcode sa kahon') + '</div>' +
        '<button class="btn scan-close" type="button">' + t('Isara') + '</button>';
      document.body.appendChild(overlay);
      const video = overlay.querySelector('video');
      let stream = null, stopped = false, zx = null;

      function stop(result, err) {
        if (stopped) return;
        stopped = true;
        try { zx && zx.reset(); } catch (e) { /* wala */ }
        if (stream) stream.getTracks().forEach((t) => t.stop());
        overlay.remove(); overlay = null;
        if (err) reject(err); else resolve(result);
      }
      overlay.querySelector('.scan-close').onclick = () => stop(null);

      const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

      if ('BarcodeDetector' in window) {
        navigator.mediaDevices.getUserMedia(constraints).then(async (s) => {
          stream = s; video.srcObject = s; await video.play();
          let det;
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            det = new window.BarcodeDetector({ formats });
          } catch (e) { det = new window.BarcodeDetector(); }
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await det.detect(video);
              if (codes.length) return stop(codes[0].rawValue);
            } catch (e) { /* subukan ulit */ }
            setTimeout(tick, 120);
          };
          tick();
        }).catch((e) => stop(null, new Error(t('Hindi mabuksan ang camera: ') + e.message)));
      } else if (window.ZXing) {
        zx = new window.ZXing.BrowserMultiFormatReader();
        zx.decodeFromConstraints(constraints, video, (res) => { if (res) stop(res.getText()); })
          .then(() => { stream = video.srcObject; })
          .catch((e) => stop(null, new Error(t('Hindi mabuksan ang camera: ') + e.message)));
      } else {
        stop(null, new Error(t('Walang barcode scanner sa browser na ito.')));
      }
    });
  }

  function loadZx() {
    if (window.ZXing || 'BarcodeDetector' in window) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing.min.js';
      s.onload = s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  async function scan() {
    if (A && A.scan) {
      try { return await nativeScan(); } catch (e) { /* gamitin ang camera sa loob ng app */ }
    }
    await loadZx();
    const code = await cameraScan();
    if (code && navigator.vibrate) navigator.vibrate(60);
    return code;
  }

  window.Scanner = { scan };
})();
