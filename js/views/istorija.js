// Istorija stvarnih unosa za mesec, grupisano po danima, sa filterima.
import { ico } from '../icons.js?v=20261108210214';
import * as S from '../store.js?v=20261108210214';
import { txOfMonth } from '../calc.js?v=20261108210214';
import { esc, fmtNum, dayLabel, monthLabel } from '../util.js?v=20261108210214';
import { openEntrySheet } from './entry.js?v=20261108210214';

const filters = { who: 'all', kind: 'all', cat: 'all' };
let view = 'list'; // 'list' | 'cal'
export const setHistoryView = (v) => (view = v);
export const setHistoryFilter = (f) => Object.assign(filters, { who: 'all', kind: 'all', cat: 'all' }, f);

export function txRow(t, { showDate = false } = {}) {
  const c = S.cat(t.categoryId);
  const m = S.member(t.by);
  const sign = t.kind === 'income' ? '+' : '−';
  const cls = t.kind === 'income' ? 't-green' : t.kind === 'saving' ? 't-cyan' : '';
  const sub = [showDate ? dayLabel(t.date) : '', t.note ? esc(t.note) : ''].filter(Boolean).join(' · ');
  return `<button class="tx-row" data-tx="${t.id}">
    <span class="cat-ico" style="--c:${c.color}">${ico(c)}</span>
    <span class="tx-main">
      <span class="tx-title">${esc(c.name)}</span>
      ${sub ? `<span class="tx-sub">${sub}</span>` : ''}
    </span>
    <span class="who" style="--c:${m.color}" title="${esc(m.name)}">${m.short}</span>
    <span class="tx-amt ${cls}">${sign}${fmtNum(t.amount)}</span>
  </button>`;
}

export function trRow(x) {
  const m = S.member(x.by);
  return `<button class="tx-row" data-tr="${x.id}">
    <span class="cat-ico" style="--c:#64748b">⇄</span>
    <span class="tx-main">
      <span class="tx-title">${esc(S.account(x.from).name)} → ${esc(S.account(x.to).name)}</span>
      <span class="tx-sub">Prebacivanje${x.note ? ' · ' + esc(x.note) : ''}</span>
    </span>
    <span class="who" style="--c:${m.color}" title="${esc(m.name)}">${m.short}</span>
    <span class="tx-amt muted">${fmtNum(x.amount)}</span>
  </button>`;
}

export function renderIstorija(el, ctx) {
  const key = ctx.month;
  if (view === 'cal') {
    import('./kalendar.js?v=20261108210214').then((m) => {
      el.innerHTML = viewSwitch() + m.calendarHTML(key);
      bindSwitch(el, ctx);
      m.bindCalendar(el, key);
    });
    return;
  }
  const all = txOfMonth(key);
  const transfers = (S.getState().transfers || []).filter((x) => x.date.startsWith(key))
    .filter((x) => filters.who === 'all' || x.by === filters.who)
    .filter(() => (filters.kind === 'all' || filters.kind === 'transfer') && filters.cat === 'all');
  const list = all
    .filter((t) => filters.who === 'all' || t.by === filters.who)
    .filter((t) => filters.kind === 'all' || t.kind === filters.kind || (filters.kind === 'expense' && t.kind === 'saving'))
    .filter(() => filters.kind !== 'transfer')
    .filter((t) => filters.cat === 'all' || t.categoryId === filters.cat)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const groups = new Map();
  for (const t of [...list, ...transfers.map((x) => ({ ...x, _tr: true }))].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const net = (arr) => arr.filter((t) => !t._tr).reduce((s, t) => s + (t.kind === 'income' ? 1 : -1) * Number(t.amount), 0);
  const spent = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const usedCats = [...new Set(all.map((t) => t.categoryId))].map(S.cat);

  el.innerHTML = viewSwitch() + `
    <div class="filters">
      <div class="chips">
        ${[['all', 'Svi'], ...S.MEMBERS.map((m) => [m.id, m.name])].map(([v, l]) =>
          `<button class="chip ${filters.who === v ? 'on' : ''}" data-f="who" data-v="${v}">${esc(l)}</button>`).join('')}
      </div>
      <div class="chips">
        ${[['all', 'Sve'], ['expense', 'Rashodi'], ['income', 'Prihodi'], ['transfer', '⇄ Prebacivanja']].map(([v, l]) =>
          `<button class="chip ${filters.kind === v ? 'on' : ''}" data-f="kind" data-v="${v}">${esc(l)}</button>`).join('')}
        <select class="chip chip-select" id="f-cat" aria-label="Kategorija">
          <option value="all">Sve kategorije</option>
          ${usedCats.map((c) => `<option value="${c.id}" ${filters.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="summary-line">
      <span>${list.length + transfers.length} ${list.length + transfers.length === 1 ? 'unos' : 'unosa'}</span>
      <span>Troškovi: <b>${fmtNum(spent)} RSD</b></span>
    </div>

    ${groups.size ? [...groups.entries()].map(([date, arr]) => `
      <div class="day-head"><span>${dayLabel(date)}</span><span class="muted">${net(arr) ? (net(arr) > 0 ? '+' : '−') + fmtNum(Math.abs(net(arr))) : ''}</span></div>
      <section class="card list">${arr.map((t) => (t._tr ? trRow(t) : txRow(t))).join('')}</section>
    `).join('') : `
      <section class="card empty">
        <div class="empty-ico">🧾</div>
        <p>${all.length ? 'Nema unosa za izabrane filtere.' : `Nema unosa za ${esc(monthLabel(key).toLowerCase())}.`}</p>
        <button class="btn btn-primary" id="add-first">+ Novi unos</button>
      </section>`}
  `;

  bindSwitch(el, ctx);
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
    filters[b.dataset.f] = b.dataset.v;
    renderIstorija(el, ctx);
  }));
  el.querySelector('#f-cat').onchange = (e) => {
    filters.cat = e.target.value;
    renderIstorija(el, ctx);
  };
  el.querySelector('#add-first')?.addEventListener('click', () => openEntrySheet());
  el.querySelectorAll('[data-tr]').forEach((r) => (r.onclick = () => {
    const x = (S.getState().transfers || []).find((t) => t.id === r.dataset.tr);
    if (x) import('./accounts.js?v=20261108210214').then((m) => m.openTransferForm({ tr: x }));
  }));
  el.querySelectorAll('[data-tx]').forEach((r) => (r.onclick = () => {
    const tx = S.getState().transactions.find((t) => t.id === r.dataset.tx);
    if (tx) openEntrySheet({ tx });
  }));
}

// Prekidač Lista | Kalendar
const viewSwitch = () => `<div class="seg seg-2 view-switch"><button data-view="list" class="${view === 'list' ? 'on' : ''}">Lista</button><button data-view="cal" class="${view === 'cal' ? 'on' : ''}">Kalendar</button></div>`;
function bindSwitch(el, ctx) {
  el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { view = b.dataset.view; renderIstorija(el, ctx); }));
}
