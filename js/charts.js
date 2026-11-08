// Grafikoni (SVG, bez biblioteka): tok potrošnje kroz mesec i raspodela po kategorijama.
import * as S from './store.js?v=20261108053527';
import { esc, fmtNum, daysInMonth, todayISO, currentMonthKey, pad } from './util.js?v=20261108053527';

const shortNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
function niceMax(v) {
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * e >= v) return f * e;
  return 10 * e;
}

// ---- Tok potrošnje: kumulativno stvarno vs. ravnomerni plan (promenljivi troškovi) ----
export function cumulativeData(key, sum) {
  const dim = daysInMonth(key);
  const cur = currentMonthKey();
  const lastDay = key < cur ? dim : key > cur ? 0 : Number(todayISO().slice(8, 10));
  const perDay = new Array(dim + 1).fill(0);
  for (const t of sum.txs) {
    if (t.kind !== 'expense' || S.cat(t.categoryId).fixed) continue;
    perDay[Number(t.date.slice(8, 10))] += Number(t.amount);
  }
  const actual = [];
  let acc = 0;
  for (let d = 1; d <= lastDay; d++) { acc += perDay[d]; actual.push(acc); }
  return { dim, actual, plan: sum.varPlan };
}

export function cumulativeChart({ dim, actual, plan }, W) {
  const H = 170, padL = 34, padR = 10, padT = 12, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = niceMax(Math.max(plan, ...actual, 1) * 1.05);
  const x = (d) => padL + ((d - 1) / Math.max(1, dim - 1)) * iw;
  const y = (v) => padT + ih - (v / max) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tok potrošnje kroz mesec">`;
  for (const g of [0, 0.5, 1]) {
    const gy = y(max * g);
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" class="grid ${g === 0 ? 'base' : ''}"/>`;
    svg += `<text x="${padL - 6}" y="${gy + 3.5}" class="ax" text-anchor="end">${shortNum(max * g)}</text>`;
  }
  for (const d of [1, 8, 15, 22, dim]) svg += `<text x="${x(d)}" y="${H - 6}" class="ax" text-anchor="middle">${d}.</text>`;
  if (plan > 0) svg += `<line class="ref" x1="${x(1)}" y1="${y(plan / dim)}" x2="${x(dim)}" y2="${y(plan)}"/>`;
  if (actual.length) {
    const pts = actual.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`);
    const last = actual.length;
    svg += `<path class="area" d="M${x(1)},${y(0)} L${pts.join(' L')} L${x(last)},${y(0)} Z"/>`;
    svg += `<polyline class="line" points="${pts.join(' ')}"/>`;
    svg += `<circle class="dot-end" cx="${x(last)}" cy="${y(actual[last - 1])}" r="4.5"/>`;
  }
  svg += `<line class="cross" id="cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/>`;
  svg += `<circle class="cross-dot" id="cross-dot" r="5" visibility="hidden"/>`;
  svg += `<rect class="hit-area" x="${padL}" y="${padT}" width="${iw}" height="${ih}" data-l="${padL}" data-w="${iw}"/>`;
  return svg + '</svg>';
}

export function bindCumulative(root, data, key) {
  const svg = root.querySelector('svg');
  const area = root.querySelector('.hit-area');
  const tip = root.querySelector('.chart-tip');
  if (!svg || !area || !tip) return;
  const cross = svg.querySelector('#cross'), dot = svg.querySelector('#cross-dot');
  const W = svg.viewBox.baseVal.width;
  const padL = Number(area.dataset.l), iw = Number(area.dataset.w);
  const H = svg.viewBox.baseVal.height, padT = 12, ih = H - 12 - 22;
  const max = niceMax(Math.max(data.plan, ...data.actual, 1) * 1.05);
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const d = Math.min(data.dim, Math.max(1, Math.round(((sx - padL) / iw) * (data.dim - 1)) + 1));
    const cx = padL + ((d - 1) / Math.max(1, data.dim - 1)) * iw;
    const v = data.actual[d - 1];
    const p = data.plan ? (data.plan * d) / data.dim : 0;
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    if (v != null) {
      dot.setAttribute('cx', cx); dot.setAttribute('cy', padT + ih - (v / max) * ih); dot.setAttribute('visibility', 'visible');
    } else dot.setAttribute('visibility', 'hidden');
    tip.innerHTML = `${d}. · ${v != null ? `<b>${fmtNum(v)}</b>` : '—'}${p ? ` <span>/ plan ${fmtNum(p)}</span>` : ''}`;
    tip.hidden = false;
    const card = tip.parentElement.getBoundingClientRect();
    tip.style.left = Math.max(80, Math.min(card.width - 80, (cx / W) * r.width + (r.left - card.left))) + 'px';
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  area.addEventListener('pointermove', (e) => show(e.clientX));
  area.addEventListener('pointerdown', (e) => show(e.clientX));
  area.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  void key;
}

// ---- Donut: raspodela troškova po kategorijama (top 6 + ostalo) ----
export function donutData(txs) {
  const by = {};
  for (const t of txs) if (t.kind === 'expense') by[t.categoryId] = (by[t.categoryId] || 0) + Number(t.amount);
  const rows = Object.entries(by).map(([id, v]) => ({ c: S.cat(id), v })).sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  if (rows.length > 7) {
    const rest = rows.splice(6);
    rows.push({ c: { id: '_rest', name: `Ostale kategorije (${rest.length})`, icon: '•••', color: '#475569' }, v: rest.reduce((s, r) => s + r.v, 0) });
  }
  return { rows, total };
}

export function donutChart({ rows, total }) {
  if (!total) return '';
  const R = 70, SW = 22, C = 2 * Math.PI * R, GAP = rows.length > 1 ? 2 : 0;
  let off = 0, segs = '';
  rows.forEach((r, i) => {
    const len = (r.v / total) * C;
    const dash = Math.max(0.5, len - GAP);
    segs += `<circle class="seg" data-i="${i}" cx="90" cy="90" r="${R}" stroke="${r.c.color}" stroke-width="${SW}"
      stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
    off += len;
  });
  return `<div class="donut-wrap">
    <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Raspodela troškova">${segs}</svg>
    <div class="donut-center" id="donut-center"><span>Ukupno</span><b>${fmtNum(total)}</b></div>
  </div>
  <div class="donut-legend">${rows.map((r, i) => `
    <button class="dl-item" data-i="${i}"><i style="background:${r.c.color}"></i><span>${esc(r.c.name)}</span><b>${Math.round((r.v / total) * 100)}%</b></button>`).join('')}
  </div>`;
}

export function bindDonut(root, { rows, total }) {
  const center = root.querySelector('#donut-center');
  if (!center) return;
  const reset = `<span>Ukupno</span><b>${fmtNum(total)}</b>`;
  let active = null;
  const pick = (i) => {
    active = active === i ? null : i;
    root.querySelectorAll('.seg').forEach((s) => s.classList.toggle('dim', active !== null && Number(s.dataset.i) !== active));
    root.querySelectorAll('.dl-item').forEach((s) => s.classList.toggle('on', Number(s.dataset.i) === active));
    if (active === null) { center.innerHTML = reset; return; }
    const r = rows[active];
    center.innerHTML = `<span>${r.c.icon} ${esc(r.c.name)}</span><b>${fmtNum(r.v)}</b><em>${Math.round((r.v / total) * 100)}%</em>`;
  };
  root.querySelectorAll('.seg, .dl-item').forEach((el) => el.addEventListener('click', () => pick(Number(el.dataset.i))));
}

export { pad };
