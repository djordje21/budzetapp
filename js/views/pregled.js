// Početni ekran: plan vs. stvarno za izabrani mesec.
import * as S from '../store.js';
import { summarize, pace, monthPhase } from '../calc.js';
import { esc, fmt, fmtNum, fmtSigned, monthLabel, addMonths, MONTH_GEN } from '../util.js';
import { countUp, animateBars, pct, toast } from '../ui.js';
import { openEntrySheet } from './entry.js';
import { txRow } from './istorija.js';

export function renderPregled(el, ctx) {
  const key = ctx.month;
  const sum = summarize(key);
  const { tot } = sum;
  const prevKey = addMonths(key, -1);

  if (!sum.plan.length && !sum.txs.length) {
    el.innerHTML = emptyMonth(key, prevKey);
    bindEmpty(el, ctx, key, prevKey);
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
    <section class="hero card ${left < 0 ? 'hero-over' : ''}">
      <div class="hero-label">${left < 0 ? 'Prekoračen plan troškova' : 'Preostalo od plana troškova'}</div>
      <div class="hero-value" id="hero-val">0</div>
      <div class="hero-sub">Potrošeno <b>${fmtNum(tot.expense.actual)}</b> od <b>${fmtNum(tot.expense.plan)}</b> RSD</div>
      <div class="bar bar-lg"><div class="bar-fill ${left < 0 ? 'is-over' : ''}" data-w="${pct(tot.expense.actual, tot.expense.plan)}"></div>
        ${p ? `<div class="bar-marker" style="left:${(p.timePct * 100).toFixed(1)}%" title="Danas"></div>` : ''}
      </div>
      ${paceMsg(p, phase, sum)}
    </section>

    <section class="stat-grid">
      ${stat('Prihodi', tot.income.actual, tot.income.plan, 'green')}
      ${stat('Troškovi', tot.expense.actual, tot.expense.plan, 'red')}
      ${stat('Štednja', tot.saving.actual, tot.saving.plan, 'cyan')}
      <div class="stat card">
        <div class="stat-label">Bilans</div>
        <div class="stat-val ${sum.balanceActual < 0 ? 't-red' : 't-accent'}">${fmtSigned(sum.balanceActual)}</div>
        <div class="stat-sub">plan ${fmtSigned(sum.balancePlan)}</div>
      </div>
    </section>

    <div class="section-head"><h3>Po kategorijama</h3><span class="muted">stvarno / plan</span></div>
    <section class="card list">
      ${expenseCats.length ? expenseCats.map(catRow).join('') : '<div class="empty-mini">Nema troškova u planu.</div>'}
    </section>

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

  el.querySelector('#note').oninput = (e) => S.setNote(key, e.target.value);
  el.querySelector('#first-entry')?.addEventListener('click', () => openEntrySheet());
  el.querySelectorAll('[data-tx]').forEach((r) => (r.onclick = () => {
    const tx = S.getState().transactions.find((t) => t.id === r.dataset.tx);
    if (tx) openEntrySheet({ tx });
  }));
}

function stat(label, actual, plan, color) {
  return `<div class="stat card">
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
  return `<div class="cat-row">
    <span class="cat-ico" style="--c:${r.cat.color}">${r.cat.icon}</span>
    <div class="cat-main">
      <div class="cat-top"><span class="cat-name">${esc(r.cat.name)}</span>${note}
        <span class="cat-amt"><b>${fmtNum(r.actual)}</b><span class="muted"> / ${fmtNum(r.plan)}</span></span></div>
      <div class="bar bar-sm"><div class="bar-fill ${over > 0 || r.plan === 0 ? 'is-over' : ''}" style="--c:${r.cat.color}" data-w="${pct(r.actual, r.plan)}"></div></div>
    </div>
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

