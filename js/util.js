// Opšte pomoćne funkcije: formatiranje, datumi, ID-jevi.

export const MONTH_NAMES = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
export const MONTH_GEN = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
export const DAY_NAMES = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota'];

const nf = new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 });
export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));
export const fmt = (n) => fmtNum(n) + ' RSD';
export const fmtSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n));

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // UUID v4 fallback (za http:// ili stare browsere)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const currentMonthKey = () => todayISO().slice(0, 7);
export const parseISO = (iso) => new Date(iso + 'T00:00:00');

export function addMonths(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${pad(m)}`;
}

export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
export const monthShort = (key) => MONTH_SHORT[Number(key.slice(5, 7)) - 1];
export const daysInMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export function dayLabel(iso) {
  const today = new Date();
  if (iso === isoOf(today)) return 'Danas';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (iso === isoOf(y)) return 'Juče';
  const d = parseISO(iso);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTH_GEN[d.getMonth()]}`;
}

export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');
