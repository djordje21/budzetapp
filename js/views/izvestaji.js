// Izveštaji: dan, nedelja, mesec, kvartal, polugodište, godina.
import * as S from '../store.js?v=20261108084202';
import { PERIODS, periodOf, shiftAnchor, prevPeriod, txInPeriod, planInPeriod, monthsCovered } from '../period.js?v=20261108084202';
import { esc, fmt, fmtNum, fmtSigned, todayISO, currentMonthKey, parseISO, isoOf, MONTH_SHORT, pad, fmtDate } from '../util.js?v=20261108084202';
import { animateBars, pct } from '../ui.js?v=20261108084202';
import { donutData, donutChart, bindDonut } from '../charts.js?v=20261108084202';
import { txRow } from './istorija.js?v=20261108084202';
import { openCategoryDetail, openCategoryPeriod } from './category-detail.js?v=20261108084202';
import { openEntrySheet } from './entry.js?v=20261108084202';

const R = { type: 'month', anchor: null };
const DOW = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

const sumBy = (arr, f) => arr.reduce((s, t) => s + (f(t) ? Number(t.amount) : 0), 0);
const isVar = (t) => t.kind === 'expense' && !S.cat(t.categoryId).fixed;

export function renderIzvestaji(el, ctx) {
  if (!R.anchor) R.anchor = ctx.month === currentMonthKey() ? todayISO() : `${ctx.month}-01`;
  const p = periodOf(R.type, R.anchor);
  const prev = prevPeriod(p);
  const txs = txInPeriod(p);
  const ptx = txInPeriod(prev);
  const today = todayISO();
  const short = R.type === 'day' || R.type === 'week';
  // Tekući period se poredi sa planom do danas (srazmerno), budući nema poređenja.
  const partial = today >= p.start && today < p.end;
  const future = today < p.start;
  const plan = future ? { byCat: {}, tot: { income: 0, expense: 0, saving: 0 } } : planInPeriod(partial ? { ...p, end: today } : p, { lumpFull: partial && !short });
  const planWord = !partial ? 'plana' : short ? 'srazmernog plana' : R.type === 'month' ? 'plana za mesec' : 'plana zaključno sa ovim mesecom';

  const inc = sumBy(txs, (t) => t.kind === 'income');
  const exp = sumBy(txs, (t) => t.kind === 'expense');
  const sav = sumBy(txs, (t) => t.kind === 'saving');
  const pexp = sumBy(ptx, (t) => t.kind === 'expense');
  const varExp = sumBy(txs, isVar);
  const varPlan = Object.entries(plan.byCat).reduce((s, [id, a]) => { const c = S.cat(id); return s + (c.kind === 'expense' && !c.fixed ? a : 0); }, 0);

  // Proteklih dana u periodu (za prosek): budući dani se ne računaju.
  const elapsed = today < p.start ? 0 : today > p.end ? p.days : Math.round((parseISO(today) - parseISO(p.start)) / 864e5) + 1;
  const avg = elapsed ? exp / elapsed : 0;

  const cmpAct = short ? varExp : exp;
  const cmpPlan = short ? varPlan : plan.tot.expense;
  const diff = cmpPlan - cmpAct;
  const change = pexp ? (exp - pexp) / pexp : null;

  el.innerHTML = `
    <div class="chips period-chips">
      ${PERIODS.map(([k, l]) => `<button class="chip ${R.type === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}
    </div>
    <div class="period-nav">
      <button class="icon-btn" id="p-prev" aria-label="Prethodni period">‹</button>
      <button class="period-label" id="p-today" title="Vrati na danas">${esc(p.label)}</button>
      <button class="icon-btn" id="p-next" aria-label="Sledeći period">›</button>
    </div>

    <section class="card hero">
      <div class="hero-label">Troškovi</div>
      <div class="hero-value">${fmt(exp)}</div>
      <div class="hero-sub">
        ${cmpPlan > 0 ? `${short ? 'Promenljivi: ' : ''}<b>${fmtNum(cmpAct)}</b> od ${planWord} <b>${fmtNum(cmpPlan)}</b>` : future ? 'Period još nije počeo' : 'Nema plana za ovaj period'}
      </div>
      ${cmpPlan > 0 ? `<div class="bar bar-lg"><div class="bar-fill ${diff < 0 ? 'is-over' : ''}" data-w="${pct(cmpAct, cmpPlan)}"></div></div>` : ''}
      <div class="kpi-row">
        ${cmpPlan > 0 ? `<span class="tag ${diff < 0 ? 'tag-red' : 'tag-good'}">${diff < 0 ? '▲ ' + fmtNum(-diff) + ' preko plana' : '▼ ' + fmtNum(diff) + ' ispod plana'}</span>` : ''}
        ${change !== null ? `<span class="tag">${exp - pexp > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(exp - pexp))} (${exp - pexp > 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}%) ${exp - pexp > 0 ? 'više' : 'manje'} nego prethodni period</span>` : ''}
      </div>
    </section>

    <section class="stat-grid">
      ${mini('Prihodi', inc, plan.tot.income, 'green', short)}
      ${mini('Štednja', sav, plan.tot.saving, 'cyan', short)}
      <div class="stat card"><div class="stat-label">Bilans</div>
        <div class="stat-val ${inc - exp - sav < 0 ? 't-red' : 't-accent'}">${fmtSigned(inc - exp - sav)}</div>
        <div class="stat-sub">prihodi − troškovi − štednja</div></div>
      <div class="stat card"><div class="stat-label">Prosek dnevno</div>
        <div class="stat-val">${fmtNum(avg)}</div>
        <div class="stat-sub">${elapsed ? `za ${elapsed} ${elapsed === 1 ? 'dan' : 'dana'}` : 'period nije počeo'}</div></div>
    </section>

    ${R.type === 'day' ? '' : `
      <div class="section-head"><h3>${short || R.type === 'month' ? 'Dnevna potrošnja' : 'Troškovi po mesecima'}</h3>
        ${chartLegend()}</div>
      <section class="card chart-card"><div class="chart" id="chart"></div><div class="chart-tip" id="tip" hidden></div>
        ${short || R.type === 'month' ? '<p class="chart-note">Bez rata i računa · isprekidana linija = dnevni plan</p>' : ''}
      </section>`}

    ${insightsBlock({ p, prev, txs, ptx, plan, inc, exp, sav, short, elapsed })}

    ${exp > 0 ? `<div class="section-head"><h3>Raspodela troškova</h3></div>
    <section class="card pad" id="donut-card">${donutChart(donutData(txs))}</section>` : ''}

    <div class="section-head"><h3>Po kategorijama</h3><span class="muted">${short ? 'udeo' : partial && R.type !== 'month' ? 'stvarno · plan do kraja ovog meseca' : 'stvarno · plan'}</span></div>
    <section class="card list">${categoryRows(txs, plan, short, exp)}</section>

    <div class="section-head"><h3>Po osobi</h3></div>
    <section class="card list">${personRows(txs, plan, short)}</section>

    <div class="section-head"><h3>${R.type === 'day' ? 'Svi unosi' : 'Najveći troškovi'}</h3></div>
    <section class="card list">${topRows(txs)}</section>

    <button class="btn btn-ghost btn-block" id="csv">⬇️ Preuzmi CSV za Excel</button>
  `;

  // Grafik se crta posle ubacivanja da bi znao širinu.
  const chartEl = el.querySelector('#chart');
  if (chartEl) {
    chartEl.innerHTML = buildChart(p, txs, planInPeriod(p), chartEl.clientWidth || 340);
    bindTips(el);
  }
  const dc = el.querySelector('#donut-card');
  if (dc) bindDonut(dc, donutData(txs));
  animateBars(el);

  el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { R.type = b.dataset.t; renderIzvestaji(el, ctx); }));
  el.querySelector('#p-prev').onclick = () => { R.anchor = shiftAnchor(R.type, R.anchor, -1); renderIzvestaji(el, ctx); };
  el.querySelector('#p-next').onclick = () => { R.anchor = shiftAnchor(R.type, R.anchor, 1); renderIzvestaji(el, ctx); };
  el.querySelector('#p-today').onclick = () => { R.anchor = todayISO(); renderIzvestaji(el, ctx); };
  el.querySelector('#csv').onclick = () => downloadCSV(p, txs);
  el.querySelectorAll('[data-rcat]').forEach((r) => (r.onclick = () => {
    if (R.type === 'month') openCategoryDetail(p.start.slice(0, 7), r.dataset.rcat);
    else openCategoryPeriod(p, r.dataset.rcat);
  }));
  el.querySelectorAll('[data-tx]').forEach((r) => (r.onclick = () => {
    const tx = S.getState().transactions.find((t) => t.id === r.dataset.tx);
    if (tx) openEntrySheet({ tx });
  }));
}

function mini(label, actual, planAmt, color, short) {
  return `<div class="stat card"><div class="stat-label">${label}</div>
    <div class="stat-val t-${color}">${fmtNum(actual)}</div>
    <div class="stat-sub">${!short && planAmt ? 'plan ' + fmtNum(planAmt) : '&nbsp;'}</div></div>`;
}

function chartLegend() {
  if (R.type === 'day') return '';
  const monthly = !['week', 'month'].includes(R.type);
  return `<span class="legend"><i class="lg-bar"></i>Stvarno <i class="${monthly ? 'lg-tick' : 'lg-dash'}"></i>Plan</span>`;
}

// ---- Grafik ----
function niceMax(v) {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * e >= v) return f * e;
  return 10 * e;
}
const shortNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));

function buildChart(p, txs, plan, W) {
  const today = todayISO();
  let labels = [], values = [], plans = null, ref = null, tips = [], every = 1, dim = [];
  if (R.type === 'week' || R.type === 'month') {
    const d = parseISO(p.start);
    for (let i = 0; i < p.days; i++) {
      const iso = isoOf(d);
      const v = sumBy(txs, (t) => t.date === iso && isVar(t));
      values.push(v);
      labels.push(R.type === 'week' ? DOW[i] : String(d.getDate()));
      tips.push(`${d.getDate()}.${d.getMonth() + 1}. · ${fmtNum(v)} RSD`);
      dim.push(iso > today);
      d.setDate(d.getDate() + 1);
    }
    every = R.type === 'week' ? 1 : 5;
    // Dnevni plan promenljivih troškova
    const varPlan = Object.entries(plan.byCat).reduce((s, [id, a]) => { const c = S.cat(id); return s + (c.kind === 'expense' && !c.fixed ? a : 0); }, 0);
    ref = varPlan / p.days || null;
  } else {
    plans = [];
    for (const { key } of monthsCovered(p)) {
      const m = Number(key.slice(5)) - 1;
      const v = sumBy(txs, (t) => t.kind === 'expense' && t.date.startsWith(key));
      const pl = S.planOf(key).reduce((s, it) => s + (S.cat(it.categoryId).kind === 'expense' ? Number(it.amount) : 0), 0);
      values.push(v); plans.push(pl); labels.push(MONTH_SHORT[m]);
      tips.push(`${MONTH_SHORT[m]} · ${fmtNum(v)} RSD${pl ? ` · plan ${fmtNum(pl)}` : ''}`);
      dim.push(key > currentMonthKey());
    }
  }

  const H = 180, padL = 34, padR = 6, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = niceMax(Math.max(1, ...values, ...(plans || []), ref || 0));
  const y = (v) => padT + ih - (v / max) * ih;
  const n = values.length;
  const slot = iw / n;
  const bw = Math.max(3, Math.min(30, slot - Math.max(2, slot * 0.3)));
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik troškova">`;
  for (const g of [0, 0.5, 1]) {
    const gy = y(max * g);
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" class="grid ${g === 0 ? 'base' : ''}"/>`;
    svg += `<text x="${padL - 6}" y="${gy + 3.5}" class="ax" text-anchor="end">${shortNum(max * g)}</text>`;
  }
  values.forEach((v, i) => {
    const cx = padL + slot * i + slot / 2;
    const x = cx - bw / 2;
    if (v > 0) {
      const top = y(v), base = y(0), r = Math.min(4, bw / 2, base - top);
      svg += `<path class="bar-mark ${dim[i] ? 'dim' : ''}" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z"/>`;
    }
    if (plans && plans[i] > 0) svg += `<line class="plan-tick" x1="${x - 3}" x2="${x + bw + 3}" y1="${y(plans[i])}" y2="${y(plans[i])}"/>`;
    if (i % every === 0 || i === n - 1) svg += `<text x="${cx}" y="${H - 6}" class="ax" text-anchor="middle">${labels[i]}</text>`;
    svg += `<rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${ih}" data-tip="${esc(tips[i])}" data-x="${cx}"/>`;
  });
  if (ref) svg += `<line class="ref" x1="${padL}" x2="${W - padR}" y1="${y(ref)}" y2="${y(ref)}"/>`;
  return svg + '</svg>';
}

