// Ciljevi štednje: kartice na Pregledu, detalj, forma, proslava.
import { ico } from '../icons.js?v=20261108203432';
import * as S from '../store.js?v=20261108203432';
import * as Sync from '../sync.js?v=20261108203432';
import { esc, fmt, fmtNum, digitsOnly, currentMonthKey, monthLabel, MONTH_GEN } from '../util.js?v=20261108203432';
import { openSheet, toast, confirmSheet, animateBars, pct, moneyInput, confetti } from '../ui.js?v=20261108203432';
import { txRow } from './istorija.js?v=20261108203432';
import { openEntrySheet } from './entry.js?v=20261108203432';

const ICONS = ['🎯', '🏖️', '✈️', '🚗', '🏠', '💍', '👶', '🎓', '💻', '🛋️', '🩺', '🎁'];

function monthsLeft(due) {
  if (!due) return null;
  const [y1, m1] = currentMonthKey().split('-').map(Number);
  const [y2, m2] = due.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1; // uključujući tekući mesec
}

export function goalStats(g) {
  const saved = S.goalSaved(g);
  const left = Math.max(0, g.target - saved);
  const ml = monthsLeft(g.due);
  const perMonth = ml && ml > 0 ? left / ml : null;
  return { saved, left, ml, perMonth, done: saved >= g.target, p: pct(saved, g.target) };
}

const dueText = (due) => due ? `${MONTH_GEN[Number(due.slice(5)) - 1]} ${due.slice(0, 4)}.` : '';

// ---- Blok na Pregledu ----
export function goalsBlock() {
  const goals = S.goalsOf();
  const warn = Sync.enabled && !Sync.isAvailable('goals')
    ? '<div class="hint hint-warn">Ciljevi se za sada čuvaju samo na ovom telefonu. Za zajedničko čuvanje pokreni SQL iz <b>supabase/migrations/003_goals.sql</b>.</div>' : '';
  return `
    <div class="section-head"><h3>Ciljevi štednje</h3>${goals.length ? '<button class="link" data-goal-new>+ Novi</button>' : ''}</div>
    ${warn}
    ${goals.length ? `<div class="goal-scroll">${goals.map(goalCard).join('')}</div>` : `
      <button class="card goal-empty" data-goal-new>
        <span class="cat-ico goal-empty-ico" style="--c:#A8833F">${ico('goal')}</span>
        <span><b>Postavi cilj štednje</b><br><span class="muted small">npr. Letovanje 2027 · 300.000 RSD</span></span>
      </button>`}`;
}

function goalCard(g) {
  const st = goalStats(g);
  return `<button class="card goal-card ${st.done ? 'is-done' : ''}" data-goal="${g.id}">
    <div class="goal-top"><span class="goal-ico">${g.icon || '🎯'}</span><span class="goal-pct">${Math.floor(st.p)}%</span></div>
    <div class="goal-name">${esc(g.name)}</div>
    <div class="goal-amt"><b>${fmtNum(st.saved)}</b> / ${fmtNum(g.target)}</div>
    <div class="bar bar-sm"><div class="bar-fill fill-cyan" data-w="${st.p}"></div></div>
    <div class="goal-sub">${st.done ? '🎉 Ostvareno!' : st.perMonth ? `${fmtNum(st.perMonth)} / mes. do ${esc(dueText(g.due))}` : g.due && st.ml <= 0 ? 'Rok je prošao' : `još ${fmtNum(st.left)}`}</div>
  </button>`;
}

export function bindGoals(el) {
  el.querySelectorAll('[data-goal]').forEach((b) => (b.onclick = () => openGoalDetail(S.goal(b.dataset.goal))));
  el.querySelectorAll('[data-goal-new]').forEach((b) => (b.onclick = () => openGoalForm(null)));
}

