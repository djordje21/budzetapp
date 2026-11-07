// Početni ekran: plan vs. stvarno za izabrani mesec.
import * as S from '../store.js?v=20261107212806';
import { summarize, pace, monthPhase } from '../calc.js?v=20261107212806';
import { esc, fmt, fmtNum, fmtSigned, monthLabel, addMonths, MONTH_GEN } from '../util.js?v=20261107212806';
import { countUp, animateBars, pct, toast } from '../ui.js?v=20261107212806';
import { openEntrySheet } from './entry.js?v=20261107212806';
import { txRow, setHistoryFilter } from './istorija.js?v=20261107212806';
import { isPayable, paidTx, payItem, PAY_LABELS } from '../pay.js?v=20261107212806';
import { openDueSheet } from './due-detail.js?v=20261107212806';
import { goalsBlock, bindGoals } from './goals.js?v=20261107212806';
import { openCategoryDetail } from './category-detail.js?v=20261107212806';

export function renderPregled(el, ctx) {
  const key = ctx.month;
  const sum = summarize(key);
  const { tot } = sum;
  const prevKey = addMonths(key, -1);

  if (!sum.plan.length && !sum.txs.length) {
    el.innerHTML = emptyMonth(key, prevKey) + goalsBlock();
    bindEmpty(el, ctx, key, prevKey);
    bindGoals(el);
    animateBars(el);
    return;
  }

  const left = tot.expense.plan - tot.expense.actual;
  const p = pace(sum);
  const phase = monthPhase(key);

  const expenseCats = sum.cats
    .filter((r) => r.cat.kind === 'expense' && (r.plan > 0 || r.actual > 0))
    .sort((a, b) => b.plan - a.plan || b.actual - a.actual);

  const recent = [...sum.txs]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5);

  el.innerHTML = `
    <section class="hero card clickable ${left < 0 ? 'hero-over' : ''}" role="button" tabindex="0" data-go="report">
      <div class="hero-label">${left < 0 ? 'Prekoračen plan troškova' : 'Preostalo od plana troškova'}</div>
      <div class="hero-value" id="hero-val">0</div>
      <div class="hero-sub">Potrošeno <b>${fmtNum(tot.expense.actual)}</b> od <b>${fmtNum(tot.expense.plan)}</b> RSD</div>
      <div class="bar bar-lg"><div class="bar-fill ${left < 0 ? 'is-over' : ''}" data-w="${pct(tot.expense.actual, tot.expense.plan)}"></div>
        ${p ? `<div class="bar-marker" style="left:${(p.timePct * 100).toFixed(1)}%" title="Danas"></div>` : ''}
      </div>
      ${paceMsg(p, phase, sum)}
    </section>

    <section class="stat-grid">
      ${stat('Prihodi', tot.income.actual, tot.income.plan, 'green', 'income')}
      ${stat('Troškovi', tot.expense.actual, tot.expense.plan, 'red', 'expense')}
      ${stat('Štednja', tot.saving.actual, tot.saving.plan, 'cyan', 'saving')}
      <div class="stat card clickable" role="button" tabindex="0" data-go="report">
        <div class="stat-label">Bilans</div>
        <div class="stat-val ${sum.balanceActual < 0 ? 't-red' : 't-accent'}">${fmtSigned(sum.balanceActual)}</div>
        <div class="stat-sub">plan ${fmtSigned(sum.balancePlan)}</div>
      </div>
    </section>

    ${dueBlock(key, sum, phase)}

    <div class="section-head"><h3>Po kategorijama</h3><span class="muted">stvarno / plan</span></div>
    <section class="card list">
      ${expenseCats.length ? expenseCats.map(catRow).join('') : '<div class="empty-mini">Nema troškova u planu.</div>'}
    </section>

    ${goalsBlock()}

    <div class="section-head"><h3>Poslednji unosi</h3>${sum.txs.length ? '<a href="#/istorija" class="link">Sve →</a>' : ''}</div>
    <section class="card list">
      ${recent.length ? recent.map((t) => txRow(t, { showDate: true })).join('') : `
        <div class="empty-mini">Još nema unosa za ${esc(monthLabel(key).toLowerCase())}.<br>
        <button class="btn btn-soft btn-sm" id="first-entry">+ Unesi prvi trošak</button></div>`}
    </section>

    <div class="section-head"><h3>Beleška</h3></div>
    <textarea class="input note" id="note" placeholder="Beleška za ${esc(monthLabel(key).toLowerCase())}...">${esc(S.noteOf(key))}</textarea>
  `;

  countUp(el.querySelector('#hero-val'), 'hero:' + key, Math.abs(left), (n) => fmt(n));
  animateBars(el);

  el.querySelectorAll('[data-due]').forEach((r) => (r.onclick = () => {
    const item = sum.plan.find((p) => p.id === r.dataset.due);
    if (item) openDueSheet(key, item);
  }));
  el.querySelectorAll('[data-go]').forEach((c) => (c.onclick = () => {
    const g = c.dataset.go;
    if (g === 'report') { location.hash = '#/izvestaji'; return; }
    setHistoryFilter({ kind: g });
    location.hash = '#/istorija';
  }));
  el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const item = sum.plan.find((p) => p.id === b.dataset.pay);
    if (!item) return;
    b.closest('.due-row')?.classList.add('leaving');
    setTimeout(() => payItem(key, item), 220);
  }));
  el.querySelector('#due-all')?.addEventListener('click', (e) => {
    e.target.closest('.list').classList.add('show-all');
    e.target.remove();
  });
  bindGoals(el);
  el.querySelectorAll('[data-cat]').forEach((r) => (r.onclick = () => openCategoryDetail(key, r.dataset.cat)));
  el.querySelector('#note').oninput = (e) => S.setNote(key, e.target.value);
  el.querySelector('#first-entry')?.addEventListener('click', () => openEntrySheet());
  el.querySelectorAll('[data-tx]').forEach((r) => (r.onclick = () => {
    const tx = S.getState().transactions.find((t) => t.id === r.dataset.tx);
    if (tx) openEntrySheet({ tx });
  }));
}

