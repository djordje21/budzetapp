// Početni ekran: plan vs. stvarno za izabrani mesec.
import { ico } from '../icons.js?v=20261108141149';
import * as S from '../store.js?v=20261108141149';
import { summarize, pace, monthPhase } from '../calc.js?v=20261108141149';
import { esc, fmt, fmtNum, fmtSigned, monthLabel, addMonths, MONTH_GEN } from '../util.js?v=20261108141149';
import { countUp, animateBars, pct, toast } from '../ui.js?v=20261108141149';
import { openEntrySheet } from './entry.js?v=20261108141149';
import { txRow, setHistoryFilter } from './istorija.js?v=20261108141149';
import { isPayable, paidTx, payItem, PAY_LABELS } from '../pay.js?v=20261108141149';
import { openDueSheet } from './due-detail.js?v=20261108141149';
import { cumulativeData, cumulativeChart, bindCumulative } from '../charts.js?v=20261108141149';
import { accountsBlock, bindAccounts } from './accounts.js?v=20261108141149';
import { goalsBlock, bindGoals } from './goals.js?v=20261108141149';
import { openCategoryDetail } from './category-detail.js?v=20261108141149';
import { guideBlock, bindGuide } from './guide.js?v=20261108141149';
import { openQuickEntry } from './quick.js?v=20261108141149';

