/* Pagpapadala ng resibo/invoice: WhatsApp, Email, o share bilang larawan.
 * Walang server: binubuksan lang ang WhatsApp o email app na may laman nang resibo.
 */
(function () {
  'use strict';
  const t = (k, v) => window.I18N.t(k, v);
  const A = window.AndroidPOS || null;

  /** Numero para sa wa.me: digits lang. 09xxxxxxxxx (PH) -> 639xxxxxxxxx. */
  function waNumber(phone) {
    let d = String(phone || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
    d = d.replace(/\D/g, '');
    if (d.startsWith('00')) return d.slice(2);
    if (/^09\d{9}$/.test(d)) return '63' + d.slice(1);
    if (/^9\d{9}$/.test(d)) return '63' + d;
    return d;
  }

  function openUrl(url) {
    if (A && A.openUrl) { A.openUrl(url); return; }
    if (/^https?:/.test(url)) {
      const w = window.open(url, '_blank', 'noopener');
      if (!w) location.href = url;
    } else {
      location.href = url;
    }
  }

  function whatsapp(phone, text) {
    const n = waNumber(phone);
    openUrl('https://wa.me/' + n + '?text=' + encodeURIComponent(text));
  }

  function email(to, subject, body) {
    openUrl('mailto:' + encodeURIComponent(to || '').replace(/%40/g, '@') +
      '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || ''));
  }

  function sms(phone, text) {
    openUrl('sms:' + String(phone || '').replace(/[^\d+]/g, '') + '?body=' + encodeURIComponent(text));
  }

  function call(phone) { openUrl('tel:' + String(phone || '').replace(/[^\d+]/g, '')); }

  function canvasBlob(cv) {
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  }

  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /** Ibahagi ang resibo bilang larawan (share sheet ng phone). Kapag hindi kaya, ida-download ang larawan. */
  async function shareImage(doc, name, text) {
    const cv = await window.Receipt.toCanvas(doc, 80);
    const blob = await canvasBlob(cv);
    const file = name + '.png';
    if (A && A.shareFile) {
      A.shareFile(file, 'image/png', await blobToB64(blob), text || '');
      return 'ok';
    }
    try {
      const f = new File([blob], file, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], text: text || '', title: name });
        return 'ok';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'download';
  }

  window.Share = { waNumber, whatsapp, email, sms, call, shareImage, openUrl };
})();