// ---- Detalj ----
export function openGoalDetail(g) {
  if (!g) return;
  const st = goalStats(g);
  const txs = S.getState().transactions.filter((t) => t.goalId === g.id).sort((a, b) => b.date.localeCompare(a.date));
  const R = 52, C = 2 * Math.PI * R;
  openSheet({
    title: g.name,
    body: `
      <div class="goal-hero">
        <svg viewBox="0 0 128 128" class="ring" aria-hidden="true">
          <circle cx="64" cy="64" r="${R}" class="ring-bg"/>
          <circle cx="64" cy="64" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - st.p / 100)}" transform="rotate(-90 64 64)"/>
        </svg>
        <div class="ring-label"><span>${g.icon || '🎯'}</span><b>${Math.floor(st.p)}%</b></div>
      </div>
      <div class="dd-meta">
        <div><span>Ušteđeno</span><span><b>${fmt(st.saved)}</b></span></div>
        <div><span>Cilj</span><span>${fmt(g.target)}</span></div>
        <div><span>Preostalo</span><span>${fmt(st.left)}</span></div>
        ${g.due ? `<div><span>Rok</span><span>${esc(monthLabel(g.due))}${st.ml > 0 ? ` · još ${st.ml} mes.` : ' · prošao'}</span></div>` : ''}
        ${st.perMonth && !st.done ? `<div><span>Potrebno mesečno</span><span><b>${fmt(st.perMonth)}</b></span></div>` : ''}
      </div>
      ${st.done ? '<div class="hint hint-good">🎉 Cilj je ostvaren! Bravo vama dvoma.</div>' : ''}
      <div class="cd-actions">
        <button class="btn btn-primary btn-sm" id="g-pay">+ Uplati</button>
        <button class="btn btn-soft btn-sm" id="g-edit">Izmeni cilj</button>
      </div>
      <div class="field-label">Uplate (${txs.length})${g.startAmount ? ` · početno ${fmtNum(g.startAmount)}` : ''}</div>
      <section class="list">${txs.length ? txs.map((t) => txRow(t, { showDate: true })).join('') : '<div class="empty-mini">Još nema uplata. Uplata štednje može da se veže za ovaj cilj.</div>'}</section>`,
    onMount(el, close) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const fg = el.querySelector('.ring-fg');
        if (fg) fg.style.strokeDashoffset = fg.dataset.off;
      }));
      const then = (fn) => () => { close(); setTimeout(fn, 200); };
      el.querySelector('#g-pay').onclick = then(() => openEntrySheet({ kind: 'saving', prefill: { goalId: g.id, amount: st.perMonth && !st.done ? Math.ceil(st.perMonth / 100) * 100 : null } }));
      el.querySelector('#g-edit').onclick = then(() => openGoalForm(g));
      el.querySelectorAll('[data-tx]').forEach((b) => (b.onclick = then(() => {
        const tx = txs.find((t) => t.id === b.dataset.tx);
        if (tx) openEntrySheet({ tx });
      })));
    },
  });
}

// ---- Forma ----
export function openGoalForm(g) {
  const v = { icon: g?.icon || '🎯', target: g ? String(Math.round(g.target)) : '', start: g ? String(Math.round(g.startAmount || 0)) : '' };
  openSheet({
    title: g ? 'Izmena cilja' : 'Novi cilj štednje',
    body: `
      <div class="cat-form">
        <input class="input icon-input" id="g-icon" maxlength="4" aria-label="Ikonica">
        <input class="input grow" id="g-name" maxlength="40" placeholder="npr. Letovanje 2027">
      </div>
      <div class="icon-row">${ICONS.map((i) => `<button class="icon-opt" data-i="${i}">${i}</button>`).join('')}</div>

      <div class="field-label">Koliko vam treba</div>
      <label class="amount-field amount-sm"><input id="g-target" inputmode="numeric" placeholder="0"><span>RSD</span></label>

      <div class="field-label">Već ušteđeno <span class="muted">(opciono)</span></div>
      <label class="amount-field amount-sm"><input id="g-start" inputmode="numeric" placeholder="0"><span>RSD</span></label>

      <div class="field-label">Do kada <span class="muted">(opciono — računa koliko treba mesečno)</span></div>
      <input class="input" type="month" id="g-due" min="${currentMonthKey()}">

      <div class="btn-row sticky-actions">
        ${g ? '<button class="btn btn-ghost btn-danger-text" id="g-del">Obriši</button>' : ''}
        <button class="btn btn-primary" id="g-save">Sačuvaj</button>
      </div>`,
    onMount(el, close) {
      const $ = (s) => el.querySelector(s);
      $('#g-icon').value = v.icon;
      $('#g-name').value = g?.name || '';
      $('#g-due').value = g?.due || '';
      const money = (id, key) => {
        const i = $(id);
        i.value = v[key] && Number(v[key]) ? fmtNum(v[key]) : '';
        moneyInput(i, (d) => (v[key] = d));
      };
      money('#g-target', 'target');
      money('#g-start', 'start');
      el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => ($('#g-icon').value = b.dataset.i)));
      if (!g) setTimeout(() => $('#g-name').focus(), 280);

      $('#g-save').onclick = async () => {
        const name = $('#g-name').value.trim();
        const target = Number(v.target);
        if (!name) { toast('Upiši naziv cilja', 'warn'); return; }
        if (!target) { toast('Upiši iznos cilja', 'warn'); return; }
        await S.saveGoal({ ...(g ? { id: g.id } : {}), name, icon: $('#g-icon').value.trim() || '🎯', target, startAmount: Number(v.start) || 0, due: $('#g-due').value || null });
        toast(g ? 'Cilj sačuvan' : `🎯 Novi cilj: ${esc(name)}`, 'ok');
        close();
      };
      $('#g-del')?.addEventListener('click', async () => {
        const ok = await confirmSheet({ title: 'Obriši cilj?', text: `${esc(g.name)} — uplate ostaju kao obična štednja.`, ok: 'Obriši', danger: true });
        if (!ok) return;
        await S.deleteGoal(g.id);
        toast('Cilj obrisan', 'ok');
        close();
      });
    },
  });
}

// ---- Proslava ----
export const celebrate = () => confetti();