export function renderPregled(el, ctx) {
  const key = ctx.month;
  const sum = summarize(key);
  const { tot } = sum;
  const prevKey = addMonths(key, -1);

  if (!sum.plan.length && !sum.txs.length) {
    const g = guideBlock(key);
    const fresh = !Object.keys(S.getState().plans).length && !S.getState().transactions.length;
    el.innerHTML = (fresh && g ? g : g + emptyMonth(key, prevKey)) + accountsBlock() + goalsBlock();
    bindGuide(el, key);
    bindEmpty(el, ctx, key, prevKey);
    bindGoals(el);
    bindAccounts(el);
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

  const mName = monthLabel(key).split(' ')[0].toLowerCase();
  // Grafikon toka ima smisla tek kad postoji nekoliko dana unosa.
  const showChart = phase !== 'future' && sum.varActual > 0 && new Set(sum.txs.map((t) => t.date)).size >= 3;
  el.innerHTML = `
    ${guideBlock(key)}
    <section class="hero card clickable ${left < 0 ? 'hero-over' : ''}" role="button" tabindex="0" data-go="report">
      <div class="hero-label">${left < 0 ? `Plan troškova za ${mName} je prekoračen za` : `Ostalo u planu troškova za ${mName}`}</div>
      <div class="hero-value" id="hero-val">0</div>
      <div class="hero-sub">Potrošeno <b>${fmtNum(tot.expense.actual)}</b> od planiranih <b>${fmtNum(tot.expense.plan)}</b> RSD</div>
      <div class="bar bar-lg"><div class="bar-fill ${left < 0 ? 'is-over' : ''}" data-w="${pct(tot.expense.actual, tot.expense.plan)}"></div></div>
      ${paceMsg(p, phase, sum)}
    </section>

    ${accountsBlock()}

    ${dueBlock(key, sum, phase)}

    <div class="section-head"><h3>Gde ide novac</h3><span class="muted">potrošeno od plana</span></div>
    <section class="card list">
      ${(quickOk = phase !== 'future', rowPlan = sum.plan, rowKey = key, rowFuture = phase === 'future', expenseCats.length) ? expenseCats.map(catRow).join('') : '<div class="empty-mini">Nema troškova u planu.</div>'}
    </section>

    ${showChart ? `
    <div class="section-head"><h3>Tok potrošnje</h3><span class="legend"><i class="lg-line"></i>Stvarno <i class="lg-dash"></i>Plan</span></div>
    <section class="card chart-card" id="cum-card"><div class="chart" id="cum"></div><div class="chart-tip" hidden></div>
      <p class="chart-note">Hrana, gorivo, izlasci i džeparac — koliko je potrošeno od 1. u mesecu, naspram plana</p></section>` : ''}

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
    const r = b.getBoundingClientRect();
    const origin = { getBoundingClientRect: () => r };
    b.closest('.due-row')?.classList.add('leaving');
    setTimeout(() => payItem(key, item, origin), 220);
  }));
  el.querySelector('#due-all')?.addEventListener('click', (e) => {
    e.target.closest('.list').classList.add('show-all');
    e.target.remove();
  });
  const cum = el.querySelector('#cum');
  if (cum) {
    const data = cumulativeData(key, sum);
    cum.innerHTML = cumulativeChart(data, cum.clientWidth || 340);
    bindCumulative(el.querySelector('#cum-card'), data, key);
  }
  bindGuide(el, key);
  bindAccounts(el);
  bindGoals(el);
  el.querySelectorAll('[data-cat]').forEach((r) => (r.onclick = () => openCategoryDetail(key, r.dataset.cat)));
  el.querySelectorAll('[data-qcat]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    openQuickEntry({ categoryId: b.dataset.qcat, key });
  }));
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
  if (!due.length) return `<div class="hint hint-good due-done">✅ Sve je plaćeno i primljeno za ovaj mesec.</div>`;
  const order = { income: 0, expense: 1, saving: 2 };
  due.sort((a, b) => order[S.cat(a.categoryId).kind] - order[S.cat(b.categoryId).kind] || b.amount - a.amount);
  const total = due.filter((p) => S.cat(p.categoryId).kind === 'expense').reduce((s, p) => s + Number(p.amount), 0);
  return `
    <div class="section-head"><h3>Za platiti i primiti · ${due.length}</h3></div>
    <section class="card list">
      ${due.map((p, i) => {
        const c = S.cat(p.categoryId);
        return `<div class="due-row clickable ${i >= 4 ? 'due-extra' : ''}" role="button" tabindex="0" data-due="${p.id}">
          <span class="cat-ico" style="--c:${c.color}">${ico(c)}</span>
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

let quickOk = true;
let rowPlan = [], rowKey = '', rowFuture = false;
function catRow(r) {
  const over = r.actual - r.plan;
  let note = '';
  if (r.plan === 0) note = '<span class="tag tag-warn">nije u planu</span>';
  else if (over > 0) note = `<span class="tag tag-red">+${fmtNum(over)} preko</span>`;
  // Grupa sa više stavki u planu (npr. Računi: A1, MTS, Struja...) — reci šta je unutra.
  const items = rowPlan.filter((p) => p.categoryId === r.cat.id);
  let sub = '';
  if (items.length > 1 || r.cat.fixed) {
    const paidN = r.cat.fixed ? items.filter((p) => paidTx(rowKey, p)).length : 0;
    const w = items.length === 1 ? 'stavka' : items.length < 5 ? 'stavke' : 'stavki';
    sub = `${items.length} ${w}${r.cat.fixed && items.length && !rowFuture ? ` · plaćeno ${paidN} od ${items.length}` : ''}`;
  }
  return `<div class="cat-row clickable" role="button" tabindex="0" data-cat="${r.cat.id}">
    <span class="cat-ico" style="--c:${r.cat.color}">${ico(r.cat)}</span>
    <div class="cat-main">
      <div class="cat-top"><span class="cat-name">${esc(r.cat.name)}</span>${note}
        <span class="cat-amt"><b>${fmtNum(r.actual)}</b><span class="muted"> od ${fmtNum(r.plan)}</span></span></div>
      ${sub ? `<div class="cat-sub">${sub}</div>` : ''}
      <div class="bar bar-sm"><div class="bar-fill ${over > 0 || r.plan === 0 ? 'is-over' : ''}" style="--c:${r.cat.color}" data-w="${pct(r.actual, r.plan)}"></div></div>
    </div>
    ${!r.cat.fixed && r.cat.kind === 'expense' && quickOk ? `<button class="quick-add" data-qcat="${r.cat.id}" aria-label="Brzi unos: ${esc(r.cat.name)}">+</button>` : '<span class="chev">›</span>'}
  </div>`;
}

const longName = (c) => ({ hrana: 'Hrana', auto: 'Gorivo', izlasci: 'Izlasci', 'licno-dj': 'Džeparac Đorđa', 'licno-m': 'Džeparac Maksijane' }[c.id] || c.name);

function paceMsg(p, phase, sum) {
  if (phase === 'future') return `<div class="hint">📅 Budući mesec — ovo je plan. Stvarni unosi kreću kad mesec počne.</div>`;
  if (phase === 'past') {
    const d = sum.tot.expense.plan - sum.tot.expense.actual;
    return d >= 0
      ? `<div class="hint hint-good">✅ Mesec završen ${fmt(d)} ispod plana troškova.</div>`
      : `<div class="hint hint-bad">Mesec završen ${fmt(-d)} iznad plana troškova.</div>`;
  }
  if (!p) return '';
  const r50 = (n) => Math.round(n / 50) * 50;
  const name = (c) => esc(longName(c));
  const perDayOk = (c) => c.id === 'hrana' || c.id.startsWith('licno-'); // troši se zaista svakog dana
  const over = p.limits.filter((l) => l.left < 0);
  // "Po planu do danas" = mesečni plan srazmerno proteklim danima.
  const fast = p.limits.filter((l) => l.left >= 0 && l.actual > 0 && l.actual - l.plan * p.timePct > Math.max(1000, l.plan * 0.15));
  const parts = [];
  for (const l of over) parts.push(`⚠️ <b>${name(l.cat)}</b>: potrošeno <b>${fmtNum(-l.left)} RSD preko plana</b> (plan ${fmtNum(l.plan)}).`);
  for (const l of fast) {
    const ahead = r50(l.actual - l.plan * p.timePct);
    const tail = perDayOk(l.cat) ? ` — oko <b>${fmtNum(r50(l.perDay))} dnevno</b>` : '';
    parts.push(`🏃 <b>${name(l.cat)}</b>: potrošeno ${fmtNum(l.actual)} RSD, a po planu je do danas trebalo oko ${fmtNum(r50(l.plan * p.timePct))} — <b>${fmtNum(ahead)} više</b>. Do kraja meseca ostaje <b>${fmtNum(l.left)}</b>${tail}.`);
  }
  if (parts.length) return `<div class="hint ${over.length ? 'hint-bad' : 'hint-warn'}">${parts.map((x) => `<div class="pace-line">${x}</div>`).join('')}</div>`;
  if (!sum.varActual) return `<div class="hint">📝 Još nema unetih troškova za hranu, gorivo, izlaske i džeparac ovog meseca. Unesite ih preko <b>+</b> čim potrošite.</div>`;
  const expected = r50(sum.varPlan * p.timePct);
  const under = expected - sum.varActual;
  return `<div class="hint hint-good">👌 U ritmu ste. Hrana, gorivo, izlasci i džeparac: potrošeno <b>${fmtNum(sum.varActual)} RSD</b>, a po planu je do danas moglo oko ${fmtNum(expected)}${under >= 1000 ? ` — <b>${fmtNum(r50(under))} manje</b>` : ''}.</div>`;
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
        ${nothingAtAll ? '<a class="btn btn-ghost" href="#/vise">Prebaci podatke iz stare aplikacije</a>' : ''}
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