function dueBlock(key, sum, phase) {
  if (phase === 'future') return '';
  const due = sum.plan.filter((p) => isPayable(p) && !paidTx(key, p));
  const all = sum.plan.filter(isPayable);
  if (!all.length) return '';
  if (!due.length) return `<div class="hint hint-good due-done">✅ Sve fiksne stavke za ovaj mesec su evidentirane.</div>`;
  const order = { income: 0, expense: 1, saving: 2 };
  due.sort((a, b) => order[S.cat(a.categoryId).kind] - order[S.cat(b.categoryId).kind] || b.amount - a.amount);
  const total = due.filter((p) => S.cat(p.categoryId).kind === 'expense').reduce((s, p) => s + Number(p.amount), 0);
  return `
    <div class="section-head"><h3>Čeka evidenciju · ${due.length}/${all.length}</h3>${total ? `<span class="muted">računi ${fmtNum(total)}</span>` : ''}</div>
    <section class="card list">
      ${due.map((p, i) => {
        const c = S.cat(p.categoryId);
        return `<div class="due-row clickable ${i >= 4 ? 'due-extra' : ''}" role="button" tabindex="0" data-due="${p.id}">
          <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
          <span class="tx-main"><span class="tx-title">${esc(p.name)}</span><span class="tx-sub">${esc(c.name)}</span></span>
          <span class="tx-amt ${c.kind === 'income' ? 't-green' : ''}">${fmtNum(p.amount)}</span>
          <button class="pay-btn" data-pay="${p.id}">${PAY_LABELS[c.kind].act}</button>
        </div>`;
      }).join('')}
      ${due.length > 4 ? `<button class="add-line" id="due-all">Prikaži sve (${due.length})</button>` : ''}
    </section>`;
}

function stat(label, actual, plan, color, go) {
  return `<div class="stat card clickable" role="button" tabindex="0" data-go="${go}">
    <div class="stat-label">${label}</div>
    <div class="stat-val t-${color}">${fmtNum(actual)}</div>
    <div class="stat-sub">plan ${fmtNum(plan)}</div>
    <div class="bar bar-sm"><div class="bar-fill fill-${color}" data-w="${pct(actual, plan)}"></div></div>
  </div>`;
}

