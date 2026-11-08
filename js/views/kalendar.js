// Kalendar meseca: potrošnja po danima + plate (kad stižu) i rokovi računa iz plana.
import * as S from '../store.js?v=20261108210214';
import { txOfMonth } from '../calc.js?v=20261108210214';
import { esc, fmt, fmtNum, todayISO, daysInMonth, pad, dayLabel, fmtDate } from '../util.js?v=20261108210214';
import { openSheet } from '../ui.js?v=20261108210214';
import { paidTx, payItem, PAY_LABELS } from '../pay.js?v=20261108210214';
import { openEntrySheet } from './entry.js?v=20261108210214';
import { txRow } from './istorija.js?v=20261108210214';

const DOW = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];
const k = (n) => (n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k' : String(Math.round(n)));

export function calendarHTML(key) {
  const dim = daysInMonth(key);
  const first = new Date(`${key}-01T00:00:00`);
  const lead = (first.getDay() + 6) % 7; // ponedeljak prvi
  const today = todayISO();
  const txs = txOfMonth(key);
  const plan = S.planOf(key).filter((p) => p.day);
  let cells = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= dim; d++) {
    const iso = `${key}-${pad(d)}`;
    const spent = txs.filter((t) => t.date === iso && t.kind !== 'income').reduce((s, t) => s + Number(t.amount), 0);
    const items = plan.filter((p) => Math.min(p.day, dim) === d);
    const marks = items.map((p) => {
      const c = S.cat(p.categoryId);
      const done = !!paidTx(key, p);
      const late = !done && iso < today;
      return `<i class="mk ${c.kind === 'income' ? 'mk-in' : 'mk-out'} ${done ? 'done' : ''} ${late ? 'late' : ''}"></i>`;
    }).join('');
    cells += `<button class="cal-cell ${iso === today ? 'today' : ''} ${iso > today ? 'future' : ''}" data-day="${iso}">
      <span class="cal-n">${d}</span>
      ${marks ? `<span class="cal-mk">${marks}</span>` : ''}
      ${spent ? `<span class="cal-sp">${k(spent)}</span>` : ''}
    </button>`;
  }
  return `<div class="cal card">${cells}</div>
    <div class="cal-legend"><span><i class="mk mk-in"></i> plata / prihod</span><span><i class="mk mk-out"></i> rok za račun</span><span><i class="mk mk-out done"></i> plaćeno</span><span>4,2k = potrošeno</span></div>`;
}

export function bindCalendar(el, key) {
  el.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => openDay(key, b.dataset.day)));
}

function openDay(key, iso) {
  const d = Number(iso.slice(8));
  const dim = daysInMonth(key);
  const plan = S.planOf(key).filter((p) => p.day && Math.min(p.day, dim) === d);
  const txs = txOfMonth(key).filter((t) => t.date === iso).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const spent = txs.filter((t) => t.kind !== 'income').reduce((s, t) => s + Number(t.amount), 0);
  openSheet({
    title: dayLabel(iso),
    body: `
      ${plan.length ? `<div class="field-label">Planirano za ovaj dan</div>
      <section class="list">${plan.map((p) => {
        const c = S.cat(p.categoryId);
        const tx = paidTx(key, p);
        const L = PAY_LABELS[c.kind];
        return `<div class="tx-row">
          <span class="tx-main"><span class="tx-title">${esc(p.name)}</span><span class="tx-sub">${c.kind === 'income' ? 'stiže' : 'rok'} ${p.day}. · ${esc(c.name)}</span></span>
          <span class="tx-amt ${c.kind === 'income' ? 't-green' : ''}">${fmtNum(p.amount)}</span>
          ${tx ? `<span class="pay-btn paid">✓ ${L.done}</span>` : `<button class="pay-btn" data-pay="${p.id}">${L.act}</button>`}
        </div>`;
      }).join('')}</section>` : ''}
      <div class="field-label">Uneto ${spent ? `· potrošeno ${fmt(spent)}` : ''}</div>
      <section class="list">${txs.length ? txs.map((t) => txRow(t)).join('') : '<div class="empty-mini">Nema unosa za ovaj dan.</div>'}</section>
      <button class="btn btn-primary btn-block" id="day-add">+ Unos za ${fmtDate(iso)}</button>`,
    onMount(el, close) {
      el.querySelector('#day-add').onclick = () => { close(); setTimeout(() => openEntrySheet({ date: iso }), 220); };
      el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => {
        const it = plan.find((p) => p.id === b.dataset.pay);
        if (it) { close(); payItem(key, it, b); }
      }));
      el.querySelectorAll('[data-tx]').forEach((b) => (b.onclick = () => {
        const tx = txs.find((t) => t.id === b.dataset.tx);
        if (tx) { close(); setTimeout(() => openEntrySheet({ tx }), 220); }
      }));
    },
  });
}
