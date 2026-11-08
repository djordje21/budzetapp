// Skener QR koda: kamera (ili slika iz galerije) → IPS račun ili fiskalni račun → popunjen unos.
import * as S from '../store.js?v=20261108114937';
import * as Sync from '../sync.js?v=20261108114937';
import { openSheet, toast, confirmSheet } from '../ui.js?v=20261108114937';
import { esc, fmtNum, currentMonthKey } from '../util.js?v=20261108114937';
import { parseQR, matchPlanItem, toLatin } from '../receipt.js?v=20261108114937';
import { paidTx } from '../pay.js?v=20261108114937';
import { openEntrySheet } from './entry.js?v=20261108114937';

const hasNative = () => 'BarcodeDetector' in window;
let jsQRLoaded = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return (jsQRLoaded ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/jsQR-1.4.0.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  }));
}

async function decodeSource(src, canvas) {
  if (hasNative()) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const codes = await det.detect(src);
      if (codes.length) return codes[0].rawValue;
      return null;
    } catch { /* pada na jsQR */ }
  }
  await loadJsQR();
  const w = src.videoWidth || src.naturalWidth || src.width;
  const h = src.videoHeight || src.naturalHeight || src.height;
  if (!w || !h) return null;
  const scale = Math.min(1, 1000 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return code?.data || null;
}

export function openScanner() {
  let stream = null, timer = null, done = false;
  const canvas = document.createElement('canvas');
  const stop = () => {
    done = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
  };

  openSheet({
    title: 'Skeniraj račun',
    body: `
      <div class="scanner" id="sc-box">
        <video id="sc-video" playsinline muted></video>
        <div class="scan-frame"></div><div class="scan-line"></div>
      </div>
      <p class="scan-msg">Uperi kameru u <b>QR kod</b> na fiskalnom računu<br>ili na računu za struju, telefon, Infostan…</p>
      <div class="btn-row">
        <button class="btn btn-ghost" id="sc-file">🖼️ Iz galerije</button>
        <button class="btn btn-ghost" id="sc-manual">Ručni unos</button>
      </div>
      <input type="file" id="sc-input" accept="image/*" hidden>`,
    onClose: stop,
    async onMount(el, close) {
      const video = el.querySelector('#sc-video');
      const finish = (text) => {
        if (done) return;
        stop();
        navigator.vibrate?.(60);
        close();
        setTimeout(() => handleScan(text), 230);
      };
      el.querySelector('#sc-manual').onclick = () => { stop(); close(); setTimeout(() => openEntrySheet(), 230); };
      const input = el.querySelector('#sc-input');
      el.querySelector('#sc-file').onclick = () => input.click();
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        const img = new Image();
        img.src = URL.createObjectURL(f);
        await img.decode().catch(() => {});
        const text = await decodeSource(img, canvas).catch(() => null);
        URL.revokeObjectURL(img.src);
        if (text) finish(text);
        else toast('Na slici nije pronađen QR kod. Probaj oštriju sliku samo QR koda.', 'warn', 3500);
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (done) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (done) return;
          if (video.readyState >= 2) {
            const text = await decodeSource(video, canvas).catch(() => null);
            if (text) return finish(text);
          }
          timer = setTimeout(tick, 220);
        };
        tick();
      } catch (e) {
        el.querySelector('#sc-box').innerHTML = `<div class="scan-err">📷 Kamera nije dostupna.<br>Dozvoli pristup kameri u podešavanjima browsera,<br>ili izaberi sliku računa iz galerije.</div>`;
      }
    },
  });
}

const prettyShop = (s) => {
  let t = toLatin(s).replace(/^\d+\s*[-–]\s*/, '').trim();
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s(.-])\p{L}/gu, (m) => m.toUpperCase());
  return t;
};

export async function handleScan(text) {
  const r = parseQR(text);

  if (r.type === 'ips') {
    const key = currentMonthKey();
    const item = matchPlanItem(key, r);
    if (item) {
      const already = paidTx(key, item);
      if (already && !(await confirmSheet({ title: `${esc(item.name)} je već plaćeno`, text: `Za ovaj mesec već postoji unos od ${fmtNum(already.amount)} RSD. Dodati još jedan?`, ok: 'Dodaj' }))) return;
      toast(`📄 Prepoznato: <b>${esc(item.name)}</b> · ${fmtNum(r.amount)} RSD`, 'ok');
      openEntrySheet({ categoryId: item.categoryId, prefill: { amount: r.amount, note: item.name, planLine: item.line } });
    } else {
      toast(`📄 Račun: ${esc(r.payee || 'nepoznat primalac')}`, 'ok');
      openEntrySheet({ prefill: { amount: r.amount, note: r.payee } });
    }
    return;
  }

  if (r.type === 'fiscal') {
    let shop = '';
    let amount = r.amount;
    if (Sync.enabled) {
      toast('🧾 Čitam račun…', 'ok', 1800);
      try {
        const info = await Sync.invoke('racun', { url: r.url });
        shop = prettyShop(info?.shop || info?.company || '');
        if (!amount && info?.total) amount = Number(String(info.total).replace(/\./g, '').replace(',', '.')) || 0;
      } catch (e) {
        console.warn('racun funkcija', e);
      }
    }
    if (!amount && !shop) {
      toast('Račun nije prepoznat. Upiši ga ručno.', 'warn');
      openEntrySheet();
      return;
    }
    // Isti račun dvaput?
    const dup = S.getState().transactions.find((t) => t.date === r.date && Math.round(t.amount) === Math.round(amount) && (!shop || t.note === shop));
    if (dup && !(await confirmSheet({ title: 'Račun je možda već unet', text: `${esc(dup.note || S.cat(dup.categoryId).name)} · ${fmtNum(dup.amount)} RSD, istog dana. Uneti ponovo?`, ok: 'Unesi' }))) return;
    toast(`🧾 ${shop ? `<b>${esc(shop)}</b> · ` : ''}${fmtNum(amount)} RSD${r.time ? ` · ${r.time}` : ''}`, 'ok', 3000);
    openEntrySheet({ date: r.date, prefill: { amount, note: shop } });
    return;
  }

  toast('Ovaj QR kod nije račun.', 'warn');
}
