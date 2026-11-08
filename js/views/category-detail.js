// Detalj kategorije za mesec: plan, unosi i brze akcije (otvara se iz Pregleda).
import * as S from '../store.js?v=20261108112459';
import { summarize } from '../calc.js?v=20261108112459';
import { esc, fmt, fmtNum, monthLabel, currentMonthKey } from '../util.js?v=20261108112459';
import { openSheet, animateBars, pct } from '../ui.js?v=20261108112459';
import { openEntrySheet } from './entry.js?v=20261108112459';
import { openQuickEntry } from './quick.js?v=20261108112459';
import { openPlanItemSheet, openPlanItemActions } from './plan.js?v=20261108112459';
import { txRow } from './istorija.js?v=20261108112459';

export function openCategoryDetail(key, catId) {
  const c = S.cat(catId);
  const sum = summarize(key);
  const r = sum.cats.find((x) => x.cat.id === catId) || { plan: 0, actual: 0 };
  const items = sum.plan.filter((p) => p.categoryId === catId);
  const txs = sum.txs.filter((t) => t.categoryId === catId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const left = r.plan - r.actual;
  const month = monthLabel(key).split(' ')[0].toLowerCase();

  openSheet({
    title: `${c.name} · ${monthLabel(key)}`,
    body: `
      <div class="cd-head">
        <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
        <div class="grow">
          <div class="cd-big">${fmt(r.actual)}</div>
          <div class="cd-sub">${r.plan ? `od plana ${fmtNum(r.plan)} · ${left >= 0 ? `ostalo <b>${fmtNum(left)}</b>` : `<span class="t-red">preko ${fmtNum(-left)}</span>`}` : 'nije u planu za ovaj mesec'}</div>
        </div>
      </div>
      ${r.plan ? `<div class="bar bar-lg mt"><div class="bar-fill ${left < 0 ? 'is-over' : ''}" data-w="${pct(r.actual, r.plan)}"></div></div>` : ''}

      <div class="cd-actions">
        <button class="btn btn-primary btn-sm" id="cd-add">+ Novi ${c.kind === 'income' ? 'prihod' : 'trošak'}</button>
        <button class="btn btn-soft btn-sm" id="cd-plan">${items.length ? '+ Stavka plana' : 'Dodaj u plan'}</button>
      </div>

      <div class="field-label">Plan za ${month}</div>
      <section class="list">
        ${items.length ? items.map((p) => `
          <button class="plan-item" data-pi="${p.id}">
            <span class="pi-name">${esc(p.name)}</span>
            <span class="pi-amt">${fmtNum(p.amount)}</span><span class="chev">›</span>
          </button>`).join('') : '<div class="empty-mini">Nema stavki u planu.</div>'}
      </section>

      <div class="field-label">Unosi (${txs.length})</div>
      <section class="list">
        ${txs.length ? txs.map((t) => txRow(t, { showDate: true })).join('') : '<div class="empty-mini">Još nema unosa.</div>'}
      </section>`,
    onMount(el, close) {
      animateBars(el);
      // Zatvori detalj pa otvori izmenu — po povratku Pregled je već osvežen.
      const then = (fn) => () => { close(); setTimeout(fn, 200); };
      el.querySelector('#cd-add').onclick = then(() => (c.kind === 'expense' && !c.fixed ? openQuickEntry({ categoryId: catId, key }) : openEntrySheet({ categoryId: catId, date: key === currentMonthKey() ? null : `${key}-01` })));
      el.querySelector('#cd-plan').onclick = then(() => openPlanItemSheet(key, null, c.kind, catId));
      el.querySelectorAll('[data-pi]').forEach((b) => (b.onclick = then(() => {
        const it = items.find((p) => p.id === b.dataset.pi);
        if (it) openPlanItemActions(key, it);
      })));
      el.querySelectorAll('[data-tx]').forEach((b) => (b.onclick = then(() => {
        const tx = txs.find((t) => t.id === b.dataset.tx);
        if (tx) openEntrySheet({ tx });
      })));
    },
  });
}

// Kategorija u proizvoljnom periodu (nedelja, kvartal, godina...) — iz Izveštaja.
export function openCategoryPeriod(p, catId) {
  const c = S.cat(catId);
  const txs = S.getState().transactions
    .filter((t) => t.categoryId === catId && t.date >= p.start && t.date <= p.end)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  openSheet({
    title: `${c.name}`,
    body: `
      <div class="cd-head">
        <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
        <div class="grow">
          <div class="cd-big">${fmt(total)}</div>
          <div class="cd-sub">${esc(p.label)} · ${txs.length} ${txs.length === 1 ? 'unos' : 'unosa'}${txs.length ? ` · prosek ${fmtNum(total / txs.length)}` : ''}</div>
        </div>
      </div>
      <div class="cd-actions" style="grid-template-columns:1fr">
        <button class="btn btn-primary btn-sm" id="cp-add">+ Novi ${c.kind === 'income' ? 'prihod' : 'trošak'} u ovoj kategoriji</button>
      </div>
      <div class="field-label">Unosi — dodir za izmenu ili brisanje</div>
      <section class="list">${txs.length ? txs.map((t) => txRow(t, { showDate: true })).join('') : '<div class="empty-mini">Nema unosa u ovom periodu.</div>'}</section>`,
    onMount(el, close) {
      const then = (fn) => () => { close(); setTimeout(fn, 200); };
      el.querySelector('#cp-add').onclick = then(() => openEntrySheet({ categoryId: catId }));
      el.querySelectorAll('[data-tx]').forEach((b) => (b.onclick = then(() => {
        const tx = txs.find((t) => t.id === b.dataset.tx);
        if (tx) openEntrySheet({ tx });
      })));
    },
  });
}