function bindTips(el) {
  const tip = el.querySelector('#tip');
  const show = (r) => {
    el.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on'));
    r.classList.add('on');
    tip.textContent = r.dataset.tip;
    tip.hidden = false;
    const card = tip.parentElement.getBoundingClientRect();
    const box = r.getBoundingClientRect();
    const x = box.left - card.left + box.width / 2;
    tip.style.left = Math.max(70, Math.min(card.width - 70, x)) + 'px';
  };
  el.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('pointerenter', () => show(r));
    r.addEventListener('click', () => show(r));
  });
  el.querySelector('#chart').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
}

// ---- Kategorije ----
function categoryRows(txs, plan, short, total) {
  const act = {};
  for (const t of txs) if (t.kind === 'expense') act[t.categoryId] = (act[t.categoryId] || 0) + Number(t.amount);
  const ids = new Set([...Object.keys(act), ...(!short ? Object.keys(plan.byCat).filter((id) => S.cat(id).kind === 'expense') : [])]);
  const rows = [...ids].map((id) => ({ c: S.cat(id), a: act[id] || 0, p: plan.byCat[id] || 0 })).sort((x, y) => y.a - x.a || y.p - x.p);
  if (!rows.length) return '<div class="empty-mini">Nema troškova u ovom periodu.</div>';
  const max = Math.max(...rows.map((r) => Math.max(r.a, short ? 0 : r.p)), 1);
  return rows.map(({ c, a, p }) => {
    const share = total ? Math.round((a / total) * 100) : 0;
    let tag = '';
    if (!short && p > 0) tag = a > p ? `<span class="tag tag-red">+${fmtNum(a - p)}</span>` : '';
    else if (!short && p === 0 && a > 0) tag = '<span class="tag tag-warn">van plana</span>';
    return `<div class="cat-row clickable" role="button" tabindex="0" data-rcat="${c.id}">
      <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
      <div class="cat-main">
        <div class="cat-top"><span class="cat-name">${esc(c.name)}</span>${tag}
          <span class="cat-amt"><b>${fmtNum(a)}</b><span class="muted"> ${short ? `· ${share}%` : `/ ${fmtNum(p)}`}</span></span></div>
        <div class="bar bar-sm"><div class="bar-fill" style="--c:${c.color}" data-w="${(a / max) * 100}"></div>
          ${!short && p > 0 ? `<div class="bar-plan" style="left:${Math.min(100, (p / max) * 100)}%"></div>` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

// ---- Po osobi ----
function personRows(txs, plan, short) {
  return S.MEMBERS.map((m) => {
    const mine = txs.filter((t) => t.by === m.id && t.kind === 'expense');
    const spent = sumBy(mine, () => true);
    const pid = 'licno-' + m.id;
    const personal = sumBy(txs, (t) => t.categoryId === pid);
    const pplan = plan.byCat[pid] || 0;
    return `<div class="cat-row">
      <span class="who who-lg" style="--c:${m.color}">${m.short}</span>
      <div class="cat-main">
        <div class="cat-top"><span class="cat-name">${esc(m.name)}</span>
          <span class="cat-amt"><b>${fmtNum(spent)}</b><span class="muted"> · ${mine.length} ${mine.length === 1 ? 'unos' : 'unosa'}</span></span></div>
        <div class="person-sub">Džeparac: <b>${fmtNum(personal)}</b>${!short && pplan ? ` od ${fmtNum(pplan)} ${personal > pplan ? '<span class="t-red">· preko plana</span>' : `· ostalo ${fmtNum(pplan - personal)}`}` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function topRows(txs) {
  const list = R.type === 'day'
    ? [...txs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    : txs.filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  return list.length ? list.map((t) => txRow(t, { showDate: R.type !== 'day' })).join('') : '<div class="empty-mini">Nema unosa.</div>';
}

// ---- Uvidi i saveti ----
function insightsBlock({ p, txs, ptx, plan, inc, exp, sav, short, elapsed }) {
  const out = [];
  const act = {}, pact = {};
  for (const t of txs) if (t.kind === 'expense') act[t.categoryId] = (act[t.categoryId] || 0) + Number(t.amount);
  for (const t of ptx) if (t.kind === 'expense') pact[t.categoryId] = (pact[t.categoryId] || 0) + Number(t.amount);

  const top = Object.entries(act).sort((a, b) => b[1] - a[1])[0];
  if (top && exp) {
    const c = S.cat(top[0]);
    out.push(['📊', `Najviše je otišlo na <b>${esc(c.name)}</b>: ${fmt(top[1])} (${Math.round((top[1] / exp) * 100)}% od ukupno ${fmt(exp)}).`]);
  }
  if (!short) {
    const over = Object.entries(act)
      .map(([id, a]) => [id, a - (plan.byCat[id] || 0)])
      .filter(([id, d]) => d > 0 && (plan.byCat[id] || 0) > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (over) out.push(['⚠️', `<b>${esc(S.cat(over[0]).name)}</b> je ${fmt(over[1])} iznad plana.`, 'bad']);
  }
  const rise = Object.entries(act)
    .map(([id, a]) => [id, a - (pact[id] || 0)])
    .filter(([id, d]) => d > 0 && (pact[id] || 0) > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (rise && rise[1] > 1000) out.push(['📈', `<b>${esc(S.cat(rise[0]).name)}</b>: ${fmt(rise[1])} više nego u prethodnom periodu.`]);

  if (!short && inc > 0) {
    const rate = sav / inc;
    if (rate >= 0.2) out.push(['🏆', `Uštedeli ste <b>${fmt(sav)}</b> (${Math.round(rate * 100)}% prihoda) — odlično.`, 'good']);
    else if (rate > 0) out.push(['🐷', `Uštedeli ste ${fmt(sav)} (${Math.round(rate * 100)}% prihoda). Do preporučenih 20% fali još <b>${fmt(inc * 0.2 - sav)}</b>.`]);
    else out.push(['🐷', 'U ovom periodu nije evidentirana štednja.']);
  }
  if ((R.type === 'week' || R.type === 'month') && elapsed > 1) {
    const daysWith = new Set(txs.filter(isVar).map((t) => t.date)).size;
    const free = elapsed - daysWith;
    if (free > 0) out.push(['🌿', `${free} ${free === 1 ? 'dan' : 'dana'} bez promenljivih troškova.`, free >= elapsed / 3 ? 'good' : '']);
  }
  const leak = sumBy(txs, (t) => t.categoryId === 'iscurelo');
  if (leak > 0) out.push(['💧', `Iscurelo (neobjašnjene razlike na računima): <b>${fmt(leak)}</b>${exp ? ` (${Math.round((leak / exp) * 100)}% troškova)` : ''}. Unosite troškove odmah, dok se sećate.`, 'bad']);
  if (!txs.length) out.push(['📝', 'U ovom periodu nema unosa. Unesi troškove preko dugmeta + da bi izveštaj imao smisla.']);
  if (!out.length) return '';
  return `<div class="section-head"><h3>Uvidi</h3></div>
    <section class="card list insights">${out.map(([i, t, k]) => `<div class="insight ${k ? 'ins-' + k : ''}"><span>${i}</span><span>${t}</span></div>`).join('')}</section>`;
}

// ---- CSV ----
function downloadCSV(p, txs) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Vrsta', 'Kategorija', 'Iznos', 'Napomena', 'Uneo/la'].map(q).join(';')];
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([fmtDate(t.date), S.KINDS[t.kind].label, S.cat(t.categoryId).name, Math.round(t.amount), t.note, S.member(t.by).name].map(q).join(';'));
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budzet-${p.type}-${p.start}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