function catRow(r) {
  const over = r.actual - r.plan;
  let note = '';
  if (r.plan === 0) note = '<span class="tag tag-warn">van plana</span>';
  else if (over > 0) note = `<span class="tag tag-red">+${fmtNum(over)} preko</span>`;
  else if (r.cat.fixed && r.actual === 0) note = '<span class="tag">nije plaćeno</span>';
  return `<div class="cat-row clickable" role="button" tabindex="0" data-cat="${r.cat.id}">
    <span class="cat-ico" style="--c:${r.cat.color}">${r.cat.icon}</span>
    <div class="cat-main">
      <div class="cat-top"><span class="cat-name">${esc(r.cat.name)}</span>${note}
        <span class="cat-amt"><b>${fmtNum(r.actual)}</b><span class="muted"> / ${fmtNum(r.plan)}</span></span></div>
      <div class="bar bar-sm"><div class="bar-fill ${over > 0 || r.plan === 0 ? 'is-over' : ''}" style="--c:${r.cat.color}" data-w="${pct(r.actual, r.plan)}"></div></div>
    </div>
    <span class="chev">›</span>
  </div>`;
}

function paceMsg(p, phase, sum) {
  if (phase === 'future') return `<div class="hint">📅 Budući mesec — ovo je plan. Stvarni unosi kreću kad mesec počne.</div>`;
  if (phase === 'past') {
    const d = sum.tot.expense.plan - sum.tot.expense.actual;
    return d >= 0
      ? `<div class="hint hint-good">✅ Mesec završen ${fmt(d)} ispod plana troškova.</div>`
      : `<div class="hint hint-bad">Mesec završen ${fmt(-d)} iznad plana troškova.</div>`;
  }
  if (!p) return '';
  const t = Math.round(p.timePct * 100), s = Math.round(p.spentPct * 100);
  if (p.status === 'over')
    return `<div class="hint hint-bad">⚠️ Promenljivi troškovi su već ${fmt(-p.remaining)} preko plana, a ostalo je ${p.dim - p.day} dana.</div>`;
  if (p.status === 'fast')
    return `<div class="hint hint-warn">🏃 Trošite brže od plana: ${s}% promenljivih troškova, a prošlo je ${t}% meseca. Da biste ostali u planu: do <b>${fmt(p.perDay)}</b> dnevno.</div>`;
  return `<div class="hint hint-good">👌 U ritmu ste: ${s}% promenljivih troškova za ${t}% meseca. Možete još oko <b>${fmt(p.perDay)}</b> dnevno.</div>`;
}

function emptyMonth(key, prevKey) {
  const canCopy = S.hasPlan(prevKey);
  const st = S.getState();
  const nothingAtAll = !Object.keys(st.plans).length && !st.transactions.length;
  return `
    <section class="card empty">
      <div class="empty-ico">🗓️</div>
      <h2>${esc(monthLabel(key))}</h2>
      <p>${nothingAtAll ? 'Dobrodošli! Krenite od plana: unesite očekivane prihode, troškove i štednju za mesec.' : 'Za ovaj mesec još nema plana ni unosa.'}</p>
      <div class="stack">
        ${canCopy ? `<button class="btn btn-primary" id="copy-prev">Kopiraj plan iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}</button>` : ''}
        <a class="btn ${canCopy ? 'btn-soft' : 'btn-primary'}" href="#/plan">Napravi plan</a>
        <button class="btn btn-ghost" id="add-now">Samo unesi trošak</button>
        ${nothingAtAll ? '<a class="btn btn-ghost" href="#/vise">Uvezi stari backup</a>' : ''}
      </div>
    </section>`;
}

function bindEmpty(el, ctx, key, prevKey) {
  el.querySelector('#copy-prev')?.addEventListener('click', async () => {
    await S.copyPlan(prevKey, key);
    toast(`Plan kopiran u ${monthLabel(key).toLowerCase()}`, 'ok');
  });
  el.querySelector('#add-now')?.addEventListener('click', () => openEntrySheet());
}

