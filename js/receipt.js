// Prepoznavanje QR kodova: IPS (računi za struju, telefon...) i fiskalni račun (radnje, restorani).
import * as S from './store.js?v=20261107215237';
import { isoOf } from './util.js?v=20261107215237';

// ---- Ćirilica → latinica ----
const CYR = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I', Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š' };
export function toLatin(s) {
  return String(s || '').replace(/[А-Яа-яЂђЈјЉљЊњЋћЏџ]/g, (ch) => {
    const up = ch.toUpperCase();
    const l = CYR[up];
    if (!l) return ch;
    return ch === up ? l : l.toLowerCase();
  });
}

const norm = (s) => toLatin(s).toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---- Prepoznaj vrstu ----
export function parseQR(text) {
  const t = String(text || '').trim();
  if (/^K:PR\|/i.test(t) || /\|I:RSD/i.test(t)) return parseIPS(t);
  if (/suf\.purs\.gov\.rs/i.test(t)) return parseFiscal(t);
  return { type: 'unknown', raw: t };
}

// ---- IPS QR (NBS standard): K:PR|V:01|C:1|R:račun|N:primalac|I:RSD1234,56|SF:..|S:svrha|RO:poziv na broj ----
export function parseIPS(text) {
  const f = {};
  for (const part of text.split('|')) {
    const i = part.indexOf(':');
    if (i > 0) f[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
  }
  const amount = f.I ? Number(f.I.replace(/^[A-Z]{3}/, '').replace(/\./g, '').replace(',', '.')) : 0;
  const payee = toLatin((f.N || '').split(/\r?\n/)[0]).trim();
  return { type: 'ips', amount: Math.round(amount * 100) / 100, payee, purpose: toLatin(f.S || '').trim(), account: f.R || '', reference: f.RO || '' };
}

// ---- Fiskalni račun: https://suf.purs.gov.rs/v/?vl=<base64> ----
// vl sadrži binarno: verzija(1) | zahtevao(8) | potpisao(8) | brojač(4) | brojač vrste(4) | iznos(8, ×10000) | vreme(8, ms) | ...
export function parseFiscal(url) {
  const out = { type: 'fiscal', url, amount: 0, date: null, time: null, invoice: '' };
  try {
    const vl = new URL(url).searchParams.get('vl');
    if (!vl) return out;
    const bin = atob(decodeURIComponent(vl).replace(/-/g, '+').replace(/_/g, '/'));
    const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dv = new DataView(b.buffer);
    const ascii = (a, n) => String.fromCharCode(...b.slice(a, a + n));
    const requestedBy = ascii(1, 8), signedBy = ascii(9, 8);
    const counter = dv.getUint32(17, true);
    const amount = Number(dv.getBigUint64(25, true)) / 10000;
    const ms = Number(dv.getBigUint64(33, true));
    const d = new Date(ms);
    // Provera smislenosti (ako format ne odgovara, ne izmišljamo podatke).
    const plausible = amount > 0 && amount < 1e8 && d.getFullYear() >= 2022 && ms <= Date.now() + 864e5;
    if (plausible) {
      out.amount = Math.round(amount * 100) / 100;
      out.date = isoOf(d);
      out.time = d.toTimeString().slice(0, 5);
      out.invoice = `${requestedBy}-${signedBy}-${counter}`;
      out.refund = b[42] === 1;
    }
  } catch (e) {
    console.warn('Fiskalni QR nije dekodiran', e);
  }
  return out;
}

// ---- Uparivanje IPS računa sa stavkom plana (Struja, A1, MTS...) ----
const PAYEE_HINTS = [
  { re: /eps|elektroprivreda|elektrodistribucija/, words: ['struja', 'eps'] },
  { re: /infostan|stambene|komunal/, words: ['infostan', 'komunal', 'voda', 'grejanje'] },
  { re: /telekom|mts/, words: ['mts', 'telekom', 'net'] },
  { re: /a1 srbija|\ba1\b|vip mobile/, words: ['a1'] },
  { re: /yettel|telenor/, words: ['yettel', 'telenor'] },
  { re: /sbb|united/, words: ['sbb', 'net', 'kabl'] },
  { re: /beogradske elektrane|toplan|grejanje/, words: ['grejanje', 'toplana'] },
  { re: /vodovod/, words: ['voda', 'vodovod'] },
];

export function matchPlanItem(key, scan) {
  const items = S.planOf(key).filter((p) => S.cat(p.categoryId).kind === 'expense');
  const hay = norm(`${scan.payee} ${scan.purpose}`);
  const paid = new Set(S.getState().transactions.filter((t) => t.date.startsWith(key) && t.planLine).map((t) => t.planLine));
  let best = null, bestScore = 0;
  for (const it of items) {
    const name = norm(it.name);
    let score = 0;
    for (const h of PAYEE_HINTS) if (h.re.test(hay) && h.words.some((w) => name.includes(w))) score += 3;
    for (const w of name.split(' ')) if (w.length >= 3 && hay.includes(w)) score += 2;
    if (score && Math.abs(Number(it.amount) - scan.amount) / Math.max(1, it.amount) < 0.3) score += 1;
    if (score && !paid.has(it.line)) score += 1; // radije neplaćenu stavku
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}
