// Periodi za izveštaje: dan, nedelja, mesec, kvartal, polugodište, godina.
import * as S from './store.js?v=20261108081746';
import { isoOf, parseISO, pad, MONTH_NAMES, MONTH_SHORT, MONTH_GEN, DAY_NAMES, daysInMonth } from './util.js?v=20261108081746';

export const PERIODS = [
  ['day', 'Dan'], ['week', 'Nedelja'], ['month', 'Mesec'],
  ['quarter', 'Kvartal'], ['half', 'Polugodište'], ['year', 'Godina'],
];

// Vraća { type, start, end (ISO, uključivo), days, label }
export function periodOf(type, anchorISO) {
  const d = parseISO(anchorISO);
  const y = d.getFullYear(), m = d.getMonth();
  let a, b;
  if (type === 'day') { a = new Date(d); b = new Date(d); }
  else if (type === 'week') {
    const dow = (d.getDay() + 6) % 7; // ponedeljak = 0
    a = new Date(d); a.setDate(d.getDate() - dow);
    b = new Date(a); b.setDate(a.getDate() + 6);
  } else if (type === 'month') { a = new Date(y, m, 1); b = new Date(y, m + 1, 0); }
  else if (type === 'quarter') { const q = Math.floor(m / 3); a = new Date(y, q * 3, 1); b = new Date(y, q * 3 + 3, 0); }
  else if (type === 'half') { const h = m < 6 ? 0 : 6; a = new Date(y, h, 1); b = new Date(y, h + 6, 0); }
  else { a = new Date(y, 0, 1); b = new Date(y, 11, 31); }
  const start = isoOf(a), end = isoOf(b);
  const days = Math.round((b - a) / 864e5) + 1;
  return { type, start, end, days, label: labelOf(type, a, b) };
}

function labelOf(type, a, b) {
  const y = a.getFullYear();
  if (type === 'day') return `${DAY_NAMES[a.getDay()]}, ${a.getDate()}. ${MONTH_GEN[a.getMonth()]} ${y}.`;
  if (type === 'week') {
    if (a.getMonth() === b.getMonth()) return `${a.getDate()}. – ${b.getDate()}. ${MONTH_GEN[b.getMonth()]} ${b.getFullYear()}.`;
    return `${a.getDate()}. ${MONTH_SHORT[a.getMonth()].toLowerCase()} – ${b.getDate()}. ${MONTH_SHORT[b.getMonth()].toLowerCase()} ${b.getFullYear()}.`;
  }
  if (type === 'month') return `${MONTH_NAMES[a.getMonth()]} ${y}.`;
  if (type === 'quarter') return `Q${Math.floor(a.getMonth() / 3) + 1} ${y}. · ${MONTH_SHORT[a.getMonth()].toLowerCase()}–${MONTH_SHORT[b.getMonth()].toLowerCase()}`;
  if (type === 'half') return `${a.getMonth() < 6 ? '1.' : '2.'} polugodište ${y}.`;
  return `${y}. godina`;
}

export function shiftAnchor(type, anchorISO, dir) {
  const d = parseISO(anchorISO);
  if (type === 'day') d.setDate(d.getDate() + dir);
  else if (type === 'week') d.setDate(d.getDate() + 7 * dir);
  else {
    const months = { month: 1, quarter: 3, half: 6, year: 12 }[type];
    d.setDate(1);
    d.setMonth(d.getMonth() + months * dir);
  }
  return isoOf(d);
}

export const prevPeriod = (p) => periodOf(p.type, shiftAnchor(p.type, p.start, -1));

export const txInPeriod = (p) => S.getState().transactions.filter((t) => t.date >= p.start && t.date <= p.end);

// Meseci koje period pokriva, sa udelom dana (za srazmerni plan nedelje/dana).
export function monthsCovered(p) {
  const out = [];
  let [y, m] = p.start.slice(0, 7).split('-').map(Number);
  const endKey = p.end.slice(0, 7);
  for (;;) {
    const key = `${y}-${pad(m)}`;
    const dim = daysInMonth(key);
    const ms = `${key}-01`, me = `${key}-${pad(dim)}`;
    const from = p.start > ms ? p.start : ms;
    const to = p.end < me ? p.end : me;
    const days = Math.round((parseISO(to) - parseISO(from)) / 864e5) + 1;
    out.push({ key, share: days / dim });
    if (key === endKey) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// Plan za period po kategoriji (srazmerno za delimične mesece).
export function planInPeriod(p, { lumpFull = false } = {}) {
  const byCat = {};
  const tot = { income: 0, expense: 0, saving: 0 };
  for (const { key, share } of monthsCovered(p)) {
    for (const it of S.planOf(key)) {
      const c = S.cat(it.categoryId);
      // lumpFull: započeti mesec se poredi sa celim mesečnim planom (kao na Pregledu), ne sa delom po danima.
      const a = Number(it.amount) * (lumpFull ? 1 : share);
      byCat[c.id] = (byCat[c.id] || 0) + a;
      tot[c.kind] += a;
    }
  }
  return { byCat, tot };
}
